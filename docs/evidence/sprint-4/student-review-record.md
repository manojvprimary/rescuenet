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
