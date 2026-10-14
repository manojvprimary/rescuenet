// Live demo of the v2 path on ONE evaluation case, without deploying anything:
//   real Bedrock classification (temperature 0) -> deriveWeights (adopted AHP vectors) -> production scoring -> winner.
//   npx ts-node scripts/demo-v2-live.ts [SYN-07]     (one billed Bedrock call, about $0.005; writes no files)
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { MODEL_ID } from '../lib/constants';
import { CLASSIFIER_SYSTEM_PROMPT, buildClassifierPrompt, parseClassifierResponse } from '../lambda/shared/needs-classifier';
import { FACTORS, deriveWeights, loadVectors, WEIGHTS_VERSION } from '../lambda/shared/weights';
import { extractCaseSpecies } from '../lambda/shared/scoring';
import { rankBids } from '../lambda/shared/match';
import { loadAnnotations, loadFixtures, pickWinner } from '../eval/harness';

const id = process.argv[2] ?? 'SYN-07';
const fixture = loadFixtures().find(f => f.id === id);
if (!fixture) { console.error(`no fixture ${id}`); process.exit(2); }
const annotation = loadAnnotations().cases[id];
const region = process.env.REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
const bar = (v: number) => '#'.repeat(Math.round(v * 40));

(async () => {
  console.log(`\nCase ${id}: ${fixture.description}`);
  console.log(`Report: "${String(fixture.reportData.reporterSituation)}"\n`);
  console.log(`1. Live Bedrock classification (${MODEL_ID}, temperature 0)...`);
  const t0 = Date.now();
  const client = new BedrockRuntimeClient({ region });
  const r = await client.send(new InvokeModelCommand({
    modelId: MODEL_ID, contentType: 'application/json', accept: 'application/json',
    body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 512, temperature: 0, system: CLASSIFIER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildClassifierPrompt(fixture.reportData) }] }),
  }));
  const text = JSON.parse(Buffer.from(r.body).toString()).content?.[0]?.text as string;
  const parsed = parseClassifierResponse(text);
  console.log(`   ${Date.now() - t0} ms; schema validation ${parsed ? 'PASSED' : 'FAILED (the STABLE_ROUTINE fallback would be used)'}`);
  console.log(`   archetype probabilities: ${JSON.stringify(parsed?.archetypeProbabilities)}`);
  console.log(`   hard constraints       : ${(parsed?.hardConstraints ?? []).join(', ') || 'none'}   reasoning: ${parsed?.reasoning}\n`);

  console.log(`2. Weights derived IN CODE from the adopted AHP vectors (${WEIGHTS_VERSION}); the model never writes a weight:`);
  const d = deriveWeights(parsed?.archetypeProbabilities ?? null, loadVectors(), 'blend');
  for (const f of FACTORS) console.log(`   ${f.padEnd(24)}${d.softWeights[f].toFixed(3)}  ${bar(d.softWeights[f])}`);
  console.log(`   fallback used: ${d.usedFallback}\n`);

  console.log('3. Production scoring on this case\'s synthetic bids (same code the arbitrator runs):');
  const ranked = rankBids(fixture.bids, { hardConstraints: parsed?.hardConstraints ?? [], softWeights: d.softWeights }, fixture.caseLocation, {}, extractCaseSpecies(fixture.reportData));
  for (const b of ranked) console.log(`   ${b.shelterId.padEnd(12)}${b.shelterName.padEnd(34)}score ${b.matchScore.toFixed(3)}`);
  const w = pickWinner(ranked);
  console.log(`\n   winner: ${w.winner} | annotated best: ${annotation.bestShelter} | near-tie: ${w.nearTie}`);
  console.log(`   ${w.winner === annotation.bestShelter ? 'matches the pre-registered annotation' : 'does NOT match the pre-registered annotation (reported as a finding, not tuned)'}\n`);
})().catch(e => { console.error('FAILED:', (e as Error).message); process.exit(1); });
