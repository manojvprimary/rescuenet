// Runnable smoke test for the weight-derivation skeleton. Exits non-zero on any failure.
// Usage: npx ts-node scripts/smoke-weights.ts
import { FACTORS, deriveWeights, loadVectors, WEIGHTS_VERSION } from '../lambda/shared/weights';
import { speciesMatchScore } from '../lambda/shared/scoring';

let failures = 0;
const check = (name: string, ok: boolean) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };

console.log(`weights version: ${WEIGHTS_VERSION} (placeholder equal vectors until the Week 6 AHP elicitation)\n`);
const vectors = loadVectors();
check('shipped vectors load and validate', Object.keys(vectors).length === 3);

const samples: Array<[string, unknown]> = [
  ['critical injury', { INJURED_CRITICAL: 0.85, URGENT_TRANSIENT: 0.1, STABLE_ROUTINE: 0.05 }],
  ['routine stray', { INJURED_CRITICAL: 0.05, URGENT_TRANSIENT: 0.1, STABLE_ROUTINE: 0.85 }],
  ['malformed model output', { oops: true }],
];
for (const [label, out] of samples) {
  const r = deriveWeights(out);
  const total = FACTORS.reduce((s, f) => s + r.softWeights[f], 0);
  console.log(`\n${label}: fallback=${r.usedFallback} p=${JSON.stringify(r.archetypeProbabilities)}`);
  console.log('  softWeights:', FACTORS.map(f => `${f}=${r.softWeights[f].toFixed(3)}`).join(' '));
  check(`${label}: weights sum to 1`, Math.abs(total - 1) < 1e-9);
  if (label === 'malformed model output') check('malformed output used the fallback', r.usedFallback);
}
console.log();
check('species check: dog shelter does not match a cat (old code scored this 0.85)', speciesMatchScore(['dog'], 'cat') === 0.5);
check('species check: cat shelter matches a cat', speciesMatchScore(['cat'], 'cat') === 0.85);

// ILLUSTRATIVE ONLY: demo vectors (same as the unit-test vectors), NOT the student's elicited AHP judgments.
// The shipped placeholder is equal, which hides the blend; this shows the mechanism working.
const demo = {
  INJURED_CRITICAL: { vet_care: 0.50, pickup_urgency: 0.25, species_specialization: 0.10, proximity: 0.10, long_term_care: 0.05 },
  URGENT_TRANSIENT: { vet_care: 0.10, pickup_urgency: 0.40, species_specialization: 0.10, proximity: 0.35, long_term_care: 0.05 },
  STABLE_ROUTINE:   { vet_care: 0.10, pickup_urgency: 0.10, species_specialization: 0.30, proximity: 0.20, long_term_care: 0.30 },
};
console.log('ILLUSTRATIVE vectors (not elicited), showing the case-specific blend:');
const critical = deriveWeights({ INJURED_CRITICAL: 0.85, URGENT_TRANSIENT: 0.1, STABLE_ROUTINE: 0.05 }, demo);
const routine = deriveWeights({ INJURED_CRITICAL: 0.05, URGENT_TRANSIENT: 0.1, STABLE_ROUTINE: 0.85 }, demo);
console.log('  critical injury vet_care =', critical.softWeights.vet_care.toFixed(3));
console.log('  routine stray   vet_care =', routine.softWeights.vet_care.toFixed(3));
check('injured case weights vet care more than a routine case', critical.softWeights.vet_care > routine.softWeights.vet_care);
console.log();

console.log(failures === 0 ? '\nSMOKE TEST PASSED' : `\nSMOKE TEST FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
