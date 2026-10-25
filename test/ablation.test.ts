import { FORMULAS, WEIGHT_METHODS, CaseInputs, CaseRow, Formula, contrast, key, runCell, runGrid, scoreWith, signTestP, summarize, weightsFor, wilson } from '../eval/ablation';
import { computeMatchScore } from '../lambda/shared/match';
import type { ShelterBid } from '../lambda/shared/utils';
import type { Annotations, Fixture } from '../eval/harness';

// Synthetic inputs only: these tests never read the committed evaluation data, so they cannot leak results
// before the ablation's pre-registration (docs/ABLATION_PREREGISTRATION.md) is committed.
const bid = (o: Partial<ShelterBid> = {}): ShelterBid => ({
  caseId: 'c', shelterId: 's', shelterName: 'S', availableSlots: 3, hasVetOnSite: true, acceptedSpecies: ['dog', 'cat'], distanceKm: 5, confidence: 0.9,
  estimatedIntakeWindowMinutes: 30, notes: '', dataFreshness: 'LIVE', autonomyPreference: 'AUTO', timestamp: 't', ...o,
});
const loc = { lat: 40.75, lng: -73.99 };
const W1 = { vet_care: 0.4, pickup_urgency: 0.2, species_specialization: 0.15, proximity: 0.15, long_term_care: 0.1 };
const F = (id: string) => FORMULAS.find(f => f.id === id) as Formula;

describe('formula variants', () => {
  it('F0 reproduces the production score exactly on a grid of bids, species and weights', () => {
    const variants: Partial<ShelterBid>[] = [{}, { hasVetOnSite: false }, { hasVetOnSite: false, vetCanBeArranged: true }, { availableSlots: 0 }, { availableSlots: 9 }, { distanceKm: 0 }, { distanceKm: 31 }, { estimatedIntakeWindowMinutes: 200 }, { acceptedSpecies: ['bird'] }, { dataFreshness: 'STATIC', confidence: 0.4 }];
    let n = 0;
    for (const v of variants) for (const sp of [undefined, 'dog', 'rabbit']) {
      expect(scoreWith(F('F0'), bid(v), loc, W1, sp)).toBe(computeMatchScore(bid(v), loc, {}, W1, sp)); n++;
    }
    expect(n).toBe(30);
  });
  it('F1 stops open slots feeding pickup urgency (only the intake window does)', () => {
    const w = { vet_care: 0, pickup_urgency: 1, species_specialization: 0, proximity: 0, long_term_care: 0 };
    const few = bid({ availableSlots: 1 }), many = bid({ availableSlots: 5 });
    expect(scoreWith(F('F0'), many, loc, w)).toBeGreaterThan(scoreWith(F('F0'), few, loc, w));       // production: slots help pickup urgency
    expect(scoreWith(F('F1'), many, loc, w)).toBeCloseTo(scoreWith(F('F1'), few, loc, w), 12);       // capacity once: they do not
  });
  it('F1 still rewards capacity through long-term care', () => {
    const w = { vet_care: 0, pickup_urgency: 0, species_specialization: 0, proximity: 0, long_term_care: 1 };
    expect(scoreWith(F('F1'), bid({ availableSlots: 5 }), loc, w)).toBeGreaterThan(scoreWith(F('F1'), bid({ availableSlots: 1 }), loc, w));
  });
  it('F2 uses a 10 km distance scale and F0 a 30 km scale', () => {
    const w = { vet_care: 0, pickup_urgency: 0, species_specialization: 0, proximity: 1, long_term_care: 0 };
    const b = bid({ distanceKm: 10 });
    expect(scoreWith(F('F0'), b, loc, w)).toBeCloseTo((1 - 10 / 30) * 0.9 * 1.0, 12);
    expect(scoreWith(F('F2'), b, loc, w)).toBeCloseTo(0, 12);
    expect(scoreWith(F('F2'), bid({ distanceKm: 5 }), loc, w)).toBeCloseTo((1 - 5 / 10) * 0.9, 12);
  });
  it('F3 combines both changes', () => {
    const w = { vet_care: 0, pickup_urgency: 0.5, species_specialization: 0, proximity: 0.5, long_term_care: 0 };
    const b = bid({ availableSlots: 5, distanceKm: 5, estimatedIntakeWindowMinutes: 60 });
    expect(scoreWith(F('F3'), b, loc, w)).toBeCloseTo((0.5 * 0.5 + 0.5 * (1 - 5 / 10)) * 0.9, 12);
  });
  it('there are exactly four formulas and four weighting methods', () => {
    expect(FORMULAS.map(f => f.id)).toEqual(['F0', 'F1', 'F2', 'F3']);
    expect(WEIGHT_METHODS.map(m => m.id)).toEqual(['equal', 'v1', 'blend', 'top']);
  });
});

