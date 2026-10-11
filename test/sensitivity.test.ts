import { SAATY_STEPS, Judgment, analyzeJudgments } from '../lambda/shared/ahp';
import { ARCHETYPES, Archetype, FACTORS } from '../lambda/shared/weights';
import { ruleClassifier } from '../eval/harness';
import { FLIP_LIMIT, runSensitivity } from '../eval/sensitivity';
import { vectorsFromStored, StoredJudgments } from '../eval/ahp-store';

// TEST-ONLY judgments: built by rounding the ratios of made-up target weights to the nearest Saaty step.
// They are NOT the student's elicited judgments; the tests check mechanism and invariants only.
function judgmentsFromTarget(target: number[]): Judgment[] {
  const out: Judgment[] = [];
  for (let i = 0; i < target.length; i++) for (let j = i + 1; j < target.length; j++) {
    const ratio = target[i] / target[j];
    const value = SAATY_STEPS.reduce((b, s) => (Math.abs(Math.log(s / ratio)) < Math.abs(Math.log(b / ratio)) ? s : b));
    out.push({ i, j, value });
  }
  return out;
}
const TARGET: Record<Archetype, number[]> = {
  INJURED_CRITICAL: [0.50, 0.25, 0.10, 0.10, 0.05],
  URGENT_TRANSIENT: [0.10, 0.40, 0.10, 0.35, 0.05],
  STABLE_ROUTINE:   [0.10, 0.10, 0.30, 0.20, 0.30],
};
const J = Object.fromEntries(ARCHETYPES.map(a => [a, judgmentsFromTarget(TARGET[a])])) as Record<Archetype, Judgment[]>;

describe('sensitivity check', () => {
  it('the test judgments are themselves acceptable (CR < 0.10)', () => {
    for (const a of ARCHETYPES) expect(analyzeJudgments(5, J[a]).acceptable).toBe(true);
  });
  const report = runSensitivity(J, ruleClassifier);
  it('perturbs every judgment up and down except moves that would leave the scale', () => {
    const maxPossible = ARCHETYPES.length * 10 * 2;
    expect(report.perturbations).toBeLessThanOrEqual(maxPossible);
    expect(report.perturbations).toBeGreaterThan(maxPossible - 12);
    report.rows.forEach(r => expect(Math.abs(r.to - r.from)).toBeGreaterThan(0));
  });
  it('reports a consistent verdict: passes iff no perturbation flips FLIP_LIMIT or more cases', () => {
    expect(report.passes).toBe(report.rows.every(r => r.flipped.length < FLIP_LIMIT));
    expect(report.maxFlips).toBe(Math.max(0, ...report.rows.map(r => r.flipped.length)));
    expect(report.violating.length).toBe(report.rows.filter(r => r.flipped.length >= FLIP_LIMIT).length);
  });
  it('flipped ids are real case ids, and the baseline covers all 8 cases', () => {
    expect(Object.keys(report.baselineWinners)).toHaveLength(8);
    report.rows.forEach(r => r.flipped.forEach(id => expect(report.baselineWinners).toHaveProperty(id)));
  });
  it('is deterministic', () => {
    expect(JSON.stringify(runSensitivity(J, ruleClassifier))).toBe(JSON.stringify(report));
  });
  it('a perturbation that changes nothing reports no flips (a judgment that cannot move a winner)', () => {
    expect(report.rows.some(r => r.flipped.length === 0)).toBe(true);
  });
});

describe('vectorsFromStored', () => {
  const stored = (a: Archetype, js: Judgment[]): StoredJudgments => {
    const r = analyzeJudgments(5, js);
    return { archetype: a, judge: 'test', elicitedAt: 'x', factors: [...FACTORS], judgments: js, result: { weights: r.weights, lambdaMax: r.lambdaMax, ci: r.ci, cr: r.cr, acceptable: r.acceptable }, note: '' };
  };
  it('uses accepted judgments and marks the rest as placeholders', () => {
    const { vectors, placeholders } = vectorsFromStored(a => (a === 'INJURED_CRITICAL' ? stored(a, J[a]) : null));
    expect(placeholders).toEqual(['URGENT_TRANSIENT', 'STABLE_ROUTINE']);
    expect(vectors.INJURED_CRITICAL.vet_care).toBeGreaterThan(0.4);
    expect(vectors.STABLE_ROUTINE.vet_care).toBeCloseTo(0.2, 12);
  });
  it('never uses judgments whose CR is 0.10 or more (treated as a placeholder)', () => {
    const circular: Judgment[] = judgmentsFromTarget([1, 1, 1, 1, 1]).map((j, k) => ({ ...j, value: k % 2 === 0 ? 9 : 1 / 9 }));
    expect(analyzeJudgments(5, circular).acceptable).toBe(false);
    const { placeholders } = vectorsFromStored(a => stored(a, circular));
    expect(placeholders).toHaveLength(3);
  });
});
