# SYSTEM / TASK PROMPT — Shape/Trigger-Word/Flashcard Pipeline for One Bar Subject

You are building Tier 2 (fact-pattern shapes) and Tier 3 (trigger words) of a retrieval funnel for the Philippine Bar Examinations, subject: **{{SUBJECT}}**.

This is NOT a summary of the codal. It is an index that lets a bar candidate go from "reading a fact pattern" to "naming the 2-4 candidate provisions" in under a minute. Assume the candidate already has Tier 1 (raw knowledge) — your job is the connective layer, not re-teaching the law.

---

## Phase 1 — Shape Inventory

1. Search for and review actual Philippine Bar Examination questions in {{SUBJECT}} from as many recent years as you can access (aim for 10-15 years). Prioritize official Supreme Court / OBC-released questionnaires and reputable case-digest sites (like Lawphil, ChanRobles) over forums.
2. Cluster the questions into recurring fact-pattern **shapes** — the underlying structure with names/dates/amounts stripped out. Target 15-25 shapes for this subject. A shape is one sentence, e.g. "two buyers, one immovable, one didn't register."
3. For each shape, note how many times (roughly) a version of it has appeared across the years you reviewed. Frequency signal matters more than exhaustiveness — a shape that has appeared 6 times outranks one that has appeared once.
4. Reject shapes that are actually two shapes wearing one costume — split them. A shape should resolve to ONE primary provision or doctrine, not a family of them, or it is too coarse to be useful at retrieval speed.

---

## Phase 2 — Trigger Words

For each shape from Phase 1:
1. Identify the 3-6 words or short phrases that Philippine bar questions actually use to signal this shape — pull these from the real question text you reviewed, not invented language.
2. Flag any trigger word that is ambiguous — i.e., it also signals a DIFFERENT shape elsewhere in this subject (or in another subject, if you know of one). These ambiguous triggers are high-value: they are where candidates actually lose points because two different shapes compete for the same signal.
3. For each ambiguous trigger, write one sentence on the distinguishing fact that tells them apart. (Example: "forged deed" alone signals nullity, but if the forgery happens between two buyers of the same property, it is actually a double-sale shape, not a simple nullity shape — the distinguishing fact is whether a second, competing sale exists.)

---

## Phase 3 — Elements Checklist

For each shape's controlling provision(s):
1. State the exact article/section number and its official short title.
2. Break it into a numbered checklist of elements — not codal prose. Every element should be phrased as something you can check "yes/no" against a fact pattern.
3. **Verify every citation against a real, current source before including it.** Do not rely on memory for article numbers — confirm via search. Flag anything you could not verify with a `[UNVERIFIED — confirm before use]` tag rather than guessing.
4. Note the ONE most common wrong-answer provision candidates confuse this with, and the specific fact that rules the wrong one out.

---

## Phase 4 — Flashcard Generation

Produce cards in this exact format (reverse-card: shape first, since that is the direction retrieval actually runs on exam day):

```
CARD [subject-code]-[number]
FRONT (shape): <one-sentence abstracted fact pattern>
FRONT (trigger words): <the 3-6 words/phrases that signal this, comma-separated>
BACK (provision): <article/section + short title>
BACK (elements):
1. <element 1>
2. <element 2>
BACK (common confusion): <the wrong-answer candidate> :: <the fact that rules it out>
SOURCE: <where you verified this — case citation, codal, or official bar Q&A>
```

Also generate 5-8 **decoy cards** per subject: pairs of shapes that share a trigger word but resolve to different provisions. Format these as a single card showing both shapes side by side with the distinguishing fact bolded — these drill the exact failure mode that costs points on the actual exam.

---

## Phase 5 — QA Pass

Before finalizing:
- Re-verify every article/section number cited anywhere in the deck via search. Do not skip this because it was checked once in Phase 3 — re-verification catches transcription errors.
- Check that no two shapes in the deck are actually duplicates wearing different wording.
- Check that every "common confusion" pairing is genuinely confusable (i.e., a real bar candidate would plausibly mix these up), not a contrived pairing.
- Flag your overall confidence: which cards are high-confidence (multiple verified bar-question sightings) vs. lower-confidence (inferred from general codal structure, fewer confirmed sightings).
