# RescueNet

**A blackboard multi-agent system for animal rescue routing.**

Anyone who spots a stray, injured, found, or lost animal can file an anonymous report in under a minute from a mobile app. From there, a chain of specialist AI agents — vision, geocoding, needs-assessment, deduplication, arbitration — enrich the case, match it to the best available shelter by live capacity and proximity, and stream every status change back to the reporter in plain language. If no shelter can take the case automatically, it escalates to a human coordinator instead of silently failing.

Full write-up, architecture diagrams, and a screenshot-by-screenshot use-case walkthrough are in [`docs/`](docs/).

---

## Repository layout

This is two projects in one repo: an AWS CDK backend at the root, and a standalone Expo/React Native mobile app in `mobile/`.

```
rescuenet/
├── bin/
│   └── rescuenet.ts          # CDK app entry point — instantiates and wires all 5 stacks
│
├── lib/
│   ├── constants.ts           # Shared config: table names, event bus name, seeded shelters
│   ├── schema.graphql          # AppSync GraphQL schema (types, queries, mutations, subscriptions)
│   └── stacks/
│       ├── storage-stack.ts    # S3 bucket for report photos
│       ├── database-stack.ts   # DynamoDB tables (cases, shelters, bids, needs, QA sessions) + seed data
│       ├── messaging-stack.ts  # EventBridge bus — the "blackboard" event backbone
│       ├── api-stack.ts        # AppSync GraphQL API, resolvers, data sources
│       └── lambda-stack.ts     # All Lambda functions + their EventBridge/AppSync wiring
│
├── lambda/                     # One folder per Lambda function (handler = index.ts)
│   ├── intake/                 # Entry point: creates a case, mints S3 upload URLs, fires ReportSubmitted
│   ├── image-agent/            # Rekognition — species + injury detection from photos
│   ├── geocoding-agent/        # Resolves coordinates to a place description
│   ├── needs-profile/          # Bedrock (Claude) — turns free text into urgency + hard constraints
│   ├── dedup-agent/            # Proximity + similarity scoring; merges or links duplicate reports
│   ├── tier1-agent/            # Bidding logic for shelters with a live API/capacity feed
│   ├── tier2-agent/            # Slack-based intake conversation for shelters without their own system
│   ├── slack-webhook/          # Inbound endpoint for Slack coordinator replies
│   ├── arbitrator/             # Scores all bids, assigns the winning shelter or escalates
│   ├── confirmation-handler/   # Finalizes or re-routes an assignment based on shelter confirmation
│   ├── case-stream-publisher/  # DynamoDB Streams → AppSync mutation, powers live subscriptions
│   ├── list-nearby-cases/      # Geo-filtered query backing the app's "Live Cases" map
│   ├── get-case-photos/        # Presigned GET URLs for a case's uploaded photos
│   └── shared/
│       └── utils.ts            # DynamoDB client, EventBridge helper, haversine distance, shared types
│
├── mobile/                     # Expo React Native app (own package.json, deploys independently)
│   ├── app/                    # Screens (file-based routing via Expo Router)
│   │   ├── index.tsx           # Home
│   │   ├── report/[type].tsx   # Report form (stray / found / lost)
│   │   ├── confirmation/[localId].tsx
│   │   ├── case/[caseId].tsx   # Live case tracking timeline
│   │   ├── history.tsx         # "Live Cases" — nearby map + my reports
│   │   └── shelters.tsx        # Nearby shelters list
│   ├── components/             # Shared UI: Button, StatusBadge, IconBadge
│   ├── lib/                    # amplify.ts (API client config), graphql.ts (queries/mutations),
│   │                            #   offlineQueue.ts (local-first submission), theme.ts, geo.ts
│   └── patches/                # patch-package fixes for a native dependency
│
├── scripts/
│   └── demo.sh                 # Interactive CLI walkthrough of a live case through the backend
│
├── docs/
│   ├── rescuenet-architecture.pdf   # 6-slide architecture deck (blackboard model, AWS infra, dataflow)
│   ├── rescuenet-usecases.pdf       # Real screenshots: happy path, dedup, lost & found reunion
│   └── PRESENTATION.md              # Talk-track notes for presenting this project
│
├── cdk.json / tsconfig.json / package.json   # Backend (CDK) project config
└── .gitignore
```

## Architecture, in one paragraph

RescueNet follows the **blackboard pattern**: one shared case record in DynamoDB is the single source of truth, and every specialist Lambda reads from it, does its one job, and writes its findings back — never calling another agent directly. EventBridge is the notification layer: a write to the case fires an event, and whichever agents care about that event wake up. This means agents can be added or removed without touching anything else; the case record itself is the API. See [`docs/rescuenet-architecture.pdf`](docs/rescuenet-architecture.pdf) for the full diagrammed version (blackboard concept → AWS infra → dataflow → case-enrichment lifecycle → frontend integration).

## Tech stack

| Layer | Technology |
|---|---|
| Infrastructure | AWS CDK (TypeScript), 5 stacks |
| API | AWS AppSync (GraphQL) — queries, mutations, live subscriptions |
| Compute | AWS Lambda (Node.js/TypeScript), 12 functions |
| Data | DynamoDB (+ Streams), S3 |
| Eventing | EventBridge |
| AI | Amazon Rekognition (vision), Amazon Bedrock / Claude (reasoning) |
| Human-in-the-loop | Slack (tier-2 shelter coordination) |
| Mobile app | React Native (Expo), Expo Router, Amplify JS (GraphQL client) |

## Setup

### Prerequisites
- Node.js 20+, an AWS account with the CLI configured (`aws configure`), and the CDK bootstrapped in your account/region (`npx cdk bootstrap`)
- For the mobile app: Xcode + iOS Simulator (macOS), or Expo Go for a quicker preview without native modules

### Backend (CDK)

```bash
npm install
npx cdk deploy --all --require-approval never   # or: npm run deploy
```

This deploys all 5 stacks and prints the AppSync endpoint URL and API key, which the mobile app needs next.

### Mobile app

```bash
cd mobile
npm install
cp .env.example .env   # fill in EXPO_PUBLIC_APPSYNC_URL / _API_KEY from the CDK output above
npx expo run:ios       # native build + simulator launch (needed once, for native modules like react-native-maps)
# subsequently:
npx expo start          # fast-refresh dev server
```

### Try it without deploying anything

`scripts/demo.sh` drives a full case through an already-deployed backend via the AWS CLI — useful for seeing the agent pipeline run end to end without building the app.

## Environment variables

The mobile app reads three `EXPO_PUBLIC_*` variables from `mobile/.env` (see `mobile/.env.example` for the template). These are public-by-design Expo env vars (bundled into the client) pointing at an API-key-authenticated AppSync endpoint — nothing sensitive is stored in the repo, and `.env` is gitignored everywhere.

The backend takes no `.env` file; all configuration is either a CDK context value in `cdk.json` or a value pulled from AWS Secrets Manager at deploy/runtime (the Slack bot token, for example).
