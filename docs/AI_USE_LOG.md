# AI-Use Log

Structured, per-instance disclosure of AI assistance, reformatted in CISC 699 Week 1 to match the schema requested in general class feedback: tool, date/phase, purpose, prompt/task summary, output used, affected section/artifact, human verification, final student revisions. Superseded the earlier narrative-only log kept during ISEM 502 and GRAD 695.

---

## Entry 1 — Code Audit

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 1 (2026-09-06), pre-launch-packet code review
- **Purpose:** Identify defects in the arbitrator and geocoding-agent Lambda functions to motivate the CISC 699 project scope.
- **Prompt / Task Summary:** Review `lambda/arbitrator/index.ts` and `lambda/geocoding-agent/index.ts` for logic and calibration issues; verify findings against a live test on the deployed system.
- **Output Used:** Identification of the `specScore` array-existence defect, hand-picked normalization constants, and the unprovisioned AWS Location Service Place Index.
- **Affected Section / Artifact:** Launch packet Sections 1, 3.2, 3.10 (Risks); Appendix A (this log's companion, `ENGINEERING_LOG.md`).
- **Human Verification:** Findings checked directly against source code; the geocoding fallback was independently confirmed by submitting a real test case to the live AWS account and reading the resulting DynamoDB record.
- **Final Student Revisions:** None required — findings were code- and test-verified before being written up.

## Entry 2 — Literature Research

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 1, initial bibliography and post-feedback addition
- **Purpose:** Identify credible, current sources on multi-agent task allocation, AHP, and market-based routing relevant to the arbitrator.
- **Prompt / Task Summary:** Search for and verify real academic/technical sources; after supervisor feedback, specifically verify three named sources (2025 MARL survey, AWS Bedrock multi-agent GA, an auction-plus-AHP task-fitness paper).
- **Output Used:** Nine annotated bibliography entries (launch packet Section 6).
- **Affected Section / Artifact:** Section 6; Section 3.9 (Preliminary Literature).
- **Human Verification:** Each source's real existence, authorship, and publication details were independently confirmed via search before inclusion; no fabricated citation was accepted.
- **Final Student Revisions:** Student selected which candidate sources to keep and directed the specific relevance angle each annotation emphasizes.

## Entry 3 — Charter, Feasibility, and Revision Drafting

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 1, full drafting and post-feedback revision
- **Purpose:** Draft the charter, feasibility review, workspace section, and AHP protocol from student direction.
- **Prompt / Task Summary:** Draft launch-packet Sections 2–5 and the AHP elicitation protocol (Section 3.4) from student-provided project history; revise per supervisor feedback.
- **Output Used:** Full section drafts, later revised.
- **Affected Section / Artifact:** Sections 2, 3, 4, 5.
- **Human Verification:** Reviewed and edited by the student before each submission.
- **Final Student Revisions:** Student redirected the shelter-portal framing from "deferred" to "gated stretch goal" (Section 3.6), and directed the addition of the AHP protocol and new sources after reading supervisor feedback.

## Entry 4 — Feedback Triage and Gap Analysis

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 2 (2026-09-13), pre-drafting for Hard Stop 1
- **Purpose:** Systematically map the instructor's RU-01 rubric feedback (88/100) and general class feedback onto concrete revisions required for the Hard Stop 1 Proposal Approval Package.
- **Prompt / Task Summary:** Given the pasted per-criterion instructor comments on Assignment 1, identify actionable items and cross-reference them against the Hard Stop 1 task list before drafting.
- **Output Used:** The "Response to Week 1 Supervisor Feedback" table (proposal Section 2).
- **Affected Section / Artifact:** Proposal Section 2.
- **Human Verification:** Student confirmed each item against the actual feedback text before marking it addressed; nothing was marked resolved without a corresponding change in the package.
- **Final Student Revisions:** Student decided to resolve the GitHub remote/issue-tracker item this week rather than defer it a second time, given it had already been flagged once.

## Entry 5 — Proposal Drafting (Background, Objectives, Success Criteria, MACP Framing, Project Plan)

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 2, full drafting
- **Purpose:** Revise the Week 1 charter into the formal proposal structure Hard Stop 1 requires, with explicit measurable success criteria and MACP-framed feasibility.
- **Prompt / Task Summary:** Restructure Week 1 charter content under the assignment's required headings; add measurable indicators not present in the Week 1 packet; reframe the feasibility review under Machine/Architecture/Computational/API headings; build a phased project plan aligned to the syllabus's 14-week schedule.
- **Output Used:** Proposal Sections 3 through 7 (Background and Problem Statement; Objectives and Intended Artifact; Success Criteria; MACP Feasibility Framing; Project Plan).
- **Affected Section / Artifact:** Proposal Sections 3, 4, 5, 6, 7.
- **Human Verification:** Reviewed by the student against the actual codebase, the live AWS account, and the syllabus's published 14-week schedule before inclusion.
- **Final Student Revisions:** Student set the specific numeric thresholds in Section 5 (e.g., the CR < 0.10 consistency threshold, the ~30-second latency budget) and decided the four-phase boundary structure in Section 7.

## Entry 6 — Work Breakdown, Risk/Ethics Section, and Approval Brief

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 2, full drafting
- **Purpose:** Produce the week-by-week work breakdown, the expanded risk/ethics/constraints section, and the one-page approval brief.
- **Prompt / Task Summary:** Draft a task backlog from the Section 7 project plan; expand the Week 1 risk list into explicit data-access, environment, ethics/privacy, and external-service-dependency categories; summarize the full proposal into a one-page brief covering what remains conditional and what evidence is expected by the next checkpoint.
- **Output Used:** Proposal Sections 8, 9, 10, and 11.
- **Affected Section / Artifact:** Proposal Sections 8, 9, 10, 11.
- **Human Verification:** Reviewed and edited by the student before submission; risk likelihoods and the approval brief's "conditional" items were checked against the student's own understanding of project status.
- **Final Student Revisions:** Student decided which open items from the Week 1 Supervisor Briefing Note remain genuinely open now that the GitHub item is resolved, and wrote the specific evidence commitments for the Week 4 checkpoint.

---

## Prior AI Use (ISEM 502 / GRAD 695, narrative summary — predates this schema)

AI-assisted development spanned the earlier coursework this project descends from: code and infrastructure implementation (CDK stacks, Lambda functions, GraphQL schema, mobile app), the GRAD 695 Applied Project Report and its figures, and the ISEM 502 UX Portfolio (personas, heuristic evaluation, prototypes), all drafted from student direction and reviewed by the student. No AI-generated or fabricated user-research data was presented as real at any point; where a course step assumed data unavailable to the student, the constraint was disclosed rather than simulated.
