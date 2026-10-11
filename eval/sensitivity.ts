// One-step sensitivity check (Hard Stop 2, SC2): move each AHP judgment one Saaty step up and one step down, one at a
// time, rebuild that archetype's vector, re-run the whole evaluation, and count how many cases change winner.
// Design criterion: no single perturbation flips 2 or more cases. This is a second safeguard beside CR < 0.10,
// because a consistent set of judgments can still be substantively wrong.

import { Judgment, analyzeJudgments, singleStepPerturbations } from '../lambda/shared/ahp';
import { ARCHETYPES, Archetype, FACTORS, VectorSet } from '../lambda/shared/weights';
import { Classify, Fixture, Annotations, runEvaluation } from './harness';
import { toWeights } from './ahp-store';

export interface SensitivityRow {
  archetype: Archetype;
  pair: [number, number];
  direction: 1 | -1;
  from: number;
  to: number;
  cr: number;
  flipped: string[];
}

export interface SensitivityReport {
  perturbations: number;
  maxFlips: number;
  worst: SensitivityRow[];          // rows achieving maxFlips
  violating: SensitivityRow[];      // rows flipping 2 or more cases
  passes: boolean;                  // no single perturbation flips 2 or more cases
  baselineWinners: Record<string, string | null>;
  rows: SensitivityRow[];
}

export const FLIP_LIMIT = 2;

export function runSensitivity(
  judgments: Record<Archetype, Judgment[]>,
  classify: Classify,
  extra: { fixtures?: Fixture[]; annotations?: Annotations } = {},
): SensitivityReport {
  const vectorsFor = (override?: { a: Archetype; js: Judgment[] }): VectorSet => {
    const v = {} as VectorSet;
    for (const a of ARCHETYPES) v[a] = toWeights(analyzeJudgments(FACTORS.length, override && override.a === a ? override.js : judgments[a]).weights);
    return v;
  };
  const winners = (v: VectorSet) => {
    const r = runEvaluation({ classify, classifierName: 'sensitivity', vectors: v, weightsVersion: 'sensitivity', ...extra });
    return Object.fromEntries(r.results.map(x => [x.id, x.winner])) as Record<string, string | null>;
  };

  const baselineWinners = winners(vectorsFor());
  const rows: SensitivityRow[] = [];
  for (const a of ARCHETYPES) {
    for (const p of singleStepPerturbations(judgments[a])) {
      const w = winners(vectorsFor({ a, js: p.judgments }));
      const base = judgments[a][p.index];
      rows.push({
        archetype: a,
        pair: [base.i, base.j],
        direction: p.direction,
        from: base.value,
        to: p.judgments[p.index].value,
        cr: analyzeJudgments(FACTORS.length, p.judgments).cr,
        flipped: Object.keys(baselineWinners).filter(id => w[id] !== baselineWinners[id]),
      });
    }
  }
  const maxFlips = Math.max(0, ...rows.map(r => r.flipped.length));
  return {
    perturbations: rows.length,
    maxFlips,
    worst: rows.filter(r => r.flipped.length === maxFlips && maxFlips > 0),
    violating: rows.filter(r => r.flipped.length >= FLIP_LIMIT),
    passes: rows.every(r => r.flipped.length < FLIP_LIMIT),
    baselineWinners,
    rows,
  };
}
