# Changelog

Format: newest first. Versions are git tags. Each entry lists what changed and what was deliberately not changed.

## v0.2.0-validation (2026-10-11) — CISC 699 Hard Stop 3

### Added
- `lambda/shared/ahp.ts`: AHP arithmetic (row-average weights as designed, power-iteration eigenvector as cross-check, lambda_max, CI, CR with the verified RI table for n = 1-5, one-step perturbations). 18 tests against independently computed reference values.
- `lambda/shared/match.ts`, `geo.ts`: the arbitrator's scoring and haversine moved into pure modules so the harness uses the exact production arithmetic. A 216-combination oracle test compares them with a verbatim copy of the original code.
- `lambda/shared/needs-classifier.ts`: v2 classifier prompt and strict response parser, `WEIGHTING_MODE` parser, a rule-based comparison classifier, and the v1 prompt moved verbatim (golden-file test).
- `lambda/needs-profile`: `WEIGHTING_MODE` = `llm` (default, unchanged) | `blend` | `top`. In `blend`/`top` the model returns archetype probabilities at temperature 0 and weights are derived in code; any failure lands on the STABLE_ROUTINE AHP vector; the stored profile gains `archetypeProbabilities`, `weightsVersion`, `weightingMode`, `usedFallback`.
- `eval/`: 8 hand-authored synthetic fixtures and their annotations (committed first, `fdb6171`), harness, sensitivity check, AHP judgment store, 7 frozen v1 profiles, recorded live classifier output.
- `scripts/`: `run-eval`, `compare-v1-v2`, `run-sensitivity`, `ahp-elicit`, `ahp-adopt`, `ahp-build-vectors`, `bedrock-eval` (live, billed), `capture-evidence.sh`.
- `lambda/shared/ahp-weights.json`: v1 vectors built from the adopted judgments (all three CR < 0.10).
- 72 new tests (36 -> 108).

### Changed
- `lambda/arbitrator/index.ts`: imports scoring and eligibility from `match.ts`. Same arithmetic; the only visible difference is the log line for an excluded bid now names the failed constraint set generically.
- `lib/stacks/lambda-stack.ts`: adds `WEIGHTING_MODE: 'llm'` to the shared Lambda environment (no behaviour change; nothing deployed).
- `lambda/shared/utils.ts`: `haversineKm` re-exported from `geo.ts`; `NeedsProfile` gains four optional audit fields.

### Not changed (deliberately)
- Nothing deployed; the live pipeline is untouched and `WEIGHTING_MODE` stays `llm`.
- Scoring constants (`/5`, `/120`, `/30`), the freshness table, and the fixtures/annotations committed before the first run.

## v0.1.0-baseline (2026-10-03) — CISC 699 Implementation Sprint I

Baseline for comparing all later sprints against.

### Added
- Jest 29 + ts-jest; `npm test` (36 tests), `npm run typecheck`, `npm run smoke`, `npm run synth`.
- `lambda/shared/weights.ts`: pure, deterministic case-specific weight derivation (convex blend of per-archetype AHP vectors; fallback to the STABLE_ROUTINE vector on invalid classifier output; optional top-archetype mode). Not yet wired into `needs-profile`.
- `lambda/shared/ahp-weights.json`: vectors per archetype, **placeholder equal weights** pending the Week 6 AHP elicitation.
- `lambda/shared/scoring.ts`: `speciesMatchScore` and `extractCaseSpecies`, extracted from the arbitrator so they are testable.
- `scripts/smoke-weights.ts`: runnable smoke test.
- `.nvmrc` (Node 20) and `engines` in `package.json`.
- `CONTRIBUTING.md`, `KNOWN_ISSUES.md`, `docs/RISK_LOG.md`, `docs/ARCHITECTURE_NOTES.md`, this changelog.

### Changed
- `lambda/arbitrator/index.ts`: the species factor now checks that the shelter's accepted list contains the case's species, instead of only checking that a list exists (fixes issue #1). Six-line diff; `cdk synth` still succeeds. Not deployed.
- `package.json`: added `ts-node` as a declared devDependency (it was previously fetched from the network by `npx` on every run, including by `cdk.json`'s app command).

### Not changed (deliberately)
- No deployment, no change to the live AWS account, no change to `needs-profile`, the mobile app, or any CDK stack.
- Hand-picked normalization constants (`/5`, `/120`, `/30`) and the freshness table are untouched (out of scope this term).

## Earlier history
- 2026-10-04: repository made public after a secrets scan of all 19 commits (no keys or tokens found). Known soft exposures: one AWS account ID in the Hard Stop 2 document, and two Slack channel IDs in `lib/constants.ts`; neither is a credential.
- 2026-09-13: private GitHub remote created and pushed; issues #1-#3 opened.
- Initial commit `a352707`: full RescueNet codebase from ISEM 502 / GRAD 695.
