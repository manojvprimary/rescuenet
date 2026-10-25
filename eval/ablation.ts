// Controlled ablation (Hard Stop 4): does the scoring FORMULA or the WEIGHTING METHOD drive which shelter wins?
// Every cell of a formula x weighting grid is run on the same cases with the same hard constraints, so each
// comparison changes exactly one thing. Pure and deterministic; reads only committed files.
// Pre-registration: docs/ABLATION_PREREGISTRATION.md (written and committed before the first run).

import * as fs from 'fs';
import * as path from 'path';
import { FACTORS, Factor, Probabilities, deriveWeights, loadVectors } from '../lambda/shared/weights';
import { FRESHNESS_WEIGHT, isEligible } from '../lambda/shared/match';
import { haversineKm } from '../lambda/shared/geo';
import { speciesMatchScore, extractCaseSpecies } from '../lambda/shared/scoring';
import { ruleBasedHardConstraints } from '../lambda/shared/needs-classifier';
import type { NeedsProfile, ShelterBid } from '../lambda/shared/utils';
import { Annotations, Fixture } from './harness';

type W = NeedsProfile['softWeights'];

// ── Scoring-formula variants (hypotheses about the capacity double count and the distance constant) ──
export interface Formula { id: string; label: string; capacityOnce: boolean; distanceScaleKm: number }
export const FORMULAS: Formula[] = [
  { id: 'F0', label: 'production formula', capacityOnce: false, distanceScaleKm: 30 },
  { id: 'F1', label: 'capacity counted once', capacityOnce: true, distanceScaleKm: 30 },
  { id: 'F2', label: 'distance scale 10 km', capacityOnce: false, distanceScaleKm: 10 },
  { id: 'F3', label: 'capacity once + 10 km', capacityOnce: true, distanceScaleKm: 10 },
];

/** F0 reproduces lambda/shared/match.ts computeMatchScore exactly (test/ablation.test.ts pins this). */
export function scoreWith(f: Formula, bid: ShelterBid, caseLoc: { lat: number; lng: number }, w: W, caseSpecies?: string): number {
  const vetScore = bid.hasVetOnSite ? 1.0 : bid.vetCanBeArranged ? 0.6 : 0.0;
  const slotsNorm = Math.min((bid.availableSlots ?? 0) / 5, 1.0);
  const windowNorm = Math.max(0, 1 - (bid.estimatedIntakeWindowMinutes ?? 60) / 120);
  const urgScore = f.capacityOnce ? windowNorm : (slotsNorm + windowNorm) / 2;   // F1/F3: slots no longer feed pickup urgency
  const specScore = speciesMatchScore(bid.acceptedSpecies, caseSpecies);
  const dist = bid.distanceKm ?? haversineKm(caseLoc?.lat, caseLoc?.lng, undefined, undefined);
  const proxScore = Math.max(0, 1 - dist / f.distanceScaleKm);
  const ltcScore = slotsNorm;
  const raw = vetScore * w.vet_care + urgScore * w.pickup_urgency + specScore * w.species_specialization + proxScore * w.proximity + ltcScore * w.long_term_care;
  return raw * bid.confidence * (FRESHNESS_WEIGHT[bid.dataFreshness] ?? 0.55);
}

// ── Weighting methods ─────────────────────────────────────────────────────────────────────────────
export type WeightMethodId = 'equal' | 'v1' | 'blend' | 'top';
export const WEIGHT_METHODS: Array<{ id: WeightMethodId; label: string }> = [
  { id: 'equal', label: 'equal weights (no case-specific weighting)' },
  { id: 'v1', label: 'v1: LLM-written weights (frozen live)' },
  { id: 'blend', label: 'v2 blend (AHP vectors x classifier probabilities)' },
  { id: 'top', label: 'v2 top (single archetype vector)' },
];

export interface CaseInputs { fixture: Fixture; v1Weights: W | null; probabilities: Probabilities | null }

