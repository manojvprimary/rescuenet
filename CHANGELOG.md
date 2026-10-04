# Changelog

Format: newest first. Versions are git tags. Each entry lists what changed and what was deliberately not changed.

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
