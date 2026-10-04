import { QueryCommand, PutCommand, UpdateCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, putEvent, haversineKm, NeedsProfile, ShelterBid, ttl1h } from '../shared/utils';
import { extractCaseSpecies, speciesMatchScore } from '../shared/scoring';

const FRESHNESS_WEIGHT: Record<string, number> = {
  LIVE:   1.00,
  HUMAN:  0.88,
  SYNCED: 0.75,
  STATIC: 0.55,
};

const BID_WINDOW_MS = parseInt(process.env.BID_WINDOW_SECONDS ?? '15', 10) * 1000;

export const handler = async (event: { 'detail-type': string; detail: Record<string, unknown> }) => {
  const { detail } = event;
  const detailType = event['detail-type'];

  if (detailType === 'ShelterBid') {
    await accumulateBid(detail as unknown as ShelterBid);
  } else if (detailType === 'BidWindowClosed') {
    await scoreAndAssign((detail as { caseId: string }).caseId);
  }

  return { statusCode: 200 };
};

// ── Accumulate ─────────────────────────────────────────────────────────────
async function accumulateBid(bid: ShelterBid) {
  console.log(`Arbitrator: bid from ${bid.shelterId} for case ${bid.caseId}`);

  await ddb.send(new PutCommand({
    TableName: process.env.BIDS_TABLE!,
    Item:      { ...bid, ttl: ttl1h() },
  }));

  // Check if bid window already started
  const caseItem = await ddb.send(new GetCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId: bid.caseId },
  }));
  if (caseItem.Item?.bidWindowScheduled) {
    console.log(`Window already scheduled for ${bid.caseId} — waiting`);
    return;
  }

  // Mark window as started, then sleep for the bid window duration
  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId: bid.caseId },
    UpdateExpression: 'SET bidWindowScheduled = :t, bidWindowOpensAt = :now',
    ExpressionAttributeValues: { ':t': true, ':now': new Date().toISOString() },
  }));

  console.log(`Bid window open for ${bid.caseId} — waiting ${BID_WINDOW_MS}ms`);
  await sleep(BID_WINDOW_MS);

  // Fire BidWindowClosed — triggers this same Lambda via EventBridge rule
  await putEvent('rescuenet.arbitrator', 'BidWindowClosed', {
    caseId:    bid.caseId,
    timestamp: new Date().toISOString(),
  });
}

// ── Score and assign ───────────────────────────────────────────────────────
async function scoreAndAssign(caseId: string) {
  console.log(`Arbitrator: scoring bids for case ${caseId}`);

  const caseResult = await ddb.send(new GetCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
  }));
  let caseItem = caseResult.Item;
  if (!caseItem) { console.error(`Case ${caseId} not found`); return; }

  // needs-profile runs in parallel with shelter bidding and can still be mid-flight
  // (Bedrock latency, cold start) when the bid window closes — give it one retry.
  if (!caseItem.needsProfile) {
    console.warn(`needsProfile not yet written for ${caseId}, waiting 4s...`);
    await sleep(4000);
    const retry = await ddb.send(new GetCommand({
      TableName: process.env.CASES_TABLE!,
      Key:       { caseId },
    }));
    if (retry.Item?.needsProfile) {
      caseItem = retry.Item;
    } else {
      console.warn(`needsProfile still missing for ${caseId} after retry — using defaultProfile()`);
    }
  }

  const needsProfile = (caseItem.needsProfile ?? defaultProfile()) as NeedsProfile;
  const caseLocation = caseItem.location as { lat: number; lng: number };

  // Read all bids for this case
  const bidsResult = await ddb.send(new QueryCommand({
    TableName:              process.env.BIDS_TABLE!,
    KeyConditionExpression: 'caseId = :c',
    ExpressionAttributeValues: { ':c': caseId },
  }));
  const bids = (bidsResult.Items ?? []) as ShelterBid[];

  console.log(`Found ${bids.length} bid(s) for case ${caseId}`);

  if (bids.length === 0) {
    return escalate(caseId, 'No bids received within the bid window.');
  }

  // Enforce hard constraints
  const { hardConstraints, softWeights } = needsProfile;
  const eligible = bids.filter(bid => {
    for (const c of hardConstraints) {
      if (c === 'has_vet' && !bid.hasVetOnSite && !bid.vetCanBeArranged) {
        console.log(`  ${bid.shelterId} excluded: fails has_vet`);
        return false;
      }
      if (c.startsWith('accepts_species:')) {
        const sp = c.split(':')[1];
        if (bid.acceptedSpecies && !bid.acceptedSpecies.includes(sp)) {
          console.log(`  ${bid.shelterId} excluded: does not accept ${sp}`);
          return false;
        }
      }
    }
    return true;
  });

  if (eligible.length === 0) {
    return escalate(caseId, 'All bids failed hard constraints.');
  }

  const caseSpecies = extractCaseSpecies(caseItem.reportData as Record<string, unknown> | undefined);

  // Get shelter locations for distance scoring
  const shelterLocs = await getShelterLocations(eligible.map(b => b.shelterId));

  // Score each eligible bid using case-relative weights
  const scored = eligible.map(bid => ({
    ...bid,
    matchScore: computeMatchScore(bid, caseLocation, shelterLocs[bid.shelterId] ?? {}, softWeights, caseSpecies),
  })).sort((a, b) => b.matchScore - a.matchScore);

  const winner = scored[0];
  const now    = new Date().toISOString();

  console.log(`Winner: ${winner.shelterId} (${winner.matchScore.toFixed(3)})`);
  scored.forEach(b => console.log(`  ${b.shelterId}: ${b.matchScore.toFixed(3)} (${b.dataFreshness})`));

  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: `
      SET #s = :s, assignedTo = :shelter, bidSummary = :bs,
          eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)
    `,
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s':       'AWAITING_CONFIRMATION',
      ':shelter': winner.shelterId,
      ':bs': {
        winner:      winner.shelterId,
        winnerScore: winner.matchScore,
        allBids:     scored.map(b => ({
          shelterId:    b.shelterId,
          matchScore:   b.matchScore,
          dataFreshness: b.dataFreshness,
          slots:        b.availableSlots,
          hasVet:       b.hasVetOnSite,
        })),
        needsProfile,
      },
      ':empty': [],
      ':entry': [{
        agent:     'arbitrator',
        timestamp: now,
        action:    'assigned',
        summary:   `${winner.shelterId} selected (score: ${winner.matchScore.toFixed(3)}). ` +
                   `${scored.length} eligible bid(s) evaluated. Awaiting confirmation.`,
      }],
    },
  }));

  await putEvent('rescuenet.arbitrator', 'CaseAssigned', {
    caseId,
    winningShelter:     winner,
    allScoredBids:      scored,
    needsProfile,
    autonomyPreference: winner.autonomyPreference,
    timestamp:          now,
  });
}