export function weightsFor(method: WeightMethodId, ci: CaseInputs): W | null {
  if (method === 'equal') return Object.fromEntries(FACTORS.map(f => [f, 1 / FACTORS.length])) as W;
  if (method === 'v1') return ci.v1Weights;
  if (!ci.probabilities) return null;
  return deriveWeights(ci.probabilities, loadVectors(), method === 'blend' ? 'blend' : 'top').softWeights;
}

/** Hard constraints are held identical in every cell (rule-based, plus the fixture's species-constraint flag). */
export function fixedConstraints(f: Fixture): string[] {
  const cs = ruleBasedHardConstraints(f.reportData);
  return f.classifierEmitsNoSpeciesConstraint ? cs.filter(c => !c.startsWith('accepts_species:')) : cs;
}

export interface Cell { winner: string | null; margin: number | null; eligible: number }

export function runCell(f: Formula, ci: CaseInputs, method: WeightMethodId): Cell | null {
  const w = weightsFor(method, ci);
  if (!w) return null;
  const fx = ci.fixture;
  const species = extractCaseSpecies(fx.reportData);
  const scored = fx.bids.filter(b => isEligible(b, fixedConstraints(fx)))
    .map(b => ({ id: b.shelterId, s: scoreWith(f, b, fx.caseLocation, w, species) }))
    .sort((a, b) => b.s - a.s || a.id.localeCompare(b.id));   // exact ties resolve to the smaller shelterId, deterministically
  return { winner: scored[0]?.id ?? null, margin: scored.length > 1 ? scored[0].s - scored[1].s : null, eligible: scored.length };
}

// ── Loading the committed inputs ──────────────────────────────────────────────────────────────────
export interface SetSpec { name: string; fixturesDir: string; annotationsFile: string; frozenDir: string; recordedFile: string }

export function loadSet(repo: string, spec: SetSpec, loadFixtures: (d: string) => Fixture[], loadAnnotations: (f: string) => Annotations): { cases: CaseInputs[]; annotations: Annotations } {
  const fixtures = loadFixtures(path.join(repo, spec.fixturesDir));
  const annotations = loadAnnotations(path.join(repo, spec.annotationsFile));
  const recorded = JSON.parse(fs.readFileSync(path.join(repo, spec.recordedFile), 'utf8')) as Record<string, { modelOutput: Probabilities | null }>;
  const cases = fixtures.map(fixture => {
    const fz = path.join(repo, spec.frozenDir, `${fixture.id}.json`);
    const prof = fs.existsSync(fz) ? JSON.parse(fs.readFileSync(fz, 'utf8')).profile : null;
    return { fixture, v1Weights: prof && prof.softWeights ? (prof.softWeights as W) : null, probabilities: recorded[fixture.id]?.modelOutput ?? null };
  });
  return { cases, annotations };
}

// ── The grid, the metrics, and the decomposition ──────────────────────────────────────────────────
export interface CaseRow { id: string; set: string; best: string; informative: boolean; control: boolean; cells: Record<string, Cell | null> }
export const key = (fid: string, wid: string) => `${fid}|${wid}`;

export function runGrid(sets: Array<{ name: string; cases: CaseInputs[]; annotations: Annotations }>): CaseRow[] {
  const rows: CaseRow[] = [];
  for (const s of sets) for (const ci of s.cases) {
    const a = s.annotations.cases[ci.fixture.id];
    if (!a || !a.bestShelter || !a.bestShelter.startsWith('shelter-') || a.nearTie || a.expectFallback) continue;   // only cases with one annotated best shelter
    const cells: Record<string, Cell | null> = {};
    for (const f of FORMULAS) for (const m of WEIGHT_METHODS) cells[key(f.id, m.id)] = runCell(f, ci, m.id);
    const eligible = Math.min(...Object.values(cells).map(c => (c ? c.eligible : 99)));
    rows.push({ id: ci.fixture.id, set: s.name, best: a.bestShelter, informative: eligible >= 2, control: /control/i.test((a as unknown as { tests?: string }).tests ?? ''), cells });
  }
  return rows;
}

