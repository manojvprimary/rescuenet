import 'react-native-get-random-values'; // must load before aws-amplify touches crypto
import { Amplify } from 'aws-amplify';

const endpoint = process.env.EXPO_PUBLIC_APPSYNC_URL;
const apiKey   = process.env.EXPO_PUBLIC_APPSYNC_API_KEY;
const region   = process.env.EXPO_PUBLIC_AWS_REGION ?? 'us-east-1';

if (!endpoint || !apiKey) {
  console.warn(
    'Missing EXPO_PUBLIC_APPSYNC_URL / EXPO_PUBLIC_APPSYNC_API_KEY — ' +
    'copy mobile/.env.example to mobile/.env and fill in the RescueNetApi stack outputs.'
  );
}

// Hand-configured rather than Amplify-CLI-generated — this backend is plain CDK, not
// an Amplify-managed project, but the plain GraphQL client works against any AppSync
// API regardless of how it was provisioned.
Amplify.configure({
  API: {
    GraphQL: {
      endpoint:        endpoint ?? '',
      region,
      defaultAuthMode: 'apiKey',
      apiKey:          apiKey ?? '',
    },
  },
});
