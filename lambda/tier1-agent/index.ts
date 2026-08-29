import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, putEvent, getNeedsProfileWithRetry, haversineKm, NeedsProfile, ShelterBid } from '../shared/utils';

const bedrock = new BedrockRuntimeClient({ region: process.env.REGION });

interface ShelterRecord {
  shelterId: string;
  name:      string;
  location:  { lat: number; lng: number };
  capacity:  {
    availableSlots:  number;
    hasVetOnSite:    boolean;
    acceptedSpecies: string[];
  };
  preferences: {
    filters: { acceptedSpecies: string[]; maxUrgency: string; radiusKm: number };
  };
}

// Tier 1 — RescueNet reads shelter capacity directly out of rescuenet-shelters, standing
// in for "we've been granted API access to the shelter's own system." One invocation
// fans out over every tier-1 shelter in parallel rather than one Lambda per shelter.
export const handler = async (event: { detail: Record<string, unknown> }) => {
  const { caseId, reportData, location } = event.detail as {
    caseId:     string;
    reportData: Record<string, unknown>;
    location:   { lat: number; lng: number };
  };

  const shelters = await queryTierShelters(1);
  console.log(`Tier 1 agent: ${shelters.length} shelter(s) evaluating case ${caseId}`);

  // needs-profile runs in parallel with us and can still be mid-flight — give it a
  // short bounded wait rather than always bidding against an empty constraint set.
  const needsProfile = await getNeedsProfileWithRetry(caseId);

  await Promise.all(shelters.map(shelter =>
    evaluateShelter(shelter, caseId, reportData, location, needsProfile)
  ));

  return { statusCode: 200 };
};

async function queryTierShelters(tier: number): Promise<ShelterRecord[]> {
  const result = await ddb.send(new QueryCommand({
    TableName: process.env.SHELTERS_TABLE!,
    IndexName: 'tier-index',
    KeyConditionExpression: '#t = :t',
    ExpressionAttributeNames:  { '#t': 'tier' },
    ExpressionAttributeValues: { ':t': tier },
  }));
  return (result.Items ?? []) as ShelterRecord[];
}

async function evaluateShelter(
  shelter:     ShelterRecord,
  caseId:      string,
  reportData:  Record<string, unknown>,
  location:    { lat: number; lng: number },
  needsProfile: NeedsProfile | undefined,
) {
  const shelterId = shelter.shelterId;
  const liveCapacity = shelter.capacity ?? { availableSlots: 0, hasVetOnSite: false, acceptedSpecies: [] };
  // DynamoDB Sets unmarshal to native JS Sets, not arrays — normalize defensively either way.
  const acceptedSpecies = Array.from(liveCapacity.acceptedSpecies ?? []);

  // ── Hard constraints from the needs profile ────────────────────────────────
  const constraints = needsProfile?.hardConstraints ?? [];
  for (const c of constraints) {
    if (c === 'has_vet' && !liveCapacity.hasVetOnSite) {
      return noBid(caseId, shelterId, 'Cannot meet hard constraint: has_vet');
    }
    if (c.startsWith('accepts_species:')) {
      const species = c.split(':')[1];
      if (!acceptedSpecies.includes(species)) {
        return noBid(caseId, shelterId, `Does not accept species: ${species}`);
      }
    }
  }

  if ((liveCapacity.availableSlots ?? 0) <= 0) {
    return noBid(caseId, shelterId, 'No available slots');
  }

  const distKm = haversineKm(
    shelter.location?.lat, shelter.location?.lng,
    location?.lat, location?.lng,
  );

  // ── Service radius — hard cutoff, not just a soft scoring factor ───────────
  const radiusKm = shelter.preferences?.filters?.radiusKm;
  if (radiusKm != null && distKm > radiusKm) {
    return noBid(caseId, shelterId, `Case is ${distKm.toFixed(1)}km away — outside ${radiusKm}km service radius`);
  }

  // ── Bedrock reasoning ─────────────────────────────────────────────────────
  let decision: { shouldBid: boolean; confidence: number; estimatedIntakeWindowMinutes: number; notes: string };

  try {
    const resp = await bedrock.send(new InvokeModelCommand({
      modelId:     process.env.MODEL_ID!,
      contentType: 'application/json',
      accept:      'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 256,
        system: 'You are a shelter intake coordinator agent. Decide whether to bid on this rescue case. Respond with valid JSON only.',
        messages: [{
          role: 'user',
          content: `Should this shelter bid on this case?

Shelter:
- Name: ${shelter.name}
- Available slots: ${liveCapacity.availableSlots}
- Vet on site: ${liveCapacity.hasVetOnSite}
- Accepted species: ${acceptedSpecies.join(', ')}
- Distance to case: ${distKm.toFixed(1)} km (service radius ${radiusKm ?? 'unlimited'} km)

Case needs profile:
${JSON.stringify(needsProfile, null, 2)}

Case reportData summary:
${JSON.stringify({
  species:   (reportData.imageAnalysis as Record<string, unknown>)?.species ?? reportData.species,
  condition: reportData.condition,
  urgency:   needsProfile?.urgencyLevel,
}, null, 2)}

Respond with:
{"shouldBid": true, "confidence": 0.92, "estimatedIntakeWindowMinutes": 20, "notes": "Brief reason"}`,
        }],
      }),
    }));

    const raw  = JSON.parse(Buffer.from(resp.body).toString());
    const text = (raw.content?.[0]?.text ?? '{}') as string;
    decision   = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error(`Bedrock failed for ${shelterId} — using fallback decision:`, (err as Error).message);
    decision = {
      shouldBid:                    liveCapacity.availableSlots > 0,
      confidence:                   0.80,
      estimatedIntakeWindowMinutes: 30,
      notes:                        'Fallback decision — Bedrock unavailable.',
    };
  }

  if (!decision.shouldBid) {
    return noBid(caseId, shelterId, decision.notes);
  }

  const bid: ShelterBid = {
    caseId,
    shelterId,
    shelterName:                  shelter.name,
    availableSlots:               liveCapacity.availableSlots,
    hasVetOnSite:                 liveCapacity.hasVetOnSite,
    acceptedSpecies,
    distanceKm:                   distKm,
    confidence:                   decision.confidence,
    estimatedIntakeWindowMinutes: decision.estimatedIntakeWindowMinutes,
    notes:                        decision.notes,
    dataFreshness:                'LIVE',
    autonomyPreference:           'AUTO_BID_CONFIRM_INTAKE',
    timestamp:                    new Date().toISOString(),
  };

  await putEvent('rescuenet.shelter', 'ShelterBid', bid);
  console.log(`Tier 1: ${shelterId} bid published for case ${caseId}`, bid);
}

const noBid = async (caseId: string, shelterId: string, reason: string) => {
  await putEvent('rescuenet.shelter', 'ShelterNoBid', {
    caseId, shelterId, reason, timestamp: new Date().toISOString(),
  });
  console.log(`Tier 1: ${shelterId} no-bid for ${caseId}: ${reason}`);
};
