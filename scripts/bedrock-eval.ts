// LIVE Bedrock calls for the evaluation (costs a small amount; throttling is possible). Nothing here touches the
// deployed pipeline: it only invokes the model with prompts, the same call needs-profile makes.
//
//   npx ts-node scripts/bedrock-eval.ts --freeze-v1           one v1 call per fixture  -> eval/frozen-v1/<ID>.json
//   npx ts-node scripts/bedrock-eval.ts --classify --repeats 5   v2 classifier, temperature 0, N calls per fixture
//                                                              -> eval/results/classifier-<stamp>.json (+ recorded replay file)
//   add --dry to print the plan and the number of calls without calling anything.
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import * as fs from 'fs';
import * as path from 'path';
import { MODEL_ID } from '../lib/constants';
import { loadFixtures } from '../eval/harness';
import { CLASSIFIER_SYSTEM_PROMPT, V1_SYSTEM_PROMPT, buildClassifierPrompt, buildV1UserPrompt, parseClassifierResponse } from '../lambda/shared/needs-classifier';
import { ARCHETYPES } from '../lambda/shared/weights';

const has = (f: string) => process.argv.includes(`--${f}`);
const val = (f: string, d: string) => { const i = process.argv.indexOf(`--${f}`); return i >= 0 ? process.argv[i + 1] : d; };
const region = process.env.REGION ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
const client = new BedrockRuntimeClient({ region });
const fixtures = loadFixtures().filter(f => f.injectClassifierOutput === undefined);  // SYN-08 injects a fault; no call needed

type Outcome = { text: string | null; error: string | null; throttled: boolean; ms: number };
async function call(system: string, user: string, temperature?: number): Promise<Outcome> {
  const t0 = Date.now();
  try {
    const r = await client.send(new InvokeModelCommand({
      modelId: MODEL_ID, contentType: 'application/json', accept: 'application/json',
      body: JSON.stringify({ anthropic_version: 'bedrock-2023-05-31', max_tokens: 512, ...(temperature === undefined ? {} : { temperature }), system, messages: [{ role: 'user', content: user }] }),
    }));
    const raw = JSON.parse(Buffer.from(r.body).toString());
    return { text: (raw.content?.[0]?.text ?? '') as string, error: null, throttled: false, ms: Date.now() - t0 };
  } catch (e) {
    const err = e as Error & { name?: string };
    return { text: null, error: `${err.name}: ${err.message}`, throttled: /Throttl|TooManyRequests/i.test(`${err.name} ${err.message}`), ms: Date.now() - t0 };
  }
}

(async () => {
  const repeats = Number(val('repeats', '5'));
  if (has('freeze-v1')) {
    console.log(`v1 freeze: ${fixtures.length} calls, model ${MODEL_ID}, region ${region}${has('dry') ? ' (DRY RUN, no calls)' : ''}`);
    if (has('dry')) return;
    const dir = path.join('eval', 'frozen-v1'); fs.mkdirSync(dir, { recursive: true });
    for (const f of fixtures) {
      const o = await call(V1_SYSTEM_PROMPT, buildV1UserPrompt(f.reportData));
      let profile: unknown = null;
      if (o.text) { try { profile = JSON.parse(o.text.replace(/```json|```/g, '').trim()); } catch { profile = null; } }
      fs.writeFileSync(path.join(dir, `${f.id}.json`), JSON.stringify({ id: f.id, modelId: MODEL_ID, recordedAt: new Date().toISOString(), error: o.error, throttled: o.throttled, rawText: o.text, profile }, null, 2) + '\n');
      console.log(`${f.id}: ${o.error ?? (profile ? 'recorded' : 'unparseable output recorded as null')} (${o.ms} ms)`);
    }
    return;
  }
  if (has('classify')) {
    console.log(`v2 classifier: ${fixtures.length} cases x ${repeats} repeats = ${fixtures.length * repeats} calls, temperature 0, model ${MODEL_ID}, region ${region}${has('dry') ? ' (DRY RUN, no calls)' : ''}`);
    if (has('dry')) return;
    const runs: Record<string, Array<{ parsed: ReturnType<typeof parseClassifierResponse>; rawText: string | null; error: string | null; throttled: boolean; ms: number }>> = {};
    for (const f of fixtures) {
      runs[f.id] = [];
      for (let k = 0; k < repeats; k++) {
        const o = await call(CLASSIFIER_SYSTEM_PROMPT, buildClassifierPrompt(f.reportData), 0);
        runs[f.id].push({ parsed: o.text ? parseClassifierResponse(o.text) : null, rawText: o.text, error: o.error, throttled: o.throttled, ms: o.ms });
      }
      console.log(`${f.id}: ${runs[f.id].filter(r => r.parsed).length}/${repeats} valid, ${runs[f.id].filter(r => r.throttled).length} throttled`);
    }
    // Stability: for each case, the largest spread (max - min) of any archetype probability across the valid repeats.
    const stability = Object.fromEntries(Object.entries(runs).map(([id, rs]) => {
      const ok = rs.filter(r => r.parsed);
      const spread = Math.max(0, ...ARCHETYPES.map(a => ok.length ? Math.max(...ok.map(r => r.parsed!.archetypeProbabilities[a])) - Math.min(...ok.map(r => r.parsed!.archetypeProbabilities[a])) : 0));
      return [id, { valid: ok.length, of: rs.length, throttled: rs.filter(r => r.throttled).length, maxSpread: spread, topArchetypes: ok.map(r => ARCHETYPES.reduce((b, a) => (r.parsed!.archetypeProbabilities[a] > r.parsed!.archetypeProbabilities[b] ? a : b), ARCHETYPES[0])) }];
    }));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.mkdirSync(path.join('eval', 'results'), { recursive: true });
    const recorded = Object.fromEntries(Object.entries(runs).map(([id, rs]) => { const first = rs.find(r => r.parsed); return [id, first ? { modelOutput: first.parsed!.archetypeProbabilities, hardConstraints: first.parsed!.hardConstraints } : { modelOutput: null, hardConstraints: [] }]; }));
    fs.writeFileSync(path.join('eval', 'results', `classifier-${stamp}.json`), JSON.stringify({ modelId: MODEL_ID, region, temperature: 0, repeats, stability, runs }, null, 2) + '\n');
    fs.writeFileSync(path.join('eval', 'results', `classifier-recorded-${stamp}.json`), JSON.stringify(recorded, null, 2) + '\n');
    console.log(`\nwrote eval/results/classifier-${stamp}.json and classifier-recorded-${stamp}.json`);
    return;
  }
  console.log('Usage: --freeze-v1 | --classify [--repeats N]   (add --dry to print the plan only)');
})();
