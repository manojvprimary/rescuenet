// Storage and assembly for the student's AHP judgments (Hard Stop 2, Section 5.2).
// One file per archetype in eval/ahp/, written by scripts/ahp-elicit.ts. Nothing here invents a judgment.

import * as fs from 'fs';
import * as path from 'path';
import { Judgment, analyzeJudgments, AhpResult } from '../lambda/shared/ahp';
import { ARCHETYPES, Archetype, FACTORS, VectorSet, Weights } from '../lambda/shared/weights';

// RESCUENET_AHP_DIR lets tests and dry runs use a scratch directory instead of the committed eval/ahp.
export const AHP_DIR = process.env.RESCUENET_AHP_DIR ?? path.join(__dirname, 'ahp');

export const ARCHETYPE_DESCRIPTIONS: Record<Archetype, string> = {
  INJURED_CRITICAL: 'The animal is visibly injured or in medical distress and needs a veterinarian.',
  URGENT_TRANSIENT: 'The animal looks healthy but is at risk or mobile, and the reporter cannot hold it (traffic, weather, fleeing).',
  STABLE_ROUTINE: 'The animal is secured and stable; no immediate danger.',
};

export const FACTOR_DESCRIPTIONS: Record<string, string> = {
  vet_care: 'vet care (the shelter has a vet on site or can arrange one)',
  pickup_urgency: 'pickup urgency (open slots and how fast the shelter can take the animal)',
  species_specialization: 'species match (the shelter accepts this species)',
  proximity: 'proximity (the shelter is close to the animal)',
  long_term_care: 'long-term care (room to keep the animal while it recovers)',
};

export interface StoredJudgments {
  archetype: Archetype;
  judge: string;
  elicitedAt: string;
  factors: string[];
  judgments: Judgment[];     // all 10 pairs, i < j, value = how much more important factor i is than factor j
  result: { weights: number[]; lambdaMax: number; ci: number; cr: number; acceptable: boolean };
  note: string;
}

export const judgmentsPath = (a: Archetype) => path.join(AHP_DIR, `${a}.judgments.json`);

export function loadStored(a: Archetype): StoredJudgments | null {
  const p = judgmentsPath(a);
  return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, 'utf8')) as StoredJudgments) : null;
}

export function resultSummary(r: AhpResult): StoredJudgments['result'] {
  return { weights: r.weights, lambdaMax: r.lambdaMax, ci: r.ci, cr: r.cr, acceptable: r.acceptable };
}

export function toWeights(row: number[]): Weights {
  return Object.fromEntries(FACTORS.map((f, i) => [f, row[i]])) as Weights;
}

/**
 * Builds a VectorSet from the stored judgments. An archetype with no accepted (CR < 0.10) judgments keeps the
 * equal placeholder vector and is listed in `placeholders`, so no result can quietly use an un-elicited vector.
 */
export function vectorsFromStored(load: (a: Archetype) => StoredJudgments | null = loadStored): { vectors: VectorSet; placeholders: Archetype[]; stored: Partial<Record<Archetype, StoredJudgments>> } {
  const vectors = {} as VectorSet;
  const placeholders: Archetype[] = [];
  const stored: Partial<Record<Archetype, StoredJudgments>> = {};
  for (const a of ARCHETYPES) {
    const s = load(a);
    if (s) {
      const r = analyzeJudgments(FACTORS.length, s.judgments);
      if (r.acceptable) { vectors[a] = toWeights(r.weights); stored[a] = s; continue; }
    }
    vectors[a] = toWeights(FACTORS.map(() => 1 / FACTORS.length));
    placeholders.push(a);
  }
  return { vectors, placeholders, stored };
}
