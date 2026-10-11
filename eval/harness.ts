// Evaluation harness core (Hard Stop 2, Section 8). Pure and deterministic: given fixtures, annotations,
// AHP vectors, and a classifier, it reproduces exactly what production scoring would do and compares the
// outcome to the annotations written before the first run (commit fdb6171).
//
// It uses the production arithmetic itself (lambda/shared/match.ts, weights.ts), not a copy.

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ARCHETYPES, Archetype, BlendMode, Factor, FACTORS, Probabilities, VectorSet, deriveWeights, topArchetype } from '../lambda/shared/weights';
import { factorContributions, rankBids, ScoredBid } from '../lambda/shared/match';
import { ClassifierResult, ruleBasedClassify, ruleBasedHardConstraints } from '../lambda/shared/needs-classifier';
import { extractCaseSpecies } from '../lambda/shared/scoring';
import type { ShelterBid } from '../lambda/shared/utils';

export const NEAR_TIE_MARGIN = 0.02;

export interface Fixture {
  id: string;
  description: string;
  caseLocation: { lat: number; lng: number };
  reportData: Record<string, unknown>;
  bids: ShelterBid[];
  injectClassifierOutput?: unknown;
  classifierEmitsNoSpeciesConstraint?: boolean;
}

export interface Annotation {
  archetype: Archetype[];
  bestShelter: string | null;
  nearTie?: boolean;
  expectFallback?: boolean;
  rationale: string;
}
export interface Annotations { version: number; tieBreakRule: string; cases: Record<string, Annotation> }

/** What a classifier returns for one case: the raw model-shaped output, plus the constraints it emitted. */
export type Classify = (fixture: Fixture) => { modelOutput: unknown; hardConstraints: string[] };

export const ruleClassifier: Classify = f => {
  const r: ClassifierResult = ruleBasedClassify(f.reportData);
  return { modelOutput: r.archetypeProbabilities, hardConstraints: r.hardConstraints };
};

/** Replays recorded classifier output (for example from a live Bedrock run), so a live run can be re-scored offline. */
export function recordedClassifier(recorded: Record<string, { modelOutput: unknown; hardConstraints: string[] }>): Classify {
  return f => {
    const r = recorded[f.id];
    if (!r) throw new Error(`no recorded classifier output for ${f.id}`);
    return r;
  };
}

export interface CaseResult {
  id: string;
  classifierProbabilities: Probabilities | null;
  usedFallback: boolean;
  topArchetype: Archetype;
  archetypeAnnotated: Archetype[];
  archetypeAgrees: boolean | null;       // null when the case carries no archetype annotation (SYN-08)
  hardConstraints: string[];
  softWeights: Record<Factor, number>;
  ranking: Array<{ shelterId: string; score: number }>;
  winner: string | null;
  runnerUp: string | null;
  margin: number | null;
  nearTie: boolean;
  decisiveFactor: Factor | null;
  annotatedBest: string | null;
  expectedWinner: string | null;         // annotatedBest, or the computed STABLE_ROUTINE winner for fallback cases
  correct: boolean;
  note: string;
}

export interface Summary {
  cases: number;
  archetypeAgreement: { agree: number; of: number };
  winnerCorrect: { correct: number; of: number };
  fallbackCasesHandled: { handled: number; of: number };
  nearTies: string[];
  decisiveFactorCounts: Record<string, number>;
}

export interface RunReport {
  provenance: {
    gitCommit: string;
    annotationsCommit: string;
    annotationsSha256: string;
    fixturesSha256: string;
    weightsVersion: string;
    classifier: string;
    mode: BlendMode;
  };
  results: CaseResult[];
  summary: Summary;
  resultHash: string;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const round = (x: number) => Math.round(x * 1e12) / 1e12;

export function loadFixtures(dir = path.join(__dirname, 'fixtures')): Fixture[] {
  return fs.readdirSync(dir).filter(f => /^SYN-\d+\.json$/.test(f)).sort()
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Fixture);
}
export function loadAnnotations(file = path.join(__dirname, 'annotations.json')): Annotations {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Annotations;
}

/** Winner of a ranked list under the documented tie-break: a near-tie between the top two goes to the smaller shelterId. */
export function pickWinner(ranked: ScoredBid[]): { winner: string | null; runnerUp: string | null; margin: number | null; nearTie: boolean } {
  const top = ranked[0];
  const second = ranked[1];
  if (!top) return { winner: null, runnerUp: null, margin: null, nearTie: false };
  if (!second) return { winner: top.shelterId, runnerUp: null, margin: null, nearTie: false };
  const margin = top.matchScore - second.matchScore;
  const nearTie = margin < NEAR_TIE_MARGIN;
  const winner = nearTie ? [top, second].sort((x, y) => x.shelterId.localeCompare(y.shelterId))[0].shelterId : top.shelterId;
  return { winner, runnerUp: winner === top.shelterId ? second.shelterId : top.shelterId, margin, nearTie };
}

