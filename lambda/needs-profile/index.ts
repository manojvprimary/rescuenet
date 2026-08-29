import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, NeedsProfile } from '../shared/utils';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

export const handler = async (event: { detail: Record<string, unknown> }) => {
  const { caseId, reportData } = event.detail as {
    caseId:     string;
    reportData: Record<string, unknown>;
  };

  console.log(`Needs profile agent for case ${caseId}`);
  const now = new Date().toISOString();

  let profile: NeedsProfile;

  try {
    const response = await bedrock.send(new InvokeModelCommand({
      modelId:     process.env.MODEL_ID!,
      contentType: 'application/json',
      accept:      'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 512,
        system: `You are a rescue case analyst. Extract a structured needs profile from an 
animal rescue case. Respond with valid JSON only — no explanation, no markdown fences.`,
        messages: [{
          role: 'user',
          content: `Given this rescue case reportData, extract a needs profile for shelter matching.

reportData:
${JSON.stringify(reportData, null, 2)}

Respond with exactly this JSON shape:
{
  "hardConstraints": ["has_vet"],
  "softWeights": {
    "vet_care": 0.40,
    "pickup_urgency": 0.30,
    "species_specialization": 0.15,
    "proximity": 0.10,
    "long_term_care": 0.05
  },
  "urgencyLevel": "HIGH",
  "reasoning": "One sentence."
}

Rules:
- hardConstraints: use "has_vet" if animal needs veterinary care; "accepts_species:X" for species requirement. Empty array if none.
- softWeights must sum to exactly 1.0. All five keys required.
  vet_care: 0 if healthy, up to 0.50 if critically injured.
  pickup_urgency: high if reporter cannot hold animal or animal is in immediate danger.
  species_specialization: higher for exotic/uncommon species.
  proximity: high if animal is mobile and at risk, low if reporter has secured it.
  long_term_care: high if animal needs extended recovery.
- urgencyLevel: LOW | MEDIUM | HIGH | CRITICAL`,
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
