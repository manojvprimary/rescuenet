import { DynamoDBClient }          from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, QueryCommand }
  from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// ── Clients (Document Client handles marshall/unmarshall automatically) ────
const rawDdb = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(rawDdb, {
  marshallOptions:   { removeUndefinedValues: true, convertEmptyValues: false },
  unmarshallOptions: { wrapNumbers: false },
});

export const eb = new EventBridgeClient({});

export const BUS = process.env.EVENT_BUS_NAME!;

// ── Slack (Tier 2) ──────────────────────────────────────────────────────────
const secretsClient = new SecretsManagerClient({});

interface SlackSecret {
  botToken:      string;
  signingSecret: string;
  channels:      Record<string, string>;
}

let slackSecretCache: SlackSecret | undefined;

// Cached across warm invocations — every Tier 2 Lambda calls this, no need to
// hit Secrets Manager on every event.
export async function getSlackSecret(): Promise<SlackSecret> {
  if (slackSecretCache) return slackSecretCache;
  const result = await secretsClient.send(new GetSecretValueCommand({
    SecretId: process.env.SLACK_SECRET_ARN!,
  }));
  slackSecretCache = JSON.parse(result.SecretString!) as SlackSecret;
  return slackSecretCache;
}

// Tier 2 Q&A script — shared between tier2-agent (which asks) and slack-webhook
// (which needs the same ordered list to know which question a reply answers).
export const QA_QUESTIONS = [
  { id: 'can_take',      text: 'Can your shelter take this animal in? (Yes / No)' },
  { id: 'slot_count',    text: 'How many animals can you currently accept? (1 / 2 / 3+)' },
  { id: 'vet_available', text: 'Do you have a vet or vet tech available? (Yes — on site / Can arrange / No)' },
] as const;

export async function postSlackMessage(channelId: string, text: string): Promise<void> {
  const { botToken } = await getSlackSecret();
  const resp = await fetch('https://slack.com/api/chat.postMessage', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Authorization': `Bearer ${botToken}`,
    },
    body: JSON.stringify({ channel: channelId, text }),
  });
  const body = await resp.json() as { ok: boolean; error?: string };
  if (!body.ok) {
    console.error(`Slack chat.postMessage failed for channel ${channelId}:`, body.error);
  }
}

// ── Types ──────────────────────────────────────────────────────────────────
export interface Location {
  lat:             number;
  lng:             number;
  accuracyMetres?: number;
}

export interface HistoryEntry {
  agent:     string;
  timestamp: string;
  action:    string;
  summary:   string;
}

export interface CaseRecord {
  caseId:        string;
  timestamp:     string;
  status:        string;
  location:      Location;
  reporterId:    string;
  channel:       string;
  reportData:    Record<string, unknown>;
  eventHistory:  HistoryEntry[];
  needsProfile?: NeedsProfile;
  bidSummary?:   unknown;
  assignedTo?:   string;
  ttl?:          number;
}

export interface NeedsProfile {
  hardConstraints: string[];
  softWeights: {
    vet_care:               number;
    pickup_urgency:         number;
    species_specialization: number;
    proximity:              number;
    long_term_care:         number;
  };
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reasoning:    string;
}

export interface ShelterBid {
  caseId:                       string;
  shelterId:                    string;
  shelterName:                  string;
  availableSlots:               number;
  hasVetOnSite:                 boolean;
  vetCanBeArranged?:            boolean;
  acceptedSpecies?:             string[];
  distanceKm?:                  number;
  confidence:                   number;
  estimatedIntakeWindowMinutes: number;
  notes:                        string;
  dataFreshness:                'LIVE' | 'SYNCED' | 'HUMAN' | 'STATIC';
  autonomyPreference:           string;
  matchScore?:                  number;
  timestamp:                    string;
}

// ── DynamoDB helpers ───────────────────────────────────────────────────────
export async function getCase(caseId: string): Promise<CaseRecord | undefined> {
  const r = await ddb.send(new GetCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
  }));
  return r.Item as CaseRecord | undefined;
}

// needs-profile runs in parallel with the shelter agents (both fire off CasePublished)
// and can still be mid-flight when a shelter agent evaluates a case — bounded retry
// instead of always deciding against an empty constraint set.
export async function getNeedsProfileWithRetry(caseId: string): Promise<NeedsProfile | undefined> {
  for (const waitMs of [0, 1500, 1500]) {
    if (waitMs) await new Promise(r => setTimeout(r, waitMs));
    const caseRecord = await getCase(caseId);
    if (caseRecord?.needsProfile) return caseRecord.needsProfile;
  }
  console.warn(`needsProfile still missing for ${caseId} after retries`);
  return undefined;
}

export async function appendHistory(
  caseId:  string,
  entry:   HistoryEntry,
  extra?:  Record<string, unknown>,
): Promise<void> {
  const extraExpr  = extra
    ? ', ' + Object.keys(extra).map(k => `${k} = :${k}`).join(', ')
    : '';
  const extraVals  = extra
    ? Object.fromEntries(Object.entries(extra).map(([k, v]) => [`:${k}`, v]))
    : {};

  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: `SET eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)${extraExpr}`,
    ExpressionAttributeValues: {
      ':empty': [],
      ':entry': [entry],
      ...extraVals,
    },
  }));
}

export async function updateCaseStatus(
  caseId: string,
  status: string,
  entry:  HistoryEntry,
  extra?: Record<string, unknown>,
): Promise<void> {
  return appendHistory(caseId, entry, { '#status': status, ...extra });
}

// ── EventBridge helper ─────────────────────────────────────────────────────
export async function putEvent(
  source:     string,
  detailType: string,
  detail:     unknown,
): Promise<void> {
  await eb.send(new PutEventsCommand({
    Entries: [{
      EventBusName: BUS,
      Source:       source,
      DetailType:   detailType,
      Detail:       JSON.stringify(detail),
    }],
  }));
}

// ── Haversine distance ─────────────────────────────────────────────────────
export function haversineKm(
  lat1?: number, lng1?: number | null,
  lat2?: number, lng2?: number | null,
): number {
  if (lat1 == null || lat2 == null) return 999;
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = ((lng2 ?? 0) - (lng1 ?? 0)) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180)
             * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── TTL helper (30 days from now) ─────────────────────────────────────────
export const ttl30d = () => Math.floor(Date.now() / 1000) + 30 * 86400;
export const ttl1h  = () => Math.floor(Date.now() / 1000) + 3600;
