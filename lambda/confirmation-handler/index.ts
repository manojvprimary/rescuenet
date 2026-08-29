import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, putEvent, ShelterBid } from '../shared/utils';

export const handler = async (event: { 'detail-type': string; detail: Record<string, unknown> }) => {
  const { detail } = event;
  const detailType = event['detail-type'];

  if (detailType === 'CaseAssigned') {
    await handleAssigned(detail as { caseId: string; winningShelter: ShelterBid; autonomyPreference: string });
  } else if (detailType === 'ConfirmationReceived') {
    await handleConfirmation(detail as { caseId: string; shelterId: string; confirmed: boolean });
  }

  return { statusCode: 200 };
};

async function handleAssigned(detail: {
  caseId:            string;
  winningShelter:    ShelterBid;
  autonomyPreference: string;
}) {
  const { caseId, winningShelter, autonomyPreference } = detail;
  const now = new Date().toISOString();
  console.log(`Confirmation handler: case ${caseId} → ${winningShelter.shelterId} (${autonomyPreference})`);

  if (autonomyPreference === 'FULLY_AUTO') {
    await finalise(caseId, winningShelter.shelterId, now, 'Auto-confirmed by agent preference');
    return;
  }

  // REQUIRED confirmation — log and wait for coordinator tap
  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: 'SET eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)',
    ExpressionAttributeValues: {
      ':empty': [],
      ':entry': [{
        agent:     'confirmation-handler',
        timestamp: now,
        action:    'awaiting-confirmation',
        summary:   `Confirmation request sent to ${winningShelter.shelterId}. Coordinator must confirm.`,
      }],
    },
  }));

  console.log(`
  ═══════════════════════════════════════════════
  INTAKE CONFIRMATION REQUIRED
  Case:    ${caseId}
  Shelter: ${winningShelter.shelterName} (${winningShelter.shelterId})
  Score:   ${(winningShelter.matchScore ?? 0).toFixed(3)}

  Confirm via CLI:
  aws events put-events --event-bus-name rescuenet-bus --entries '[{
    "Source": "rescuenet.shelter",
    "DetailType": "ConfirmationReceived",
    "Detail": "{\\"caseId\\":\\"${caseId}\\",\\"shelterId\\":\\"${winningShelter.shelterId}\\",\\"confirmed\\":true}"
  }]'
  ═══════════════════════════════════════════════
  `);
}

async function handleConfirmation(detail: { caseId: string; shelterId: string; confirmed: boolean }) {
  const { caseId, shelterId, confirmed } = detail;
  const now = new Date().toISOString();

  if (confirmed) {
    await finalise(caseId, shelterId, now, 'Confirmed by coordinator');
  } else {
    await ddb.send(new UpdateCommand({
      TableName: process.env.CASES_TABLE!,
      Key:       { caseId },
      UpdateExpression: `SET #s = :s, eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)`,
      ExpressionAttributeNames:  { '#s': 'status' },
      ExpressionAttributeValues: {
        ':s':     'NEEDS_REROUTING',
        ':empty': [],
        ':entry': [{ agent: 'confirmation-handler', timestamp: now, action: 'declined-post-assignment',
                     summary: `${shelterId} declined after assignment — needs re-routing.` }],
      },
    }));
    await putEvent('rescuenet.confirmation-handler', 'ReroutingRequired', { caseId, declinedBy: shelterId, timestamp: now });
  }
}

async function finalise(caseId: string, shelterId: string, now: string, reason: string) {
  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: `SET #s = :s, eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)`,
    ExpressionAttributeNames:  { '#s': 'status' },
    ExpressionAttributeValues: {
      ':s':     'ASSIGNED',
      ':empty': [],
      ':entry': [{ agent: 'confirmation-handler', timestamp: now, action: 'confirmed',
                   summary: `Assignment finalised. Shelter: ${shelterId}. ${reason}.` }],
    },
  }));
  await putEvent('rescuenet.confirmation-handler', 'AssignmentFinalised', { caseId, shelterId, reason, timestamp: now });
  console.log(`Case ${caseId} ASSIGNED to ${shelterId} — ${reason}`);
}
