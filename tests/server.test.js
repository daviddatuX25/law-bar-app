const test = require('node:test');
const assert = require('node:assert');
const { DbAdapter } = require('../db');
const { startServer } = require('../server');

test('Express Server API routes', async (t) => {
  const db = new DbAdapter(':memory:');
  db.initialize();

  // Seed mock database data
  db.insertSubjectData('subject-1', {
    subjectName: 'Real Property',
    sources: [
      {
        id: 'source-1',
        title: 'Restatement of Property',
        paragraphs: [
          {
            id: 'p1',
            text: 'A fee simple absolute is the largest estate known to the law.'
          },
          {
            id: 'p2',
            text: 'If there is a Conveyance to A for life, it is a life estate.'
          }
        ]
      }
    ],
    provisions: [
      {
        id: 'prov-1',
        citation: 'Restatement § 1',
        short_title: 'Fee Simple Absolute',
        elements_checklist: ['Intent to convey', 'No words of limitation'],
        common_confusion: 'Confused with Fee Tail',
        distinguishing_fact: 'Fee simple is devisable and descendible.'
      },
      {
        id: 'prov-2',
        citation: 'Restatement § 2',
        short_title: 'Life Estate',
        elements_checklist: ['Duration for life'],
        common_confusion: 'Confused with Fee Simple',
        distinguishing_fact: 'Life estate terminates at death.'
      }
    ],
    shapes: [
      {
        id: 'shape-1',
        shape_text: 'Conveyance to A and his heirs',
        frequency: 5,
        provisions: [
          { id: 'prov-1', is_primary: 1 }
        ]
      },
      {
        id: 'shape-2',
        shape_text: 'Conveyance to A for life',
        frequency: 3,
        provisions: [
          { id: 'prov-2', is_primary: 1 }
        ]
      }
    ],
    trigger_words: [
      {
        shape_id: 'shape-1',
        word: 'heirs',
        is_ambiguous: 0,
        distinguishing_fact: null
      },
      {
        shape_id: 'shape-2',
        word: 'life',
        is_ambiguous: 0,
        distinguishing_fact: null
      }
    ],
    decoy_pairs: [
      {
        id: 'decoy-1',
        shape_a_id: 'shape-1',
        shape_b_id: 'shape-2',
        shared_trigger: 'A and heirs/life',
        distinguishing_fact: 'Heirs indicates fee simple; life indicates life estate'
      }
    ],
    flashcards: [
      {
        id: 'fc-1',
        shape_id: 'shape-1',
        source_citation: 'Restatement § 1'
      }
    ]
  });

  const server = startServer(db, 3001);

  await t.test('GET /api/subjects returns list of subjects', async () => {
    const res = await fetch('http://localhost:3001/api/subjects');
    assert.strictEqual(res.statusCode || res.status, 200);
    assert.strictEqual(res.headers.get('content-type').includes('application/json'), true);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 1);
    assert.strictEqual(body[0].id, 'subject-1');
    assert.strictEqual(body[0].name, 'Real Property');
  });

  await t.test('GET /deck.html serves the study deck page', async () => {
    const res = await fetch('http://localhost:3001/deck.html');
    assert.strictEqual(res.statusCode || res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Retrieval Deck — Study Mode'));
    assert.ok(text.includes('id="subject-study-dropdown"'));
    assert.ok(text.includes('id="standard-card"'));
    assert.ok(text.includes('id="decoy-container"'));
  });

  await t.test('GET /api/subjects/:id/deck returns flashcards and decoy pairs', async () => {
    const res = await fetch('http://localhost:3001/api/subjects/subject-1/deck');
    assert.strictEqual(res.statusCode || res.status, 200);
    const body = await res.json();
    assert.ok(body.flashcards);
    assert.ok(body.decoys);
    assert.strictEqual(body.flashcards.length, 1);
    assert.strictEqual(body.flashcards[0].id, 'fc-1');
    assert.strictEqual(body.flashcards[0].front_shape, 'Conveyance to A and his heirs');
    assert.strictEqual(body.decoys.length, 1);
    assert.strictEqual(body.decoys[0].id, 'decoy-1');
  });

  await t.test('GET /api/subjects/:id/triggers returns triggers list', async () => {
    const res = await fetch('http://localhost:3001/api/subjects/subject-1/triggers');
    assert.strictEqual(res.statusCode || res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 2);
    assert.ok(body.some(t => t.word === 'heirs'));
  });

  await t.test('GET /api/sources/:id returns a source or 404', async () => {
    // Valid source
    const res = await fetch('http://localhost:3001/api/sources/source-1');
    assert.strictEqual(res.statusCode || res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.id, 'source-1');
    assert.strictEqual(body.paragraphs.length, 2);
    assert.deepStrictEqual(body.paragraphs[1].shapes, ['Conveyance to A for life']);

    // Non-existent source
    const res404 = await fetch('http://localhost:3001/api/sources/non-existent');
    assert.strictEqual(res404.statusCode || res404.status, 404);
  });

  await t.test('POST /api/import validations and execution', async () => {
    // Missing subjectId
    const resMissing = await fetch('http://localhost:3001/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown: 'CARD test\nFRONT (shape): Test\nFRONT (trigger words): t\nBACK (provision): p\nBACK (elements):\n1. el\nSOURCE: src' })
    });
    assert.strictEqual(resMissing.statusCode || resMissing.status, 400);

    // Invalid Markdown Validation Error
    const resInvalid = await fetch('http://localhost:3001/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectId: 'subject-1',
        markdown: 'CARD test\nFRONT (shape): Test\nBACK (provision): p\nSOURCE: src' // Missing trigger words and elements
      })
    });
    assert.strictEqual(resInvalid.statusCode || resInvalid.status, 422);
    const errBody = await resInvalid.json();
    assert.ok(errBody.error);
    assert.ok(errBody.details);

    // Valid Markdown import
    const validMarkdown = `
CARD imported-card-1
FRONT (shape): Conveyance to B forever
FRONT (trigger words): forever
BACK (provision): Restatement 3 - Fee Simple
BACK (elements):
1. Element A
2. Element B
BACK (common confusion): None
SOURCE: Restatement § 3
    `.trim();

    const resSuccess = await fetch('http://localhost:3001/api/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subjectId: 'subject-1',
        markdown: validMarkdown
      })
    });
    assert.strictEqual(resSuccess.statusCode || resSuccess.status, 200);
    const successBody = await resSuccess.json();
    assert.strictEqual(successBody.success, true);
    assert.strictEqual(successBody.count, 1);

    // Verify imported card in database via /api/subjects/subject-1/deck
    const deckRes = await fetch('http://localhost:3001/api/subjects/subject-1/deck');
    const deckBody = await deckRes.json();
    const imported = deckBody.flashcards.find(c => c.id === 'imported-card-1');
    assert.ok(imported);
    assert.strictEqual(imported.front_shape, 'Conveyance to B forever');
    assert.deepStrictEqual(imported.front_triggers, ['forever']);
    assert.strictEqual(imported.back_provision, 'Restatement 3 (Fee Simple)');
    assert.deepStrictEqual(imported.back_elements, ['Element A', 'Element B']);
  });

  // Clean up server
  await new Promise((resolve) => server.close(resolve));
});
