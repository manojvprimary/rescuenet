# Student-led review record (verbatim; written by the student, recorded by the AI without editing)

Recorded in a chat session on 2026-10-25 (evening), item by item. The AI showed a piece of code with questions; the student's replies are copied exactly as typed, including questions the student asked back. The AI's answers to those questions are recorded separately, marked as the AI's.

## Item 1: scoring function (`lambda/shared/match.ts`, `computeMatchScore`)

**Q1. Open slots count twice (inside pickup urgency and again as long-term care). Does that make sense? What would you change?**
Student: "lets count it once so it's not skewed"

**Q2. The result is multiplied by confidence and a freshness factor (STATIC = 0.55). Reasonable, or can it override the weights?**
Student (as a question): "whats a confidence score for a shelter where do we get it from?"

**Q3. A shelter that can only arrange a vet scores 0.6 against 1.0 for one with a vet on site. Defensible for an injured animal?**
Student (as a question): "shouldn't other factors like injuries dictate this? are we using static weights and not having the agent "smartly" manage them?"

**Q4. Anything unclear?** (not answered separately; the questions above show what the student wanted explained)

### Follow-up on Item 1 (after the AI answered the student's questions)

AI's answers, recorded as the AI's (not the student's): the tier-1 `confidence` and `estimatedIntakeWindowMinutes` come from a Bedrock call whose prompt gives the shelter's live facts (slots, vet, species, distance/radius) and the case's needs profile and summary, and shows an example reply of 0.92 and 20; there is no knowledge base, no shelter history, no definition of "confidence", no calibration, and no temperature set. Tier-2 (Slack) shelters use a fixed 0.78 and 45 minutes. Freshness is LIVE for tier 1 and HUMAN for tier 2; SYNCED and STATIC are never assigned in the code. The net effect is that Slack shelters start roughly 25 to 30 percent behind.

**Student, on whether the confidence number is acceptable:**
"what's a guess here? is it an informed decision the agent makes against a knowledge base or a prompt we set up? if yes then that works, if it's a random guess then no. slack starting 30% behind is ok"

**Student, on the fixed constants versus agent-generated weights:**
"lets keep it fixed for now and keep looking into agent generated weights and how we can reproduce them"

(Student decisions recorded: count open capacity once in a future formula change; keep the formula's constants fixed for now; Slack shelters starting about 30 percent behind is acceptable; investigate agent-generated weights and their reproducibility.)

## Item 2: weight blend and fallback (`lambda/shared/weights.ts`, `deriveWeights`)
**Q1. The fallback for unusable classifier output is the least urgent type (STABLE_ROUTINE). Is that the right safe default? What would you choose?**
Student: "how do we stop it from returning garbage? i would treat a case we dont have visibility into at highest severity. better to be safe than sorry"

**Q2. Probabilities that do not sum to 1 are silently rescaled. OK, or a failure?**
Student: "ok to rescale them as long as the original ratios are retained"

**Q3. Anything unclear?** (not answered separately)

(Student decision recorded: when the classifier output is unusable, treat the case as highest severity (INJURED_CRITICAL), not as STABLE_ROUTINE. This reverses the design in Hard Stop 2, Section 5.3, and is not yet implemented: it will change `FALLBACK_ARCHETYPE`, the SYN-08 expectation, the tests, and the deployed function. Rescaling is acceptable because dividing by the total keeps the ratios exactly.)

## Item 3: the classifier path (`needs-profile` v2, `parseClassifierResponse`, and the failure handling)
**Q1. The parser rejects `accepts_species:Dog` (capital D) and discards the whole response. Too strict, about right, or too loose?**
Student: "yes this is alright for now, but we should look into temporary options where a shelter that wouldn't normally take in dogs would be willing to at least treat injuries if any or hold for a while until another shelter confirms they can take it in"

**Q2. On failure the fallback looks for injuries only in the photo analysis, so a text-only report ("bleeding, can't stand") would not require a vet. Should a failed classifier always require a vet?**
Student: "not a failed classifier but can we not do only photo analysis - it's the whole reason we have free text input"

**Q3. If the AI call hangs, the function times out and the arbitrator falls back to a hard-coded profile with no constraints. Acceptable?**
Student: "acceptable"

(Student decisions recorded: the strict parser is acceptable for now. Future idea raised by the student: temporary emergency options, where a shelter that would not normally take a species can treat injuries or hold the animal until a suitable shelter confirms. Injury detection must not depend only on photo analysis: free text must count, because free text is the reason the input exists. The arbitrator's hard-coded default profile is acceptable.)

## Item 4: the evaluation harness tie rule (`eval/harness.ts`, `pickWinner`)
**Q1. The tie rule gives a near-tie (within 0.02) to the alphabetically smaller shelter id. Keep it, or report near-ties as undecided?**
Student: "we should have an ultimate tie breaker like distance or how well shelters have responded previously - maybe as a future feature. for now alphabetical works"

**Q2. The ablation excludes cases decided entirely by a hard constraint (only one eligible shelter). Right call?**
Student: "unclear."
(AI note: the question was not clear. It was re-asked in simpler terms: such cases give every method the same answer, so counting them would raise all scores equally and say nothing about the weights.)
Student, after the simpler explanation: "yes, it's ok to leave those cases out of comparison"

(Student decision recorded: alphabetical tie-break is acceptable for now; a proper tie-breaker such as distance or a shelter's past responsiveness is a future feature.)

## Item 5: the ablation hypotheses and five AHP judgments
(awaiting the student's answers)
