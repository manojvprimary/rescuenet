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
- Built a real data-source inventory by reading `lib/stacks/database-stack.ts`, `lib/schema.graphql`, and every Lambda's DynamoDB access pattern directly, rather than describing the schema generically. This surfaced two previously undocumented findings: the `needsProfile` data is duplicated across the `rescuenet-needs` table and an embedded copy on the Case item with no single source of truth, and the `caseId-index` GSI on the QA-sessions table is defined in the CDK stack but never actually queried anywhere in the Lambda code.
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
