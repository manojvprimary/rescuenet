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
