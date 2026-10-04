# Architecture Notes: How the Sprint I Skeleton Maps to the Design Review

Source of truth for the design is the Hard Stop 2 Design Review Package (Sections 3-5). This file records what exists in the repo at `v0.1.0-baseline` versus what is still design only.

## Scope (unchanged from the design review)
Two components change this term: the **arbitrator** and the **weight-derivation step inside `needs-profile`**. Every other Lambda, the CDK stacks, and the mobile app are treated as stable dependencies.

## Skeleton versus design

| Design element (Hard Stop 2) | Repo location | State at baseline |
|---|---|---|
| Species check uses membership (SC1, minor) | `lambda/shared/scoring.ts`, called from `lambda/arbitrator/index.ts` | **Implemented and tested; not deployed** |
| Weights module: validate vectors, blend, fallback, top-archetype mode (Section 5.3) | `lambda/shared/weights.ts` | **Implemented and tested; not wired in** |
| AHP vectors, one per archetype (Section 5.2) | `lambda/shared/ahp-weights.json` | **Placeholder equal vectors**; real vectors in Week 6 |
| Classifier (Bedrock returns archetype probabilities, temperature 0) | `lambda/needs-profile/index.ts` | **Not started** (still the v1 prompt that invents weights) |
| `WEIGHTING_MODE` flag (llm, archetype) | CDK environment variable | **Not started** |
| Unit tests: blend properties, fallback faults, species check | `test/weights.test.ts`, `test/scoring.test.ts` | 36 tests passing |
| Smoke test | `scripts/smoke-weights.ts` (`npm run smoke`) | Passing |
| Evaluation harness, frozen v1 baseline, synthetic cases SYN-01..08 | `test/fixtures/` (planned) | **Not started**; Week 5-6 |
| Classifier agreement and stability tests | harness (planned) | **Not started** |
| Sensitivity (60 perturbations) and fairness-by-characteristic checks | harness (planned) | **Not started**; needs real vectors |

## Data flow (unchanged; see Figure 2 of the design review)
`ReportSubmitted` fans out to image, geocoding, and dedup agents in parallel; dedup publishes `CasePublished`, which fans out to `needs-profile`, `tier1-agent`, and `tier2-agent` in parallel; bids reach the arbitrator as `ShelterBid` events; the arbitrator scores, assigns, and publishes `CaseAssigned`. The new weights module slots into the `needs-profile` step and feeds the same `needsProfile.softWeights` field the arbitrator already reads, so the arbitrator's interface does not change.

## Repo tree (excerpt, as of the baseline)
```
bin/rescuenet.ts            CDK app entry
lib/                        stacks + constants + GraphQL schema
lambda/
  arbitrator/index.ts       modified: uses scoring.ts
  needs-profile/index.ts    unchanged (v1)
  shared/
    utils.ts                AWS clients and shared types (unchanged)
    scoring.ts              NEW  pure species-match helpers
    weights.ts              NEW  pure weight derivation
    ahp-weights.json        NEW  placeholder vectors
test/
  scoring.test.ts           NEW
  weights.test.ts           NEW
scripts/smoke-weights.ts    NEW
jest.config.js, .nvmrc      NEW
```
