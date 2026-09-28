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

## Entry 7 — Literature Verification and Synthesis

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 3 (2026-09-20), literature expansion for RU-03
- **Purpose:** Identify and independently verify credible sources for three themes missing from the Week 1-2 bibliography: competing/comparable systems, evaluation strategy under sparse data, and AI governance/ethics standards.
- **Prompt / Task Summary:** Search for real, current sources on animal-shelter management software, offline/sparse-data evaluation methods for ranking systems, and NIST AI risk-management guidance; verify exact authors, venues, and dates before use.
- **Output Used:** Five new annotated bibliography entries and the literature synthesis narrative, including an explicit gap statement.
- **Affected Section / Artifact:** Literature and Requirements Brief, Sections 2 and 3.
- **Human Verification:** Every new source's real existence, exact title, authorship, and publication/announcement date was independently confirmed via search before inclusion; the NIST critical-infrastructure document was confirmed to be a concept note in development, not a finished profile, and is cited accordingly rather than overstated.
- **Final Student Revisions:** Student selected which five sources to add and directed the specific gap this project fills relative to each theme.

## Entry 8 — Requirements and Use Case Drafting

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 3, full drafting
- **Purpose:** Derive functional and non-functional requirements from the literature and domain context, and formalize the project's existing informal product-walkthrough flows into a structured use-case model.
- **Prompt / Task Summary:** Draft a requirements table tracing each requirement to either a literature source or a stakeholder need; convert the three flows already documented in docs/rescuenet-usecases.pdf into formal use cases (actor, trigger, preconditions, main flow, postcondition); produce one visual use-case diagram.
- **Output Used:** Literature and Requirements Brief, Sections 4 and 5, including the use-case diagram.
- **Affected Section / Artifact:** Sections 4, 5.
- **Human Verification:** Every use case was checked against the real product-walkthrough document and, where applicable, the actual Lambda code path it describes (e.g., dedup-agent's active-status query).
- **Final Student Revisions:** Student decided which requirements were mandatory versus stretch and confirmed the use-case actors matched the real system's actual actors rather than a generic template.

## Entry 9 — Domain Constraints and Data Source Inventory

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 3, full drafting
- **Purpose:** Profile the system's real DynamoDB tables for provenance, schema, and data-quality limitations, and enumerate domain constraints (latency, legal/privacy, data fields, hardware, interface, organizational policy).
- **Prompt / Task Summary:** Read the actual CDK database stack, GraphQL schema, and every Lambda's DynamoDB access pattern to build an accurate data-source inventory rather than a generic description; ground domain constraints in the real deployed system and prior weeks' findings.
- **Output Used:** Literature and Requirements Brief, Sections 6 and 7.
- **Affected Section / Artifact:** Sections 6, 7.
- **Human Verification:** Every table, field, and access pattern listed was confirmed directly against lib/stacks/database-stack.ts, lib/schema.graphql, and each Lambda's source file, not assumed.
- **Final Student Revisions:** Student directed the reframing of the IRB statement as an assumption subject to university policy (per Week 2 supervisor feedback) rather than a settled conclusion, and confirmed which data-quality findings (e.g., the unused caseId-index GSI) were worth disclosing as known limitations.

## Entry 10 — Citation Re-Verification and Correction (Post-Feedback)

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 3 (2026-09-22), post-submission correction following RU-03 instructor feedback
- **Purpose:** Correct a bibliographic error the instructor identified in the Zhou et al. citation, and re-verify it properly this time.
- **Prompt / Task Summary:** Instructor feedback flagged that "the bibliographic details in the student's brief need correction." Re-fetched the actual Frontiers in Physics article page directly (not a search-result summary) to confirm the real author list, title, and publication date.
- **Output Used:** Corrected citation — Zhou, Y., Lan, Q., Yang, X., Wang, L., Li, G., Li, S., & Lyu, T. (2026), "Multi-agent task allocation method based on the cost-effectiveness maximization multi-round auction algorithm," Frontiers in Physics, 13 — replacing a version with the wrong year (2025 vs. actual 2026), a fabricated title, and incorrect middle initials for six of seven authors.
- **Affected Section / Artifact:** Literature and Requirements Brief, Sections 2 and 3.
- **Human Verification:** The original Week 3 verification had confirmed the paper's real existence and DOI but relied on a search-engine summary for the author list and title rather than the source page itself — an insufficient verification standard. This entry documents fetching the actual article page directly as the corrective standard going forward.
- **Final Student Revisions:** Student also directed softening two overstated claims the same feedback flagged: the "competing systems ignore routing" and project-niche conclusions in Sections 2 and 3 now explicitly note they rest on published documentation only, not an audit of undocumented internals.

## Entry 11 — Architecture, Data Flow, and Computational Method Drafting

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 4 (2026-09-27), full drafting
- **Purpose:** Translate the approved RU-03 requirements into a formal architecture description, a data-flow diagram scoped to the arbitrator, and reproducible pseudocode for both the corrected scoring function and the AHP weight-derivation procedure.
- **Prompt / Task Summary:** Read the real Lambda source (arbitrator, needs-profile) and CDK stack to build an accurate component/responsibility table and data-flow diagram; derive AHP pseudocode including the verified Saaty random-index table; independently verify the RI(5)=1.12 value rather than assume it from memory.
- **Output Used:** Design Review Package, Sections 3, 4, and 5.
- **Affected Section / Artifact:** Sections 3, 4, 5.
- **Human Verification:** Components and code lines were checked against the Lambda source, but the first draft of the pipeline ordering (Figure 2) was wrong and was corrected after the EventBridge rules were read directly (see Entry 15); the RI(5) value was independently re-verified via search rather than trusted from training knowledge.
- **Final Student Revisions:** Student confirmed the arbitrator scope boundary drawn in Figure 2 matches the charter's Section 9 (Out-of-Scope) boundary exactly, and directed which real Bedrock prompt fields to show as the API contract example.

## Entry 12 — Test and Evaluation Plan, Traceability Matrix

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 4, full drafting
- **Purpose:** Design a concrete, evidence-producing test and evaluation plan, including a defined synthetic-case matrix with ground-truth answers, and trace every RU-03 requirement to a design component and test method.
- **Prompt / Task Summary:** Define test types, metrics, acceptance thresholds, and comparison logic for SC1-SC5; construct a concrete synthetic case matrix varying species match, urgency, distance, capacity, and vet availability with expert-annotated expected outcomes; design a sensitivity/perturbation check answering the Week 2 supervisor-feedback request for a fairness check.
- **Output Used:** Design Review Package, Sections 8 and 9.
- **Affected Section / Artifact:** Sections 8, 9.
- **Human Verification:** The synthetic case matrix was checked by the student for domain plausibility before being accepted as ground truth.
- **Final Student Revisions:** Student set the specific perturbation design (±1 Saaty-scale step, one judgment at a time) for the sensitivity check and decided the highest-risk dependency call in Section 10.

## Entry 13 — Environment, API Contracts, and Supervisor Review Drafting

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 4, full drafting
- **Purpose:** Document the real environment/toolchain plan and API contracts, and draft a genuine supervisor-review request rather than a self-review disclosure, directly applying the Week 3 feedback that a disclosed self-check does not substitute for the assignment-required review.
- **Prompt / Task Summary:** Confirm real runtime/dependency versions from package.json, tsconfig.json, and the CDK stack; pull a real Bedrock request payload from needs-profile/index.ts as the API contract example rather than a fabricated one; draft a short, sendable message requesting actual supervisor review of this package's highest-risk item before the deadline.
- **Output Used:** Design Review Package, Sections 6, 7, and 11.
- **Affected Section / Artifact:** Sections 6, 7, 11.
- **Human Verification:** Every version number and dependency in Section 6 was confirmed directly against package.json/tsconfig.json/cdk.json, not assumed from the Week 1 environment snapshot.
- **Final Student Revisions:** Student sent the supervisor-review email (Sep 26, 5:55 PM EDT) after the AI-drafted text was shortened and made more conversational at the student's direction; a follow-up on the later design change was sent at 7:14 PM EDT.

## Entry 14 — Design Revision: Dynamic Archetype-Blended Weighting

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 4 (2026-09-26), design revision before Hard Stop 2 submission
- **Purpose:** Resolve the student's question of whether routing should use one settled weight set or case-specific weights, by checking what the code actually does and revising the design accordingly.
- **Prompt / Task Summary:** Re-read lambda/needs-profile/index.ts and lambda/arbitrator/index.ts to establish that weights are already generated per case by an unseeded Bedrock call; lay out three design options (single AHP set, AHP per archetype, LLM-only); revise the Design Review Package for the chosen option.
- **Output Used:** Revised Sections 2.2, 3, 4, 5, 7, 8, 9, 10, and 11 of the Design Review Package, including the archetype-blend method, the expanded test plan, and the frozen-v1 comparison design.
- **Affected Section / Artifact:** Most of the Design Review Package; also corrects the Hard Stop 1 framing of "constant hand-picked weights."
- **Human Verification:** The claim that weights are already per-case was verified against the source, not assumed; the species-check defect's real scope was re-checked against the hard-constraint filter and downgraded accordingly.
- **Final Student Revisions:** Student chose the archetype-blending option and directed that the design be as dynamic as possible, accepting the scope expansion into needs-profile. The three archetypes and all thresholds marked provisional are AI proposals for the student and supervisor to confirm or change.

## Entry 15 — Rubric Audit and Corrections

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 4 (2026-09-26), audit before Hard Stop 2 submission
- **Purpose:** Check the Design Review Package against the RU-04 rubric and the assignment task list, and close the gaps found.
- **Prompt / Task Summary:** Compare each section with the five rubric criteria and nine tasks; re-read lib/stacks/lambda-stack.ts for the real event wiring; re-check every reader and writer of NEEDS_TABLE; add the missing tradeoff analysis, setup steps, data-validation steps, failure-mode table, interface table, revised success criteria, Figure 3, and the risks, dependencies, and gaps lists.
- **Output Used:** Sections 2.3, 3 (interface table), 5.4, 6.1 to 6.3, 8 (failure modes), 9 (revised success criteria), 11 (three-part lists), Figures 2 and 3; corrections to the RU-03 brief and engineering log.
- **Affected Section / Artifact:** Most of the Design Review Package, the RU-03 repository copy, ENGINEERING_LOG.md.
- **Human Verification:** The event fan-out was read from the EventBridge rules; the unused needs table was confirmed by searching every reference to NEEDS_TABLE. Both showed earlier AI-drafted claims were wrong (Entry 9 said every table and access pattern was confirmed against source, but the duplicated-needs-profile finding had been inferred, not verified), which is why they are disclosed.
- **Final Student Revisions:** Student requested the rubric check. Whether to tell the instructor about the RU-03 correction is the student's decision. Figures 2 and 3 were drawn by the AI as SVG from the verified design.

## Entry 16 — Incorporating the Supervisor's Response

- **Tool:** Claude (Anthropic, Claude Sonnet 5)
- **Date / Phase:** Week 4 (2026-09-28), revision after supervisor reply
- **Purpose:** Read the supervisor's actual reply to the two emailed requests and revise the design and Section 11 to act on it, rather than only disclosing that a reply was expected.
- **Prompt / Task Summary:** Open and quote the supervisor's Sep 27, 8:59 PM EDT reply approving the three-archetype approach and requiring the blend to be explicit about being deterministic, documented, and reproducible; add that explicit statement to Section 5.3; update Section 11 with the quoted response and what was and was not directly addressed; note the class-wide deadline extension to Sep 29 and that this revision is being made to act on the response, not merely to use extra time.
- **Output Used:** Revised Sections 5.3 and 11 of the Design Review Package.
- **Affected Section / Artifact:** Sections 5.3, 11.
- **Human Verification:** The quoted reply was read directly from Outlook, not paraphrased from memory; the Canvas assignment page was checked directly for the real extended availability date (Sep 29, 11:59 PM) rather than computing it from the announcement's "two days" wording alone.
- **Final Student Revisions:** Student decided that the second-judge and evidence-base questions, not directly addressed in the reply, would be treated as resolved by proceeding rather than re-asked, consistent with the decision to stop emailing and document instead.

---

## Prior AI Use (ISEM 502 / GRAD 695, narrative summary — predates this schema)

AI-assisted development spanned the earlier coursework this project descends from: code and infrastructure implementation (CDK stacks, Lambda functions, GraphQL schema, mobile app), the GRAD 695 Applied Project Report and its figures, and the ISEM 502 UX Portfolio (personas, heuristic evaluation, prototypes), all drafted from student direction and reviewed by the student. No AI-generated or fabricated user-research data was presented as real at any point; where a course step assumed data unavailable to the student, the constraint was disclosed rather than simulated.
