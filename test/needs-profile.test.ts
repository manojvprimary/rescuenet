import {
  CLASSIFIER_SYSTEM_PROMPT, buildClassifierPrompt, parseClassifierResponse, parseWeightingMode,
  ruleBasedClassify, ruleBasedHardConstraints, ruleBasedProbabilities,
} from '../lambda/shared/needs-classifier';

const good = {
  hardConstraints: ['has_vet', 'accepts_species:cat'],
  archetypeProbabilities: { INJURED_CRITICAL: 0.7, URGENT_TRANSIENT: 0.25, STABLE_ROUTINE: 0.05 },
  urgencyLevel: 'HIGH',
  reasoning: 'Visible blood.',
};

describe('WEIGHTING_MODE parsing', () => {
  it('accepts blend and top, and treats everything else as llm (the existing behaviour)', () => {
    expect(parseWeightingMode('blend')).toBe('blend');
    expect(parseWeightingMode('top')).toBe('top');
    for (const v of [undefined, '', 'llm', 'archetype', 'BLEND', ' blend', 'true']) expect(parseWeightingMode(v)).toBe('llm');
  });
});

describe('classifier prompt', () => {
  it('asks for probabilities, forbids weights, and embeds the case', () => {
    const p = buildClassifierPrompt({ species: 'cat' });
    expect(p).toContain('"species": "cat"');
    expect(p).toContain('archetypeProbabilities');
    expect(p).toMatch(/Do not output any weights/);
    expect(p).not.toContain('softWeights');
    expect(CLASSIFIER_SYSTEM_PROMPT).toMatch(/JSON only/);
  });
});

describe('parseClassifierResponse (strict)', () => {
  it('accepts a valid response, including one wrapped in markdown fences', () => {
    expect(parseClassifierResponse(JSON.stringify(good))?.urgencyLevel).toBe('HIGH');
    expect(parseClassifierResponse('```json\n' + JSON.stringify(good) + '\n```')?.hardConstraints).toEqual(['has_vet', 'accepts_species:cat']);
  });
  const bad: Array<[string, string]> = [
    ['not JSON', 'I think this cat is injured.'],
    ['empty string', ''],
    ['JSON array', '[1,2,3]'],
    ['JSON null', 'null'],
    ['missing probabilities', JSON.stringify({ ...good, archetypeProbabilities: undefined })],
    ['negative probability', JSON.stringify({ ...good, archetypeProbabilities: { INJURED_CRITICAL: -0.1, URGENT_TRANSIENT: 0.6, STABLE_ROUTINE: 0.5 } })],
    ['probability as string', JSON.stringify({ ...good, archetypeProbabilities: { INJURED_CRITICAL: '0.7', URGENT_TRANSIENT: 0.2, STABLE_ROUTINE: 0.1 } })],
    ['missing an archetype', JSON.stringify({ ...good, archetypeProbabilities: { INJURED_CRITICAL: 1, URGENT_TRANSIENT: 0 } })],
    ['all-zero probabilities', JSON.stringify({ ...good, archetypeProbabilities: { INJURED_CRITICAL: 0, URGENT_TRANSIENT: 0, STABLE_ROUTINE: 0 } })],
    ['bad urgency', JSON.stringify({ ...good, urgencyLevel: 'EXTREME' })],
    ['unknown hard constraint', JSON.stringify({ ...good, hardConstraints: ['has_vet', 'must_be_free'] })],
    ['constraints not an array', JSON.stringify({ ...good, hardConstraints: 'has_vet' })],
  ];
  it.each(bad)('rejects: %s', (_label, text) => {
    expect(parseClassifierResponse(text)).toBeNull();
  });
});

