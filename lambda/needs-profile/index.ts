import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, NeedsProfile } from '../shared/utils';
import { deriveWeights, loadVectors, WEIGHTS_VERSION } from '../shared/weights';
import {
  buildClassifierPrompt, buildV1UserPrompt, CLASSIFIER_SYSTEM_PROMPT, V1_SYSTEM_PROMPT, parseClassifierResponse, parseWeightingMode,
  ruleBasedHardConstraints, WeightingMode,
} from '../shared/needs-classifier';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export const handler = async (event: { detail: Record<string, unknown> }) => {
  const { caseId, reportData } = event.detail as {
    caseId:     string;
    reportData: Record<string, unknown>;
  };

  console.log(`Needs profile agent for case ${caseId}`);
  const now = new Date().toISOString();

  let profile: NeedsProfile;

  // WEIGHTING_MODE (default 'llm') selects the weighting method. 'llm' is the original behaviour below,
  // unchanged. 'blend' / 'top' use the archetype classifier plus AHP vectors (Hard Stop 2, Section 5.3).
  const weightingMode = parseWeightingMode(process.env.WEIGHTING_MODE);
  if (weightingMode !== 'llm') {
    profile = await buildArchetypeProfile(reportData, weightingMode);
  } else try {
    const response = await bedrock.send(new InvokeModelCommand({
      modelId:     process.env.MODEL_ID!,
      contentType: 'application/json',
      accept:      'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 512,
        system: V1_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: buildV1UserPrompt(reportData),
        }],
      }),
    }));

    const raw  = JSON.parse(Buffer.from(response.body).toString());
    const text = (raw.content?.[0]?.text ?? '{}') as string;
    profile    = JSON.parse(text.replace(/```json|```/g, '').trim()) as NeedsProfile;
    console.log(`Needs profile for ${caseId}:`, JSON.stringify(profile));

  } catch (err) {
    console.error('Bedrock failed — using default profile:', (err as Error).message);
    profile = buildDefaultProfile(reportData);
  }

  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: `
      SET needsProfile = :np,
          eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)
    `,
    ExpressionAttributeValues: {
      ':np':    profile,
      ':empty': [],
      ':entry': [{
        agent:     'needs-profile',
        timestamp: now,
        action:    'enriched',
        summary:   `Needs profile extracted. Urgency: ${profile.urgencyLevel}. ` +
                   `Hard constraints: ${profile.hardConstraints.join(', ') || 'none'}. ` +
                   `Reasoning: ${profile.reasoning}`,
      }],
    },
  }));

  return { statusCode: 200 };
};

// v2: the model classifies, code derives the weights. Any failure lands on the STABLE_ROUTINE AHP vector.
async function buildArchetypeProfile(reportData: Record<string, unknown>, mode: Exclude<WeightingMode, 'llm'>): Promise<NeedsProfile> {
  let classified = null as ReturnType<typeof parseClassifierResponse>;
  try {
    const response = await bedrock.send(new InvokeModelCommand({
      modelId:     process.env.MODEL_ID!,
      contentType: 'application/json',
      accept:      'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 512,
        temperature: 0,
        system: CLASSIFIER_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildClassifierPrompt(reportData) }],
      }),
    }));
    const raw = JSON.parse(Buffer.from(response.body).toString());
    classified = parseClassifierResponse((raw.content?.[0]?.text ?? '') as string);
    if (!classified) console.warn('Classifier output failed validation — using STABLE_ROUTINE fallback');
  } catch (err) {
    console.error('Bedrock failed — using STABLE_ROUTINE fallback:', (err as Error).message);
  }

  const derived = deriveWeights(classified?.archetypeProbabilities ?? null, loadVectors(), mode, WEIGHTS_VERSION);
  const injured = ruleBasedHardConstraints(reportData).includes('has_vet');
  return {
    // Hard constraints are never rescued or overridden by a weighted score; on failure they come from structured fields.
    hardConstraints:        classified?.hardConstraints ?? ruleBasedHardConstraints(reportData),
    softWeights:            derived.softWeights,
    urgencyLevel:           classified?.urgencyLevel ?? (injured ? 'HIGH' : 'MEDIUM'),
    reasoning:              classified?.reasoning ?? 'Classifier unavailable or invalid — STABLE_ROUTINE fallback vector.',
    archetypeProbabilities: derived.archetypeProbabilities,
    weightsVersion:         derived.weightsVersion,
    weightingMode:          mode,
    usedFallback:           derived.usedFallback,
  };
}

function buildDefaultProfile(reportData: Record<string, unknown>): NeedsProfile {
  const imageData      = (reportData.imageAnalysis ?? {}) as Record<string, unknown>;
  const injuryCount    = ((imageData.injuryIndicators ?? []) as string[]).length;
  const hasInjury      = injuryCount > 0;
  const reporterText   = String(reportData.reporterSituation ?? '').toLowerCase();
  const reporterCanHold = !reporterText.includes('cannot') && !reporterText.includes("can't");

  // Prefer the reporter-declared species; image analysis only runs when a photo was uploaded.
  const species = (imageData.species as string | undefined)
    ?? (reportData.species as string | undefined)
    ?? 'unknown';
  // An unresolvable species should widen the pool, not zero it out — omit the
  // constraint entirely rather than filtering out every shelter with accepts_species:unknown.
  const speciesConstraint = species === 'unknown' ? [] : [`accepts_species:${species}`];

  return {
    hardConstraints: hasInjury
      ? ['has_vet', ...speciesConstraint]
      : speciesConstraint,
    softWeights: {
      vet_care:               hasInjury      ? 0.40 : 0.05,
      pickup_urgency:         reporterCanHold ? 0.15 : 0.35,
      species_specialization: 0.20,
      proximity:              0.25,
      long_term_care:         hasInjury      ? 0.10 : 0.15,
    },
    urgencyLevel: hasInjury ? 'HIGH' : 'MEDIUM',
    reasoning:    'Default profile — Bedrock unavailable.',
  };
}