function runCase(f: Fixture, a: Annotation, classify: Classify, vectors: VectorSet, mode: BlendMode, version: string): CaseResult {
  const classified = classify(f);
  const modelOutput = f.injectClassifierOutput !== undefined ? f.injectClassifierOutput : classified.modelOutput;
  const derived = deriveWeights(modelOutput, vectors, mode, version);

  // Classifier failure: constraints come from structured fields, never from the failed model output.
  let hardConstraints = derived.usedFallback ? ruleBasedHardConstraints(f.reportData) : classified.hardConstraints;
  if (f.classifierEmitsNoSpeciesConstraint) hardConstraints = hardConstraints.filter(c => !c.startsWith('accepts_species:'));

  const caseSpecies = extractCaseSpecies(f.reportData);
  const ranked: ScoredBid[] = rankBids(f.bids, { hardConstraints, softWeights: derived.softWeights }, f.caseLocation, {}, caseSpecies);
  const top = ranked[0];
  const second = ranked[1];
  const { winner, runnerUp, margin, nearTie } = pickWinner(ranked);

  let decisiveFactor: Factor | null = null;
  if (top && second && !nearTie) {
    const w = f.bids.find(b => b.shelterId === top.shelterId)!;
    const r = f.bids.find(b => b.shelterId === second.shelterId)!;
    const cw = factorContributions(w, f.caseLocation, {}, derived.softWeights, caseSpecies);
    const cr = factorContributions(r, f.caseLocation, {}, derived.softWeights, caseSpecies);
    decisiveFactor = FACTORS.reduce((best, k) => (cw[k] - cr[k] > cw[best] - cr[best] ? k : best), FACTORS[0]);
  }

  // Expected winner: annotation, or for fallback cases the winner under the STABLE_ROUTINE vector alone.
  let expectedWinner: string | null = a.bestShelter;
  if (a.expectFallback) {
    const srRanked = rankBids(f.bids, { hardConstraints, softWeights: vectors.STABLE_ROUTINE }, f.caseLocation, {}, caseSpecies);
    expectedWinner = pickWinner(srRanked).winner;
  }
  const probs = derived.usedFallback ? null : derived.archetypeProbabilities;
  const top1 = topArchetype(derived.archetypeProbabilities);
  const annotatedArchetypes = a.archetype ?? [];

  let correct: boolean;
  let note: string;
  if (a.nearTie) {
    correct = nearTie && winner === [...f.bids.map(b => b.shelterId)].sort()[0];
    note = nearTie ? `near-tie (margin ${margin!.toFixed(4)} < ${NEAR_TIE_MARGIN}); tie-break rule applied: smaller shelterId` : 'expected a near-tie but scores separated';
  } else if (a.expectFallback) {
    correct = derived.usedFallback && winner === expectedWinner;
    note = derived.usedFallback ? 'malformed classifier output handled by the STABLE_ROUTINE fallback' : 'fallback was NOT used';
  } else {
    correct = winner === expectedWinner;
    note = nearTie ? `near-tie (margin ${margin!.toFixed(4)}); tie-break applied` : '';
  }

  return {
    id: f.id,
    classifierProbabilities: probs,
    usedFallback: derived.usedFallback,
    topArchetype: top1,
    archetypeAnnotated: annotatedArchetypes,
    archetypeAgrees: annotatedArchetypes.length === 0 ? null : annotatedArchetypes.includes(top1),
    hardConstraints,
    softWeights: Object.fromEntries(FACTORS.map(k => [k, round(derived.softWeights[k])])) as Record<Factor, number>,
    ranking: ranked.map(r => ({ shelterId: r.shelterId, score: round(r.matchScore) })),
    winner,
    runnerUp,
    margin: margin === null ? null : round(margin),
    nearTie,
    decisiveFactor,
    annotatedBest: a.bestShelter,
    expectedWinner,
    correct,
    note,
  };
}

export interface RunOptions {
  classify: Classify;
  classifierName: string;
  vectors: VectorSet;
  weightsVersion: string;
  mode?: BlendMode;
  fixtures?: Fixture[];
  annotations?: Annotations;
  gitCommit?: string;
  annotationsCommit?: string;
  annotationsFile?: string;
  fixturesDir?: string;
}

