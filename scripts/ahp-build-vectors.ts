// Compiles the student's accepted AHP judgments (eval/ahp/*.judgments.json) into lambda/shared/ahp-weights.json.
// An archetype without accepted judgments (CR < 0.10) keeps the equal placeholder and is marked as such, so the
// file always says exactly which vectors are elicited and which are not.
//   Usage: npx ts-node scripts/ahp-build-vectors.ts [--dry-run]
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ARCHETYPES, FACTORS } from '../lambda/shared/weights';
import { vectorsFromStored } from '../eval/ahp-store';

const dry = process.argv.includes('--dry-run');
const { vectors, placeholders, stored } = vectorsFromStored();
const elicited = ARCHETYPES.filter(a => !placeholders.includes(a));
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const digest = createHash('sha256').update(JSON.stringify(elicited.map(a => stored[a]!.judgments))).digest('hex').slice(0, 8);

const out = {
  version: elicited.length === 0 ? 'v0-placeholder' : placeholders.length === 0 ? `v1-elicited-${today}-${digest}` : `v0-partial-${today}-${digest}`,
  status: elicited.length === 0 ? 'PLACEHOLDER_NOT_ELICITED' : placeholders.length === 0 ? 'ELICITED_ALL_THREE' : 'PARTIAL_ELICITATION',
  note: elicited.length === 0
    ? 'Equal vectors. These are NOT the student\'s AHP judgments.'
    : `Elicited from the student's own pairwise judgments (eval/ahp/*.judgments.json), single judge. Elicited: ${elicited.join(', ') || 'none'}. Still equal placeholders: ${placeholders.join(', ') || 'none'}.`,
  factors: [...FACTORS],
  consistency: Object.fromEntries(elicited.map(a => [a, { cr: stored[a]!.result.cr, lambdaMax: stored[a]!.result.lambdaMax, elicitedAt: stored[a]!.elicitedAt }])),
  vectors: Object.fromEntries(ARCHETYPES.map(a => [a, FACTORS.map(f => vectors[a][f])])),
};
const file = path.join(__dirname, '..', 'lambda', 'shared', 'ahp-weights.json');
console.log(JSON.stringify(out, null, 2));
if (!dry) { fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n'); console.log(`\nWrote ${file}`); }
