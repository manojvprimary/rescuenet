// Validates a proposed set of AHP answers and, only when told to, saves them as the student's judgments.
//   npx ts-node scripts/ahp-adopt.ts eval/ahp/evidence-informed-proposal.json            check only (writes nothing)
//   npx ts-node scripts/ahp-adopt.ts eval/ahp/evidence-informed-proposal.json --adopt    save as the student's judgments
// The proposal file is the record of WHY each pair has its value (sources and reasoning). Adopting means the student
// reviewed it and takes it as their own judgment; the saved files say so and name the proposal they came from.
import * as fs from 'fs';
import { Judgment, analyzeJudgments, mostInconsistentJudgment } from '../lambda/shared/ahp';
import { ARCHETYPES, FACTORS } from '../lambda/shared/weights';
import { AHP_DIR, StoredJudgments, judgmentsPath, resultSummary } from '../eval/ahp-store';

const file = process.argv[2];
const adopt = process.argv.includes('--adopt');
const note = process.argv.find(a => a.startsWith('--judge='))?.slice(8) ?? 'Manoj Venkatachalaiah (sole judge)';
if (!file) { console.error('Usage: ts-node scripts/ahp-adopt.ts <proposal.json> [--adopt]'); process.exit(2); }
const proposal = JSON.parse(fs.readFileSync(file, 'utf8'));

const pairs: Array<[number, number]> = [];
for (let i = 0; i < FACTORS.length; i++) for (let j = i + 1; j < FACTORS.length; j++) pairs.push([i, j]);
const parse = (t: string): number => {
  if (t === '=') return 1;
  const m = /^([ab])([1-9])$/.exec(t);
  if (!m) throw new Error(`bad answer "${t}"`);
  return m[1] === 'a' ? Number(m[2]) : 1 / Number(m[2]);
};

let allOk = true;
for (const a of ARCHETYPES) {
  const answers: string[] = proposal.archetypes[a].answers;
  if (answers.length !== pairs.length) throw new Error(`${a}: expected ${pairs.length} answers`);
  const js: Judgment[] = pairs.map(([i, j], k) => ({ i, j, value: parse(answers[k]) }));
  const r = analyzeJudgments(FACTORS.length, js);
  console.log(`${a.padEnd(17)} CR ${r.cr.toFixed(4)} ${r.acceptable ? 'OK ' : 'REJECT'}  weights ${r.weights.map(w => w.toFixed(3)).join(' ')}  (row-avg vs eigenvector max diff ${r.maxDiff.toFixed(3)})`);
  if (!r.acceptable) {
    allOk = false;
    const h = mostInconsistentJudgment(FACTORS.length, js);
    if (h) console.log(`   most inconsistent pair: ${h.index + 1}; changing it one step would give CR ${h.crAfter.toFixed(4)}`);
    continue;
  }
  if (adopt) {
    const stored: StoredJudgments = {
      archetype: a, judge: note, elicitedAt: new Date().toISOString(), factors: [...FACTORS], judgments: js, result: resultSummary(r),
      note: `Adopted by the student from the evidence-informed proposal (${file}); sources and per-pair reasoning are in that file. Single judge. CR below 0.10 shows internal consistency only.`,
    };
    fs.mkdirSync(AHP_DIR, { recursive: true });
    fs.writeFileSync(judgmentsPath(a), JSON.stringify(stored, null, 2) + '\n');
    console.log(`   saved ${judgmentsPath(a)}`);
  }
}
if (!allOk) { console.log('\nAt least one matrix has CR >= 0.10; nothing was saved for it.'); process.exit(1); }
console.log(adopt ? '\nAdopted.' : '\nCheck only: nothing written. Re-run with --adopt once the student has reviewed the proposal.');
