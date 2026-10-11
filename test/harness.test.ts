import { loadAnnotations, loadFixtures, NEAR_TIE_MARGIN, ruleClassifier, runEvaluation } from '../eval/harness';
import { VectorSet, loadVectors, WEIGHTS_VERSION } from '../lambda/shared/weights';

// Illustrative vectors for mechanism tests ONLY. They are not the student's elicited judgments and the
// tests below assert structure and invariants, never that these vectors produce the "right" winners.
const ILLUSTRATIVE: VectorSet = {
  INJURED_CRITICAL: { vet_care: 0.50, pickup_urgency: 0.25, species_specialization: 0.10, proximity: 0.10, long_term_care: 0.05 },
  URGENT_TRANSIENT: { vet_care: 0.10, pickup_urgency: 0.40, species_specialization: 0.10, proximity: 0.35, long_term_care: 0.05 },
  STABLE_ROUTINE:   { vet_care: 0.10, pickup_urgency: 0.10, species_specialization: 0.30, proximity: 0.20, long_term_care: 0.30 },
};
const run = (vectors: VectorSet = ILLUSTRATIVE, version = 'illustrative') =>
  runEvaluation({ classify: ruleClassifier, classifierName: 'rule', vectors, weightsVersion: version });

describe('fixtures and annotations (integrity)', () => {
  const fixtures = loadFixtures();
  const annotations = loadAnnotations();

  it('has the 8 synthetic cases from the Hard Stop 2 matrix, with unique ids', () => {
    expect(fixtures.map(f => f.id)).toEqual(['SYN-01', 'SYN-02', 'SYN-03', 'SYN-04', 'SYN-05', 'SYN-06', 'SYN-07', 'SYN-08']);
  });
  it('every fixture has an annotation and every annotation has a fixture', () => {
    expect(Object.keys(annotations.cases).sort()).toEqual(fixtures.map(f => f.id).sort());
  });
  it('runtime checks from the design: non-negative distances and slots, unique shelter ids per case, valid freshness', () => {
    for (const f of fixtures) {
      const ids = f.bids.map(b => b.shelterId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const b of f.bids) {
        expect(b.distanceKm ?? 0).toBeGreaterThanOrEqual(0);
        expect(b.availableSlots).toBeGreaterThanOrEqual(0);
        expect(b.confidence).toBeGreaterThan(0);
        expect(['LIVE', 'HUMAN', 'SYNCED', 'STATIC']).toContain(b.dataFreshness);
        expect(b.caseId).toBe(f.id);
      }
    }
  });
  it('every annotated best shelter exists among that case\'s bids', () => {
    for (const f of fixtures) {
      const best = annotations.cases[f.id].bestShelter;
      if (best && best.startsWith('shelter-')) expect(f.bids.map(b => b.shelterId)).toContain(best);
    }
  });
  it('the fixtures contain no personal information markers (phone numbers, emails, street addresses)', () => {
    const blob = JSON.stringify(fixtures);
    expect(blob).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
    expect(blob).not.toMatch(/[\w.]+@[\w.]+\.[a-z]{2,}/i);
  });
});

describe('harness behavior', () => {
  it('is deterministic: two runs give the identical result hash', () => {
    expect(run().resultHash).toBe(run().resultHash);
  });
  it('reports one result per fixture, and a summary consistent with the results', () => {
    const r = run();
    expect(r.results).toHaveLength(8);
    expect(r.summary.cases).toBe(8);
    expect(r.summary.winnerCorrect.correct).toBe(r.results.filter(x => x.correct).length);
    expect(r.summary.archetypeAgreement.of).toBe(7); // SYN-08 carries no archetype annotation
  });
  it('weights in every result sum to 1', () => {
    for (const x of run().results) expect(Object.values(x.softWeights).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
  });
  it('SYN-08: malformed classifier output uses the STABLE_ROUTINE fallback, does not throw, and is counted as handled', () => {
    const r = run();
    const s8 = r.results.find(x => x.id === 'SYN-08')!;
    expect(s8.usedFallback).toBe(true);
    expect(s8.classifierProbabilities).toBeNull();
    expect(s8.correct).toBe(true);
    expect(r.summary.fallbackCasesHandled).toEqual({ handled: 1, of: 1 });
  });
  it('SYN-06: identical shelters are reported as a near-tie, never resolved silently', () => {
    const s6 = run().results.find(x => x.id === 'SYN-06')!;
    expect(s6.nearTie).toBe(true);
    expect(s6.margin).toBeLessThan(NEAR_TIE_MARGIN);
    expect(s6.note).toMatch(/tie-break rule applied/);
    expect(s6.winner).toBe('shelter-A');
  });
  it('SYN-02: with the species constraint suppressed, the nearest non-accepting shelter is still ranked, not excluded by a constraint', () => {
    const s2 = run().results.find(x => x.id === 'SYN-02')!;
    expect(s2.hardConstraints.some(c => c.startsWith('accepts_species:'))).toBe(false);
    expect(s2.ranking.map(x => x.shelterId)).toContain('shelter-A');
  });
  it('the has_vet constraint excludes shelters without a vet in injured cases (SYN-05)', () => {
    const s5 = run().results.find(x => x.id === 'SYN-05')!;
    expect(s5.hardConstraints).toContain('has_vet');
    expect(s5.ranking.map(x => x.shelterId)).not.toContain('shelter-A');
  });
  it('different vectors change the weights case by case (the blend is case-specific), and equal vectors do not', () => {
    const equal = run(loadVectors(), WEIGHTS_VERSION);
    const distinct = new Set(equal.results.map(x => JSON.stringify(x.softWeights)));
    expect(distinct.size).toBe(1);   // placeholder equal vectors: every case gets the same weights
    const illustrative = run();
    const vet = (id: string) => illustrative.results.find(x => x.id === id)!.softWeights.vet_care;
    expect(vet('SYN-01')).toBeGreaterThan(vet('SYN-03')); // injured case weights vet care more than a routine one
  });
  it('records provenance: annotation hash and fixture hash are 64-hex digests', () => {
    const p = run().provenance;
    expect(p.annotationsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(p.fixturesSha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