describe('rule-based comparison classifier', () => {
  const injured = { species: 'cat', reporterSituation: 'I am holding her.', imageAnalysis: { species: 'cat', injuryIndicators: ['visible blood'] } };
  const loose = { species: 'dog', reporterSituation: 'I cannot hold it, it keeps running toward the road.', imageAnalysis: { species: 'dog', injuryIndicators: [] } };
  const calm = { species: 'dog', reporterSituation: 'Friendly dog in my fenced yard. I can hold it.', imageAnalysis: { species: 'dog', injuryIndicators: [] } };
  const mixed = { species: 'dog', reporterSituation: 'Limping and bleeding; I cannot hold it.', imageAnalysis: { species: 'dog', injuryIndicators: ['limping'] } };

  it('is deterministic and returns normalized probabilities', () => {
    for (const r of [injured, loose, calm, mixed]) {
      const p = ruleBasedProbabilities(r);
      expect(Object.values(p).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 12);
      expect(ruleBasedProbabilities(r)).toEqual(p);
    }
  });
  it('puts the dominant archetype where the structured fields point', () => {
    expect(ruleBasedClassify(injured).archetypeProbabilities.INJURED_CRITICAL).toBeGreaterThan(0.5);
    expect(ruleBasedClassify(loose).archetypeProbabilities.URGENT_TRANSIENT).toBeGreaterThan(0.5);
    expect(ruleBasedClassify(calm).archetypeProbabilities.STABLE_ROUTINE).toBeGreaterThan(0.5);
    const m = ruleBasedClassify(mixed).archetypeProbabilities;
    expect(m.INJURED_CRITICAL).toBeGreaterThan(0.4);
    expect(m.URGENT_TRANSIENT).toBeGreaterThan(0.4);
  });
  it('derives hard constraints like the v1 default profile: has_vet when injured, species when known', () => {
    expect(ruleBasedHardConstraints(injured)).toEqual(['has_vet', 'accepts_species:cat']);
    expect(ruleBasedHardConstraints(calm)).toEqual(['accepts_species:dog']);
    expect(ruleBasedHardConstraints({ reporterSituation: '' })).toEqual([]);
  });
});

// ── Handler wiring, with Bedrock and DynamoDB mocked ─────────────────────────────────────────────
const sendBedrock = jest.fn();
const sendDdb = jest.fn();
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: (...a: unknown[]) => sendBedrock(...a) })),
  InvokeModelCommand: jest.fn((input: unknown) => ({ input })),
}));
jest.mock('../lambda/shared/utils', () => ({ ddb: { send: (...a: unknown[]) => sendDdb(...a) } }));
jest.mock('@aws-sdk/lib-dynamodb', () => ({ UpdateCommand: jest.fn((input: unknown) => ({ input })) }));

const reply = (text: string) => ({ body: Buffer.from(JSON.stringify({ content: [{ text }] })) });
const event = { detail: { caseId: 'c1', reportData: { species: 'cat', reporterSituation: 'holding', imageAnalysis: { species: 'cat', injuryIndicators: ['visible blood'] } } } };
const storedProfile = () => (sendDdb.mock.calls[0][0] as { input: { ExpressionAttributeValues: Record<string, any> } }).input.ExpressionAttributeValues[':np'];

