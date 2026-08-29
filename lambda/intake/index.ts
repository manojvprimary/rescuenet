import { PutCommand }    from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { S3Client }      from '@aws-sdk/client-s3';
import { getSignedUrl }  from '@aws-sdk/s3-request-presigner';
import { randomUUID }    from 'crypto';
import { ddb, putEvent, ttl30d } from '../shared/utils';

const s3 = new S3Client({});

export const handler = async (event: Record<string, unknown>) => {
  // AppSync Lambda resolvers pass GraphQL arguments as event.arguments.input rather
  // than an HTTP-shaped body — everything else (direct invoke, API Gateway, ALB)
  // keeps working exactly as before.
  const isAppSync = !!(event.arguments as Record<string, unknown> | undefined)?.input;
  const body = isAppSync
    ? (event.arguments as { input: Record<string, unknown> }).input
    : typeof event.body === 'string'
      ? JSON.parse(event.body) as Record<string, unknown>
      : (event.body as Record<string, unknown> | undefined) ?? event;

  const {
    reportType      = 'STRAY',
    lat,
    lng,
    accuracyMetres  = 0,
    reporterId      = 'anonymous',
    channel         = 'APP',
    reportData      = {},
    wantsPhotoUpload = false,
    photoCount       = 0,
  } = body as {
    reportType?:       string;
    lat:               number;
    lng:               number;
    accuracyMetres?:   number;
    reporterId?:       string;
    channel?:          string;
    reportData?:       Record<string, unknown>;
    wantsPhotoUpload?: boolean;
    photoCount?:       number;
  };

  if (!lat || !lng) {
    if (isAppSync) throw new Error('lat and lng are required');
    return { statusCode: 400, body: JSON.stringify({ error: 'lat and lng are required' }) };
  }

  const caseId    = randomUUID();
  const timestamp = new Date().toISOString();

  // Optional presigned URLs for direct-to-S3 photo upload, up to 5 per report.
  // The first key keeps the legacy "photo-original.jpg" name — image-agent reads
  // reportData.photoKey and analyzes that one.
  const requestedPhotos = Math.min(Math.max(photoCount || (wantsPhotoUpload ? 1 : 0), 0), 5);
  const photoKeys: string[] = [];
  const photoUploadUrls: string[] = [];

  for (let i = 0; i < requestedPhotos; i++) {
    const key = i === 0 ? `cases/${caseId}/photo-original.jpg` : `cases/${caseId}/photo-${i + 1}.jpg`;
    photoKeys.push(key);
    photoUploadUrls.push(await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket:      process.env.PHOTO_BUCKET!,
        Key:         key,
        ContentType: 'image/jpeg',
      }),
      { expiresIn: 300 },
    ));
  }

  // Build the initial case — reportData is fully freeform
  const fullReportData: Record<string, unknown> = {
    reportType,
    ...(reportData as object),
    ...(photoKeys.length ? { photoKey: photoKeys[0], photoKeys, photoUploaded: false } : {}),
  };

  const caseRecord = {
    caseId,
    timestamp,
    status:       'SUBMITTED',
    reporterId,
    channel,
    location:     { lat, lng, accuracyMetres },
    // ↓ open key-value map — anything the reporter provides lives here
    reportData:   fullReportData,
    eventHistory: [{
      agent:     'intake',
      timestamp,
      action:    'created',
      summary:   `Report received via ${channel}. Type: ${reportType}.`,
    }],
    ttl: ttl30d(),
  };

  await ddb.send(new PutCommand({
    TableName:           process.env.CASES_TABLE!,
    Item:                caseRecord,
    ConditionExpression: 'attribute_not_exists(caseId)',
  }));

  // Fire the first event onto the bus — specialist agents wake up
  await putEvent('rescuenet.intake', 'ReportSubmitted', {
    caseId,
    timestamp,
    location:   { lat, lng, accuracyMetres },
    reportData: fullReportData,
    channel,
    reporterId,
  });

  console.log(`Case ${caseId} created and ReportSubmitted fired`);

  const result = {
    caseId,
    status:    'SUBMITTED',
    timestamp,
    photoUploadUrl:  photoUploadUrls[0] ?? null,
    photoKey:        photoKeys[0] ?? null,
    photoUploadUrls: photoUploadUrls.length ? photoUploadUrls : null,
    photoKeys:       photoKeys.length ? photoKeys : null,
    message: 'Report received — specialist agents are processing.',
  };

  // AppSync expects the raw object matching SubmitReportResult, not an HTTP envelope.
  if (isAppSync) return result;

  return {
    statusCode: 200,
    headers:    { 'Content-Type': 'application/json' },
    body: JSON.stringify(result),
  };
};
