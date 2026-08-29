import type { DynamoDBStreamEvent } from 'aws-lambda';
import { unmarshall } from '@aws-sdk/util-dynamodb';

// Bridges plain DynamoDB writes to AppSync's realtime layer. AppSync subscriptions
// only fire when a *mutation* resolves through AppSync — every pipeline Lambda writes
// case status via a raw UpdateCommand, so without this, onCaseUpdated would never fire.
const APPSYNC_URL     = process.env.APPSYNC_URL!;
const APPSYNC_API_KEY = process.env.APPSYNC_API_KEY!;

const MUTATION = `
  mutation PublishCaseUpdate($input: PublishCaseUpdateInput!) {
    publishCaseUpdate(input: $input) { caseId status }
  }
`;

export const handler = async (event: DynamoDBStreamEvent) => {
  for (const record of event.Records) {
    if (record.eventName === 'REMOVE') continue;

    const newImageRaw = record.dynamodb?.NewImage;
    if (!newImageRaw) continue;
    // Streams events and the SDK's AttributeValue type are structurally identical at
    // runtime; @types/aws-lambda just models them more loosely than the SDK does.
    const newCase = unmarshall(newImageRaw as any) as Record<string, unknown>;

    const oldImageRaw = record.dynamodb?.OldImage;
    const oldStatus    = oldImageRaw ? unmarshall(oldImageRaw as any).status : undefined;
    if (newCase.status === oldStatus) continue; // only publish on an actual status change

    const input = {
      caseId:       newCase.caseId,
      timestamp:    newCase.timestamp,
      status:       newCase.status,
      location:     JSON.stringify(newCase.location ?? null),
      reporterId:   newCase.reporterId ?? null,
      channel:      newCase.channel ?? null,
      reportData:   JSON.stringify(newCase.reportData ?? null),
      eventHistory: JSON.stringify(newCase.eventHistory ?? null),
      needsProfile: JSON.stringify(newCase.needsProfile ?? null),
      bidSummary:   JSON.stringify(newCase.bidSummary ?? null),
      assignedTo:   newCase.assignedTo ?? null,
      dupStatus:    newCase.dupStatus ?? null,
      linkedTo:     newCase.linkedTo ?? null,
    };

    const resp = await fetch(APPSYNC_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': APPSYNC_API_KEY },
      body:    JSON.stringify({ query: MUTATION, variables: { input } }),
    });
    const body = await resp.json() as { errors?: unknown };
    if (body.errors) {
      console.error(`publishCaseUpdate failed for ${newCase.caseId}:`, JSON.stringify(body.errors));
    } else {
      console.log(`Published case update: ${newCase.caseId} -> ${newCase.status}`);
    }
  }
  return { statusCode: 200 };
};
