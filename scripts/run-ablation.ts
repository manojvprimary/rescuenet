// Runs the pre-registered ablation (docs/ABLATION_PREREGISTRATION.md) over both evaluation sets.
//   npx ts-node scripts/run-ablation.ts [--out eval/results/ablation.json]
// Deterministic: reads only committed files (fixtures, annotations, frozen v1 profiles, recorded classifier output).
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { FORMULAS, WEIGHT_METHODS, contrast, key, loadSet, runGrid, summarize, wilson, SetSpec } from '../eval/ablation';
import { loadAnnotations, loadFixtures } from '../eval/harness';

const repo = path.join(__dirname, '..');
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const latest = (dir: string, re: RegExp) => path.join('eval', 'results', fs.readdirSync(path.join(repo, dir)).filter(f => re.test(f)).sort().pop()!);
const git = (c: string) => { try { return execSync(`git ${c}`, { cwd: repo, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
const sha = (f: string) => createHash('sha256').update(fs.readFileSync(path.join(repo, f))).digest('hex');

const specs: SetSpec[] = [
  { name: 'set1', fixturesDir: 'eval/fixtures', annotationsFile: 'eval/annotations.json', frozenDir: 'eval/frozen-v1', recordedFile: latest('eval/results', /^classifier-recorded-/) },
  { name: 'set2', fixturesDir: 'eval/fixtures-set2', annotationsFile: 'eval/annotations-set2.json', frozenDir: 'eval/frozen-v1-set2', recordedFile: latest('eval/results', /^classifier-set2-recorded-/) },
];
// POST-HOC variant (not pre-registered): --production-bids drops bids with no open slots, because the tier-1 agent never submits
// them in production (lambda/tier1-agent/index.ts: 'No available slots'). The pre-registered run keeps every fixture bid as written.
const PROD_BIDS = process.argv.includes('--production-bids');
const sets = specs.map(sp => {
  const loaded = loadSet(repo, sp, loadFixtures, loadAnnotations);
  if (PROD_BIDS) loaded.cases = loaded.cases.map(c => ({ ...c, fixture: { ...c.fixture, bids: c.fixture.bids.filter(b => (b.availableSlots ?? 0) > 0) } }));
  return { name: sp.name, ...loaded };
});
if (PROD_BIDS) console.log('*** POST-HOC VARIANT: zero-slot bids removed as production would (not the pre-registered run) ***\n');
const rows = runGrid(sets);
const S = summarize(rows);
const L = (id: string) => id.replace('shelter-', '');
const pad = (s: string | number, n: number) => String(s).padEnd(n);

console.log(`provenance: commit ${git('rev-parse --short HEAD')}; annotations set1 ${sha('eval/annotations.json').slice(0, 10)}, set2 ${sha('eval/annotations-set2.json').slice(0, 10)}; classifier ${specs.map(s => path.basename(s.recordedFile)).join(' + ')}\n`);
const excluded = sets.flatMap(s => s.cases.map(c => `${c.fixture.id}`)).filter(id => !rows.some(r => r.id === id && r.informative));
console.log(`cases in grid: ${rows.length} (informative non-control: ${S.informativeCases}; controls: ${rows.filter(r => r.control).length}); excluded as uninformative or unannotated-best: ${excluded.join(', ') || 'none'}\n`);

console.log('Correct (raw top = annotated best) out of ' + S.informativeCases + ' informative cases, with Wilson 95% interval');
console.log(pad('', 26) + WEIGHT_METHODS.map(m => pad(m.id, 18)).join(''));
for (const f of FORMULAS) console.log(pad(`${f.id} ${f.label}`, 26) + WEIGHT_METHODS.map(m => { const k = S.correct[key(f.id, m.id)]; const [lo, hi] = wilson(k, S.informativeCases); return pad(`${k}/${S.informativeCases} (${lo.toFixed(2)}-${hi.toFixed(2)})`, 18); }).join(''));

console.log('\nPer-case winners (annotated best in brackets); columns are F | weighting method');
const cols = FORMULAS.flatMap(f => WEIGHT_METHODS.map(m => key(f.id, m.id)));
console.log(pad('case', 8) + pad('best', 6) + cols.map(c => pad(c.replace('|', ' '), 9)).join(''));
for (const r of rows) console.log(pad(r.id + (r.control ? '*' : ''), 8) + pad(L(r.best), 6) + cols.map(c => pad(r.cells[c] ? L(r.cells[c]!.winner ?? '-') + (r.cells[c]!.winner === r.best ? ' ok' : ' X') : 'n/a', 9)).join('') + (r.informative ? '' : '  (decided by a constraint)'));
console.log('(* = control)\n');

console.log('H1: share of one-factor-only cell pairs whose winner differs');
console.log(`  swapping the WEIGHTING METHOD (formula fixed): ${(S.weightSwapDiffRate * 100).toFixed(1)}% of ${S.weightSwapPairs} pairs; cases where it ever changes the winner: ${S.casesWhereWeightsChangeWinner} of ${S.informativeCases}`);
console.log(`  swapping the SCORING FORMULA (weights fixed): ${(S.formulaSwapDiffRate * 100).toFixed(1)}% of ${S.formulaSwapPairs} pairs; cases where it ever changes the winner: ${S.casesWhereFormulaChangesWinner} of ${S.informativeCases}`);
console.log(`  => H1 ${S.formulaSwapDiffRate > S.weightSwapDiffRate ? 'SUPPORTED (formula swaps change winners more often)' : 'NOT SUPPORTED'}\n`);

console.log('H2/H3 contrasts (informative cases; discordant pairs; exact two-sided sign test, uncorrected)');
const show = (label: string, a: string, b: string) => { const c = contrast(rows, a, b); console.log(`  ${pad(label, 34)} only-first-right ${c.aOnly}, only-second-right ${c.bOnly}, p = ${c.p.toFixed(3)}`); };
for (const m of WEIGHT_METHODS) show(`F1 vs F0 under ${m.id}`, key('F1', m.id), key('F0', m.id));
show('blend vs v1 under F0', key('F0', 'blend'), key('F0', 'v1'));
show('blend vs equal under F0', key('F0', 'blend'), key('F0', 'equal'));
show('v1 vs equal under F0', key('F0', 'v1'), key('F0', 'equal'));
const h2 = WEIGHT_METHODS.map(m => ({ m: m.id, f1: S.correct[key('F1', m.id)], f0: S.correct[key('F0', m.id)] }));
console.log(`  H2 (F1 >= F0 under every method, strictly better under one): ${h2.every(x => x.f1 >= x.f0) && h2.some(x => x.f1 > x.f0) ? 'SUPPORTED' : h2.some(x => x.f1 < x.f0) ? 'REFUTED' : 'NOT SUPPORTED (no strict gain)'}`);
console.log(`  H3 (blend >= v1 under F0): ${S.correct[key('F0', 'blend')] >= S.correct[key('F0', 'v1')] ? 'HOLDS' : 'DOES NOT HOLD'}`);
console.log(`  H4 (control correct in all cells): ${S.controlsAllCorrect ? 'HOLDS' : 'FAILS: a cell is broken, interpret nothing from it'}`);

const out = arg('out', path.join('eval', 'results', PROD_BIDS ? 'ablation-posthoc-production-bids.json' : 'ablation.json'));
const report = { provenance: { commit: git('rev-parse HEAD'), annotationsSet1: sha('eval/annotations.json'), annotationsSet2: sha('eval/annotations-set2.json'), recorded: specs.map(s => s.recordedFile) }, summary: S, rows };
const body = JSON.stringify(report, null, 2);
fs.writeFileSync(path.isAbsolute(out) ? out : path.join(repo, out), body + '\n');
console.log(`\nresult hash: ${createHash('sha256').update(JSON.stringify({ S, rows })).digest('hex')}\nwrote ${out}`);
