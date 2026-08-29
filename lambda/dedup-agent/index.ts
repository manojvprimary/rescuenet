import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, putEvent, getCase, haversineKm, CaseRecord } from '../shared/utils';

const CASES_TABLE      = process.env.CASES_TABLE!;
const WINDOW_HOURS     = 3;
const RADIUS_KM        = 1.0;
const MERGE_THRESHOLD  = 0.85;
const LINK_THRESHOLD   = 0.50;
const REQUIRED_AGENTS  = ['image-agent', 'geocoding-agent'];

export const handler = async (event: { source: string; 'detail-type': string; detail: Record<string, unknown> }) => {
  const { source, detail } = event;
  const detailType = event['detail-type'];

  if (detailType === 'ReportSubmitted') {
    // Fast path: geographic check only, no waiting
    await fastProximityCheck(detail as { caseId: string; location: { lat: number; lng: number } });
  } else if (detailType === 'AgentEnriched') {
    // Full path: only when all specialists have finished
    await checkAndPublish(detail as { caseId: string; agent: string });
  }

  return { statusCode: 200 };
};

async function fastProximityCheck(detail: { caseId: string; location: { lat: number; lng: number } }) {
  const { caseId, location: { lat, lng } } = detail;
  const cutoff    = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  const candidates = await queryRecentCases(cutoff, caseId);
  const nearby     = candidates.filter(c =>
    haversineKm(lat, lng, c.location?.lat, c.location?.lng) <= RADIUS_KM
  );

  const now = new Date().toISOString();
  await ddb.send(new UpdateCommand({
    TableName: CASES_TABLE,
    Key:       { caseId },
    UpdateExpression: 'SET eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)',
    ExpressionAttributeValues: {
      ':empty': [],
      ':entry': [{
        agent:     'dedup-agent',
        timestamp: now,
        action:    'proximity-checked',
        summary:   `${nearby.length} case(s) within ${RADIUS_KM}km. Waiting for enrichment.`,
      }],
    },
  }));
}

async function checkAndPublish(detail: { caseId: string; agent: string }) {
  const { caseId } = detail;
  const caseRecord = await getCase(caseId);
  if (!caseRecord) { console.warn(`Case ${caseId} not found`); return; }
  if (caseRecord.status !== 'SUBMITTED') return; // already processed

  // Check if all required agents have enriched
  const enrichedAgents = (caseRecord.eventHistory ?? [])
    .filter(e => e.action === 'enriched')
    .map(e => e.agent);

  const allDone = REQUIRED_AGENTS.every(a => enrichedAgents.includes(a));
  if (!allDone) {
    console.log(`${caseId}: waiting. Enriched so far: ${enrichedAgents.join(', ')}`);
    return;
  }

  console.log(`${caseId}: all specialist agents done — running full dedup`);

  const cutoff     = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000).toISOString();
  const candidates = await queryRecentCases(cutoff, caseId);

  let bestScore  = 0;
  let bestMatch: CaseRecord | undefined;

  for (const candidate of candidates) {
    if (candidate.status === 'MERGED') continue;
    const score = computeSimilarity(caseRecord, candidate);
    console.log(`  Similarity with ${candidate.caseId}: ${score.toFixed(3)}`);
    if (score > bestScore) { bestScore = score; bestMatch = candidate; }
  }

  const now = new Date().toISOString();

  if (bestScore >= MERGE_THRESHOLD && bestMatch) {
    await merge(caseId, bestMatch.caseId, bestScore, now);
  } else {
    // Unique or soft-linked — publish to bid pool
    const dupStatus = bestScore >= LINK_THRESHOLD ? 'LINKED' : 'UNIQUE';

    const linked = dupStatus === 'LINKED' && bestMatch ? bestMatch : undefined;
    await ddb.send(new UpdateCommand({
      TableName:  CASES_TABLE,
      Key:        { caseId },
      UpdateExpression: `
        SET #s = :s,
            dupStatus = :ds,
            eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)
      ` + (linked ? ', linkedTo = :lt' : ''),
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s':     'PUBLISHED',
        ':ds':    dupStatus,
        ':empty': [],
        ...(linked ? { ':lt': linked.caseId } : {}),
        ':entry': [{
          agent:     'dedup-agent',
          timestamp: now,
          action:    dupStatus === 'LINKED' ? 'soft-linked' : 'cleared',
          summary:   linked
            ? `LINKED to ${linked.caseId} (similarity ${bestScore.toFixed(3)}). Bid window opening.`
            : `${dupStatus}. Best similarity: ${bestScore.toFixed(3)}. Bid window opening.`,
        }],
      },
    }));

    await putEvent('rescuenet.dedup', 'CasePublished', {
      caseId,
      timestamp:  now,
      location:   caseRecord.location,
      reportData: caseRecord.reportData,
      dupStatus,
      bestSimilarityScore: bestScore,
    });
  }
}

