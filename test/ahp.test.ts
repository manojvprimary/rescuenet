import {
  CR_THRESHOLD, RANDOM_INDEX, SAATY_STEPS, Judgment,
  analyze, analyzeJudgments, buildMatrix, judgmentCount, mostInconsistentJudgment,
  singleStepPerturbations, stepValue,
} from '../lambda/shared/ahp';

// Reference values below were computed independently (separate Python implementation, 20000-step power
// iteration), not copied from the code under test. The 3x3 eigenvector (0.637, 0.258, 0.105) also matches
// the widely published values for this matrix.
const close = (a: number[], b: number[], tol: number) => a.forEach((x, i) => expect(Math.abs(x - b[i])).toBeLessThan(tol));

const A3 = [[1, 3, 5], [1 / 3, 1, 3], [1 / 5, 1 / 3, 1]];
const A5 = [[1, 3, 5, 7, 9], [1 / 3, 1, 3, 5, 7], [1 / 5, 1 / 3, 1, 3, 5], [1 / 7, 1 / 5, 1 / 3, 1, 3], [1 / 9, 1 / 7, 1 / 5, 1 / 3, 1]];
const C5 = [[1, 5, 3, 7, 6], [1 / 5, 1, 1 / 3, 5, 3], [1 / 3, 3, 1, 6, 3], [1 / 7, 1 / 5, 1 / 6, 1, 1 / 3], [1 / 6, 1 / 3, 1 / 3, 3, 1]];

// judgments (upper triangle) for a 5x5 matrix
const upper = (m: number[][]): Judgment[] => {
  const out: Judgment[] = [];
  for (let i = 0; i < m.length; i++) for (let j = i + 1; j < m.length; j++) out.push({ i, j, value: m[i][j] });
  return out;
};

describe('reference matrices (independently computed)', () => {
  it('3x3: row-average weights, lambda_max, CR', () => {
    const r = analyze(A3);
    close(r.weights, [0.633346, 0.260498, 0.106156], 1e-6);
    expect(r.lambdaMax).toBeCloseTo(3.038715, 6);
    expect(r.ci).toBeCloseTo(0.019357, 6);
    expect(r.cr).toBeCloseTo(0.033375, 6);
  });
  it('3x3: power-iteration eigenvector matches the published values', () => {
    close(analyze(A3).eigenWeights, [0.636986, 0.258285, 0.104729], 1e-6);
  });
  it('5x5 (B): weights, lambda_max, CR, eigenvector', () => {
    const r = analyze(A5);
    close(r.weights, [0.502819, 0.260232, 0.13435, 0.067778, 0.034821], 1e-6);
    expect(r.lambdaMax).toBeCloseTo(5.242607, 5);
    expect(r.cr).toBeCloseTo(0.054153, 5);
    close(r.eigenWeights, [0.512813, 0.261499, 0.128976, 0.063377, 0.033335], 1e-6);
    expect(r.maxDiff).toBeCloseTo(0.009993, 5);
  });
  it('5x5 (C): weights, CR', () => {
    const r = analyze(C5);
    close(r.weights, [0.491197, 0.146932, 0.240038, 0.040687, 0.081147], 1e-6);
    expect(r.cr).toBeCloseTo(0.068507, 5);
    expect(r.acceptable).toBe(true);
  });
});