export interface GridSummary {
  informativeCases: number;
  correct: Record<string, number>;                         // key(F, W) -> correct count over informative cases
  weightSwapDiffRate: number; formulaSwapDiffRate: number;  // share of one-factor-only cell pairs whose winners differ
  weightSwapPairs: number; formulaSwapPairs: number;
  casesWhereWeightsChangeWinner: number; casesWhereFormulaChangesWinner: number;   // under any fixed other factor
  controlsAllCorrect: boolean;
}

export function summarize(rows: CaseRow[]): GridSummary {
  const inf = rows.filter(r => r.informative && !r.control);
  const all = rows.filter(r => r.informative);
  const correct: Record<string, number> = {};
  for (const f of FORMULAS) for (const m of WEIGHT_METHODS) correct[key(f.id, m.id)] = inf.filter(r => r.cells[key(f.id, m.id)]?.winner === r.best).length;
  let wd = 0, wn = 0, fd = 0, fn = 0, cw = 0, cf = 0;
  for (const r of inf) {
    let caseW = false, caseF = false;
    for (const f of FORMULAS) for (let i = 0; i < WEIGHT_METHODS.length; i++) for (let j = i + 1; j < WEIGHT_METHODS.length; j++) {
      const a = r.cells[key(f.id, WEIGHT_METHODS[i].id)]?.winner, b = r.cells[key(f.id, WEIGHT_METHODS[j].id)]?.winner;
      if (a === undefined || b === undefined) continue; wn++; if (a !== b) { wd++; caseW = true; }
    }
    for (const m of WEIGHT_METHODS) for (let i = 0; i < FORMULAS.length; i++) for (let j = i + 1; j < FORMULAS.length; j++) {
      const a = r.cells[key(FORMULAS[i].id, m.id)]?.winner, b = r.cells[key(FORMULAS[j].id, m.id)]?.winner;
      if (a === undefined || b === undefined) continue; fn++; if (a !== b) { fd++; caseF = true; }
    }
    if (caseW) cw++; if (caseF) cf++;
  }
  const controls = all.filter(r => r.control);
  return {
    informativeCases: inf.length, correct,
    weightSwapDiffRate: wn ? wd / wn : 0, formulaSwapDiffRate: fn ? fd / fn : 0, weightSwapPairs: wn, formulaSwapPairs: fn,
    casesWhereWeightsChangeWinner: cw, casesWhereFormulaChangesWinner: cf,
    controlsAllCorrect: controls.length > 0 && controls.every(r => FORMULAS.every(f => WEIGHT_METHODS.every(m => r.cells[key(f.id, m.id)]?.winner === r.best))),
  };
}

/** Exact two-sided sign test on discordant pairs: x of n favour one side, null p = 0.5. */
export function signTestP(x: number, n: number): number {
  if (n === 0) return 1;
  const k = Math.min(x, n - x);
  let c = 1, cum = 0;                       // sum_{i<=k} C(n,i) 0.5^n
  for (let i = 0; i <= k; i++) { if (i > 0) c = (c * (n - i + 1)) / i; cum += c; }
  return Math.min(1, 2 * cum * Math.pow(0.5, n));
}

/** Paired contrast of two cells over the informative cases: discordant counts and exact p. */
export function contrast(rows: CaseRow[], a: string, b: string) {
  const inf = rows.filter(r => r.informative && !r.control);
  const aOnly = inf.filter(r => r.cells[a]?.winner === r.best && r.cells[b]?.winner !== r.best).length;
  const bOnly = inf.filter(r => r.cells[b]?.winner === r.best && r.cells[a]?.winner !== r.best).length;
  return { aOnly, bOnly, n: aOnly + bOnly, p: signTestP(aOnly, aOnly + bOnly) };
}

/** Wilson 95% interval for k of n. */
export function wilson(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96, p = k / n, d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d, h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export { FACTORS };
export type { Factor };
