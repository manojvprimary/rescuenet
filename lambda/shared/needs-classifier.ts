// Archetype classification for needs-profile v2 (Hard Stop 2, Section 5.3 and 6).
//
// The model no longer invents weights. It returns a probability for each case archetype plus hard
// constraints and an urgency level; weights are then derived in code (weights.ts) from the AHP vectors.
// Everything here is pure (no AWS clients) so the prompt, the response parser, and a rule-based
// comparison classifier can be unit-tested and replayed offline.

import { ARCHETYPES, Archetype, Probabilities, parseArchetypeProbabilities } from './weights';

export type UrgencyLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

/** WEIGHTING_MODE: llm = existing behaviour (the model writes weights); blend = archetype blend; top = top archetype only. */
export type WeightingMode = 'llm' | 'blend' | 'top';

/** Unknown or missing values mean `llm`, so a typo in configuration can never switch behaviour on by accident. */
export function parseWeightingMode(raw: string | undefined): WeightingMode {
  return raw === 'blend' || raw === 'top' ? raw : 'llm';
}

export interface ClassifierResult {
  hardConstraints: string[];
  archetypeProbabilities: Probabilities;
  urgencyLevel: UrgencyLevel;
  reasoning: string;
}


// ── v1 prompt (WEIGHTING_MODE=llm), moved here verbatim from needs-profile so the baseline freeze script and the
// handler send byte-identical requests. test/needs-profile.test.ts pins it against the original text.
export const V1_SYSTEM_PROMPT = `You are a rescue case analyst. Extract a structured needs profile from an 
animal rescue case. Respond with valid JSON only — no explanation, no markdown fences.`;

export function buildV1UserPrompt(reportData: Record<string, unknown>): string {
  return `Given this rescue case reportData, extract a needs profile for shelter matching.

reportData:
${JSON.stringify(reportData, null, 2)}

Respond with exactly this JSON shape:
{
  "hardConstraints": ["has_vet"],
  "softWeights": {
    "vet_care": 0.40,
    "pickup_urgency": 0.30,
    "species_specialization": 0.15,
    "proximity": 0.10,
    "long_term_care": 0.05
  },
  "urgencyLevel": "HIGH",
  "reasoning": "One sentence."
}

Rules:
- hardConstraints: use "has_vet" if animal needs veterinary care; "accepts_species:X" for species requirement. Empty array if none.
- softWeights must sum to exactly 1.0. All five keys required.
  vet_care: 0 if healthy, up to 0.50 if critically injured.
  pickup_urgency: high if reporter cannot hold animal or animal is in immediate danger.
  species_specialization: higher for exotic/uncommon species.
  proximity: high if animal is mobile and at risk, low if reporter has secured it.
  long_term_care: high if animal needs extended recovery.
- urgencyLevel: LOW | MEDIUM | HIGH | CRITICAL`;
}

export const CLASSIFIER_SYSTEM_PROMPT =
  'You are a rescue case classifier. Classify an animal rescue case into three archetypes. ' +
  'Respond with valid JSON only: no explanation, no markdown fences.';

/** User prompt for the classifier. Temperature is set to 0 by the caller. */
export function buildClassifierPrompt(reportData: Record<string, unknown>): string {
  return `Classify this rescue case.

reportData:
${JSON.stringify(reportData, null, 2)}

Archetypes (probabilities must be non-negative and sum to 1):
- INJURED_CRITICAL: the animal is visibly injured or in medical distress and needs a veterinarian.
- URGENT_TRANSIENT: the animal looks healthy but is at risk or mobile and the reporter cannot hold it (traffic, weather, fleeing).
- STABLE_ROUTINE: the animal is secured and stable, with no immediate danger.
A case can be a mix, for example injured and also loose in traffic; then split the probability.

Respond with exactly this JSON shape:
{
  "hardConstraints": ["has_vet"],
  "archetypeProbabilities": { "INJURED_CRITICAL": 0.70, "URGENT_TRANSIENT": 0.25, "STABLE_ROUTINE": 0.05 },
  "urgencyLevel": "HIGH",
  "reasoning": "One sentence."
}

Rules:
- hardConstraints: "has_vet" if the animal needs veterinary care; "accepts_species:X" (lowercase species) for a species requirement. Empty array if none.
- Do not output any weights. Only the three probabilities.
- urgencyLevel: LOW | MEDIUM | HIGH | CRITICAL`;
}

