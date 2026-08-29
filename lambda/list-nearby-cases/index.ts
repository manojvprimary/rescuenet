import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, haversineKm, CaseRecord } from '../shared/utils';

// Demo-scale Scan + client-side distance filter, same approach dedup-agent already
// uses for its proximity check — a real geo index would be the next step past this
// table's size. Returns only what a passerby needs to know, not the full report.
export const handler = async (event: { arguments: { lat: number; lng: number; radiusKm: number } }) => {
  const { lat, lng, radiusKm } = event.arguments;

  const result = await ddb.send(new ScanCommand({
    TableName: process.env.CASES_TABLE!,
  }));

  const cases = (result.Items ?? []) as CaseRecord[];

  return cases
    .filter(c => c.status !== 'MERGED')
    .map(c => ({
      caseId:     c.caseId,
      status:     c.status,
      timestamp:  c.timestamp,
      species:    ((c.reportData?.imageAnalysis as Record<string, unknown>)?.species as string | undefined)
                    ?? (c.reportData?.species as string | undefined)
                    ?? null,
      distanceKm: haversineKm(lat, lng, c.location?.lat, c.location?.lng),
      lat:        c.location?.lat ?? null,
      lng:        c.location?.lng ?? null,
    }))
    .filter(c => c.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
};
