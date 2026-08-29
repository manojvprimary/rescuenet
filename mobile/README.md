# RescueNet — mobile app

Expo/React Native reporter app for [RescueNet](../README.md). See the root README for the full architecture and backend setup — this file covers only what's specific to running the app itself.

## Setup

```bash
npm install
cp .env.example .env   # fill in from your deployed backend's CDK output
npx expo run:ios       # first run: native build (needed for native modules like maps)
npx expo start          # subsequent runs: fast-refresh dev server
```

## Structure

- `app/` — screens, file-based routing via Expo Router
- `components/` — shared UI primitives
- `lib/` — Amplify/GraphQL client, offline queue, theme, geo helpers
- `patches/` — `patch-package` fix for a native dependency (applied automatically via `postinstall`)

## Notes

- No accounts/login anywhere in the flow — every report is anonymous by design.
- Submissions are local-first: a report is written to on-device storage before any network call, so a dead spot never loses a report; it syncs automatically on reconnect (`lib/offlineQueue.ts`).
- `ios/` and `android/` are Expo prebuild output — regenerable via `npx expo prebuild`, intentionally gitignored.