describe('weighting methods', () => {
  const fx: Fixture = { id: 'T-1', description: 't', caseLocation: loc, reportData: { species: 'dog', imageAnalysis: { species: 'dog', injuryIndicators: ['x'] } }, bids: [bid({ shelterId: 'shelter-A' })] };
  const ci: CaseInputs = { fixture: fx, v1Weights: W1, probabilities: { INJURED_CRITICAL: 0.7, URGENT_TRANSIENT: 0.2, STABLE_ROUTINE: 0.1 } };
  it('equal gives 0.2 each; v1 returns the frozen weights; blend and top sum to 1 and differ', () => {
    const eq = weightsFor('equal', ci)!; Object.values(eq).forEach(v => expect(v).toBeCloseTo(0.2, 12));
    expect(weightsFor('v1', ci)).toEqual(W1);
    const bl = weightsFor('blend', ci)!, tp = weightsFor('top', ci)!;
    expect(Object.values(bl).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
    expect(Object.values(tp).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
    expect(bl).not.toEqual(tp);
  });
  it('a missing input yields no cell rather than a guess', () => {
    expect(weightsFor('v1', { ...ci, v1Weights: null })).toBeNull();
    expect(weightsFor('blend', { ...ci, probabilities: null })).toBeNull();
    expect(runCell(F('F0'), { ...ci, v1Weights: null }, 'v1')).toBeNull();
  });
});

describe('grid, summary, and statistics', () => {
  const mk = (id: string, bestId: string, bids: ShelterBid[], extra: Partial<Fixture> = {}): CaseInputs => ({
    fixture: { id, description: id, caseLocation: loc, reportData: { species: 'dog', reporterSituation: 'calm', imageAnalysis: { species: 'dog', injuryIndicators: [] } }, bids, ...extra },
    v1Weights: W1, probabilities: { INJURED_CRITICAL: 0.05, URGENT_TRANSIENT: 0.05, STABLE_ROUTINE: 0.9 },
  });
  const ann = (m: Record<string, { best: string; tests?: string }>): Annotations => ({ version: 1, tieBreakRule: '', cases: Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { archetype: ['STABLE_ROUTINE'], bestShelter: v.best, tests: v.tests, rationale: '' } as never])) });
  const a = bid({ shelterId: 'shelter-A', distanceKm: 1 }), b = bid({ shelterId: 'shelter-B', distanceKm: 20 });
  const sets = [{ name: 's', cases: [mk('X-1', 'shelter-A', [a, b]), mk('X-2', 'shelter-A', [a]), mk('X-3', 'shelter-A', [a, b])], annotations: ann({ 'X-1': { best: 'shelter-A' }, 'X-2': { best: 'shelter-A' }, 'X-3': { best: 'shelter-A', tests: 'control' } }) }];
  const rows = runGrid(sets);
  it('runs all 16 cells for each annotated case and marks single-eligible cases uninformative', () => {
    expect(rows).toHaveLength(3);
    rows.forEach(r => expect(Object.keys(r.cells)).toHaveLength(16));
    expect(rows.find(r => r.id === 'X-2')!.informative).toBe(false);
    expect(rows.find(r => r.id === 'X-3')!.control).toBe(true);
  });
  it('summarizes counts over informative non-control cases and checks the control', () => {
    const s = summarize(rows);
    expect(s.informativeCases).toBe(1);
    expect(s.correct[key('F0', 'equal')]).toBe(1);   // the near shelter is clearly better under every method here
    expect(s.controlsAllCorrect).toBe(true);
    expect(s.weightSwapPairs).toBe(24); expect(s.formulaSwapPairs).toBe(24);
    expect(s.weightSwapDiffRate).toBe(0); expect(s.formulaSwapDiffRate).toBe(0);
  });
  it('counts a swap that changes the winner', () => {
    const flip: CaseRow = { id: 'F-1', set: 's', best: 'shelter-A', informative: true, control: false, cells: Object.fromEntries(FORMULAS.flatMap(f => WEIGHT_METHODS.map(m => [key(f.id, m.id), { winner: f.id === 'F1' ? 'shelter-B' : 'shelter-A', margin: 0.1, eligible: 2 }]))) };
    const s = summarize([flip]);
    expect(s.formulaSwapDiffRate).toBeGreaterThan(0);   // F1 differs from F0, F2, F3
    expect(s.weightSwapDiffRate).toBe(0);               // weights never change the winner
    expect(s.casesWhereFormulaChangesWinner).toBe(1); expect(s.casesWhereWeightsChangeWinner).toBe(0);
    const c = contrast([flip], key('F0', 'equal'), key('F1', 'equal'));
    expect(c.aOnly).toBe(1); expect(c.bOnly).toBe(0);
  });
  it('is deterministic', () => { expect(JSON.stringify(runGrid(sets))).toBe(JSON.stringify(runGrid(sets))); });
  it('sign test: known values', () => {
    expect(signTestP(0, 0)).toBe(1);
    expect(signTestP(3, 3)).toBeCloseTo(0.25, 12);
    expect(signTestP(0, 10)).toBeCloseTo(2 * Math.pow(0.5, 10), 12);
    expect(signTestP(5, 10)).toBeCloseTo(1, 12);
    expect(signTestP(7, 10)).toBeCloseTo(0.34375, 6);
  });
  it('Wilson interval: bounded, contains the point estimate, and is wide for small n', () => {
    const [lo, hi] = wilson(3, 6);
    expect(lo).toBeGreaterThanOrEqual(0); expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeLessThan(0.5); expect(hi).toBeGreaterThan(0.5);
    expect(hi - lo).toBeGreaterThan(0.4);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});
