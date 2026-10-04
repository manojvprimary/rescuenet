# Contributing / Engineering Conventions

Sole developer today (Manoj Venkatachalaiah); these rules exist so a peer or a second annotator can work in the repo without asking questions.

## Repository structure
- `lambda/<agent>/index.ts`: one folder per Lambda handler. Logic that needs unit tests goes in `lambda/shared/` as **pure functions with no AWS clients**, and the handler calls it (example: `scoring.ts`, `weights.ts`).
- `test/<module>.test.ts`: one Jest file per shared module; imports from `../lambda/shared/...`.
- `lib/`: CDK stacks and constants. `bin/`: CDK entry point. `scripts/`: runnable helper and smoke scripts. `mobile/`: separate Expo app with its own `package.json`.
- `docs/`: course deliverables and design documents. `ENGINEERING_LOG.md` (dated decisions), `CHANGELOG.md`, `KNOWN_ISSUES.md` at the root.

## Naming
- Files: `kebab-case` for folders and scripts, `camelCase.ts` is not used; test files end in `.test.ts`.
- Exported TypeScript: `camelCase` functions, `PascalCase` types, `UPPER_SNAKE` constants. Archetype and factor names match the design documents exactly (`INJURED_CRITICAL`, `vet_care`, ...).
- Git tags: `vMAJOR.MINOR.PATCH[-label]`, for example `v0.1.0-baseline`. Hard-stop snapshots get `hs3`, `hs4`, ... tags.

## Branch strategy
- `main` is always deployable-in-principle and always passes `npm run typecheck` and `npm test`.
- Work happens on short-lived branches: `sprint-N/<topic>` for a sprint, `fix/<issue-number>-<topic>` for a defect. Merge to `main` with `--no-ff` so each sprint is one visible unit in history.
- Commit messages: imperative summary line, then a short body saying what changed and what was deliberately not changed. Reference GitHub issues (`#1`).
- Nothing deploys to the live AWS account from a branch. Deployment happens from `main` after the validation in the design review (non-production path, latency and error-rate comparison, `WEIGHTING_MODE` flag).

## Artifact storage
- Course documents: `docs/` (one `.docx` per deliverable, regenerated from source, not hand-edited).
- Evidence for a milestone (terminal output, harness reports): `docs/evidence/<milestone>/`, text files committed; large binaries (screenshots) are attached to the Canvas submission, not committed.
- Evaluation fixtures (synthetic cases) and annotations: `test/fixtures/`, committed **before** the first harness run, with the commit hash recorded in the report.
- Secrets: never committed. The backend reads the Slack token from AWS Secrets Manager; the mobile `.env` is local.

## Definition of done for a change
1. `npm run typecheck` clean. 2. `npm test` passes, with a regression test for any bug fix (and the test confirmed to fail against the old behavior). 3. `CHANGELOG.md` and, if relevant, `KNOWN_ISSUES.md` / `docs/RISK_LOG.md` updated. 4. `docs/AI_USE_LOG.md` entry added for any AI assistance.
