# RescueNet — presentation run sheet

Deck: `rescuenet-architecture.pdf` (6 slides). Times assume a ~12–15 min slot; compress by cutting the second edge case.

---

## 1 · Project overview — slide 1 (~2 min)

**Keywords:** anonymous reporting · blackboard architecture · minutes not days · no dropped cases

- The problem: someone sees an injured stray. Today they Google, call three shelters, get voicemail, give up. The animal loses.
- RescueNet: snap a photo, drop a pin, done — anonymous, no account. The system does the calling.
- Behind it: a **blackboard multi-agent system** — AI agents enrich the report, deduplicate sightings, and auction the case to real shelters with live capacity.
- Point at the tech-stack strip: fully serverless AWS, React Native app, vision + LLM enrichment. Everything you'll see is deployed and live.

## 2 · Architecture — slides 2 & 3 (~3 min)

**Keywords:** blackboard pattern · agents never call each other · event-driven · audit trail · serverless

Slide 2 (concept):
- Classic AI blackboard pattern: **one shared case record** is the source of truth; specialist agents each know one thing well.
- Agents **never call each other** — they react to events and write back to the record. Adding/removing an agent touches nothing else. "The case record is the API."
- Every write appends to an **event history** — full audit trail of what each agent decided and why.

Slide 3 (AWS):
- Same shape mapped onto AWS: DynamoDB is the blackboard, EventBridge is how agents notice changes, 12 Lambdas are the agents.
- Rekognition for photo analysis, Bedrock (Claude) for reading free-text descriptions into structured needs.
- Slack is the tier-2 escalation surface — small shelters without an API get a human coordinator in a channel.
- 5 CDK stacks, all TypeScript, zero servers idling between reports.

## 3 · The frontend & how it talks to the backend — slide 6 (~2 min)

**Keywords:** Expo/React Native · one GraphQL endpoint · local-first · presigned uploads · push not polling

*(Background for you, since you didn't build this part:)*

- The app is **React Native via Expo** — one TypeScript codebase, file-based routing (each screen is a file: `report/[type].tsx`, `case/[caseId].tsx`). It runs on the iOS simulator for this demo, same code would ship to Android.
- It talks to exactly **one endpoint**: the AppSync GraphQL API, using the Amplify JS client with an API key (anonymous by design). Three interaction patterns:
  - **Write:** `submitReport` mutation → backend creates the case AND returns up to 5 presigned S3 URLs → the app uploads photos **directly to S3**, never through a server.
  - **Read:** `getCase`, `listShelters`, `listNearbyCases` (the map). Nearby cases return a deliberately thin payload — no reporter data leaves the backend.
  - **Live:** the app opens a GraphQL **subscription** per case. Agents write to DynamoDB, a Streams-triggered Lambda republishes each status change through AppSync, and the case page updates in real time — no polling anywhere.
- **Local-first:** a report is saved to the device before any network call. In a dead spot it queues and auto-syncs when connectivity returns — a report can never be lost.
- The timeline the user sees is the agents' event history translated into **plain language** ("Care needs assessed", not "needs-profile enriched").

## 4 · Demo — slides 4 & 5 up as backdrop (~5–6 min)

Simulator GPS is set to **Union Square, Manhattan**. Photo library has 8 stray-dog photos ready (the two *beach* shots and the two *Chamkhar street* shots are same-dog pairs for dedup).

### Happy path (main flow)

**Keywords:** 30-second report · agents in seconds · live timeline · real shelter data

1. Home → **"Stray or injured animal"**.
2. Species **Dog**, type a short description ("limping badly, favoring front left leg"), **attach 2–3 photos** (shows the multi-photo picker, "up to 5"), location auto-detected → **Submit**.
3. Confirmation screen: case ID, "submitted anonymously". Tap **Track this case**.
4. Talk over the timeline as milestones appear (seconds): report received → photo reviewed (Rekognition) → care needs assessed (Bedrock, urgency) → shelter selected → **"Manhattan Animal Care Center matched — vet on site"**.
5. Open **Live cases** from Home: satellite-style map of Manhattan with paw pins, radius filter, every active case. Tap a pin → callout → case page.

### Edge case 1 — duplicate sightings (dedup)

**Keywords:** proximity + similarity · soft-link vs auto-merge · one animal, one case

1. Submit a stray report with **Chamkhar photo #1** at current location.
2. Submit a second report with **Chamkhar photo #2** (same dog, different angle, similar wording).
3. Open the second case: timeline shows **"Similar report noticed — someone nearby may have reported the same animal"**, and a **"Possible match reported nearby"** card links to the first case — including *"it's currently at Manhattan Animal Care Center"* once matched.
4. Say: ≥0.85 similarity auto-merges silently; 0.50–0.85 soft-links so a human can decide. Score combines species, distance, and plausible animal movement over time.

### Edge case 2 — lost pet reunion (same mechanism, flipped)

**Keywords:** lost + found are the same graph · reunion flow

1. From Home → **"Lost my pet"**, describe the same dog, near the same spot.
2. The lost case immediately gets the **match card**: "A similar animal was reported close by — it's currently at Manhattan Animal Care Center. View that case →" with the stray case's photo.
3. Punchline: reporters and owners feed the **same blackboard** — a reunion is just a dedup link viewed from the other side.

### (Optional) Edge case 3 — human escalation

**Keywords:** tier-2 shelters · Slack · never a dropped case

- If no shelter can bid (capacity, species), the arbitrator **escalates instead of failing**: the case lands in a Slack channel where a coordinator claims it by replying. Show the amber ESCALATED state on slide 5 and mention the live Slack round-trip works.

## 5 · Close (~1 min)

**Keywords:** extensible by design · real data · what's next

- Everything shown is live AWS infrastructure, driven end-to-end by events.
- Because agents are decoupled, next steps are drop-in: image-embedding similarity for dedup, real geocoding via a Place Index, push notifications, Android build.
- End on the mission: the animal on the sidewalk gets help in minutes, and the person who cared enough to stop never had to make a phone call.

---

### Cheat sheet — numbers to have in your head

| Thing | Value |
|---|---|
| Lambdas / agents | 12 functions, ~7 acting as agents |
| CDK stacks | 5 (Storage, Database, Messaging, Api, Lambda) |
| Dedup thresholds | ≥0.85 merge · ≥0.50 soft-link · 1 km / 3 h window |
| Photos per report | up to 5, presigned direct-to-S3 |
| Shelters seeded | 6 real Manhattan orgs (4 tier-1 API, 2 tier-2 Slack) |
| End-to-end latency | seconds from submit to shelter match |
