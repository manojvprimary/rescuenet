# Ablation pre-registration (Hard Stop 4)

Written and committed **before the first ablation run**. Nothing below may be edited after results exist; later thoughts go in the results document as clearly labelled post-hoc notes.

## Technical question (the one that most needs evidence this week)

Hard Stop 3 showed that the original (v1) and the new (v2) weighting methods choose the same shelter by raw score in every case. The instructor's feedback (Priority 4) asked for a controlled test of whether the **scoring formula** or the **weighting method** is what limits routing correctness. This ablation answers that: *for the same cases, does changing the formula change the winner more often than changing the weights does, and which changes make the annotated best shelter win more often?*

## Design

A 4 x 4 grid, every cell run on the same cases with the same hard constraints, so each comparison changes exactly one thing.

**Scoring formulas** (hypotheses about known weaknesses, KI-11 and R-07; chosen before any run):

| ID | Formula | Change from production |
|---|---|---|
| F0 | production | none (reproduces `lambda/shared/match.ts` exactly; pinned by a test) |
| F1 | capacity counted once | `pickup_urgency` uses only the intake-window term; open slots enter only through `long_term_care` |
| F2 | distance scale 10 km | the proximity term is `1 - distance/10 km` instead of `/30 km` |
| F3 | F1 and F2 together | both changes |

**Weighting methods:** `equal` (0.2 for every factor, i.e. no case-specific weighting), `v1` (the LLM-written weights, frozen from live calls), `blend` (v2: AHP vectors blended by the recorded classifier probabilities), `top` (v2 with the single highest-probability archetype vector).

**Hard constraints** are identical in every cell (rule-based from the report, plus each fixture's species-constraint flag), so weights are the only thing the weighting methods change.

**Cases:** set 1 (8 cases, annotations committed at `fdb6171`) and set 2 (8 new cases, annotations committed at `fe064ca`). Only cases with one annotated best shelter and at least two eligible shelters after the constraints are *informative*; the near-tie case, the fault-injection case, and cases decided entirely by a hard constraint are excluded and listed. SYN-16 is a **control**: it is reported separately and every cell should get it right.

**Primary metric:** the raw top-scoring shelter equals the annotated best shelter (no tie rule). Counts, not percentages; Wilson 95% intervals are shown and are wide.

## Hypotheses and decision rules

- **H1 (formula matters more than weights).** The share of one-factor-only cell pairs whose winners differ is larger for formula swaps than for weighting-method swaps. *Supported* if the formula-swap rate exceeds the weight-swap rate; *not supported* otherwise.
- **H2 (counting capacity once helps).** F1 makes the annotated best shelter win in at least as many informative cases as F0 under every weighting method, and strictly more under at least one. *Refuted* if F1 is worse than F0 under any weighting method.
- **H3 (v2 is no worse than v1).** Under F0, `blend` is correct in at least as many informative cases as `v1`.
- **H4 (the control is sound).** SYN-16 is correct in all 16 cells. Failure means a cell is broken, not that the method is bad, and that cell's other results are not interpreted.
- **H5 (hard-constraint cases).** Cases excluded as uninformative are not counted for or against any method.

## Analysis plan

Paired discordant counts and an exact two-sided sign test for the contrasts F1 vs F0 under each weighting method, `blend` vs `v1` under F0, and `blend` vs `equal` under F0. There is **no** correction for multiple comparisons; with this few cases the p-values are descriptive. The result will be reported even if it contradicts every hypothesis above.

## Known limits (stated now, not discovered later)

- About twelve informative cases; one annotator; no real case. Intervals will be wide and nothing here supports generalization.
- Set 2 annotations were written by the AI assistant, not by the student, before any result existed; the student reviews them and any change before the first run is recorded in the results document.
- The formula variants are the assistant's hypotheses, not shelter-expert judgments; a variant that "wins" is a lead, not a recommendation.
- v1 weights come from one live call per case at the model's default temperature; they could differ on another day. They are frozen for repeatability.
- The classifier probabilities are the first valid response of repeated temperature-0 calls; spread across repeats was reported separately.

## What has and has not happened at the time of writing

Fixtures and annotations for both sets exist and are committed. The frozen v1 profiles and recorded classifier outputs for set 2 exist (32 live calls, none throttled). **No ablation run has been made.**
