# Hard Stop 4: recorded walkthrough script (about 10 minutes, worth 10 points)

Talk naturally from these points; do not read them out. Record the screen with your voice (QuickTime or Teams), then upload it to Canvas as a media recording or file. The rubric asks for "the implemented components, key code pathways, tests, benchmarks, evidence, and any scope adjustments."

## Before you press record (5 minutes)
- Terminal in the repo: `cd ~/Downloads/rescuenet && git checkout sprint-4/ablation && nvm use` (Node 20).
- Have these open in tabs: the evidence document (Sections 3 and 4), `docs/ABLATION_PREREGISTRATION.md`, `eval/ablation.ts`.
- Pre-type (do not run) the commands below so you only press Enter.
- Do one dry run without recording.

## 1. What and why (0:00 to 1:00)
Say: this is RescueNet's routing evaluation. Hard Stop 3 left a puzzle: the old LLM weights and the new AHP blend picked the same shelter every time. The question this week: does the scoring formula or the weighting method limit correctness?
Show: Section 2 of the document.

## 2. Pre-registration, so the result could not be tuned (1:00 to 2:15)
Show: `git log --format='%h %ad %s' --date=format:'%b %d %H:%M' -12`
Say: the cases and annotations were committed first, then the pre-registration with the hypotheses and decision rules, then your approval of the annotations, and only then the first result. Point at the timestamps. Open `docs/ABLATION_PREREGISTRATION.md` and read the four hypotheses.

## 3. The design and the key code (2:15 to 3:45)
Show: `eval/ablation.ts` at `FORMULAS` and `scoreWith`.
Say (your words): four formulas, four weighting methods, 16 cells, same cases and same hard constraints, so each comparison changes one thing. F0 is the production formula and a test pins it to the arbitrator's code. F1 counts open capacity once, because it currently feeds two terms.
Show: `npx jest test/ablation.test.ts` (14 tests).

## 4. The run and the evidence (3:45 to 6:15)
Run: `npx ts-node scripts/run-ablation.ts`
Point at, in order:
1. The F0 row: all four weighting methods score 7 of 12, including equal weights.
2. The F1 row: case-specific weights reach 9 and 10; equal weights stay at 7.
3. The H1 lines: formula swaps change winners in 20.8% of pairs, weight swaps in 11.1%.
4. The contrasts: nothing is statistically distinguishable (smallest p = 0.25). Say that clearly.
5. The control line: SYN-16 correct in every cell.

## 5. What it means, and what it does not (6:15 to 7:45)
Say: weights matter only once the formula lets them. Blend and top are nearly identical because the classifier's probabilities are close to one-hot. Blend beats the old method by one case at most.
Then the honest part: twelve cases; one annotator; I (with the AI) wrote the second case set and the formula variants, so a good score for them is a lead, not proof; one fixture contained a bid production never sends (SYN-04), so I report a labelled post-hoc variant.

## 6. Error handling and the deployed system (7:45 to 8:45)
Show: Section 4.7 of the document.
Say: malformed model output falls back to the safest vector; 12 malformed cases and the mocked handler tests pass; on the deployed pipeline, 13 of 13 cases assigned, no errors, about 24 seconds, rollback in 7 seconds. Optional: run `scripts/demo-e2e.sh --auto --scenario=routine` and let the final lines show. (It posts to the test Slack channels.)

## 7. AI use and your own review (8:45 to 9:30)
Say: the AI wrote nearly all the code and the second case set. What I checked myself: (say two or three specific things you read and one thing you challenged, from your review notes in Section 1.3). The annotations I read and approved. I did not read every line of generated code, and the document says so.

## 8. Next steps and the supervisor prompt (9:30 to 10:00)
Say: the result that most changes my priorities is the interaction: fix the formula (with a minimum-capacity rule) before more work on weights or calibration. Next: supervisor review, an independent annotator, expert-proposed formula variants, then re-run the same grid on fresh cases.

## If you run long
Cut section 6's live demo and shorten section 3. Keep sections 2, 4, 5 and 7: they carry the grade.