describe('invariants', () => {
  it('a perfectly consistent matrix (a_ij = w_i / w_j) recovers w exactly and has CR = 0', () => {
    const w = [0.4, 0.3, 0.15, 0.1, 0.05];
    const m = w.map(wi => w.map(wj => wi / wj));
    const r = analyze(m);
    close(r.weights, w, 1e-12);
    close(r.eigenWeights, w, 1e-9);
    expect(r.lambdaMax).toBeCloseTo(5, 10);
    expect(r.cr).toBeCloseTo(0, 10);
  });
  it('an all-equal matrix gives equal weights and CR = 0', () => {
    const r = analyze(Array.from({ length: 5 }, () => Array(5).fill(1)));
    close(r.weights, Array(5).fill(0.2), 1e-12);
    expect(r.cr).toBeCloseTo(0, 12);
  });
  it('weights are positive and sum to 1; lambda_max >= n', () => {
    for (const m of [A3, A5, C5]) {
      const r = analyze(m);
      expect(r.weights.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
      r.weights.forEach(x => expect(x).toBeGreaterThan(0));
      expect(r.lambdaMax).toBeGreaterThanOrEqual(m.length - 1e-9);
    }
  });
  it('the random index table holds the verified RI(5) = 1.12', () => {
    expect(RANDOM_INDEX[5]).toBe(1.12);
    expect(RANDOM_INDEX[3]).toBe(0.58);
  });
});

describe('inconsistent judgments are rejected by the gate', () => {
  // A beats B by 9, B beats C by 9, but C beats A by 9: circular, so CR is far above 0.10.
  const circular: Judgment[] = [{ i: 0, j: 1, value: 9 }, { i: 1, j: 2, value: 9 }, { i: 0, j: 2, value: 1 / 9 }];
  it('CR >= 0.10 and acceptable is false', () => {
    const r = analyzeJudgments(3, circular);
    expect(r.cr).toBeGreaterThanOrEqual(CR_THRESHOLD);
    expect(r.acceptable).toBe(false);
  });
  it('suggests a single change that lowers CR', () => {
    const base = analyzeJudgments(3, circular).cr;
    const s = mostInconsistentJudgment(3, circular);
    expect(s).not.toBeNull();
    expect(s!.crAfter).toBeLessThan(base);
  });
});

describe('buildMatrix validation', () => {
  const full = upper(A5);
  it('builds a reciprocal matrix from 10 judgments', () => {
    const m = buildMatrix(5, full);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) expect(m[i][j] * m[j][i]).toBeCloseTo(1, 12);
  });
  it('needs C(5,2) = 10 judgments', () => {
    expect(judgmentCount(5)).toBe(10);
    expect(() => buildMatrix(5, full.slice(1))).toThrow(/expected 10/);
  });
  it('rejects values off the Saaty scale', () => {
    expect(() => buildMatrix(5, full.map((j, k) => (k === 0 ? { ...j, value: 4.5 } : j)))).toThrow(/Saaty scale/);
    expect(() => buildMatrix(5, full.map((j, k) => (k === 0 ? { ...j, value: 0 } : j)))).toThrow(/Saaty scale/);
    expect(() => buildMatrix(5, full.map((j, k) => (k === 0 ? { ...j, value: 10 } : j)))).toThrow(/Saaty scale/);
  });
  it('rejects repeated or malformed pairs', () => {
    expect(() => buildMatrix(5, [...full.slice(0, 9), full[0]])).toThrow(/twice/);
    expect(() => buildMatrix(5, [...full.slice(0, 9), { i: 3, j: 2, value: 3 }])).toThrow(/invalid pair/);
    expect(() => buildMatrix(5, [...full.slice(0, 9), { i: 3, j: 5, value: 3 }])).toThrow(/invalid pair/);
  });
  it('refuses a size with no verified random index', () => {
    expect(() => analyze(Array.from({ length: 9 }, () => Array(9).fill(1)))).toThrow(/random index/);
  });
});

describe('Saaty steps and one-step perturbations', () => {
  it('the scale has 17 values from 1/9 to 9, ascending', () => {
    expect(SAATY_STEPS).toHaveLength(17);
    expect(SAATY_STEPS[0]).toBeCloseTo(1 / 9, 12);
    expect(SAATY_STEPS[16]).toBe(9);
    for (let k = 1; k < SAATY_STEPS.length; k++) expect(SAATY_STEPS[k]).toBeGreaterThan(SAATY_STEPS[k - 1]);
  });
  it('steps up and down, and clamps at the edges', () => {
    expect(stepValue(1, 1)).toBe(2);
    expect(stepValue(1, -1)).toBeCloseTo(1 / 2, 12);
    expect(stepValue(9, 1)).toBe(9);
    expect(stepValue(1 / 9, -1)).toBeCloseTo(1 / 9, 12);
    expect(() => stepValue(4.5, 1)).toThrow();
  });
  it('perturbs each judgment one step up and down, one at a time, never leaving the scale', () => {
    const base = upper(A5); // contains 9 at (0,4), so its upward step is skipped
    const ps = singleStepPerturbations(base);
    expect(ps).toHaveLength(10 * 2 - 1 - 0 - countEdges(base));
    ps.forEach(p => {
      const changed = p.judgments.filter((x, k) => Math.abs(x.value - base[k].value) > 1e-12);
      expect(changed).toHaveLength(1);
      expect(() => buildMatrix(5, p.judgments)).not.toThrow();
    });
  });
});

function countEdges(js: Judgment[]): number {
  // judgments sitting at 9 (cannot go up) or 1/9 (cannot go down), minus the 1 already subtracted in the caller
  return js.filter(j => Math.abs(j.value - 9) < 1e-9 || Math.abs(j.value - 1 / 9) < 1e-9).length - 1;
}
