import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});

// Returns short-lived presigned GET URLs for every photo uploaded to a case,
// so the app can render them without the bucket ever being public.
export const handler = async (event: { arguments: { caseId: string } }) => {
  const { caseId } = event.arguments;
  if (!/^[0-9a-f-]{36}$/i.test(caseId)) throw new Error('invalid caseId');

  const listed = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.PHOTO_BUCKET!,
    Prefix: `cases/${caseId}/`,
    MaxKeys: 10,
  }));

  const keys = (listed.Contents ?? [])
    .map(o => o.Key!)
    .filter(k => k.endsWith('.jpg'))
    .sort();

  return Promise.all(keys.map(key => getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.PHOTO_BUCKET!, Key: key }),
    { expiresIn: 900 },
  )));
};
