import { GetCommand, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, putEvent, getNeedsProfileWithRetry, postSlackMessage, QA_QUESTIONS, ShelterBid, ttl1h } from '../shared/utils';

interface ShelterRecord {
  shelterId: string;
  name:      string;
  slack:     { channelId: string };
  preferences: {
    filters: { acceptedSpecies: string[] };
  };
}

interface QaSession {
  sessionId:   string;
  caseId:      string;
  shelterId:   string;
  channelId:   string;
  status:      string;
  caseSummary: string;
  answers:     Record<string, string>;
  createdAt:   string;
  ttl:         number;
}

// Tier 2 — human-in-the-loop via Slack. One invocation fans out over every tier-2
// shelter; each gets its own Q&A session and its own channel conversation.
export const handler = async (event: { 'detail-type': string; detail: Record<string, unknown> }) => {
  const { detail } = event;
  const detailType = event['detail-type'];

  if (detailType === 'CasePublished') {
    await handleCasePublished(detail);
  } else if (detailType === 'QaAnswerSubmitted') {
    await handleQaAnswer(detail as { sessionId: string; questionId: string; answer: string });
  }

  return { statusCode: 200 };
};

// ── New case: open a Q&A session per tier-2 shelter, ask the first question ─
async function handleCasePublished(detail: Record<string, unknown>) {
  const { caseId, reportData, location } = detail as {
    caseId:     string;
    reportData: Record<string, unknown>;
    location:   { lat: number; lng: number };
  };

  const shelters = await queryTierShelters(2);
  console.log(`Tier 2 agent: ${shelters.length} shelter(s) for case ${caseId}`);

  const needsProfile = await getNeedsProfileWithRetry(caseId);
  const constraints   = needsProfile?.hardConstraints ?? [];

  const imageData  = (reportData.imageAnalysis ?? {}) as Record<string, unknown>;
  const species    = String(imageData.species ?? reportData.species ?? 'animal');
  const condition  = (imageData.injuryIndicators as string[] ?? []).length > 0 ? 'injured' : 'appears healthy';
  const address    = (reportData.geocoding as Record<string, unknown>)?.addressResolved
                  ?? `${(location?.lat ?? 0).toFixed(4)}, ${(location?.lng ?? 0).toFixed(4)}`;
  const caseSummary = `${species.charAt(0).toUpperCase() + species.slice(1)} — ${condition} — near ${address}`;

  await Promise.all(shelters.map(async shelter => {
    const accepted = Array.from(shelter.preferences?.filters?.acceptedSpecies ?? ['dog', 'cat']);
    for (const c of constraints) {
      if (c.startsWith('accepts_species:')) {
        const sp = c.split(':')[1];
        if (!accepted.includes(sp)) {
          console.log(`Tier 2: ${shelter.shelterId} does not accept ${sp} — skipping Slack outreach`);
          return;
        }
      }
    }

    const sessionId = `qa-${caseId}-${shelter.shelterId}`;
    const session: QaSession = {
      sessionId,
      caseId,
      shelterId: shelter.shelterId,
      channelId: shelter.slack.channelId,
      status:    'PENDING',
      caseSummary,
      answers:   {},
      createdAt: new Date().toISOString(),
      ttl:       ttl1h(),
    };

    await ddb.send(new PutCommand({ TableName: process.env.QA_TABLE!, Item: session }));

    await postSlackMessage(
      shelter.slack.channelId,
      `🐾 *New rescue case* — ${caseSummary}\n\n${QA_QUESTIONS[0].text}\n\n_Reply in this channel to answer._`,
    );
    console.log(`Tier 2: Q&A session ${sessionId} opened in Slack channel ${shelter.slack.channelId}`);
  }));
}

// ── Answer received (from the Slack webhook) ─────────────────────────────────
async function handleQaAnswer(detail: { sessionId: string; questionId: string; answer: string }) {
  const { sessionId, questionId, answer } = detail;
  console.log(`Tier 2: Q&A answer ${sessionId} — ${questionId}: ${answer}`);

  const r = await ddb.send(new GetCommand({ TableName: process.env.QA_TABLE!, Key: { sessionId } }));
  if (!r.Item) { console.warn(`Session ${sessionId} not found`); return; }

  const session = r.Item as QaSession;
  const answers = { ...session.answers, [questionId]: answer };
  const nextQuestion = QA_QUESTIONS.find(q => answers[q.id] === undefined);

  await ddb.send(new UpdateCommand({
    TableName: process.env.QA_TABLE!,
    Key:       { sessionId },
    UpdateExpression: 'SET answers = :a, #st = :s',
    ExpressionAttributeNames:  { '#st': 'status' },
    ExpressionAttributeValues: { ':a': answers, ':s': nextQuestion ? 'IN_PROGRESS' : 'COMPLETE' },
  }));

  if (nextQuestion) {
    await postSlackMessage(session.channelId, nextQuestion.text);
    return;
  }

  // All three answered — build the bid.
  const canTake = (answers['can_take'] ?? '').toLowerCase().startsWith('yes');
  if (!canTake) {
    await postSlackMessage(session.channelId, `Got it — marking this case as unable to take. Thanks!`);
    await putEvent('rescuenet.shelter', 'ShelterNoBid', {
      caseId:    session.caseId,
      shelterId: session.shelterId,
      reason:    'Coordinator answered: cannot take this animal',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const slotAnswer = answers['slot_count'] ?? '1';
  const slots      = slotAnswer.startsWith('3') ? 3 : (parseInt(slotAnswer, 10) || 1);
  const vetAnswer  = answers['vet_available'] ?? 'No';
  const hasVet     = vetAnswer.toLowerCase().includes('yes');
  const canArrange = vetAnswer.toLowerCase().includes('arrange');

  const shelterResult = await ddb.send(new GetCommand({
    TableName: process.env.SHELTERS_TABLE!,
    Key:       { shelterId: session.shelterId },
  }));
  const shelterName = (shelterResult.Item as ShelterRecord | undefined)?.name ?? session.shelterId;

  const bid: ShelterBid = {
    caseId:                       session.caseId,
    shelterId:                    session.shelterId,
    shelterName,
    availableSlots:               slots,
    hasVetOnSite:                 hasVet,
    vetCanBeArranged:             canArrange,
    confidence:                   0.78,   // human-confirmed but no live system
    estimatedIntakeWindowMinutes: 45,
    notes:                        `Coordinator confirmed: ${slots} slot(s). Vet: ${vetAnswer}.`,
    dataFreshness:                'HUMAN',
    autonomyPreference:           'AFTER_QA_CONFIRM_INTAKE',
    timestamp:                    new Date().toISOString(),
  };

  await postSlackMessage(session.channelId, `Thanks — bid submitted for this case. We'll follow up once it's assigned.`);
  await putEvent('rescuenet.shelter', 'ShelterBid', bid);
  console.log(`Tier 2: ${session.shelterId} bid published for case ${session.caseId}`, bid);
}

async function queryTierShelters(tier: number): Promise<ShelterRecord[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: process.env.SHELTERS_TABLE!,
    IndexName: 'tier-index',
    KeyConditionExpression: '#t = :t',
    ExpressionAttributeNames:  { '#t': 'tier' },
    ExpressionAttributeValues: { ':t': tier },
  }));
  return (result.Items ?? []) as ShelterRecord[];
}
