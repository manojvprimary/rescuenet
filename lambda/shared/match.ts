// Pure shelter-matching logic extracted verbatim from lambda/arbitrator/index.ts so the evaluation
// harness scores cases with the exact production arithmetic. No AWS clients, no I/O.
// Behavior is unchanged; test/match.test.ts pins it against a verbatim copy of the original code.

import { haversineKm } from './geo';
import { speciesMatchScore } from './scoring';
import type { NeedsProfile, ShelterBid } from './utils';

export const FRESHNESS_WEIGHT: Record<string, number> = {
  LIVE:   1.00,
  HUMAN:  0.88,
  SYNCED: 0.75,
  STATIC: 0.55,
};

/** Hard constraints (has_vet, accepts_species:X). A bid is eligible only if it passes every one. */
export function isEligible(bid: ShelterBid, hardConstraints: string[]): boolean {
  for (const c of hardConstraints) {
    if (c === 'has_vet' && !bid.hasVetOnSite && !bid.vetCanBeArranged) return false;
    if (c.startsWith('accepts_species:')) {
      const sp = c.split(':')[1];
      if (bid.acceptedSpecies && !bid.acceptedSpecies.includes(sp)) return false;
    }
  }
  return true;
}

// ── Case-relative match scoring ────────────────────────────────────────────
export function computeMatchScore(
  bid:         ShelterBid,
  caseLoc:     { lat: number; lng: number },
  shelterLoc:  Partial<{ lat: number; lng: number }>,
  weights:     NeedsProfile['softWeights'],
  caseSpecies?: string,
): number {
  const vetScore   = bid.hasVetOnSite ? 1.00 : bid.vetCanBeArranged ? 0.60 : 0.00;
  const slotsNorm  = Math.min((bid.availableSlots ?? 0) / 5, 1.0);
  const windowNorm = Math.max(0, 1 - (bid.estimatedIntakeWindowMinutes ?? 60) / 120);
  const urgScore   = (slotsNorm + windowNorm) / 2;
  const specScore  = speciesMatchScore(bid.acceptedSpecies, caseSpecies);

  const dist     = bid.distanceKm ?? haversineKm(caseLoc?.lat, caseLoc?.lng, shelterLoc?.lat, shelterLoc?.lng);
  const proxScore = Math.max(0, 1 - dist / 30);
  const ltcScore  = slotsNorm;

  const raw = vetScore   * weights.vet_care               +
              urgScore   * weights.pickup_urgency          +
              specScore  * weights.species_specialization  +
              proxScore  * weights.proximity               +
              ltcScore   * weights.long_term_care;

  return raw * bid.confidence * (FRESHNESS_WEIGHT[bid.dataFreshness] ?? 0.55);
}

/** The five weighted terms before the confidence/freshness multiplier, for the harness's decisive-factor log. */
export function factorContributions(
  bid:         ShelterBid,
  caseLoc:     { lat: number; lng: number },
  shelterLoc:  Partial<{ lat: number; lng: number }>,
  weights:     NeedsProfile['softWeights'],
  caseSpecies?: string,
): NeedsProfile['softWeights'] {
  const vetScore   = bid.hasVetOnSite ? 1.00 : bid.vetCanBeArranged ? 0.60 : 0.00;
  const slotsNorm  = Math.min((bid.availableSlots ?? 0) / 5, 1.0);
  const windowNorm = Math.max(0, 1 - (bid.estimatedIntakeWindowMinutes ?? 60) / 120);
  const dist       = bid.distanceKm ?? haversineKm(caseLoc?.lat, caseLoc?.lng, shelterLoc?.lat, shelterLoc?.lng);
  return {
    vet_care:               vetScore * weights.vet_care,
    pickup_urgency:         ((slotsNorm + windowNorm) / 2) * weights.pickup_urgency,
    species_specialization: speciesMatchScore(bid.acceptedSpecies, caseSpecies) * weights.species_specialization,
    proximity:              Math.max(0, 1 - dist / 30) * weights.proximity,
    long_term_care:         slotsNorm * weights.long_term_care,
  };
}

export interface ScoredBid extends ShelterBid { matchScore: number }

/** Filter by hard constraints, score, sort descending (stable for ties, as Array.prototype.sort is in Node 20). */
export function rankBids(
  bids: ShelterBid[],
  needsProfile: Pick<NeedsProfile, 'hardConstraints' | 'softWeights'>,
  caseLoc: { lat: number; lng: number },
  shelterLocs: Record<string, Partial<{ lat: number; lng: number }>>,
  caseSpecies?: string,
): ScoredBid[] {
  return bids
    .filter(b => isEligible(b, needsProfile.hardConstraints))
    .map(bid => ({ ...bid, matchScore: computeMatchScore(bid, caseLoc, shelterLocs[bid.shelterId] ?? {}, needsProfile.softWeights, caseSpecies) }))
    .sort((a, b) => b.matchScore - a.matchScore);
}