export function runEvaluation(o: RunOptions): RunReport {
  const fixtures = o.fixtures ?? loadFixtures(o.fixturesDir);
  const annotations = o.annotations ?? loadAnnotations(o.annotationsFile);
  const mode = o.mode ?? 'blend';
  const results = fixtures.map(f => {
    const a = annotations.cases[f.id];
    if (!a) throw new Error(`no annotation for ${f.id}`);
    return runCase(f, a, o.classify, o.vectors, mode, o.weightsVersion);
  });
  const agreeable = results.filter(r => r.archetypeAgrees !== null);
  const fallbackCases = results.filter(r => annotations.cases[r.id].expectFallback);
  const decisive: Record<string, number> = {};
  results.forEach(r => { if (r.decisiveFactor) decisive[r.decisiveFactor] = (decisive[r.decisiveFactor] ?? 0) + 1; });
  const summary: Summary = {
    cases: results.length,
    archetypeAgreement: { agree: agreeable.filter(r => r.archetypeAgrees).length, of: agreeable.length },
    winnerCorrect: { correct: results.filter(r => r.correct).length, of: results.length },
    fallbackCasesHandled: { handled: fallbackCases.filter(r => r.correct).length, of: fallbackCases.length },
    nearTies: results.filter(r => r.nearTie).map(r => r.id),
    decisiveFactorCounts: decisive,
  };
  const annFile = o.annotationsFile ?? path.join(__dirname, 'annotations.json');
  const fixDir = o.fixturesDir ?? path.join(__dirname, 'fixtures');
  const fixturesSha256 = sha256(fs.readdirSync(fixDir).filter(f => /^SYN-\d+\.json$/.test(f)).sort()
    .map(f => fs.readFileSync(path.join(fixDir, f), 'utf8')).join('\n---\n'));
  const report: RunReport = {
    provenance: {
      gitCommit: o.gitCommit ?? 'unknown',
      annotationsCommit: o.annotationsCommit ?? 'unknown',
      annotationsSha256: sha256(fs.readFileSync(annFile, 'utf8')),
      fixturesSha256,
      weightsVersion: o.weightsVersion,
      classifier: o.classifierName,
      mode,
    },
    results,
    summary,
    resultHash: '',
  };
  // Hash only what the run computed (not git metadata), so repeat runs on any commit are comparable.
  report.resultHash = sha256(JSON.stringify({ results, summary, v: o.weightsVersion, c: o.classifierName, m: mode }));
  return report;
}

export { ARCHETYPES };

// ── Frozen v1 baseline (Hard Stop 2, Section 8 "Comparison") ─────────────────────────────────────────────────
// v1 = the original llm-weighting needs profile, recorded once from the live model (scripts/bedrock-eval.ts --freeze-v1)
// and then replayed, so the comparison does not depend on the model's day-to-day variation.

export interface FrozenV1 { id: string; profile: { hardConstraints: string[]; softWeights: Record<Factor, number> } | null }

export interface ComparisonRow {
  id: string;
  annotatedBest: string | null;
  v1Winner: string | null;
  v2Winner: string | null;
  v1Matches: boolean | null;
  v2Matches: boolean | null;
  disagree: boolean;
  v1Weights: Record<Factor, number> | null;
}

/** Winner under a frozen v1 profile for each fixture (null if the v1 profile could not be recorded for that case). */
export function runFrozenV1(frozen: FrozenV1[], fixtures: Fixture[] = loadFixtures()): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const f of fixtures) {
    const fz = frozen.find(x => x.id === f.id);
    if (!fz || !fz.profile) { out[f.id] = null; continue; }
    const ranked = rankBids(f.bids, fz.profile, f.caseLocation, {}, extractCaseSpecies(f.reportData));
    out[f.id] = pickWinner(ranked).winner;
  }
  return out;
}

/** Cases with a single annotated best shelter (excludes the near-tie case and the fallback case, which have no single annotated winner). */
const hasSingleBest = (a: Annotation) => !a.nearTie && !a.expectFallback && !!a.bestShelter;

export function compareV1V2(v1: Record<string, string | null>, v2: RunReport, annotations: Annotations = loadAnnotations(), frozen: FrozenV1[] = []): { rows: ComparisonRow[]; v1Correct: number; v2Correct: number; of: number; disagreements: number } {
  const rows: ComparisonRow[] = v2.results.map(r => {
    const a = annotations.cases[r.id];
    const single = hasSingleBest(a);
    const v1w = v1[r.id] ?? null;
    return {
      id: r.id,
      annotatedBest: a.bestShelter,
      v1Winner: v1w,
      v2Winner: r.winner,
      v1Matches: single ? (v1w === null ? null : v1w === a.bestShelter) : null,
      v2Matches: single ? r.winner === a.bestShelter : null,
      disagree: v1w !== null && v1w !== r.winner,
      v1Weights: frozen.find(x => x.id === r.id)?.profile?.softWeights ?? null,
    };
  });
  const scored = rows.filter(r => r.v2Matches !== null);
  return {
    rows,
    v1Correct: scored.filter(r => r.v1Matches === true).length,
    v2Correct: scored.filter(r => r.v2Matches === true).length,
    of: scored.length,
    disagreements: rows.filter(r => r.disagree).length,
  };
}
