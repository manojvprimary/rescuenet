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

**Open questions for supervisor** — carried forward and consolidated into the Section 11 request: the AHP protocol soundness check, the seeded-shelter evidence-base question, and the still-unconfirmed remaining hard-stop dates (open since Week 1).

---
