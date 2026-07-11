# Sample Input/Output Markdown Format

This sample shows the target Markdown format expected by `parser.js`. The incoming generator agent must output exactly this format.

---

## Standard Flashcard Ingestion Format

```
CARD civil-1
FRONT (shape): Two buyers, one immovable, one registered first in good faith.
FRONT (trigger words): double sale, registered first, in good faith
BACK (provision): Art. 1544 - Double Sale of Immovable
BACK (elements):
1. Two or more valid sales contracts
2. Entered by the same vendor
3. Concurring on the same subject matter (an immovable property)
4. Competitors hold conflicting interests
5. The winning buyer recorded the sale first in the Registry of Property in good faith
BACK (common confusion): Art. 1409 (Void Contracts) :: If one of the competing sales is void from inception (e.g. forged deed from non-owner), it is nullity under Art. 1409, not double sale.
SOURCE: Civil Code Art. 1544
```

---

## Decoy Card Ingestion Format

Decoy cards are mapped as relations inside `decoy_pairs`. If the incoming agent wants to declare decoy pairs, they can write them as a list at the bottom of the subject markdown file:

```markdown
### DECOY PAIRS

DECOY decoy-double-forged
SUBJECT: civil-law
SHAPE_A: shape-double-sale
SHAPE_B: shape-forged-deed
SHARED_TRIGGER: forged deed
DISTINQUISHING_FACT: If the forged deed is used to sell the owner's land to a second buyer by a third party, it is nullity. If the owner selling to A is forced by B under a forged deed, it is void.
```
