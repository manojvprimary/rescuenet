# Engineering Log — RescueNet / CISC 699

A running, dated record of decisions, findings, and changes made during the CISC 699 applied-project term. Started in Week 1 per the course's project-management expectations.

---

## Week 1 — 2026-09-06

**Context.** CISC 699 launch packet due. RescueNet already exists as a deployed system (5 CDK stacks, 12 Lambda agents, blackboard architecture over DynamoDB + EventBridge, AppSync GraphQL API, Expo mobile app) from the ISEM 502 → GRAD 695 sequence. Supervisor approved continuing it into CISC 699 with a specific mandate: harden the case-routing/arbitration algorithm.

**Findings carried in from prior audit work (this term, pre-syllabus):**
- `lambda/arbitrator/index.ts`'s `computeMatchScore` uses hand-picked normalization constants (slots/5, window/120, distance/30) with no calibration against real outcome data.
- `specScore = bid.acceptedSpecies ? 0.85 : 0.50` checks whether the array *exists*, not whether the species actually matches — effectively a near-constant term. Confirmed defect, not a design choice.
- `lambda/geocoding-agent/index.ts` has real AWS Location Service integration code, but the Place Index resource was never provisioned in the CDK stack, so every request falls back to raw coordinates. Verified live by submitting a real test case and reading the resulting DynamoDB record directly.
- A real end-to-end case (injured cat, Washington Square Park coordinates) was submitted through the live `rescuenet-intake` Lambda on 2026-08-30; the full pipeline (image-agent → geocoding-agent → needs-profile → dedup-agent → arbitrator → confirmation-handler) completed in ~28 seconds, producing genuine Bedrock reasoning output, a real computed match score (0.8791300139891632), and confirming the assignment to `shelter-manhattan-acc`. This case is retained in `rescuenet-cases` as the first real evaluation data point for the routing-hardening work.

