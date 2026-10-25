# Student-led review guide (about 45 minutes)

**Why this exists.** The Hard Stop 3 feedback (Priority 5) and the Hard Stop 4 rubric (30 points) ask that AI-assisted work be "fully disclosed and **critically reviewed**." Nearly all the code was written by an AI assistant, and the student has not read all of it. This guide lists the highest-risk parts and the questions worth asking of each. **The answers must be yours.** Write what you actually checked and what you would challenge, in your own words, in the record at the end. If you disagree with something, say so: a challenge is worth more than agreement.

**How to use it.** Open each file, find the named function, read it, and answer the questions. Mark each answer *agree*, *disagree*, or *unsure*. For anything *disagree* or *unsure*, write what you would change or ask.

## 1. The scoring function: `lambda/shared/match.ts` (`computeMatchScore`, `isEligible`)
Tests: `test/match.test.ts` (compares it with a copy of the original code).
1. The open-slot count feeds two terms: `pickup_urgency` (via `slotsNorm`) and `long_term_care`. Is counting capacity twice intended? What does it do to a nearer shelter with fewer slots?
2. The final score is multiplied by `confidence` and by a freshness weight (LIVE 1.0, HUMAN 0.88, SYNCED 0.75, STATIC 0.55). Can this multiplier outweigh the weights entirely? Is a stale shelter's penalty reasonable?
3. A shelter that can only *arrange* a vet scores 0.6 against 1.0 for one with a vet on site. Defensible?
4. The constants (slots/5, window/120, distance/30) were hand-picked. Are they plausible for a city like New York?
5. `isEligible`: what happens when a bid has no `acceptedSpecies`? Is that safe?

## 2. The weight blend and fallback: `lambda/shared/weights.ts` (`parseArchetypeProbabilities`, `deriveWeights`, `blendWeights`)
Tests: `test/weights.test.ts`.
1. Probabilities that do not sum to 1 are renormalized. Should they be accepted, or rejected as a sign the model misbehaved?
2. Which malformed outputs reach the STABLE_ROUTINE fallback and which do not? Is falling back to the *least urgent* archetype the right safe default for an injured animal?
3. With near one-hot probabilities, `blend` is almost the top archetype. Does that matter for your claims?

## 3. The classifier path: `lambda/shared/needs-classifier.ts` (`parseClassifierResponse`) and `lambda/needs-profile/index.ts` (`buildArchetypeProfile`)
Tests: `test/needs-profile.test.ts` (Bedrock mocked).
1. What happens if the model returns valid JSON with an extra field, or a constraint such as `accepts_species:guinea pig`? Is the strict pattern too strict or not strict enough?
2. When Bedrock fails, hard constraints come from the rule-based function. Could that exclude every shelter or the right ones?
3. The Lambda timeout is 30 s. Is the fallback reached before the function is killed if Bedrock hangs?

## 4. The evaluation harness: `eval/harness.ts` (`pickWinner`, `runCase`)
Tests: `test/harness.test.ts`.
1. The near-tie rule hands a tie to the smaller shelter id. In your fixtures the annotated best shelter is often the smaller id. Does that bias the result? (It did affect SYN-04 and SYN-05.)
2. How is the expected winner for the fault-injection case (SYN-08) defined, and is it fair?

## 5. The ablation: `eval/ablation.ts` (`scoreWith`, `fixedConstraints`, `summarize`) and `docs/ABLATION_PREREGISTRATION.md`
Tests: `test/ablation.test.ts`.
1. Do the formula variants F1 to F3 test sensible hypotheses, or are they arbitrary? Would a shelter expert propose different ones?
2. Hard constraints are held fixed (rule-based) for every method. Is that fair to v1, which writes its own constraints?
3. Read the hypotheses H1 to H4 and their decision rules. Would you have set the bar differently?

## 6. Five AHP judgments to justify or challenge yourself
Open `eval/ahp/evidence-informed-proposal.json` (or Appendix C of the Hard Stop 3 document). The weakest-supported ones are:
- INJURED_CRITICAL: species vs long-term care (a2); pickup vs proximity (equal).
- URGENT_TRANSIENT: vet vs long-term care (equal); proximity vs long-term care (a7).
- STABLE_ROUTINE: long-term care vs species (b2, evidence is about cats only).
For each, say whether you would give the same value and why, citing your own experience or a source you read.

## 7. The new annotations: `eval/annotations-set2.json`
Read all eight. For each, do you agree the stated shelter is the best answer? Change any you disagree with **before the ablation is run**; anything changed afterwards is recorded as post-hoc.

---

## Your review record (fill in; do not copy wording from this guide)

| Date | File / item | What I checked | What I found or challenged | Decision (keep / change / ask) |
|---|---|---|---|---|
| | | | | |
| | | | | |
| | | | | |
| | | | | |
| | | | | |