// ── Similarity computation ─────────────────────────────────────────────────
function computeSimilarity(a: CaseRecord, b: CaseRecord): number {
  const distKm   = haversineKm(a.location?.lat, a.location?.lng, b.location?.lat, b.location?.lng);
  const locScore = Math.max(0, 1 - distKm / RADIUS_KM);

  const specA = (a.reportData?.imageAnalysis as Record<string,unknown>)?.species as string
             ?? a.reportData?.species as string ?? 'unknown';
  const specB = (b.reportData?.imageAnalysis as Record<string,unknown>)?.species as string
             ?? b.reportData?.species as string ?? 'unknown';
  const speciesScore = specA !== 'unknown' && specA === specB ? 1.0
                     : specA === 'unknown' || specB === 'unknown' ? 0.5 : 0.0;

  const hoursApart  = Math.abs(new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) / 3_600_000;
  const movementScore = distKm <= hoursApart * 15 ? 1.0 : 0.0; // 15 km/h dog speed cap

  // Image similarity — use species as proxy; real embeddings would improve this
  const imageScore = speciesScore * 0.7;

  return imageScore * 0.50 + locScore * 0.30 + movementScore * 0.20;
}

async function merge(newId: string, existingId: string, score: number, now: string) {
  await ddb.send(new UpdateCommand({
    TableName: CASES_TABLE,
    Key:       { caseId: newId },
    UpdateExpression: `
      SET #s = :s, mergedInto = :m,
          eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)
    `,
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s':     'MERGED',
      ':m':     existingId,
      ':empty': [],
      ':entry': [{
        agent:     'dedup-agent',
        timestamp: now,
        action:    'merged',
        summary:   `Auto-merged into ${existingId}. Score: ${score.toFixed(3)}.`,
      }],
    },
  }));
  console.log(`Merged ${newId} into ${existingId} (score: ${score.toFixed(3)})`);
}

// A case races through PUBLISHED in seconds (the arbitrator promotes it almost
// immediately), so a single-status query misses nearly every real duplicate.
// Consider every still-active status a candidate — only MERGED cases drop out.
const ACTIVE_STATUSES = ['SUBMITTED', 'PUBLISHED', 'AWAITING_CONFIRMATION', 'ASSIGNED', 'ESCALATED'];

async function queryRecentCases(cutoff: string, excludeId: string): Promise<CaseRecord[]> {
  const results = await Promise.all(ACTIVE_STATUSES.map(status =>
    ddb.send(new QueryCommand({
      TableName:              CASES_TABLE,
      IndexName:              'status-timestamp-index',
      KeyConditionExpression: '#s = :s AND #ts > :c',
      ExpressionAttributeNames:  { '#s': 'status', '#ts': 'timestamp' },
      ExpressionAttributeValues: { ':s': status, ':c': cutoff },
    })),
  ));
  return results
    .flatMap(r => (r.Items ?? []) as CaseRecord[])
    .filter(i => i.caseId !== excludeId);
}
