// Case-specific weight derivation (Hard Stop 2, Section 5.3).
//
// Pure and deterministic: no AWS clients, no model call, no randomness. Given the archetype
// probabilities p, the output is exactly reproducible. The only non-deterministic step in the
// whole path is the upstream Bedrock classification that produces p (measured separately by the
// classifier-stability test). Not yet wired into needs-profile; see KNOWN_ISSUES.md KI-01.

import ahpConfig from './ahp-weights.json';

export const ARCHETYPES = ['INJURED_CRITICAL', 'URGENT_TRANSIENT', 'STABLE_ROUTINE'] as const;
export type Archetype = typeof ARCHETYPES[number];

// Same keys and order as NeedsProfile['softWeights'] in utils.ts (kept local so this module
// has no runtime dependency on the AWS-client setup in utils.ts).
export const FACTORS = ['vet_care', 'pickup_urgency', 'species_specialization', 'proximity', 'long_term_care'] as const;
export type Factor = typeof FACTORS[number];
export type Weights = Record<Factor, number>;
export type Probabilities = Record<Archetype, number>;
export type VectorSet = Record<Archetype, Weights>;
export type BlendMode = 'blend' | 'top';

export const FALLBACK_ARCHETYPE: Archetype = 'STABLE_ROUTINE';
const TOLERANCE = 1e-9;

export interface DerivedWeights {
  softWeights: Weights;
  archetypeProbabilities: Probabilities;
  weightsVersion: string;
  usedFallback: boolean;
}

function toWeights(row: number[]): Weights {
  return Object.fromEntries(FACTORS.map((f, i) => [f, row[i]])) as Weights;
}

/** Throws if a vector set is malformed: wrong length, non-finite or negative entries, or a sum other than 1. */
export function validateVectors(vectors: VectorSet): void {
  for (const a of ARCHETYPES) {
    const v = vectors[a];
    if (!v) throw new Error(`missing vector for ${a}`);
    let sum = 0;
    for (const f of FACTORS) {
      const x = v[f];
      if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) throw new Error(`${a}.${f} must be a finite number >= 0`);
      sum += x;
    }
    if (Math.abs(sum - 1) > 1e-6) throw new Error(`${a} weights must sum to 1 (got ${sum})`);
  }
}

/** The vectors shipped in ahp-weights.json. Currently PLACEHOLDER (equal) until the Week 6 elicitation. */
export function loadVectors(): VectorSet {
  const v = Object.fromEntries(
    ARCHETYPES.map(a => [a, toWeights((ahpConfig.vectors as Record<string, number[]>)[a])]),
  ) as VectorSet;
  validateVectors(v);
  return v;
}

export const WEIGHTS_VERSION: string = ahpConfig.version;

/**
 * Schema-validates raw classifier output. Returns null if it is not an object with a finite,
 * non-negative number for every archetype and a positive total. Does NOT renormalize.
 */
export function parseArchetypeProbabilities(raw: unknown): Probabilities | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const src = raw as Record<string, unknown>;
  const out = {} as Probabilities;
  let sum = 0;
  for (const a of ARCHETYPES) {
    const x = src[a];
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return null;
    out[a] = x;
    sum += x;
  }
  return sum > 0 ? out : null;
}

function normalize(p: Probabilities): Probabilities {
  const sum = ARCHETYPES.reduce((s, a) => s + p[a], 0);
  return Object.fromEntries(ARCHETYPES.map(a => [a, p[a] / sum])) as Probabilities;
}

/** Highest-probability archetype. Ties resolve by ARCHETYPES order (deterministic). */
export function topArchetype(p: Probabilities): Archetype {
  return ARCHETYPES.reduce((best, a) => (p[a] > p[best] + TOLERANCE ? a : best), ARCHETYPES[0]);
}

/** w = sum over archetypes of p[k] * vectors[k], per factor. */
export function blendWeights(p: Probabilities, vectors: VectorSet): Weights {
  const out = {} as Weights;
  for (const f of FACTORS) out[f] = ARCHETYPES.reduce((s, a) => s + p[a] * vectors[a][f], 0);
  return out;
}

/**
 * Derives a case's softWeights from raw classifier output.
 * Invalid or missing output falls back to the STABLE_ROUTINE vector (an AHP vector, not a hand-coded constant).
 * mode 'blend' = full convex blend (ladder rung 1); 'top' = highest-probability archetype only (rung 2).
 */
export function deriveWeights(
  modelOutput: unknown,
  vectors: VectorSet = loadVectors(),
  mode: BlendMode = 'blend',
  version: string = WEIGHTS_VERSION,
): DerivedWeights {
  const parsed = parseArchetypeProbabilities(modelOutput);
  const usedFallback = parsed === null;
  const p: Probabilities = usedFallback
    ? { INJURED_CRITICAL: 0, URGENT_TRANSIENT: 0, STABLE_ROUTINE: 1 }
    : normalize(parsed);
  const softWeights = mode === 'top' ? { ...vectors[topArchetype(p)] } : blendWeights(p, vectors);
  return { softWeights, archetypeProbabilities: p, weightsVersion: version, usedFallback };
}