describe('needs-profile handler', () => {
  const OLD = process.env;
  beforeEach(() => {
    jest.resetModules();
    sendBedrock.mockReset(); sendDdb.mockReset(); sendDdb.mockResolvedValue({});
    process.env = { ...OLD, MODEL_ID: 'm', CASES_TABLE: 't', REGION: 'us-east-1' };
  });
  afterAll(() => { process.env = OLD; });
  const load = () => require('../lambda/needs-profile/index').handler as (e: unknown) => Promise<unknown>;

  it("llm mode (default): the original prompt is used and the model's own softWeights are stored unchanged", async () => {
    delete process.env.WEIGHTING_MODE;
    const own = { hardConstraints: ['has_vet'], softWeights: { vet_care: 0.4, pickup_urgency: 0.3, species_specialization: 0.15, proximity: 0.1, long_term_care: 0.05 }, urgencyLevel: 'HIGH', reasoning: 'x' };
    sendBedrock.mockResolvedValue(reply(JSON.stringify(own)));
    await load()(event);
    expect(storedProfile()).toEqual(own);
    const body = JSON.parse((sendBedrock.mock.calls[0][0] as { input: { body: string } }).input.body);
    expect(body.temperature).toBeUndefined();
    expect(JSON.stringify(body)).toContain('softWeights');
  });

  it('blend mode: temperature 0, weights are derived in code, and the audit fields are stored', async () => {
    process.env.WEIGHTING_MODE = 'blend';
    sendBedrock.mockResolvedValue(reply(JSON.stringify(good)));
    await load()(event);
    const p = storedProfile();
    const body = JSON.parse((sendBedrock.mock.calls[0][0] as { input: { body: string } }).input.body);
    expect(body.temperature).toBe(0);
    expect(p.weightingMode).toBe('blend');
    expect(p.usedFallback).toBe(false);
    expect(p.archetypeProbabilities).toEqual(good.archetypeProbabilities);
    expect(p.weightsVersion).toMatch(/\S/);
    expect(Object.values(p.softWeights as Record<string, number>).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
    expect(p.hardConstraints).toEqual(good.hardConstraints);
  });

  it('blend mode: malformed model output falls back to STABLE_ROUTINE and still derives hard constraints from structured fields', async () => {
    process.env.WEIGHTING_MODE = 'blend';
    sendBedrock.mockResolvedValue(reply('sorry, I cannot do that'));
    await load()(event);
    const p = storedProfile();
    expect(p.usedFallback).toBe(true);
    expect(p.archetypeProbabilities).toEqual({ INJURED_CRITICAL: 0, URGENT_TRANSIENT: 0, STABLE_ROUTINE: 1 });
    expect(p.hardConstraints).toEqual(['has_vet', 'accepts_species:cat']);
  });

  it('blend mode: a Bedrock error does not throw and lands on the fallback', async () => {
    process.env.WEIGHTING_MODE = 'blend';
    sendBedrock.mockRejectedValue(new Error('ThrottlingException'));
    await expect(load()(event)).resolves.toEqual({ statusCode: 200 });
    expect(storedProfile().usedFallback).toBe(true);
  });

  it('top mode returns exactly one archetype vector', async () => {
    process.env.WEIGHTING_MODE = 'top';
    sendBedrock.mockResolvedValue(reply(JSON.stringify(good)));
    await load()(event);
    const p = storedProfile();
    expect(p.weightingMode).toBe('top');
    const { loadVectors } = require('../lambda/shared/weights');
    expect(p.softWeights).toEqual(loadVectors().INJURED_CRITICAL);
  });

  it('an unrecognized WEIGHTING_MODE value behaves as llm', async () => {
    process.env.WEIGHTING_MODE = 'archetype';
    sendBedrock.mockResolvedValue(reply(JSON.stringify({ hardConstraints: [], softWeights: { vet_care: 0.2, pickup_urgency: 0.2, species_specialization: 0.2, proximity: 0.2, long_term_care: 0.2 }, urgencyLevel: 'LOW', reasoning: 'r' })));
    await load()(event);
    expect(storedProfile().weightingMode).toBeUndefined();
  });
});

describe('v1 prompt is byte-identical to the original (golden files rendered from the pre-refactor handler, commit 265183c)', () => {
  const fs = require('fs');
  const { V1_SYSTEM_PROMPT, buildV1UserPrompt } = require('../lambda/shared/needs-classifier');
  const golden = (n: string) => fs.readFileSync(`${__dirname}/golden/${n}`, 'utf8');
  it('system prompt', () => { expect(V1_SYSTEM_PROMPT).toBe(golden('v1-system-prompt.txt')); });
  it('user prompt for a sample case', () => {
    expect(buildV1UserPrompt(JSON.parse(golden('v1-report-data.json')))).toBe(golden('v1-user-prompt.txt'));
  });
});
