# Risk and Issue Log

Maintained by: Manoj Venkatachalaiah (sole developer, so every owner is the same person; owner is recorded as a role placeholder for when a second annotator or evaluator joins). Last updated: 2026-10-03 (Sprint I baseline, tag `v0.1.0-baseline`).

Severity: **H** = could invalidate a success criterion or break the live system; **M** = degrades evidence quality or schedule; **L** = cosmetic or contained. Status: Open, Mitigating, Closed, Accepted.

## Risks

| ID | Risk | Sev | Mitigation action | Owner | Status |
|----|------|-----|-------------------|-------|--------|
| R-01 | The 30 AHP judgments come from a single judge; a CR below 0.10 shows internal consistency, not that the judgments are substantively right. | H | Elicit INJURED_CRITICAL first and run its sensitivity check before the other two; one-step perturbation of all 30 judgments (SC2); re-elicit any matrix where a single perturbation flips 2 or more of 9 cases. | Judge/developer | Open (Week 6) |
| R-02 | The LLM archetype classifier is non-deterministic and may be confidently wrong, which would shift the old LLM-weighting problem upstream (the supervisor's stated concern, 2026-09-27). | H | The blend is a pure function (done, tested); classifier set to temperature 0; classifier agreement and stability tests; degradation ladder via `WEIGHTING_MODE` (blend, top-archetype, single vector). | Developer | Mitigating (blend done; classifier work Week 5-6) |
| R-03 | Evaluation set is tiny (9 cases, 1 real) and annotated by one person, so annotations could be biased and results cannot be statistically powered. | M | Annotations committed before the first harness run (hash recorded); thresholds reported as counts and marked provisional; request an independent second annotator for the 8 synthetic cases. | Developer / second annotator (TBD) | Open |
| R-04 | Changing `needs-profile` or the arbitrator could regress the live pipeline (about 28 s end to end). | H | Nothing deployed this sprint; new code is behind `WEIGHTING_MODE`; non-production path and latency/error-rate comparison before promotion; rollback is a configuration change. | Developer | Mitigating |
| R-05 | Development runs on Node 25.9 while Lambda runs Node 20. A test can pass locally and behave differently in production. | M | `.nvmrc` and `engines` added (documented, not enforced on this machine); run the final validation under Node 20 before Hard Stop 3. | Developer | Mitigating |
| R-06 | Bedrock account quotas and throttling are unchecked; a throttled call lands on the fallback and could skew classifier results. | M | Check quotas in the console in Week 5-6; stability test logs throttled calls separately from model outputs. | Developer | Open |
| R-07 | Hand-picked normalization constants (`/5`, `/120`, `/30`) and the freshness table remain uncalibrated and may dominate the ranking regardless of the AHP weights. | M | Out of scope this term; disclosed. The harness logs the decisive factor per case so domination would be visible. | Developer | Accepted |
| R-08 | Only one real case exists; seeded shelters are synthetic. External validity of any result is limited. | M | Disclosed in every evaluation write-up; no claim of real-world outcome improvement. | Developer | Accepted |
| R-09 | Scope creep into the shelter portal or geocoding fix before success criteria are met. | L | Hard gate: stretch goals only after SC1-SC4 pass; geocoding tracked as issue #3. | Developer | Mitigating |

## Issues (found and tracked)

| ID | Issue | Sev | Action | Owner | Status |
|----|-------|-----|--------|-------|--------|
| I-01 | `ts-node` was not a declared dependency; `cdk.json` runs `npx ts-node`, which silently downloaded an unpinned copy on every run. Found while building the smoke test. | M | Added `ts-node@^10.9.2` as a devDependency (Sprint I). | Developer | Closed |
| I-02 | No test framework or `npm test` existed. | M | Added Jest 29 with ts-jest and 36 tests (Sprint I). | Developer | Closed |
| I-03 | Species check tested whether a shelter's accepted-species list existed, not whether it contained the case's species (GitHub issue #1). | L | Fixed in `lambda/shared/scoring.ts` and the arbitrator; regression tests added; verified the tests fail against the old logic (Sprint I). | Developer | Closed (not yet deployed) |
| I-04 | `rescuenet-needs` DynamoDB table is provisioned and granted to every Lambda but never read or written. | L | Documented in the data inventory; removal deferred (out of scope). | Developer | Open |
| I-05 | `caseId-index` GSI on the QA table is defined but never queried. | L | Documented; removal deferred. | Developer | Open |
| I-06 | AWS Location Service Place Index is never provisioned, so geocoding falls back to raw coordinates (GitHub issue #3). | L | Out of scope this term. | Developer | Open |
| I-07 | Local `npm install` prints an engine warning because Node 25.9 is outside the declared `>=20 <21` range. | L | Expected until Node 20 is installed locally (see R-05). | Developer | Accepted |
