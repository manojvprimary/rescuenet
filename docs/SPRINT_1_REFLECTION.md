# Sprint I Reflection (CISC 699, Week 5)

Baseline tag: `v0.1.0-baseline`. Smallest demonstrable technical path (the supervisor prompt): a fresh clone of the repo installs with `npm ci`, type-checks every Lambda, passes 36 unit tests, and runs a smoke script that shows the new case-specific weight blend working, the fallback catching malformed classifier output, and the species-match fix. Evidence is in `docs/evidence/sprint-1/`.

## What was completed
- **Engineering baseline:** Jest + ts-jest, `npm test`, `typecheck`, `smoke`, and `synth` scripts; `.nvmrc` and `engines`; `ts-node` pinned; branch `sprint-1/baseline` merged to `main` with `--no-ff` and tagged.
- **Weights module (design Section 5.3):** `lambda/shared/weights.ts`, a pure deterministic blend of per-archetype AHP vectors with validated fallback and a top-archetype mode. 27 of the 36 tests cover it (the other 9 cover the species-match helpers), including the property tests from the design (weights sum to 1, components stay within archetype bounds, one-hot returns the archetype vector, vet care rises with injury probability, exact reproducibility) and ten kinds of malformed classifier output.
- **Species-match fix (issue #1):** extracted to `lambda/shared/scoring.ts` and used by the arbitrator (six-line diff). A deliberate mutation check confirmed the regression tests fail against the old logic (2 failures) and pass against the fix.
- **Documentation:** README baseline steps, CHANGELOG, KNOWN_ISSUES, CONTRIBUTING (naming, branches, artifact storage), RISK_LOG (9 risks, 7 issues), ARCHITECTURE_NOTES mapping skeleton to design.
- **Reproducibility test:** cloned the pushed branch into an empty directory and ran the documented steps; all exit codes 0 (`docs/evidence/sprint-1/smoke-output.txt`).

## What is not done, stated plainly
- The weights module is **not wired into `needs-profile`**, and the classifier (Bedrock returning archetype probabilities) is not started. The deployed system is unchanged and **nothing was deployed**.
- The AHP vectors are **equal placeholders**. The real vectors depend on the student's judgments in Week 6; the smoke demo's non-equal weights use clearly labeled illustrative vectors, not elicited ones.
- There is no evaluation harness, no synthetic fixtures, no frozen v1 baseline, and no measured results yet. The 36 tests cover only the new pure modules; the rest of the pipeline has no tests (KI-04).
- Verified after the initial capture: the install, type-check, tests, and smoke test pass under Node 20.20.2 on an anonymous clone of the public repo (`docs/evidence/sprint-1/node20-output.txt`). Not verified: `npm run synth` on a machine without the author's AWS configuration.

## Blocked or needing input
- **AHP elicitation (R-01):** needs the student's 30 pairwise judgments; cannot be generated.
- **Second annotator (R-03):** an independent person to annotate the 8 synthetic cases blind; the supervisor said this would strengthen validity if feasible.
- **Node 20 as the local default (R-05):** the baseline already passes under Node 20 via `npx`; installing Node 20 locally (nvm or Homebrew) would make everyday runs match production.
- **Bedrock quotas (R-06):** need a console check before the stability tests.

## Lessons
1. **A hidden dependency surfaced because I built the smoke test.** `ts-node` was never declared; `cdk.json` and `npx` fetched it from the network on every run. The reproducibility check is only meaningful on a clean clone, so I ran one.
2. **Passing tests on the first run are not evidence by themselves.** All 36 passed immediately, so I put the old bug back and confirmed the regression tests failed. That is what makes them worth citing.
3. **Extracting pure functions out of handlers is what made anything testable.** The arbitrator imports AWS clients at load time; the species logic could not be unit-tested until it moved to `scoring.ts`.
4. **Evidence must be captured, not retyped.** My first evidence file had a blank exit code and a typed-in line; I regenerated it from a script so every line is real output.

## Risk implications
R-04 (regression risk) is lower now because the change is small, tested, and undeployed, but it returns the moment `needs-profile` is touched; the `WEIGHTING_MODE` flag must exist before that change. R-02 (classifier unreliability) is the next dominant risk and cannot be assessed until the classifier exists. R-05 (Node mismatch) is now documented but not fixed.

## Next sprint (Oct 5-11, toward Hard Stop 3: Early Implementation Validation Package)
1. Build an AHP calculator (matrix to weights, lambda_max, CI, CR with the verified RI table) with tests, so the Week 6 elicitation produces committed, checkable numbers.
2. Write the 8 synthetic fixtures and the annotations, and commit them **before** any harness run; ask for a second annotator.
3. Add the `WEIGHTING_MODE` flag and the v2 `needs-profile` classifier behind it (default stays `llm`); keep it off the live path.
4. Record the frozen v1 needs profiles for the evaluation cases (needs live Bedrock calls; check quotas first).
5. First harness run and the AHP elicitation, INJURED_CRITICAL first, with its sensitivity check; report classifier agreement and stability as counts.
The honest risk to the plan is item 3 and 4 together: both touch live AWS and Bedrock, so they should not start until the flag and the non-production path exist.
