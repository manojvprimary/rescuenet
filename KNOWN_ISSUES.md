# Known Issues

Status as of the `v0.1.0-baseline` tag (2026-10-03). Risks and mitigations live in [`docs/RISK_LOG.md`](docs/RISK_LOG.md); this file lists defects and gaps a new reader should know about before running anything.

| ID | Issue | Impact | Planned fix |
|----|-------|--------|-------------|
| KI-01 | The weights module is **not wired into `needs-profile`**. The deployed system still asks Bedrock to invent the five weights per case (no temperature set, so they vary run to run). | The AHP design exists as tested code only. | Weeks 5-6, behind a `WEIGHTING_MODE` flag. |
| KI-02 | `ahp-weights.json` holds **placeholder equal vectors** (0.2 each). | The blend is mechanically correct but produces equal weights today. | Replaced by the elicited vectors in Week 6 (issue #2). |
| KI-03 | The species-match fix is in the repo but **not deployed**. | The live arbitrator still has the old existence check. | Deploy after the non-production latency/error-rate run. |
| KI-04 | No tests exist for `needs-profile`, the arbitrator's DynamoDB flow, or any other Lambda; the 36 tests cover only the new pure modules. | Most of the pipeline has no automated tests. | The evaluation harness (Weeks 5-7) replays cases through the scoring path. |
| KI-05 | Local Node is 25.9; Lambda is 20.x. `npm install` prints an engine warning. | A test could pass here and differ in production. | Run final validation under Node 20 before Hard Stop 3. |
| KI-06 | `npm run synth` and the deployment need AWS credentials and a bootstrapped account; they were not run against a clean machine. | A peer without AWS cannot run the synth step. | Tests and smoke test need no AWS; synth is marked optional in the README. |
| KI-07 | `rescuenet-needs` table and `caseId-index` GSI are provisioned but unused. | Dead infrastructure. | Deferred (out of scope). |
| KI-08 | Geocoding falls back to raw coordinates (no Place Index). | Case addresses are coordinates. | Out of scope; issue #3. |
| KI-09 | The hand-picked normalization constants and freshness table are uncalibrated. | They may dominate rankings regardless of weights. | Out of scope; the harness logs the decisive factor per case. |
| KI-10 | `cdk.json` runs the app through `npx ts-node`; `ts-node` is now pinned, but `npm run synth` was verified only on the author's machine. | Reproducibility on other machines is unconfirmed. | A peer clone test (see the sprint reflection). |
