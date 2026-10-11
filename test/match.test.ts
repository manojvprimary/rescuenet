import { computeMatchScore, factorContributions, isEligible, rankBids, FRESHNESS_WEIGHT } from '../lambda/shared/match';
import { haversineKm } from '../lambda/shared/geo';
import { speciesMatchScore } from '../lambda/shared/scoring';
import type { NeedsProfile, ShelterBid } from '../lambda/shared/utils';

// ── Verbatim copies of the code that lived in lambda/arbitrator/index.ts before extraction (HEAD 265183c). ──
// Kept in the test as an oracle: the extracted module must give identical results on every input below.
const ORIGINAL_FRESHNESS: Record<string, number> = { LIVE: 1.00, HUMAN: 0.88, SYNCED: 0.75, STATIC: 0.55 };

function originalComputeMatchScore(
  bid: ShelterBid, caseLoc: { lat: number; lng: number }, shelterLoc: Partial<{ lat: number; lng: number }>,
  weights: NeedsProfile['softWeights'], caseSpecies?: string,
): number {
  const vetScore   = bid.hasVetOnSite ? 1.00 : bid.vetCanBeArranged ? 0.60 : 0.00;
  const slotsNorm  = Math.min((bid.availableSlots ?? 0) / 5, 1.0);
  const windowNorm = Math.max(0, 1 - (bid.estimatedIntakeWindowMinutes ?? 60) / 120);
  const urgScore   = (slotsNorm + windowNorm) / 2;
  const specScore  = speciesMatchScore(bid.acceptedSpecies, caseSpecies);
  const dist     = bid.distanceKm ?? haversineKm(caseLoc?.lat, caseLoc?.lng, shelterLoc?.lat, shelterLoc?.lng);
  const proxScore = Math.max(0, 1 - dist / 30);
  const ltcScore  = slotsNorm;
  const raw = vetScore * weights.vet_care + urgScore * weights.pickup_urgency + specScore * weights.species_specialization +
              proxScore * weights.proximity + ltcScore * weights.long_term_care;
  return raw * bid.confidence * (ORIGINAL_FRESHNESS[bid.dataFreshness] ?? 0.55);
}

function originalEligible(bid: ShelterBid, hardConstraints: string[]): boolean {
  for (const c of hardConstraints) {
    if (c === 'has_vet' && !bid.hasVetOnSite && !bid.vetCanBeArranged) return false;
    if (c.startsWith('accepts_species:')) {
      const sp = c.split(':')[1];
      if (bid.acceptedSpecies && !bid.acceptedSpecies.includes(sp)) return false;
    }
  }
  return true;
}

const bid = (o: Partial<ShelterBid> = {}): ShelterBid => ({
  caseId: 'c', shelterId: 's', shelterName: 'S', availableSlots: 3, hasVetOnSite: true, acceptedSpecies: ['dog', 'cat'],
  distanceKm: 5, confidence: 0.9, estimatedIntakeWindowMinutes: 30, notes: '', dataFreshness: 'LIVE',
  autonomyPreference: 'AUTO', timestamp: '2026-10-10T00:00:00Z', ...o,
});
const W: NeedsProfile['softWeights'] = { vet_care: 0.4, pickup_urgency: 0.2, species_specialization: 0.15, proximity: 0.15, long_term_care: 0.1 };
const loc = { lat: 40.75, lng: -73.99 };

describe('extraction is behavior-preserving (oracle = original arbitrator code)', () => {
  const variants: Partial<ShelterBid>[] = [
    {}, { hasVetOnSite: false }, { hasVetOnSite: false, vetCanBeArranged: true }, { availableSlots: 0 }, { availableSlots: 12 },
    { distanceKm: 0 }, { distanceKm: 31 }, { distanceKm: undefined }, { estimatedIntakeWindowMinutes: undefined },
    { estimatedIntakeWindowMinutes: 200 }, { acceptedSpecies: undefined }, { acceptedSpecies: [] }, { acceptedSpecies: ['bird'] },
    { dataFreshness: 'HUMAN' }, { dataFreshness: 'SYNCED' }, { dataFreshness: 'STATIC' }, { dataFreshness: 'UNKNOWN' as ShelterBid['dataFreshness'] },
    { confidence: 0.3 },
  ];
  const species = [undefined, 'dog', 'cat', 'rabbit'];
  const weights: NeedsProfile['softWeights'][] = [
    W, { vet_care: 0.2, pickup_urgency: 0.2, species_specialization: 0.2, proximity: 0.2, long_term_care: 0.2 },
    { vet_care: 0, pickup_urgency: 0.35, species_specialization: 0.05, proximity: 0.5, long_term_care: 0.1 },
  ];
  it('computeMatchScore matches the original on a grid of 18 bids x 4 species x 3 weight sets (216 comparisons)', () => {
    let n = 0;
    for (const v of variants) for (const sp of species) for (const w of weights) {
      const b = bid(v);
      const shelterLoc = { lat: 40.7947, lng: -73.9418 };
      expect(computeMatchScore(b, loc, shelterLoc, w, sp)).toBe(originalComputeMatchScore(b, loc, shelterLoc, w, sp));
      n++;
    }
    expect(n).toBe(216);
  });
  it('isEligible matches the original for every constraint combination', () => {
    const constraintSets = [[], ['has_vet'], ['accepts_species:dog'], ['accepts_species:rabbit'], ['has_vet', 'accepts_species:cat']];
    for (const v of variants) for (const cs of constraintSets) expect(isEligible(bid(v), cs)).toBe(originalEligible(bid(v), cs));
  });
  it('freshness table is unchanged', () => {
    expect(FRESHNESS_WEIGHT).toEqual(ORIGINAL_FRESHNESS);
  });
});

describe('rankBids', () => {
  it('excludes ineligible bids, sorts by score descending, and keeps shelter identity', () => {
    const bids = [
      bid({ shelterId: 'far', distanceKm: 20 }),
      bid({ shelterId: 'novet', hasVetOnSite: false, distanceKm: 1 }),
      bid({ shelterId: 'near', distanceKm: 2 }),
    ];
    const ranked = rankBids(bids, { hardConstraints: ['has_vet'], softWeights: W }, loc, {});
    expect(ranked.map(r => r.shelterId)).toEqual(['near', 'far']);
    expect(ranked[0].matchScore).toBeGreaterThan(ranked[1].matchScore);
  });
  it('returns an empty list when every bid fails a hard constraint', () => {
    expect(rankBids([bid({ hasVetOnSite: false })], { hardConstraints: ['has_vet'], softWeights: W }, loc, {})).toEqual([]);
  });
});

describe('factorContributions', () => {
  it('the five terms times confidence and freshness equal the match score', () => {
    const b = bid({ dataFreshness: 'SYNCED', confidence: 0.8 });
    const parts = factorContributions(b, loc, {}, W, 'dog');
    const sum = Object.values(parts).reduce((s, x) => s + x, 0);
    expect(sum * 0.8 * 0.75).toBeCloseTo(computeMatchScore(b, loc, {}, W, 'dog'), 12);
  });
});