**Decisions made this week:**
- Scope for CISC 699: harden the routing/arbitration scoring function specifically (fix the confirmed defect, replace hand-picked weights with an AHP-derived set, build a comparison evaluation harness), not the shelter-onboarding portal feature work — that remains a separate, already-prototyped track outside this course's graded artifact.
- Repository: local git repo exists (`/Users/manoj/Downloads/rescuenet`, one commit as of this term's start). GitHub remote setup status: see charter, Section 5.

**Open questions for supervisor** — see the Supervisor Briefing Note in this week's launch packet submission.

---

## Week 2 — 2026-09-13

**Context.** Hard Stop 1: Proposal Approval Package due. Instructor returned scored RU-01 feedback on the Week 1 launch packet (88/100) with five concrete, per-criterion deficiencies.

**Decisions and actions this week:**
- Resolved the one repeated feedback item rather than deferring again: created a private GitHub remote (`github.com/manojvprimary/rescuenet`), pushed the existing history, and opened three tracking issues (species-match fix, AHP elicitation, geocoding Place Index provisioning).
- Formalized the AHP elicitation protocol (judges, 5×5 pairwise instrument, CR < 0.10 threshold, revision procedure) that Week 1 had only gestured at.
- Added three independently verified 2025 sources (MARL survey, AWS Bedrock multi-agent GA, auction+AHP task-fitness paper) to the bibliography.
- Restructured the AI Usage Disclosure into the granular, per-instance schema the instructor requested, and embedded the full log as a submission appendix rather than only referencing it.
- Added an "Existing Algorithm (v1) and Identified Defects" section reproducing the real `computeMatchScore` code, with an explicit, honest scoping note: this term's success criteria fix the confirmed `specScore` defect and replace the five `softWeights` via AHP, but do **not** recalibrate the hand-picked `/5`, `/120`, `/30` normalization constants or the `ltcScore`/`slotsNorm` duplication — those remain disclosed, known limitations.

**Result:** RU-02 scored 99/100. The two 0.5 deductions (unconfirmed hard-stop dates; IRB statement phrased as a settled conclusion rather than an assumption) are carried into Week 3 as corrections.

**Open questions for supervisor** — carried forward: whether the supervisor participates as a second AHP judge (Week 6); whether the seeded shelter data is an acceptable midpoint-review evidence base.

---

## Week 3 — 2026-09-20

**Context.** RU-03 Literature and Requirements Brief due. Course now also assigns a team database-design project (ISEM 534) unrelated to RescueNet by deliberate choice, since real teammates unfamiliar with RescueNet would gain little from co-designing an already-deployed system.

**Decisions and actions this week:**
- Expanded the bibliography from 9 to 14 sources, adding three themes it previously lacked: competing/comparable systems (Shelterluv, RescueGroups.org), evaluation strategy under sparse data (Castells & Moffat, 2022), and AI governance (NIST AI 600-1, 2024; NIST critical-infrastructure concept note, 2026).
- Derived 11 requirements (6 functional, 5 non-functional), each traced to either a literature source or a named stakeholder need.
- Formalized the three flows already documented in `docs/rescuenet-usecases.pdf` into a proper use-case model with a UML-style diagram.
- Built a real data-source inventory by reading `lib/stacks/database-stack.ts`, `lib/schema.graphql`, and every Lambda's DynamoDB access pattern directly, rather than describing the schema generically. This surfaced two previously undocumented findings: the `caseId-index` GSI on the QA-sessions table is defined in the CDK stack but never queried anywhere in the Lambda code, and (added later; the original version of this finding was wrong, see the Week 4 correction) the `rescuenet-needs` table is provisioned and granted to every Lambda role but never read or written by any Lambda.
- Corrected the IRB/privacy statement from Week 1's unqualified "no approval required" to an explicit assumption subject to university policy, per the Week 2 feedback.
- This same data-source inventory work (entities, access patterns, and the Scan-based queries already flagged as demo-scale in the code's own comments) is being reused as the starting point for a single-table DynamoDB redesign exercise in the ISEM 534 database course — a deliberate, disclosed reuse of analysis effort across two courses, distinct from reusing RescueNet itself as the ISEM 534 team project.

**Open questions for supervisor** — carried forward: whether the six seeded shelter profiles remain an acceptable requirements-validation baseline, or whether broader synthetic shelter diversity should become its own requirement before Week 5 implementation begins.

---

## Week 3 (continued) — 2026-09-22

**Context.** Instructor feedback on RU-03 (complete/incomplete, no numeric score) identified three deficiencies: an inaccurate citation despite a claimed independent-verification standard, no supervisor review actually completed before submission, and overstated competing-systems/gap conclusions.

**Findings and corrections:**
- The Zhou et al. citation was wrong on inspection: year (had 2025, actual is 2026), a fabricated article title, and incorrect middle initials for six of the paper's seven authors. Root cause: the original Week 3 "verification" confirmed the paper existed at the right DOI but was drawn from a search-result summary, not the actual article page — existence-checking and full-citation-accuracy are different verification standards, and only the former was actually met. Corrected by fetching the real Frontiers in Physics page directly; the document and AI_USE_LOG.md (Entry 10) now reflect the real citation.
- Softened two claims in the literature synthesis and Theme 3 bibliography entries that concluded competing shelter platforms "don't attempt" routing decisions — that conclusion was drawn only from published feature documentation, not an audit of undocumented internals, and now says so explicitly.
- The supervisor-review task was disclosed as self-reviewed-pending rather than actually completed, following the same pattern used for Week 1 and Hard Stop 1's "confirm with supervisor" items. Unlike those, this was flagged as one of three principal deficiencies here — the lesson going forward is that an explicit "review with supervisor" task instruction needs the actual conversation to happen, not just a disclosed self-check, even when the assignment phrasing looks similar to prior weeks' items.

**Not corrected:** the same Zhou et al. citation also appears in the already-submitted, already-graded (99/100) Hard Stop 1 proposal docx. Left as-is rather than hand-editing a graded, submitted artifact; the correction is captured here and in the current document for the final report.

---

## Week 4 — 2026-09-27

**Context.** Hard Stop 2: Design Review Package due. This is the term's engineering-commitment checkpoint — architecture, computational method, environment, API contracts, and test/evaluation plan all need to be concrete enough that implementation (Weeks 5-8) can start immediately after approval.

**Decisions and actions this week:**
- Built a data-flow diagram scoped specifically to the arbitrator's hand-off points (needs-profile → tier1/tier2 bidding → arbitrator → confirmation-handler), distinct from the existing full-system architecture diagram.
- Wrote the AHP weight-derivation procedure as literal reproducible pseudocode (pairwise matrix → normalization → row-average weights → λmax → CI → CR), including Saaty's Random Index table, independently re-verified (RI(5) = 1.12) rather than assumed — directly applying the Week 3 citation-verification lesson to a numeric fact, not just a bibliography entry.
- Designed a concrete 6-case synthetic evaluation matrix (SYN-01 through SYN-06) with student-annotated expected-best-shelter ground truth, varying species match, urgency, distance, capacity, and vet availability. SYN-02 is deliberately constructed to expose the specScore defect by design, giving SC1 a concrete, checkable piece of evidence independent of whether the AHP weights turn out to be well-chosen.
- Designed a sensitivity/perturbation check (±1 Saaty-scale step per judgment, 20 perturbed matrices, checked against the synthetic case set) directly answering the Week 2 feedback's request for an AHP fairness/sensitivity check — this had been outstanding since Hard Stop 1.
- Confirmed the real environment/toolchain plan against package.json, tsconfig.json, and cdk.json rather than the Week 1 snapshot: Node 20.x, TypeScript 5.4/ES2020 strict, CDK 2.150+, and Jest still not installed (a real, current gap, not yet closed).
- Applied the Week 3 supervisor-review lesson directly: rather than writing another self-review disclosure, drafted an actual, specific, sendable request for supervisor feedback on the highest-risk item (whether the AHP protocol as specified is sound to proceed with, and whether the seeded-shelter evidence base is acceptable for the midpoint). Sending it is the student's own action, separate from this document.

**Correction to the Week 3 data-source inventory (2026-09-26).** The RU-03 brief and this log originally said the needs profile was duplicated across the `rescuenet-needs` table and the Case item's `needsProfile` attribute. That was wrong. Re-checking every reader and writer of `NEEDS_TABLE` while auditing Hard Stop 2 against its rubric showed no Lambda touches that table at all (only the CDK stack references it); needs profiles live only on the Case item. The finding is therefore an unused table, not duplicated storage. Root cause: I inferred duplication from a CDK comment and the shape of the `CaseRecord` type without checking who actually writes to the table, so the Week 3 "confirmed directly against each Lambda's source" claim overstated what had been verified. The repo copy of the RU-03 brief and this log are corrected; the version already submitted to Canvas still carries the original wording.

**Design revision (2026-09-26), before submission.** The student asked whether the algorithm should be a one-time settled router with constant weights or should adapt weights case by case (an injured animal needs a vet more than anything else). Checking the code showed weights are already generated per case by an unseeded Bedrock call in needs-profile (no temperature set, so they vary run to run), which means the Hard Stop 1 framing of "replace constant hand-picked weights" was imprecise. The real weaknesses are that the weights are not reproducible, auditable, or grounded in documented judgment. Decision (student, "as dynamic as possible"): three case archetypes (INJURED_CRITICAL, URGENT_TRANSIENT, STABLE_ROUTINE), one AHP vector each (30 judgments), with Bedrock returning archetype probabilities and a deterministic convex blend producing the per-case weights; AHP vectors also replace the hand-coded fallback profile. Scope grows from the arbitrator alone to the arbitrator plus the weight-derivation step in needs-profile; a WEIGHTING_MODE flag and a three-step degradation ladder keep rollback a configuration change. The species-match defect was also re-scoped: the arbitrator's hard-constraint filter already excludes non-accepting shelters when accepts_species is emitted, so it is a minor regression test, not a headline fix. Canvas confirmed the remaining hard-stop dates (Oct 11, Oct 25, Nov 8, Nov 22, Dec 6), closing an open item from Week 1.

**Rubric audit (2026-09-26).** Checked Hard Stop 2 against the RU-04 rubric and task list. Gaps found and closed: no explicit tradeoff analysis of the weighting options (added Section 5.4); no reproducible setup steps, data-validation steps, or quota notes (added 6.1 to 6.3, including the real finding that local development runs Node v25.9.0 while Lambda runs Node 20.x with no pinned version); no failure-mode-to-test mapping (added to Section 8); no interface table or weight-derivation diagram (added Key Interfaces and Figure 3); revised success criteria were not shown side by side with the originals (added to Section 9); and risks, missing dependencies, and evaluation gaps were not separated as the task list asks (Section 11). The audit also found that the first draft of the data-flow figure was wrong: EventBridge fans `ReportSubmitted` out to image, geocoding, and dedup in parallel, and `CasePublished` then fans out to needs-profile and both bidding agents in parallel; the figure now follows the rules.

**Supervisor communication (2026-09-26).** Two emails were sent to the supervisor: the original review request at 5:55 PM EDT (asking about the AHP protocol, a second judge, and the evidence base as then planned) and a follow-up at 7:14 PM EDT describing the later three-archetype design and scope expansion. Both offered a Teams meeting. Decision (student): no further email; questions, corrections, and status are documented in the assignment submissions instead, including the RU-03 needs-table correction, which is recorded in Section 2.3 of Hard Stop 2 and in this log. No response had been received when Hard Stop 2 was finalized.

**Supervisor response received (2026-09-27, 8:59 PM EDT).** Dr. Shaalan approved the three-archetype AHP approach as preferable to one fixed weighting scheme, with one explicit requirement: the blending mechanism must be deterministic, documented, and reproducible, not a way of quietly shifting the LLM-weighting problem upstream. He also capped scope at the three profiles already proposed. Action taken (2026-09-28): Section 5.3 was revised to state explicitly that deriveWeights is a pure, deterministic function with no model call, and that the only non-determinism in the whole path is the upstream classifier producing p, which Section 8's classifier-stability test was already built to measure. Section 11 now quotes the response in full and records what was and was not directly addressed (the second-judge and evidence-base questions were not answered; treated as resolved by proceeding, not re-asked). A class-wide announcement the same morning extended the Hard Stop 2 submission window to Sep 29, 11:59 PM; this revision is being made to act on the supervisor's response, not merely to use the extra time. Decision (student, reaffirmed): no further email to the supervisor — further questions, corrections, and status go in the assignment documents themselves.

**Fairness check added (2026-09-29).** Re-reading Week 2 feedback verbatim showed it named two distinct checks under "sensitivity/fairness," not one: whether AHP judgments are robust to small changes (already built, Section 8's perturbation test), and whether the scoring formula itself systematically favors a shelter characteristic (tier, vet availability, distance, data freshness) regardless of case merit (not yet built). Added a won-share-vs-eligible-share method for the second check, explicitly caveated as directional given only 9 planned cases rather than a statistically powered audit, to be run alongside the Week 7 midpoint comparison. Traceability row NFR7 added.

**Open questions for supervisor** — carried forward and consolidated into the Section 11 request: the AHP protocol soundness check, the seeded-shelter evidence-base question, and the still-unconfirmed remaining hard-stop dates (open since Week 1).

---

---

## Week 5 — 2026-10-04 (Implementation Sprint I)

**Context.** First build sprint. Goal from the check-in assignment: a real, runnable engineering baseline plus documentation and a risk log, not feature count.

**Done.** Branch `sprint-1/baseline`: Jest/ts-jest tooling (36 tests), `lambda/shared/weights.ts` (pure case-specific weight blend, fallback, top-archetype mode, placeholder equal AHP vectors), `lambda/shared/scoring.ts` and a six-line arbitrator change fixing the species-match defect (issue #1), smoke script, `.nvmrc`/`engines`, pinned `ts-node`, and the documentation set (README baseline steps, CHANGELOG, KNOWN_ISSUES, CONTRIBUTING, RISK_LOG, ARCHITECTURE_NOTES, sprint reflection). Merged to `main` with `--no-ff` and tagged `v0.1.0-baseline`.

**Verification.** Type-check clean before and after; mutation check (old buggy logic restored temporarily) made 2 regression tests fail, then all 36 passed after restoring; fresh `git clone` into an empty directory ran `npm ci`, typecheck, tests, and smoke, all exit 0; `cdk synth` succeeded on the author's machine. Evidence in `docs/evidence/sprint-1/`.

**Corrections made during the sprint (disclosed, not absorbed).** (1) `ts-node` turned out to be an undeclared dependency fetched unpinned by `npx` (also used by `cdk.json`); pinned. (2) My first evidence capture had a blank exit-code line and a hand-typed `npm ci` line; regenerated from a script. (3) My first draft of the reflection said 31 tests cover the weights module; the real count is 27 (9 cover the species helpers).

**Not done / honest limits.** Weights module not wired into `needs-profile`; classifier not started; vectors are placeholders until the Week 6 AHP elicitation; no harness, fixtures, or measured results; nothing deployed. Not verified under Node 20 (local Node is 25.9, `nvm` not installed) or synth on a machine without the author's AWS configuration.

**Decision.** No deployment this sprint; the live pipeline is untouched. The `WEIGHTING_MODE` flag and non-production path must exist before `needs-profile` is modified.

**Follow-ups (2026-10-04, later the same day).** (1) The student reviewed the generated code and reported it looks good; Entry 18 updated. (2) The repository was made public at the student's instruction, after a scan of all 19 commits found no key or token patterns, no tracked `.env` or key files (`mobile/.env` is git-ignored), and no personal email, phone, or address in the text files. Two soft exposures were found and disclosed to the student: an AWS account ID inside the Hard Stop 2 .docx (binary, so text grep misses it) and two Slack channel IDs in `lib/constants.ts`. Neither is a credential; they remain in git history. The repo has no LICENSE file, so it is publicly viewable but not licensed for reuse. (3) The baseline was re-verified under Node 20.20.2 (via `npx`, nothing installed) on an anonymous clone: install, type-check, 36 tests, and smoke all exit 0; evidence in `docs/evidence/sprint-1/node20-output.txt`. Remaining unverified: `cdk synth` on a machine without the author's AWS setup.

---

## Week 6 — 2026-10-11 (Hard Stop 3: Early Implementation Validation)

**Context.** Hard Stop 3 asks for evidence that the stack is technically alive: run the baseline end to end, validate data and toolchain, capture early evidence, log defects, and interpret the results honestly. Branch `sprint-2/validation`.

**Done.** (1) AHP calculator with 18 tests against independently computed references. (2) Arbitrator scoring extracted into pure modules (`match.ts`, `geo.ts`) and pinned by a 216-combination oracle test against a verbatim copy of the old code. (3) `WEIGHTING_MODE` (`llm` default | `blend` | `top`) in `needs-profile`, v1 prompt moved verbatim and pinned by golden files, v2 classifier prompt and strict parser. (4) 8 hand-authored fixtures and annotations committed **before** the harness existed (`fdb6171`, sha256 recorded). (5) Evaluation harness, sensitivity check, v1-vs-v2 comparison. (6) 42 live Bedrock calls: 7 to freeze v1 profiles, 35 for classifier agreement and stability. (7) AHP judgments: proposed by the AI assistant from five sources (two read as PDFs, three as web pages), committed (`92373a8`) before any harness run, reviewed and adopted by the student (`93f895a`); CR 0.034, 0.023, 0.022. (8) Fresh-clone evidence under Node 20 with repeated runs and hash comparison. 108 tests (was 36).

**Results (counts, 8 synthetic cases, no real case).** Classifier top archetype agreed with the annotation in 7 of 7 (35 of 35 calls valid, 0 throttled, largest probability spread 0.05). Winner matched the annotated best shelter in 5 of 6 single-best cases with the pre-registered tie rule, but only 3 of 6 by raw score; v1's live profiles also scored 3 of 6, and v1 and v2 agree on every case by raw score. One-step sensitivity: 60 perturbations, largest flip count 1 (criterion: fewer than 2): PASS.

**Findings that cut against the design (not hidden).** (a) The scoring formula, not the weighting method, limits correctness: capacity is counted twice and no term measures the case's own urgency (KI-11). (b) The near-tie rule decided SYN-04 and SYN-05 in v2's favour; its alphabetical tie-break happens to agree with the annotations (KI-12). I added the raw-score metric after seeing the first results and say so wherever it appears. (c) The classifier's probabilities are near one-hot, so `blend` is almost `top` here (KI-13). (d) SYN-05 and SYN-07 are mostly decided by the `has_vet` constraint (KI-14).

**Corrections made during the sprint.** The first evidence-capture script put `npx` inside the Node 20 shell, which failed with usage errors and left the hash lines empty; I read the output instead of trusting the exit code of the wrapper, fixed it to call the local `ts-node`, and re-ran (I-10). The harness's first expected-winner computation for SYN-08 skipped the tie rule that the actual winner used, so a test failed; fixed by sharing one `pickWinner`.

**Process disclosure.** Reddit and X could not be read (the fetch, search and browser tools refuse them), so no forum evidence is used. The student asked to see forum posts (r/IndianPets); they remain unread and are not cited. The AI-proposed judgments are the student's judgments of record only because the student reviewed the table and reasoning and adopted them.

**Supervisor.** No new contact. As the student decided on 2026-09-27, further supervisor email is replaced by documenting in the assignments; the package cites the Sep 26-27 exchange and says no meeting took place for Hard Stop 3.

**Not done.** Nothing deployed; no non-production latency or error-rate run; `WEIGHTING_MODE` stays `llm`; no real case; no second annotator or judge; Bedrock console quota check still outstanding.

---

## Week 7 — 2026-10-18 to 2026-10-21 (Midpoint Demo and Adjustment Memo)

**Context.** Hard Stop 3 scored 90/100. The instructor's top deduction was the missing non-production deployment of the new path; the Week 7 plan in Hard Stop 2 had also promised a latency and error-rate run with the flag on.

**Done.** Read-only `cdk diff`, pre-deploy snapshot, then a deploy of the Lambda stack only (13 functions, 27 s; code plus `WEIGHTING_MODE`, default `llm`). Regression check with the unchanged default, then `scripts/measure-v2.py`: 6 cases under `llm`, 6 under `blend`, rollback, 1 verification case. Results in `docs/evidence/sprint-3/measure-v2.json`. Replaced the stale `scripts/demo.sh` with `scripts/demo-e2e.sh` and added `scripts/demo-v2-live.ts`.

**Results (counts, one deployed environment, 13 cases).** 13 of 13 reached ASSIGNED; 0 error lines across the nine pipeline functions. Median seconds from submission to a scored assignment: `llm` 24.7, `blend` 24.1, after rollback 24.2 (all between 23.0 and 29.2, target about 30). needs-profile Lambda duration: median 3.7 s under `llm`, 3.3 s under `blend`. Rollback took 7.3 s (an environment-variable change) and the next case stored no v2 fields. Winners were identical in both modes for all three scenarios.

**What this does not show.** All six scenarios picked the same shelter because the seeded roster has one dominant shelter (large capacity, vet, wide radius), so this run cannot say whether blend routes better. It was the only environment (the demo account, no real users), not an isolated one. Every block started on freshly reconfigured functions (cold start counted separately). Sample is small. The per-case weights under `blend` and `llm` are similar in shape.

**Corrections made during the sprint.** `scripts/demo.sh` was stale (retired in-app Q&A); the first `demo-e2e.sh` mis-parsed the intake response; the first measurement run crashed on an AWS clock-skew error when the machine slept, so I added retries and incremental saves and repeated the run from the start (five aborted-run cases remain in the cases table). I noticed only after several hours that the Oct 18 deadline had passed; the package is therefore late.

**Decisions.** The feature named as the cut if the project falls behind after Week 8 is the fairness-by-shelter-characteristic check (NFR7). The student delegated this choice. Deployment and rollback were chosen by me from the options I recommended, on the student's instruction to proceed without waiting.

---

## Week 8 — 2026-10-25 (Hard Stop 4: Midpoint Technical Evidence Review)

**Question.** Does the scoring formula or the weighting method limit routing correctness? (Hard Stop 3 Priority 4.)

**Done.** Eight new cases and annotations committed first (`fe064ca`); 32 live Bedrock calls (8 frozen v1 profiles; 24 classifier calls, all valid, none throttled, no spread across repeats); pre-registration and runner committed before any result (`70c3835`); the 4x4 ablation run; a labelled post-hoc variant; clean-clone evidence under Node 20. The student reviewed and approved the annotations ("approve all").

**Results (counts, 12 informative cases, raw top score).** Under the production formula every weighting method, including equal weights, gets 7 of 12. Counting capacity once gives 9 (v1), 10 (blend) and 10 (top) of 12 and still 7 with equal weights. Counting capacity once and using a 10 km distance scale gives 10, 11 and 11, and 8 with equal weights. Changing the formula changes the winner in 20.8% of one-factor-only cell pairs; changing the weighting method in 11.1%. No contrast is statistically distinguishable at this sample size (smallest exact p = 0.25 in the pre-registered run). Post-hoc, dropping bids production never sends: best cell 12 of 12.

**Reading.** Weights only matter once the formula lets them; under the production formula the weighting method is invisible. Blend equals top almost everywhere and beats v1 by one case at most.

**Corrections and cautions.** SYN-04 contains a bid production never sends (found from the output, confirmed in the code, not edited); the evidence script printed empty hash lines until I fixed an absolute-path bug in the runner; the formula variants and set-2 cases share an author and a purpose, so their result is a lead, not validation.

**Not done.** Independent annotator or judge; a real case; expert-proposed formula variants; a pair-by-pair review of the five weakest AHP judgments; promotion of v2.

