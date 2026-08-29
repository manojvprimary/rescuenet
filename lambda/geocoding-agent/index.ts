import { LocationClient, SearchPlaceIndexForPositionCommand } from '@aws-sdk/client-location';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, putEvent, Location } from '../shared/utils';

const locationClient = new LocationClient({});

export const handler = async (event: { detail: Record<string, unknown> }) => {
  const { caseId, location } = event.detail as { caseId: string; location: Location };
  const { lat, lng } = location ?? {};
  const now = new Date().toISOString();

  let geo: Record<string, unknown> = {};

  if (lat && lng) {
    try {
      const result = await locationClient.send(new SearchPlaceIndexForPositionCommand({
        IndexName:  process.env.PLACE_INDEX!,
        Position:   [lng, lat],            // Location Service uses [lng, lat]
        MaxResults: 1,
      }));

      const place = result.Results?.[0]?.Place;
      if (place) {
        geo = {
          addressResolved: place.Label,
          street:          place.Street,
          municipality:    place.Municipality,
          region:          place.Region,
          country:         place.Country,
          postalCode:      place.PostalCode,
          jurisdiction:    place.Municipality ?? place.Region ?? 'unknown',
          agentNote:       `Resolved: ${place.Label}`,
        };
      }
    } catch (err) {
      console.warn('Location Service unavailable — using coordinate fallback:', (err as Error).message);
      // Graceful fallback: coordinates are still useful for distance scoring
      geo = {
        addressResolved: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        jurisdiction:    'unknown',
        agentNote:       `Geocoding fallback — coordinates only. ` +
                         `Create a Location Service Place Index named '${process.env.PLACE_INDEX}' for real geocoding.`,
      };
    }
  } else {
    geo = { agentNote: 'No coordinates — geocoding skipped.' };
  }

  await ddb.send(new UpdateCommand({
    TableName: process.env.CASES_TABLE!,
    Key:       { caseId },
    UpdateExpression: `
      SET reportData.geocoding = :geo,
          eventHistory = list_append(if_not_exists(eventHistory, :empty), :entry)
    `,
    ExpressionAttributeValues: {
      ':geo':   geo,
      ':empty': [],
      ':entry': [{ agent: 'geocoding-agent', timestamp: now, action: 'enriched', summary: geo.agentNote }],
    },
  }));

  await putEvent('rescuenet.geocoding-agent', 'AgentEnriched', {
    caseId, agent: 'geocoding-agent', timestamp: now, result: geo,
  });

  console.log(`Geocoding agent done for ${caseId}`);
  return { statusCode: 200 };
};
