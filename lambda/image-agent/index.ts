import { RekognitionClient, DetectLabelsCommand } from '@aws-sdk/client-rekognition';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, putEvent } from '../shared/utils';

const rekog = new RekognitionClient({});

const INJURY_KEYWORDS = ['wound','injury','injured','bleeding','blood','limping','hurt','sick','ill'];
const SPECIES_MAP: Record<string, string[]> = {
  dog:   ['dog','canine','puppy','hound'],
  cat:   ['cat','feline','kitten','tabby'],
  bird:  ['bird','parrot','pigeon','crow','dove'],
  cow:   ['cow','cattle','bovine','calf'],
  horse: ['horse','equine','pony','foal'],
};

export const handler = async (event: { detail: Record<string, unknown> }) => {
  const { caseId, reportData } = event.detail as {
    caseId:     string;
    reportData: Record<string, unknown>;
  };

  const photoKey = reportData?.photoKey as string | undefined;
  const now      = new Date().toISOString();
  let analysis: Record<string, unknown>;

  if (photoKey) {
    try {
      // The reporter's client uploads the photo to S3 *after* getting the presigned
      // URL back from intake — which is also what fires this very event. There's no
      // ordering guarantee between "client finishes the PUT" and "we start analyzing",
      // so a fresh photo commonly isn't in S3 yet on the first attempt. Bounded retry
      // rather than a hard failure, same pattern as the needs-profile race elsewhere.
      const result = await detectLabelsWithRetry(photoKey);

      const labels     = result.Labels ?? [];
      const lowerNames = labels.map(l => (l.Name ?? '').toLowerCase());

      const species          = detectSpecies(lowerNames);
      const injuryIndicators = lowerNames.filter(l => INJURY_KEYWORDS.some(k => l.includes(k)));
      const hasCollar        = lowerNames.some(l => l.includes('collar'));
      const hasTag           = lowerNames.some(l => l.includes('tag'));

      const topLabels = labels
        .sort((a, b) => (b.Confidence ?? 0) - (a.Confidence ?? 0))
        .slice(0, 10)
        .map(l => ({ name: l.Name, confidence: Math.round(l.Confidence ?? 0) }));

      analysis = {
        species: species ?? 'unknown',
        injuryIndicators,
        hasCollar,
        hasTag,
        topLabels,
        agentNote: injuryIndicators.length > 0
          ? `Injury indicators detected: ${injuryIndicators.join(', ')}.`
          : `No injury indicators. Species: ${species ?? 'unknown'}.`,
      };
    } catch (err) {
      console.error('Rekognition error:', err);
      analysis = {
        agentNote: `Image analysis failed: ${(err as Error).message}. Proceeding without image data.`,
        error:     true,
      };
    }
  } else {
    // No photo to analyze — fall back to whatever the reporter declared directly,
    // so needs-profile and shelter agents still have a species/injury signal to work with.
    const declaredSpecies = reportData?.species as string | undefined;
    const conditionText   = String(reportData?.condition ?? '').toLowerCase();
    const injuryIndicators = INJURY_KEYWORDS.filter(k => conditionText.includes(k));

    analysis = declaredSpecies
      ? {
          species: declaredSpecies,
          injuryIndicators,
          hasCollar: false,
          hasTag: false,
          topLabels: [],
          agentNote: `No photo — using reporter-provided species: ${declaredSpecies}`,
        }
      : { agentNote: 'No photo provided — image analysis skipped.' };
  }

  // Write enrichment back to the blackboard (reportData is a freeform map)
  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: `
      SET reportData.imageAnalysis = :ia,
          eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)
    `,
    ExpressionAttributeValues: {
      ':ia':    analysis,
      ':empty': [],
      ':entry': [{ agent: 'image-agent', timestamp: now, action: 'enriched', summary: analysis.agentNote }],
    },
  }));

  await putEvent('rescuenet.image-agent', 'AgentEnriched', {
    caseId, agent: 'image-agent', timestamp: now, result: analysis,
  });

  console.log(`Image agent done for ${caseId}:`, analysis.agentNote);
  return { statusCode: 200 };
};

async function detectLabelsWithRetry(photoKey: string) {
  const attempts = [0, 2000, 3000]; // ~5s total, well inside the function's 30s timeout
  let lastErr: unknown;
  for (const waitMs of attempts) {
    if (waitMs) await new Promise(r => setTimeout(r, waitMs));
    try {
      return await rekog.send(new DetectLabelsCommand({
        Image:         { S3Object: { Bucket: process.env.PHOTO_BUCKET!, Name: photoKey } },
        MaxLabels:     30,
        MinConfidence: 60,
      }));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

function detectSpecies(labels: string[]): string | null {
  for (const [species, keywords] of Object.entries(SPECIES_MAP)) {
    if (labels.some(l => keywords.some(k => l.includes(k)))) return species;
  }
  return null;
}
