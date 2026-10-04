import {
  ARCHETYPES, FACTORS, Archetype, Probabilities, VectorSet, Weights,
  blendWeights, deriveWeights, loadVectors, parseArchetypeProbabilities, topArchetype, validateVectors,
} from '../lambda/shared/weights';

// Distinct, valid test vectors so blend behavior is observable (the shipped file is placeholder-equal).
const V: VectorSet = {
  INJURED_CRITICAL: { vet_care: 0.50, pickup_urgency: 0.25, species_specialization: 0.10, proximity: 0.10, long_term_care: 0.05 },
  URGENT_TRANSIENT: { vet_care: 0.10, pickup_urgency: 0.40, species_specialization: 0.10, proximity: 0.35, long_term_care: 0.05 },
  STABLE_ROUTINE:   { vet_care: 0.10, pickup_urgency: 0.10, species_specialization: 0.30, proximity: 0.20, long_term_care: 0.30 },
};
const oneHot = (a: Archetype): Probabilities => ({ INJURED_CRITICAL: 0, URGENT_TRANSIENT: 0, STABLE_ROUTINE: 0, [a]: 1 });
const sum = (w: Weights) => FACTORS.reduce((s, f) => s + w[f], 0);

describe('shipped vectors (ahp-weights.json)', () => {
  it('load and validate (each archetype sums to 1)', () => {
    expect(() => validateVectors(loadVectors())).not.toThrow();
  });
});

describe('blend properties', () => {
  const cases: Probabilities[] = [
    { INJURED_CRITICAL: 0.7, URGENT_TRANSIENT: 0.25, STABLE_ROUTINE: 0.05 },
    { INJURED_CRITICAL: 0.2, URGENT_TRANSIENT: 0.5, STABLE_ROUTINE: 0.3 },
    { INJURED_CRITICAL: 1 / 3, URGENT_TRANSIENT: 1 / 3, STABLE_ROUTINE: 1 / 3 },
  ];
  it.each(cases)('weights sum to 1 (%j)', p => {
    expect(Math.abs(sum(blendWeights(p, V)) - 1)).toBeLessThan(1e-9);
  });
  it.each(cases)('each component stays between the smallest and largest archetype value (%j)', p => {
    const w = blendWeights(p, V);
    for (const f of FACTORS) {
      const vals = ARCHETYPES.map(a => V[a][f]);
      expect(w[f]).toBeGreaterThanOrEqual(Math.min(...vals) - 1e-12);
      expect(w[f]).toBeLessThanOrEqual(Math.max(...vals) + 1e-12);
    }
  });
  it.each(ARCHETYPES)('one-hot %s returns exactly that archetype vector', a => {
    const w = blendWeights(oneHot(a), V);
    for (const f of FACTORS) expect(w[f]).toBeCloseTo(V[a][f], 12);
  });
  it('vet_care rises monotonically as INJURED_CRITICAL probability rises', () => {
    let prev = -1;
    for (const pic of [0, 0.25, 0.5, 0.75, 1]) {
      const rest = (1 - pic) / 2;
      const w = blendWeights({ INJURED_CRITICAL: pic, URGENT_TRANSIENT: rest, STABLE_ROUTINE: rest }, V);
      expect(w.vet_care).toBeGreaterThan(prev);
      prev = w.vet_care;
    }
  });
  it('is exactly reproducible: same input twice gives identical output', () => {
    const p = cases[0];
    expect(deriveWeights(p, V)).toEqual(deriveWeights(p, V));
  });
});

describe('fallback and validation', () => {
  const STABLE = V.STABLE_ROUTINE;
  const bad: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['string', 'INJURED_CRITICAL'],
    ['empty object', {}],
    ['missing key', { INJURED_CRITICAL: 0.5, URGENT_TRANSIENT: 0.5 }],
    ['negative probability', { INJURED_CRITICAL: -0.1, URGENT_TRANSIENT: 0.6, STABLE_ROUTINE: 0.5 }],
    ['NaN probability', { INJURED_CRITICAL: NaN, URGENT_TRANSIENT: 0.5, STABLE_ROUTINE: 0.5 }],
    ['Infinity probability', { INJURED_CRITICAL: Infinity, URGENT_TRANSIENT: 0, STABLE_ROUTINE: 0 }],
    ['string-valued probability', { INJURED_CRITICAL: '0.9', URGENT_TRANSIENT: 0.1, STABLE_ROUTINE: 0 }],
    ['all zero', { INJURED_CRITICAL: 0, URGENT_TRANSIENT: 0, STABLE_ROUTINE: 0 }],
  ];
  it.each(bad)('malformed input (%s) falls back to the STABLE_ROUTINE vector without throwing', (_n, input) => {
    const r = deriveWeights(input, V);
    expect(r.usedFallback).toBe(true);
    expect(r.archetypeProbabilities).toEqual(oneHot('STABLE_ROUTINE'));
    for (const f of FACTORS) expect(r.softWeights[f]).toBeCloseTo(STABLE[f], 12);
  });
  it('probabilities not summing to 1 are renormalized, not rejected', () => {
    const r = deriveWeights({ INJURED_CRITICAL: 2, URGENT_TRANSIENT: 1, STABLE_ROUTINE: 1 }, V);
    expect(r.usedFallback).toBe(false);
    expect(r.archetypeProbabilities.INJURED_CRITICAL).toBeCloseTo(0.5, 12);
    expect(Math.abs(sum(r.softWeights) - 1)).toBeLessThan(1e-9);
  });
  it('parseArchetypeProbabilities does not renormalize', () => {
    expect(parseArchetypeProbabilities({ INJURED_CRITICAL: 2, URGENT_TRANSIENT: 1, STABLE_ROUTINE: 1 })?.INJURED_CRITICAL).toBe(2);
  });
  it('validateVectors rejects a vector set that does not sum to 1', () => {
    const broken = { ...V, INJURED_CRITICAL: { ...V.INJURED_CRITICAL, vet_care: 0.9 } };
    expect(() => validateVectors(broken)).toThrow(/sum to 1/);
  });
});

describe('ladder rung 2: top-archetype mode', () => {
  it('returns the highest-probability archetype vector unchanged', () => {
    const r = deriveWeights({ INJURED_CRITICAL: 0.6, URGENT_TRANSIENT: 0.3, STABLE_ROUTINE: 0.1 }, V, 'top');
    expect(r.softWeights).toEqual(V.INJURED_CRITICAL);
  });
  it('resolves exact ties deterministically by archetype order', () => {
    expect(topArchetype({ INJURED_CRITICAL: 0.5, URGENT_TRANSIENT: 0.5, STABLE_ROUTINE: 0 })).toBe('INJURED_CRITICAL');
    expect(topArchetype({ INJURED_CRITICAL: 0, URGENT_TRANSIENT: 0.5, STABLE_ROUTINE: 0.5 })).toBe('URGENT_TRANSIENT');
  });
});
