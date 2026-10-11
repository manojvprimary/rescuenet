// AHP arithmetic (Hard Stop 2, Section 5.2): pairwise judgments -> weight vector, lambda_max, CI, CR.
//
// Pure and deterministic: no AWS clients, no randomness. The design's method is the row-average
// approximation of the principal eigenvector (Saaty, 1980); the principal eigenvector itself is
// computed by power iteration as a cross-check, as promised in the design's method-selection table.

/** Saaty's random index by matrix size n (n = 1..5 are the sizes this project can use; RI(5) = 1.12). */
export const RANDOM_INDEX: Record<number, number> = { 1: 0, 2: 0, 3: 0.58, 4: 0.9, 5: 1.12 };

/** CR acceptance gate from the design (Section 5.2, Step 6). */
export const CR_THRESHOLD = 0.1;

/** The Saaty values a judge may state, as "i is this much more important than j" (1 = equal). */
export const SAATY_SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

/** Every legal a_ij: the nine Saaty values and their reciprocals, ordered from 1/9 up to 9. */
export const SAATY_STEPS: number[] = [
  ...SAATY_SCALE.slice(1).reverse().map(v => 1 / v),
  1,
  ...SAATY_SCALE.slice(1),
];

/** One stated judgment: factor i versus factor j (i < j), with value a_ij on the 1/9..9 scale. */
export interface Judgment { i: number; j: number; value: number }

export interface AhpResult {
  n: number;
  weights: number[];       // row-average weights (the design's method); sums to 1
  eigenWeights: number[];  // power-iteration principal eigenvector, normalized to sum 1 (cross-check)
  maxDiff: number;         // largest |weights - eigenWeights| over the factors
  lambdaMax: number;
  ci: number;
  cr: number;
  acceptable: boolean;     // cr < CR_THRESHOLD
}

const isSaatyValue = (v: number): boolean => SAATY_STEPS.some(s => Math.abs(s - v) < 1e-9);

/** Number of judgments needed for n factors: C(n, 2). */
export const judgmentCount = (n: number): number => (n * (n - 1)) / 2;

/**
 * Builds the reciprocal matrix. Throws if a judgment is off the Saaty scale, repeated, out of range,
 * or if the set is incomplete (all C(n,2) pairs are required).
 */
export function buildMatrix(n: number, judgments: Judgment[]): number[][] {
  const a: number[][] = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (r === c ? 1 : 0)));
  const seen = new Set<string>();
  for (const { i, j, value } of judgments) {
    if (!Number.isInteger(i) || !Number.isInteger(j) || i < 0 || j >= n || i >= j) throw new Error(`invalid pair (${i}, ${j}); need 0 <= i < j < ${n}`);
    if (!isSaatyValue(value)) throw new Error(`judgment (${i}, ${j}) = ${value} is not on the Saaty scale (1/9 .. 9)`);
    const key = `${i},${j}`;
    if (seen.has(key)) throw new Error(`pair (${i}, ${j}) judged twice`);
    seen.add(key);
    a[i][j] = value;
    a[j][i] = 1 / value;
  }
  if (seen.size !== judgmentCount(n)) throw new Error(`expected ${judgmentCount(n)} judgments for n=${n}, got ${seen.size}`);
  return a;
}

/** Steps 2-3: normalize each column by its sum, then average each row. */
export function rowAverageWeights(a: number[][]): number[] {
  const n = a.length;
  const colSums = Array.from({ length: n }, (_, c) => a.reduce((s, row) => s + row[c], 0));
  return a.map(row => row.reduce((s, x, c) => s + x / colSums[c], 0) / n);
}

/** Principal eigenvector by power iteration, normalized to sum 1. Deterministic (fixed start, fixed tolerance). */
export function eigenWeights(a: number[][], maxIter = 1000, tol = 1e-12): number[] {
  const n = a.length;
  let w = Array.from({ length: n }, () => 1 / n);
  for (let k = 0; k < maxIter; k++) {
    const next = a.map(row => row.reduce((s, x, c) => s + x * w[c], 0));
    const total = next.reduce((s, x) => s + x, 0);
    const normalized = next.map(x => x / total);
    const delta = Math.max(...normalized.map((x, i) => Math.abs(x - w[i])));
    w = normalized;
    if (delta < tol) break;
  }
  return w;
}

/** Step 4: lambda_max as the mean of (A w)_i / w_i. */
export function lambdaMax(a: number[][], w: number[]): number {
  const n = a.length;
  return a.reduce((s, row, i) => s + row.reduce((t, x, c) => t + x * w[c], 0) / w[i], 0) / n;
}

/** Steps 2-5 end to end for a complete reciprocal matrix. */
export function analyze(a: number[][]): AhpResult {
  const n = a.length;
  if (!(n in RANDOM_INDEX)) throw new Error(`no verified random index for n=${n}`);
  const weights = rowAverageWeights(a);
  const eigen = eigenWeights(a);
  const lmax = lambdaMax(a, weights);
  const ci = n > 1 ? (lmax - n) / (n - 1) : 0;
  const ri = RANDOM_INDEX[n];
  const cr = ri > 0 ? ci / ri : 0;
  return {
    n,
    weights,
    eigenWeights: eigen,
    maxDiff: Math.max(...weights.map((x, i) => Math.abs(x - eigen[i]))),
    lambdaMax: lmax,
    ci,
    cr,
    acceptable: cr < CR_THRESHOLD,
  };
}

/** Convenience: judgments -> result. */
export function analyzeJudgments(n: number, judgments: Judgment[]): AhpResult {
  return analyze(buildMatrix(n, judgments));
}

/** The next Saaty value up or down from v (clamped at 9 and 1/9). Returns v itself at an edge. */
export function stepValue(v: number, direction: 1 | -1): number {
  const idx = SAATY_STEPS.findIndex(s => Math.abs(s - v) < 1e-9);
  if (idx < 0) throw new Error(`${v} is not on the Saaty scale`);
  return SAATY_STEPS[Math.min(SAATY_STEPS.length - 1, Math.max(0, idx + direction))];
}

export interface Perturbation { index: number; direction: 1 | -1; judgments: Judgment[] }

/**
 * The one-step sensitivity set from the design (SC2): every judgment moved one Saaty step up and one
 * step down, one at a time. A move that would leave the scale (e.g. 9 stepped up) is skipped, so every
 * returned set is a different, legal set of judgments.
 */
export function singleStepPerturbations(judgments: Judgment[]): Perturbation[] {
  const out: Perturbation[] = [];
  judgments.forEach((jd, index) => {
    for (const direction of [1, -1] as const) {
      const value = stepValue(jd.value, direction);
      if (Math.abs(value - jd.value) < 1e-9) continue;
      out.push({ index, direction, judgments: judgments.map((x, k) => (k === index ? { ...x, value } : x)) });
    }
  });
  return out;
}

/**
 * When CR >= threshold: the single judgment whose move to an adjacent Saaty step lowers CR the most,
 * with the CR it would give. Helps the judge decide which statement to reconsider (the judge still decides).
 */
export function mostInconsistentJudgment(n: number, judgments: Judgment[]): { index: number; suggested: number; crAfter: number } | null {
  let best: { index: number; suggested: number; crAfter: number } | null = null;
  for (const p of singleStepPerturbations(judgments)) {
    const crAfter = analyzeJudgments(n, p.judgments).cr;
    if (best === null || crAfter < best.crAfter) best = { index: p.index, suggested: p.judgments[p.index].value, crAfter };
  }
  return best;
}
