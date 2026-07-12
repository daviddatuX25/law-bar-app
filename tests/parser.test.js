const test = require('node:test');
const assert = require('node:assert');
const { parseMarkdown } = require('../parser');

test('Parser Ingestion Validation - Valid Card', () => {
  const md = `
CARD civil-1
FRONT (shape): Two buyers, one immovable, one registered.
FRONT (trigger words): double sale, registered first
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Double sale of same property
2. Valid title
BACK (common confusion): Art. 1458 - Contract of Sale :: Distinction is double sale requires two sales.
SOURCE: Civil Code Art. 1544
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.data.length, 1);
  assert.strictEqual(result.errors.length, 0);

  const card = result.data[0];
  assert.strictEqual(card.id, 'civil-1');
  assert.strictEqual(card.shape, 'Two buyers, one immovable, one registered.');
  assert.deepStrictEqual(card.triggers, ['double sale', 'registered first']);
  assert.strictEqual(card.provision, 'Art. 1544 - Double Sale');
  assert.deepStrictEqual(card.elements, ['Double sale of same property', 'Valid title']);
  assert.strictEqual(card.confusion, 'Art. 1458 - Contract of Sale :: Distinction is double sale requires two sales.');
  assert.strictEqual(card.source, 'Civil Code Art. 1544');
});

test('Parser Ingestion Validation - Missing Shape', () => {
  const md = `
CARD civil-2
FRONT (trigger words): double sale, registered first
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Double sale of same property
SOURCE: Civil Code Art. 1544
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.data.length, 0);
  assert.ok(result.errors.some(err => err.includes('Missing shape description')));
});

test('Parser Ingestion Validation - Missing Triggers', () => {
  const md = `
CARD civil-3
FRONT (shape): Two buyers, one immovable, one registered.
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Double sale of same property
SOURCE: Civil Code Art. 1544
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.data.length, 0);
  assert.ok(result.errors.some(err => err.includes('Missing trigger words')));
});

test('Parser Ingestion Validation - Missing Provision', () => {
  const md = `
CARD civil-4
FRONT (shape): Two buyers, one immovable, one registered.
FRONT (trigger words): double sale, registered first
BACK (elements):
1. Double sale of same property
SOURCE: Civil Code Art. 1544
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.data.length, 0);
  assert.ok(result.errors.some(err => err.includes('Missing controlling provision')));
});

test('Parser Ingestion Validation - Non-numbered Elements', () => {
  const md = `
CARD civil-5
FRONT (shape): Two buyers, one immovable, one registered.
FRONT (trigger words): double sale, registered first
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
- Double sale of same property
- Valid title
SOURCE: Civil Code Art. 1544
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.data.length, 0);
  assert.ok(result.errors.some(err => err.includes('Elements checklist must be a numbered list')));
});

test('Parser Ingestion Validation - Missing Source', () => {
  const md = `
CARD civil-6
FRONT (shape): Two buyers, one immovable, one registered.
FRONT (trigger words): double sale, registered first
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Double sale of same property
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.data.length, 0);
  assert.ok(result.errors.some(err => err.includes('Missing source citation')));
});

test('Parser Ingestion Validation - Multiple Cards (One Valid, One Invalid)', () => {
  const md = `
CARD civil-valid
FRONT (shape): Two buyers, one immovable, one registered.
FRONT (trigger words): double sale, registered first
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Double sale of same property
SOURCE: Civil Code Art. 1544

CARD civil-invalid
FRONT (shape): Two buyers
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Double sale of same property
SOURCE: Civil Code Art. 1544
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, false);
  // Valid card should be in data, invalid card should NOT be in data
  assert.strictEqual(result.data.length, 1);
  assert.strictEqual(result.data[0].id, 'civil-valid');
  assert.strictEqual(result.errors.length, 1);
  assert.ok(result.errors[0].includes('Missing trigger words'));
});

test('Parser Ingestion Validation - Parse SOURCE_PARAGRAPH', () => {
  const md = `CARD civil-10
FRONT (shape): Double buyers.
FRONT (trigger words): double, buy
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Element 1
BACK (common confusion): Confusion :: Fact
SOURCE: Civil Code Art. 1544
SOURCE_PARAGRAPH: civil-code-p1544`;
  const res = parseMarkdown(md);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.data[0].source_paragraph_id, 'civil-code-p1544');
});

test('Parser Ingestion Validation - Parse ALAC Questions', () => {
  const md = `
CARD civil-1
FRONT (shape): Two buyers, one immovable, one registered.
FRONT (trigger words): double sale, registered first
BACK (provision): Art. 1544 - Double Sale
BACK (elements):
1. Double sale of same property
SOURCE: Civil Code Art. 1544

### ALAC QUESTIONS

QUESTION civil-alac-1
SUBJECT: civil-law
QUESTION_TEXT: A sold to B...
LINKED_FLASHCARDS: civil-1, civil-2
  `;
  const result = parseMarkdown(md);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.alac_questions.length, 1);
  assert.strictEqual(result.alac_questions[0].id, 'civil-alac-1');
  assert.strictEqual(result.alac_questions[0].subject_id, 'civil-law');
  assert.strictEqual(result.alac_questions[0].question_text, 'A sold to B...');
  assert.deepStrictEqual(result.alac_questions[0].linked_flashcard_ids, ['civil-1', 'civil-2']);
});

