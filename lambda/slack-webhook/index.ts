import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createHmac, timingSafeEqual } from 'crypto';
import { ddb, putEvent, getSlackSecret, QA_QUESTIONS } from '../shared/utils';

const MAX_TIMESTAMP_SKEW_SEC = 60 * 5;

interface QaSession {
  sessionId: string;
  caseId:    string;
  shelterId: string;
  channelId: string;
  status:    string;
  answers:   Record<string, string>;
  createdAt: string;
}

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : (event.body ?? '');

  if (!(await isValidSlackRequest(event, rawBody))) {
    console.warn('slack-webhook: signature verification failed');
    return { statusCode: 401, body: 'invalid signature' };
  }

  const payload = JSON.parse(rawBody || '{}');

  // Slack's one-time handshake when the Request URL is first configured.
  if (payload.type === 'url_verification') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge: payload.challenge }) };
  }

  if (payload.type === 'event_callback') {
    await handleEvent(payload.event ?? {});
  }

  return { statusCode: 200, body: 'ok' };
};

async function isValidSlackRequest(event: APIGatewayProxyEvent, rawBody: string): Promise<boolean> {
  const headers        = lowercaseHeaders(event.headers ?? {});
  const timestamp       = headers['x-slack-request-timestamp'];
  const slackSignature  = headers['x-slack-signature'];
  if (!timestamp || !slackSignature) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (Number.isNaN(age) || age > MAX_TIMESTAMP_SKEW_SEC) return false;

  const { signingSecret } = await getSlackSecret();
  const baseString = `v0:${timestamp}:${rawBody}`;
  const expected   = 'v0=' + createHmac('sha256', signingSecret).update(baseString).digest('hex');

  const expectedBuf = Buffer.from(expected);
  const actualBuf    = Buffer.from(slackSignature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function lowercaseHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (v) out[k.toLowerCase()] = v;
  return out;
}

// A plain-text reply in a shelter's channel is treated as the answer to that
// channel's active session's next unanswered question, in QA_QUESTIONS order.
async function handleEvent(slackEvent: Record<string, unknown>) {
  if (slackEvent.type !== 'message' || slackEvent.subtype || slackEvent.bot_id) return;

  const channelId = slackEvent.channel as string;
  const text       = String(slackEvent.text ?? '').trim();
  if (!channelId || !text) return;

  const session = await findActiveSession(channelId);
  if (!session) {
    console.log(`slack-webhook: no active session for channel ${channelId} — ignoring message`);
    return;
  }

  const nextQuestion = QA_QUESTIONS.find(q => session.answers[q.id] === undefined);
  if (!nextQuestion) {
    console.log(`slack-webhook: session ${session.sessionId} already complete — ignoring message`);
    return;
  }

  await putEvent('rescuenet.app', 'QaAnswerSubmitted', {
    sessionId:  session.sessionId,
    questionId: nextQuestion.id,
    answer:     text,
  });
  console.log(`slack-webhook: ${session.sessionId} — ${nextQuestion.id} = "${text}"`);
}

// Demo-scale lookup: a handful of concurrently open sessions at most, so a filtered
// Scan is fine here rather than adding a channelId GSI for one low-traffic query.
async function findActiveSession(channelId: string): Promise<QaSession | undefined> {
  const result = await ddb.send(new ScanCommand({
    TableName:        process.env.QA_TABLE!,
    FilterExpression: 'channelId = :c AND #st <> :done',
    ExpressionAttributeNames:  { '#st': 'status' },
    ExpressionAttributeValues: { ':c': channelId, ':done': 'COMPLETE' },
  }));
  const sessions = (result.Items ?? []) as QaSession[];
  sessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sessions[0];
}
