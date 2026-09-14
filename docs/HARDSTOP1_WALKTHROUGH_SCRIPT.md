# Hard Stop 1 — Recorded Walkthrough Script (8–12 minutes, 50 pts)

Talking points only — speak naturally, don't read verbatim. Have the Proposal Approval Package and the architecture diagram (docs/rescuenet-architecture.pdf) open to reference on screen. Target ~1 minute per numbered section below (11 sections ≈ 10–11 min).

## 1. Orient (30–45 sec)
"This is RescueNet — a multi-agent AWS system I built across ISEM 502 and GRAD 695 that routes stray/injured animal reports to shelters. For CISC 699, my supervisor approved a specific, narrower mandate: harden the case-routing algorithm — not rebuild the whole system."

## 2. The problem, and what's confirmed vs. aspirational (60–90 sec)
"I audited the arbitrator's scoring code directly and found two real issues: normalization constants that were hand-picked with no calibration, and a species-match term that's effectively broken — it checks whether an array *exists*, not whether the species actually matches. I verified this by reading the source and by running one real case end-to-end through the live system.
One thing I tightened up this week based on feedback: I now explicitly separate *confirmed* evidence — the code defect, the live test — from *plausible* context, like the New York shelters I've identified as candidate pilot partners but haven't signed anything with. I don't want to overstate where this project actually stands."

## 3. Objectives → success criteria traceability (60 sec)
"Every objective maps to exactly one measurable success criterion — that was a self-check this assignment asked for. Fix the defect → regression test passes. Replace hand-picked weights with AHP → consistency ratio under 0.10. Build a comparison harness → side-by-side report on real and synthetic cases. Deploy without regression → latency and error rate stay flat. Documentation → supervisor sign-off at the Week 7 midpoint."

## 4. AHP protocol — the fully specified version (60–75 sec)
"This is the part reviewer feedback pushed me hardest on last week — I'd only said 'we'll use AHP' without saying how. Now it's fully operational: I'm the primary judge, scoring five factors — vet care, pickup urgency, species specialization, proximity, long-term care — in a 5×5 pairwise matrix on Saaty's 1–9 scale. I derive weights from the matrix, compute a consistency ratio, and if it's 0.10 or above, I redo the judgments before accepting them. That happens in Week 6, after the factors are locked in Week 3 and the harness is built in Week 4."

## 5. Architecture and scope boundary (60 sec) — *show the diagram*
"Here's the full blackboard architecture — reporters and shelters on the outside, the shared case record and event bus in the middle, specialist agents around it. My entire scope this term is one box: the Arbitrator's scoring logic. Everything else — Rekognition, Bedrock, the mobile app, the event bus — is a stable foundation I'm not touching."

## 6. MACP feasibility, briefly (45–60 sec)
"On Machine: Node 20, CDK, and — this is new this week — an actual GitHub remote with an issue tracker, which was the one gap called out in my last review. On Computational: this is deliberately rule-based plus AHP, not machine learning, because I don't have the real case volume yet to train anything credible — that's an honest constraint, not a shortcut. On API: eight live AWS/Slack integrations, all already working, no new vendor agreements needed."

## 7. Project plan and phases (45–60 sec)
"Four phases mapped to the syllabus's 14-week schedule: design and planning through Week 4, implementation through Week 8 — including the AHP session and the midpoint demo — evaluation and reporting through Week 11, then finalization. This submission itself is Hard Stop 1, the Week 2 proposal-approval checkpoint."

## 8. Out of scope, on purpose (30 sec)
"Explicitly not this term: the rest of the shelter-onboarding portal, any real shelter data-sharing agreement, the geocoding fallback defect — that's a real bug but outside my mandate, so it's tracked as a GitHub issue instead of scope creep — and machine-learned weighting, which is a stretch goal at best."

## 9. Risks and ethics (45 sec)
"Biggest risk is real case volume — I likely won't have enough to fully validate calibration, so I'm treating synthetic scenarios as primary evidence and outcome-based calibration as a stretch goal. On ethics: no PII, reports are anonymous by design, so there's no IRB concern for this specific scope."

## 10. What's still conditional (30–45 sec)
"Three things I'm still waiting on from my supervisor: confirmation of the remaining hard-stop dates, whether they want to participate as a second AHP judge or just review my result, and whether the seeded shelter data is an acceptable evidence base for the midpoint given no real shelter partnership yet."

## 11. Close — next evidence, own the decisions (30 sec)
"By Week 4 I'll have the five scoring factors formalized and the evaluation harness designed. The scope calls, the success-criteria thresholds, and resolving the GitHub gap this week instead of deferring it again — those were my calls, not just AI-assisted drafting. Ready for feedback."

---

**Recording tips:**
- Canvas offers "media recording" as a submission type directly on this assignment — use that, or Zoom/QuickTime screen recording if you prefer more control, then upload.
- Do one practice pass without recording first — this script is ~10 minutes read at a natural pace.
- If you go over 12 minutes, cut section 6 (MACP) down to just the GitHub-resolution line and the "no ML this term" line — those are the two feedback-driven points worth keeping.