// ── Case-relative match scoring ────────────────────────────────────────────
function computeMatchScore(
  bid:         ShelterBid,
  caseLoc:     { lat: number; lng: number },
  shelterLoc:  Partial<{ lat: number; lng: number }>,
  weights:     NeedsProfile['softWeights'],
  caseSpecies?: string,
): number {
  const vetScore   = bid.hasVetOnSite ? 1.00 : bid.vetCanBeArranged ? 0.60 : 0.00;
  const slotsNorm  = Math.min((bid.availableSlots ?? 0) / 5, 1.0);
  const windowNorm = Math.max(0, 1 - (bid.estimatedIntakeWindowMinutes ?? 60) / 120);
  const urgScore   = (slotsNorm + windowNorm) / 2;
  const specScore  = speciesMatchScore(bid.acceptedSpecies, caseSpecies);

  const dist     = bid.distanceKm ?? haversineKm(caseLoc?.lat, caseLoc?.lng, shelterLoc?.lat, shelterLoc?.lng);
  const proxScore = Math.max(0, 1 - dist / 30);
  const ltcScore  = slotsNorm;

  const raw = vetScore   * weights.vet_care               +
              urgScore   * weights.pickup_urgency          +
              specScore  * weights.species_specialization  +
              proxScore  * weights.proximity               +
              ltcScore   * weights.long_term_care;

  return raw * bid.confidence * (FRESHNESS_WEIGHT[bid.dataFreshness] ?? 0.55);
}

async function escalate(caseId: string, reason: string) {
  const now = new Date().toISOString();
  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: `SET #s = :s, eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)`,
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s':     'ESCALATED',
      ':empty': [],
      ':entry': [{ agent: 'arbitrator', timestamp: now, action: 'escalated', summary: reason }],
    },
  }));
  await putEvent('rescuenet.arbitrator', 'EscalationRequired', { caseId, reason, timestamp: now });
  console.log(`Case ${caseId} escalated: ${reason}`);
}

async function getShelterLocations(ids: string[]): Promise<Record<string, Partial<{ lat: number; lng: number }>>> {
  const out: Record<string, Partial<{ lat: number; lng: number }>> = {};
  await Promise.all(ids.map(async id => {
    const r = await ddb.send(new GetCommand({ TableName: process.env.SHELTERS_TABLE!, Key: { shelterId: id } }));
    if (r.Item) out[id] = (r.Item as { location?: { lat: number; lng: number } }).location ?? {};
  }));
  return out;
}

function defaultProfile(): NeedsProfile {
  return {
    hardConstraints: [],
    softWeights:     { vet_care: 0.10, pickup_urgency: 0.30, species_specialization: 0.20, proximity: 0.30, long_term_care: 0.10 },
    urgencyLevel:    'MEDIUM',
    reasoning:       'Default profile.',
  };
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
