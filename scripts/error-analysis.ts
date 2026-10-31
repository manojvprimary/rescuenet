// Error analysis for the Results and Limitations memo (week 9): why does the production formula (F0) miss 5 of 12 informative cases?
//   npx ts-node scripts/error-analysis.ts [--out docs/evidence/sprint-5/error-analysis.json]
// Deterministic: reads only committed files (the same inputs as scripts/run-ablation.ts). Weights are the v2 blend.
import * as fs from 'fs';
import * as path from 'path';
import { FORMULAS, loadSet, runGrid, scoreWith, weightsFor, key, fixedConstraints, SetSpec } from '../eval/ablation';
import { loadAnnotations, loadFixtures } from '../eval/harness';
import { isEligible } from '../lambda/shared/match';
import { extractCaseSpecies } from '../lambda/shared/scoring';

const repo = path.join(__dirname, '..');
const arg = (n: string, d: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const latest = (re: RegExp) => path.join('eval', 'results', fs.readdirSync(path.join(repo, 'eval/results')).filter(f => re.test(f)).sort().pop()!);
const specs: SetSpec[] = [
  { name: 'set1', fixturesDir: 'eval/fixtures', annotationsFile: 'eval/annotations.json', frozenDir: 'eval/frozen-v1', recordedFile: latest(/^classifier-recorded-/) },
  { name: 'set2', fixturesDir: 'eval/fixtures-set2', annotationsFile: 'eval/annotations-set2.json', frozenDir: 'eval/frozen-v1-set2', recordedFile: latest(/^classifier-set2-recorded-/) },
];
const sets = specs.map(sp => ({ name: sp.name, ...loadSet(repo, sp, loadFixtures, loadAnnotations) }));
const rows = runGrid(sets);
const L = (id: string) => id.replace('shelter-', '');
const out: unknown[] = [];

for (const r of rows.filter(x => x.informative && !x.control && x.cells[key('F0', 'blend')]?.winner !== x.best)) {
  const s = sets.find(x => x.name === r.set)!;
  const ci = s.cases.find(c => c.fixture.id === r.id)!;
  const w = weightsFor('blend', ci)!;
  const species = extractCaseSpecies(ci.fixture.reportData);
  const eligible = ci.fixture.bids.filter(b => isEligible(b, fixedConstraints(ci.fixture)));
  const best = eligible.find(b => b.shelterId === r.best)!;
  const winner = eligible.find(b => b.shelterId === r.cells[key('F0', 'blend')]!.winner)!;
  // gap = score(annotated best) - score(top-scoring other eligible shelter); negative means the annotated best loses
  const gap = Object.fromEntries(FORMULAS.map(f => {
    const sc = (b: typeof best) => scoreWith(f, b, ci.fixture.caseLocation, w, species);
    const rival = Math.max(...eligible.filter(b => b.shelterId !== best.shelterId).map(sc));
    return [f.id, +(sc(best) - rival).toFixed(3)];
  }));
  const capacityOverProximity = (winner.availableSlots ?? 0) > (best.availableSlots ?? 0) && (winner.distanceKm ?? 0) > (best.distanceKm ?? 0);
  const row = {
    id: r.id, best: L(r.best), f0Winner: L(winner.shelterId),
    bestBid: { km: best.distanceKm, slots: best.availableSlots, vet: !!best.hasVetOnSite, intakeMin: best.estimatedIntakeWindowMinutes },
    winnerBid: { km: winner.distanceKm, slots: winner.availableSlots, vet: !!winner.hasVetOnSite, intakeMin: winner.estimatedIntakeWindowMinutes },
    capacityOverProximity, gap,
    fixedBy: FORMULAS.filter(f => f.id !== 'F0' && gap[f.id] > 0).map(f => f.id),
  };
  out.push(row);
  console.log(`${r.id}: best ${row.best} ${JSON.stringify(row.bestBid)} loses to ${row.f0Winner} ${JSON.stringify(row.winnerBid)}; capacity-over-proximity: ${capacityOverProximity}; gap F0/F1/F2/F3 = ${FORMULAS.map(f => gap[f.id]).join(' / ')}; flips under: ${row.fixedBy.join(', ') || 'none'}`);
}
const n = (out as Array<{ capacityOverProximity: boolean }>).filter(x => x.capacityOverProximity).length;
console.log(`\n${n} of ${out.length} F0 misses are the same pattern: a farther shelter with more open slots outranks the nearer annotated best.`);
const dest = arg('out', path.join('docs', 'evidence', 'sprint-5', 'error-analysis.json'));
fs.mkdirSync(path.dirname(path.isAbsolute(dest) ? dest : path.join(repo, dest)), { recursive: true });
fs.writeFileSync(path.isAbsolute(dest) ? dest : path.join(repo, dest), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${dest}`);
