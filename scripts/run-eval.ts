// Evaluation harness CLI. Usage:
//   npx ts-node scripts/run-eval.ts [--classifier rule|file:<path>] [--out <path>] [--mode blend|top]
// Writes a JSON report (default eval/results/latest.json) and prints a table. Exits non-zero on a harness error,
// not on a failed expectation: a wrong winner is a result to report, not a crash.
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { loadVectors, WEIGHTS_VERSION, BlendMode } from '../lambda/shared/weights';
import { recordedClassifier, ruleClassifier, runEvaluation } from '../eval/harness';

const arg = (name: string, dflt?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const git = (cmd: string) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };

const classifierArg = arg('classifier', 'rule')!;
const mode = (arg('mode', 'blend') as BlendMode);
const out = arg('out', path.join('eval', 'results', 'latest.json'))!;
const classify = classifierArg === 'rule' ? ruleClassifier
  : classifierArg.startsWith('file:') ? recordedClassifier(JSON.parse(fs.readFileSync(classifierArg.slice(5), 'utf8')))
  : (() => { throw new Error(`unknown classifier "${classifierArg}"`); })();

const report = runEvaluation({
  classify,
  classifierName: classifierArg === 'rule' ? 'rule-based comparison classifier (offline, not Bedrock)' : classifierArg,
  vectors: loadVectors(),
  weightsVersion: WEIGHTS_VERSION,
  mode,
  gitCommit: git('rev-parse HEAD'),
  annotationsCommit: git('log -1 --format=%H -- eval/annotations.json'),
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`weights: ${report.provenance.weightsVersion} | classifier: ${report.provenance.classifier} | mode: ${mode}`);
console.log(`annotations committed at ${report.provenance.annotationsCommit.slice(0, 7)} (sha256 ${report.provenance.annotationsSha256.slice(0, 12)}...)\n`);
console.log(pad('case', 8) + pad('top archetype', 18) + pad('agree', 7) + pad('winner', 11) + pad('expected', 11) + pad('ok', 5) + 'decisive factor / note');
for (const r of report.results) {
  console.log(pad(r.id, 8) + pad(r.topArchetype, 18) + pad(r.archetypeAgrees === null ? 'n/a' : r.archetypeAgrees ? 'yes' : 'NO', 7) +
    pad(String(r.winner), 11) + pad(String(r.expectedWinner), 11) + pad(r.correct ? 'yes' : 'NO', 5) + (r.decisiveFactor ?? r.note));
}
const s = report.summary;
console.log(`\narchetype agreement: ${s.archetypeAgreement.agree} of ${s.archetypeAgreement.of}`);
console.log(`winner matches annotation: ${s.winnerCorrect.correct} of ${s.winnerCorrect.of}`);
console.log(`classifier-failure cases handled: ${s.fallbackCasesHandled.handled} of ${s.fallbackCasesHandled.of}`);
console.log(`near-ties: ${s.nearTies.join(', ') || 'none'}`);
console.log(`decisive factor counts: ${JSON.stringify(s.decisiveFactorCounts)}`);
console.log(`result hash: ${report.resultHash}`);
