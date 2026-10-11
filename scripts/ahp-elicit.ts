// Interactive AHP elicitation (Hard Stop 2, Section 5.2). The JUDGE answers; this script only asks, checks, and saves.
//
// Usage:   npx ts-node scripts/ahp-elicit.ts INJURED_CRITICAL
//          npx ts-node scripts/ahp-elicit.ts URGENT_TRANSIENT
//          npx ts-node scripts/ahp-elicit.ts STABLE_ROUTINE
//
// For each of the 10 pairs of factors you say which matters more FOR THAT KIND OF CASE, and by how much:
//     =      equal importance
//     a3     the first factor is 3 times as important as the second   (a1 to a9; a1 is the same as =)
//     b5     the second factor is 5 times as important as the first   (b1 to b9)
// Saaty's scale: 1 equal, 3 moderately more, 5 strongly more, 7 very strongly more, 9 extremely more; 2, 4, 6, 8 in between.
// If the consistency ratio (CR) is 0.10 or more, the script points at the judgment that most reduces it; you decide
// whether to change it. Nothing is saved as accepted unless CR < 0.10. Press Ctrl+C any time; progress is not lost
// because only a completed, accepted set is written.

import * as fs from 'fs';
import * as readline from 'readline';
import { Judgment, analyzeJudgments, judgmentCount, mostInconsistentJudgment } from '../lambda/shared/ahp';
import { ARCHETYPES, Archetype, FACTORS } from '../lambda/shared/weights';
import { AHP_DIR, ARCHETYPE_DESCRIPTIONS, FACTOR_DESCRIPTIONS, StoredJudgments, judgmentsPath, resultSummary } from '../eval/ahp-store';

const archetype = process.argv[2] as Archetype;
if (!ARCHETYPES.includes(archetype)) {
  console.error(`Usage: ts-node scripts/ahp-elicit.ts <${ARCHETYPES.join('|')}>`);
  process.exit(2);
}

const pairs: Array<[number, number]> = [];
for (let i = 0; i < FACTORS.length; i++) for (let j = i + 1; j < FACTORS.length; j++) pairs.push([i, j]);
const label = (i: number) => FACTORS[i].replace(/_/g, ' ');

function parseAnswer(raw: string): number | null {
  const t = raw.trim().toLowerCase();
  if (t === '=' || t === '1' || t === 'a1' || t === 'b1') return 1;
  const m = /^([ab])\s*([1-9])$/.exec(t);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] === 'a' ? n : 1 / n;
}
const show = (v: number) => (v === 1 ? 'equal' : v > 1 ? `a${v}` : `b${Math.round(1 / v)}`);

// A line iterator, not rl.question: it keeps every line even when many arrive at once (piped or pasted answers).
const rl = readline.createInterface({ input: process.stdin });
const lines = rl[Symbol.asyncIterator]();
const ask = async (q: string): Promise<string> => {
  process.stdout.write(q);
  const next = await lines.next();
  if (next.done) { console.log('\nInput ended before the elicitation finished. Nothing was saved.'); process.exit(1); }
  if (!process.stdin.isTTY) console.log(next.value);
  return next.value;
};

(async () => {
  console.log(`\nAHP elicitation for ${archetype}`);
  console.log(`Case type: ${ARCHETYPE_DESCRIPTIONS[archetype]}`);
  console.log('Factors:');
  FACTORS.forEach(f => console.log(`  - ${f}: ${FACTOR_DESCRIPTIONS[f]}`));
  console.log('\nFor each pair, answer for THIS kind of case. Answers: =  a1..a9 (first matters more)  b1..b9 (second matters more)\n');

  const values: number[] = [];
  for (let k = 0; k < pairs.length; k++) {
    const [i, j] = pairs[k];
    for (;;) {
      const ans = await ask(`(${k + 1}/${pairs.length}) ${label(i)}  vs  ${label(j)}: `);
      const v = parseAnswer(ans);
      if (v !== null) { values.push(v); break; }
      console.log('  Please answer = or a1..a9 or b1..b9.');
    }
  }

  const build = (): Judgment[] => pairs.map(([i, j], k) => ({ i, j, value: values[k] }));
  for (;;) {
    const r = analyzeJudgments(FACTORS.length, build());
    console.log('\nYour judgments:');
    pairs.forEach(([i, j], k) => console.log(`  ${String(k + 1).padStart(2)}. ${label(i)} vs ${label(j)}: ${show(values[k])}`));
    console.log('\nResulting weights:');
    FACTORS.forEach((f, i) => console.log(`  ${f.padEnd(24)} ${r.weights[i].toFixed(3)}`));
    console.log(`\nlambda_max = ${r.lambdaMax.toFixed(4)}   CI = ${r.ci.toFixed(4)}   CR = ${r.cr.toFixed(4)}   (must be < 0.10)`);
    if (r.acceptable) {
      const ok = (await ask('\nCR is acceptable. Save these as your final judgments? (yes / number of a pair to change / no): ')).trim().toLowerCase();
      if (ok === 'yes' || ok === 'y') {
        const stored: StoredJudgments = {
          archetype, judge: 'Manoj Venkatachalaiah (sole judge)', elicitedAt: new Date().toISOString(),
          factors: [...FACTORS], judgments: build(), result: resultSummary(r),
          note: 'Single judge. A CR below 0.10 shows internal consistency only, not that the judgments are substantively right (see SC2 sensitivity check).',
        };
        fs.mkdirSync(AHP_DIR, { recursive: true });
        fs.writeFileSync(judgmentsPath(archetype), JSON.stringify(stored, null, 2) + '\n');
        console.log(`\nSaved ${judgmentsPath(archetype)}`);
        break;
      }
      if (ok === 'no' || ok === 'n') { console.log('Not saved.'); break; }
      const n = Number(ok);
      if (!(n >= 1 && n <= pairs.length)) { console.log('Please answer yes, no, or a pair number.'); continue; }
      const [i, j] = pairs[n - 1];
      for (;;) {
        const v = parseAnswer(await ask(`New answer for ${label(i)} vs ${label(j)}: `));
        if (v !== null) { values[n - 1] = v; break; }
        console.log('  Please answer = or a1..a9 or b1..b9.');
      }
      continue;
    }
    const hint = mostInconsistentJudgment(FACTORS.length, build());
    console.log('\nCR is 0.10 or more, so these judgments are not consistent enough to use.');
    if (hint) {
      const [i, j] = pairs[hint.index];
      console.log(`The single change that lowers CR the most is pair ${hint.index + 1} (${label(i)} vs ${label(j)}): ${show(values[hint.index])} -> ${show(hint.suggested)} gives CR ${hint.crAfter.toFixed(4)}.`);
      console.log('That is a suggestion, not an answer: reconsider the pair and state what you actually believe.');
    }
    const n = Number(await ask(`Which pair number (1-${judgmentCount(FACTORS.length)}) do you want to reconsider? (0 to quit without saving): `));
    if (!(n >= 1 && n <= pairs.length)) { console.log('Not saved.'); break; }
    const [i, j] = pairs[n - 1];
    for (;;) {
      const v = parseAnswer(await ask(`New answer for ${label(i)} vs ${label(j)}: `));
      if (v !== null) { values[n - 1] = v; break; }
      console.log('  Please answer = or a1..a9 or b1..b9.');
    }
  }
  rl.close();
})();
