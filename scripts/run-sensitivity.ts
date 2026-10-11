// One-step sensitivity check over the student's accepted AHP judgments (SC2). Requires all three archetypes elicited.
//   Usage: npx ts-node scripts/run-sensitivity.ts [--classifier rule|file:<path>] [--out <path>]
import * as fs from 'fs';
import * as path from 'path';
import { ARCHETYPES, FACTORS } from '../lambda/shared/weights';
import { loadStored } from '../eval/ahp-store';
import { recordedClassifier, ruleClassifier } from '../eval/harness';
import { runSensitivity } from '../eval/sensitivity';

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const classifierArg = arg('classifier', 'rule')!;
const classify = classifierArg === 'rule' ? ruleClassifier : recordedClassifier(JSON.parse(fs.readFileSync(classifierArg.slice(5), 'utf8')));

const judgments = {} as Parameters<typeof runSensitivity>[0];
for (const a of ARCHETYPES) {
  const s = loadStored(a);
  if (!s || !s.result.acceptable) { console.error(`${a}: no accepted judgments yet (run scripts/ahp-elicit.ts ${a}). Sensitivity needs all three.`); process.exit(3); }
  judgments[a] = s.judgments;
}
const r = runSensitivity(judgments, classify);
const label = (i: number) => FACTORS[i];
console.log(`classifier: ${classifierArg}`);
console.log(`${r.perturbations} one-step perturbations (each judgment up and down, one at a time)`);
console.log(`largest number of cases flipped by any single perturbation: ${r.maxFlips}`);
console.log(`criterion (no single perturbation flips ${2} or more cases): ${r.passes ? 'PASS' : 'FAIL'}`);
for (const v of r.violating) console.log(`  ${v.archetype} ${label(v.pair[0])} vs ${label(v.pair[1])}: ${v.from.toFixed(3)} -> ${v.to.toFixed(3)} flips ${v.flipped.join(', ')} (CR ${v.cr.toFixed(3)})`);
const out = arg('out', path.join('eval', 'results', 'sensitivity.json'))!;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(r, null, 2) + '\n');
console.log(`wrote ${out}`);
