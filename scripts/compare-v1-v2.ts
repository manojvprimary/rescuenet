// Frozen v1 vs v2 on the evaluation cases (Hard Stop 2, SC3). v1 = recorded live needs profiles (eval/frozen-v1);
// v2 = archetype blend with the current AHP vectors and the chosen classifier. Judged against the annotations.
//   Usage: npx ts-node scripts/compare-v1-v2.ts [--classifier rule|file:<path>] [--out <path>]
import * as fs from 'fs';
import * as path from 'path';
import { loadVectors, WEIGHTS_VERSION } from '../lambda/shared/weights';
import { FrozenV1, compareV1V2, loadAnnotations, loadFixtures, recordedClassifier, ruleClassifier, runEvaluation, runFrozenV1 } from '../eval/harness';

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const classifierArg = arg('classifier', 'rule')!;
const classify = classifierArg === 'rule' ? ruleClassifier : recordedClassifier(JSON.parse(fs.readFileSync(classifierArg.slice(5), 'utf8')));

const frozenDir = path.join('eval', 'frozen-v1');
const frozen: FrozenV1[] = fs.existsSync(frozenDir)
  ? fs.readdirSync(frozenDir).filter(f => f.endsWith('.json')).sort().map(f => {
      const d = JSON.parse(fs.readFileSync(path.join(frozenDir, f), 'utf8'));
      const p = d.profile;
      const ok = p && Array.isArray(p.hardConstraints) && p.softWeights;
      return { id: d.id, profile: ok ? { hardConstraints: p.hardConstraints, softWeights: p.softWeights } : null };
    })
  : [];
if (frozen.length === 0) { console.error('No frozen v1 profiles in eval/frozen-v1 (run scripts/bedrock-eval.ts --freeze-v1).'); process.exit(3); }

const v2 = runEvaluation({ classify, classifierName: classifierArg, vectors: loadVectors(), weightsVersion: WEIGHTS_VERSION });
const v1 = runFrozenV1(frozen, loadFixtures());
const cmp = compareV1V2(v1, v2, loadAnnotations(), frozen);

console.log(`v2: weights ${WEIGHTS_VERSION}, classifier ${classifierArg}\n`);
console.log('case    annotated   v1 winner   v2 winner   v1 ok  v2 ok  differ');
for (const r of cmp.rows) {
  const t = (b: boolean | null) => (b === null ? 'n/a ' : b ? 'yes ' : 'NO  ');
  console.log(`${r.id.padEnd(8)}${String(r.annotatedBest).slice(0, 10).padEnd(12)}${String(r.v1Winner).padEnd(12)}${String(r.v2Winner).padEnd(12)}${t(r.v1Matches).padEnd(7)}${t(r.v2Matches).padEnd(7)}${r.disagree ? 'YES (needs a written rationale)' : 'no'}`);
}
console.log(`\ncases with a single annotated best shelter: ${cmp.of}`);
console.log(`v1 matches annotation: ${cmp.v1Correct} of ${cmp.of}`);
console.log(`v2 matches annotation: ${cmp.v2Correct} of ${cmp.of}`);
console.log(`winner disagreements v1 vs v2 (all cases): ${cmp.disagreements}`);
console.log(`SC3 criterion (v2 at least as good as v1): ${cmp.v2Correct >= cmp.v1Correct ? 'MET' : 'NOT MET'}`);
const out = arg('out', path.join('eval', 'results', 'comparison.json'))!;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ classifier: classifierArg, weightsVersion: WEIGHTS_VERSION, ...cmp }, null, 2) + '\n');