const URGENCY: ReadonlyArray<string> = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CONSTRAINT = /^(has_vet|accepts_species:[a-z][a-z _-]*)$/;

/**
 * Strictly parses model text into a ClassifierResult. Returns null on anything malformed (not JSON,
 * missing or invalid probabilities, bad urgency, unknown constraint). The caller then falls back to the
 * STABLE_ROUTINE vector; nothing here repairs or guesses.
 */
export function parseClassifierResponse(text: string): ClassifierResult | null {
  let obj: unknown;
  try { obj = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { return null; }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const probs = parseArchetypeProbabilities(o.archetypeProbabilities);
  if (!probs) return null;
  if (typeof o.urgencyLevel !== 'string' || !URGENCY.includes(o.urgencyLevel)) return null;
  if (!Array.isArray(o.hardConstraints) || !o.hardConstraints.every(c => typeof c === 'string' && CONSTRAINT.test(c))) return null;
  return {
    hardConstraints: o.hardConstraints as string[],
    archetypeProbabilities: probs,
    urgencyLevel: o.urgencyLevel as UrgencyLevel,
    reasoning: typeof o.reasoning === 'string' ? o.reasoning : '',
  };
}

// ── Rule-based comparison classifier ──────────────────────────────────────────
// The design's "cheap comparison" (Section 6): deterministic rules on structured fields. It is NOT the
// production classifier; it lets the harness run end to end offline and gives the LLM something to be
// compared against. Same signals the existing buildDefaultProfile already reads.

export function ruleBasedProbabilities(reportData: Record<string, unknown>): Probabilities {
  const image = (reportData.imageAnalysis ?? {}) as Record<string, unknown>;
  const injured = Array.isArray(image.injuryIndicators) && image.injuryIndicators.length > 0;
  const text = String(reportData.reporterSituation ?? '').toLowerCase();
  const cannotHold = /\b(cannot|can't|cant|unable to)\b[^.]{0,40}\b(hold|catch|keep|contain)/.test(text);
  const p: Probabilities = injured && cannotHold
    ? { INJURED_CRITICAL: 0.5, URGENT_TRANSIENT: 0.45, STABLE_ROUTINE: 0.05 }
    : injured
      ? { INJURED_CRITICAL: 0.9, URGENT_TRANSIENT: 0.05, STABLE_ROUTINE: 0.05 }
      : cannotHold
        ? { INJURED_CRITICAL: 0.05, URGENT_TRANSIENT: 0.9, STABLE_ROUTINE: 0.05 }
        : { INJURED_CRITICAL: 0.05, URGENT_TRANSIENT: 0.05, STABLE_ROUTINE: 0.9 };
  return p;
}

/** Hard constraints from structured fields, matching what the v1 default profile derives. */
export function ruleBasedHardConstraints(reportData: Record<string, unknown>): string[] {
  const image = (reportData.imageAnalysis ?? {}) as Record<string, unknown>;
  const injured = Array.isArray(image.injuryIndicators) && image.injuryIndicators.length > 0;
  const species = ((image.species as string | undefined) ?? (reportData.species as string | undefined) ?? 'unknown').toLowerCase();
  const speciesConstraint = species === 'unknown' ? [] : [`accepts_species:${species}`];
  return injured ? ['has_vet', ...speciesConstraint] : speciesConstraint;
}

export function ruleBasedClassify(reportData: Record<string, unknown>): ClassifierResult {
  const p = ruleBasedProbabilities(reportData);
  const top = ARCHETYPES.reduce((b: Archetype, a) => (p[a] > p[b] ? a : b), ARCHETYPES[0]);
  return {
    hardConstraints: ruleBasedHardConstraints(reportData),
    archetypeProbabilities: p,
    urgencyLevel: top === 'INJURED_CRITICAL' ? 'HIGH' : top === 'URGENT_TRANSIENT' ? 'MEDIUM' : 'LOW',
    reasoning: 'Rule-based comparison classifier (structured fields only).',
  };
}
