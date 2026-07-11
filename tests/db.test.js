const test = require('node:test');
const assert = require('node:assert');
const { DbAdapter } = require('../db');

test('Database Sync & Retrieval', () => {
  const db = new DbAdapter(':memory:');
  db.initialize();
  
  // Insert initial subject data
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
        elements_checklist: ['Duration for life', 'Reversion or remainder'],
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

  const subjects = db.getSubjects();
  assert.ok(Array.isArray(subjects), 'Subjects should return an array');
  assert.strictEqual(subjects.length, 1);
  assert.strictEqual(subjects[0].id, 'subject-1');
  assert.strictEqual(subjects[0].name, 'Real Property');

  const flashcards = db.getFlashcards('subject-1');
  assert.ok(Array.isArray(flashcards), 'Flashcards should return an array');
  assert.strictEqual(flashcards.length, 1);
  assert.strictEqual(flashcards[0].front_shape, 'Conveyance to A and his heirs');
  assert.deepStrictEqual(flashcards[0].front_triggers, ['heirs']);
  assert.strictEqual(flashcards[0].back_provision, 'Restatement § 1 (Fee Simple Absolute)');
  assert.deepStrictEqual(flashcards[0].back_elements, ['Intent to convey', 'No words of limitation']);
  assert.strictEqual(flashcards[0].back_confusion, 'Confused with Fee Tail');
  assert.strictEqual(flashcards[0].is_decoy, true);
  assert.strictEqual(flashcards[0].decoy_pair_id, 'decoy-1');

  const decoyPairs = db.getDecoyPairs('subject-1');
  assert.ok(Array.isArray(decoyPairs), 'Decoy pairs should return an array');
  assert.strictEqual(decoyPairs.length, 1);
  assert.strictEqual(decoyPairs[0].id, 'decoy-1');
  assert.strictEqual(decoyPairs[0].shape_a, 'Conveyance to A and his heirs');
  assert.strictEqual(decoyPairs[0].provision_a, 'Restatement § 1 (Fee Simple Absolute)');
  assert.strictEqual(decoyPairs[0].shape_b, 'Conveyance to A for life');
  assert.strictEqual(decoyPairs[0].provision_b, 'Restatement § 2 (Life Estate)');
  assert.strictEqual(decoyPairs[0].distinguishing_fact, 'Heirs indicates fee simple; life indicates life estate');

  const triggers = db.getTriggers('subject-1');
  assert.ok(Array.isArray(triggers), 'Triggers should return an array');
  assert.strictEqual(triggers.length, 2);

  const source = db.getSource('source-1');
  assert.ok(source, 'Source should be found');
  assert.strictEqual(source.title, 'Restatement of Property');
  assert.strictEqual(source.paragraphs.length, 1);
  assert.strictEqual(source.paragraphs[0].id, 'p1');
  assert.strictEqual(source.paragraphs[0].text, 'A fee simple absolute is the largest estate known to the law.');
  // Since the paragraph text does not mention the shapes, shapes should be empty
  assert.deepStrictEqual(source.paragraphs[0].shapes, []);

  // Update subject data with paragraph matching shape
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
        shape_id: 'shape-2',
        word: 'life',
        is_ambiguous: 0,
        distinguishing_fact: null
      }
    ],
    decoy_pairs: [],
    flashcards: []
  });

  // Verify that old data was deleted and only new data is present (idempotency check)
  const updatedSubjects = db.getSubjects();
  assert.strictEqual(updatedSubjects.length, 1);

  const updatedFlashcards = db.getFlashcards('subject-1');
  assert.strictEqual(updatedFlashcards.length, 0);

  const updatedDecoyPairs = db.getDecoyPairs('subject-1');
  assert.strictEqual(updatedDecoyPairs.length, 0);

  const updatedSource = db.getSource('source-1');
  assert.strictEqual(updatedSource.paragraphs.length, 2);
  assert.strictEqual(updatedSource.paragraphs[1].id, 'p2');
  // p2 text contains "Conveyance to A for life" which matches shape-2
  assert.deepStrictEqual(updatedSource.paragraphs[1].shapes, ['Conveyance to A for life']);
});

