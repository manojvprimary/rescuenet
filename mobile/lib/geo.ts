// Mirrors lambda/shared/utils.ts's haversineKm so distances shown on-device match
// what the arbitrator actually scores against.
export function haversineKm(lat1?: number, lng1?: number, lat2?: number, lng2?: number): number {
  if (lat1 == null || lat2 == null || lng1 == null || lng2 == null) return Infinity;
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2
             + Math.cos(lat1 * Math.PI / 180)
             * Math.cos(lat2 * Math.PI / 180)
             * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
