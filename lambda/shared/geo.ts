// Pure geometry helper. Lives apart from utils.ts so the scoring code and tests can use it
// without constructing any AWS clients. utils.ts re-exports it, so existing imports are unchanged.

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
