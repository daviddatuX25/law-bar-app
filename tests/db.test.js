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
        elements_checklist: ['Intent to convey'],
        common_confusion: 'Confused with Fee Tail',
        distinguishing_fact: 'Fee simple is devisable.'
      }
    ],
    shapes: [
      {
        id: 'shape-1',
        shape_text: 'Conveyance to A and his heirs',
        frequency: 5,
        provisions: [{ id: 'prov-1', is_primary: 1 }]
      }
    ],
    trigger_words: [
      {
        shape_id: 'shape-1',
        word: 'heirs',
        is_ambiguous: 0,
        distinguishing_fact: null
      }
    ],
    decoy_pairs: [],
    flashcards: [
      {
        id: 'fc-1',
        shape_id: 'shape-1',
        source_citation: 'Restatement § 1',
        source_paragraph_id: 'source-1:p1'
      }
    ]
  });
  const testFc = db.getFlashcards('subject-1');
  assert.strictEqual(testFc[0].source_paragraph_id, 'source-1:p1');
  assert.strictEqual(testFc[0].source_paragraph_text, 'A fee simple absolute is the largest estate known to the law.');

  // Restore initial subject data
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

  // Test getSourcesForSubject
  const sourcesForSub = db.getSourcesForSubject('subject-1');
  assert.strictEqual(sourcesForSub.length, 1);
  assert.strictEqual(sourcesForSub[0].id, 'source-1');
  assert.strictEqual(sourcesForSub[0].title, 'Restatement of Property');

  // Test getParagraphMapping
  const mapping = db.getParagraphMapping('p2');
  assert.ok(mapping);
  assert.strictEqual(mapping.paragraph.anchor_id, 'p2');
  assert.strictEqual(mapping.paragraph.content_text, 'If there is a Conveyance to A for life, it is a life estate.');
  assert.strictEqual(mapping.shapes.length, 1);
  assert.strictEqual(mapping.shapes[0].id, 'shape-2');
  assert.strictEqual(mapping.shapes[0].triggers.length, 1);
  assert.strictEqual(mapping.shapes[0].triggers[0].word, 'life');

  // Test getParagraphMapping with linked flashcards and getSource cardCount
  // 1. Manually insert a flashcard linked to 'source-1:p2'
  db.runWriteQuery(
    "INSERT INTO flashcards (id, subject_id, shape_id, source_citation, source_paragraph_id) VALUES (?, ?, ?, ?, ?)",
    ['fc-test-p2', 'subject-1', 'shape-2', 'Restatement § 2', 'source-1:p2']
  );

  // 2. Query getSource and verify cardCount
  const sourceWithCount = db.getSource('source-1');
  assert.strictEqual(sourceWithCount.paragraphs[1].cardCount, 1);
  assert.strictEqual(sourceWithCount.paragraphs[0].cardCount, 0);

  // 3. Query getParagraphMapping and verify related flashcards
  const mappingWithCards = db.getParagraphMapping('source-1:p2');
  assert.ok(mappingWithCards);
  assert.ok(Array.isArray(mappingWithCards.flashcards));
  assert.strictEqual(mappingWithCards.flashcards.length, 1);
  assert.strictEqual(mappingWithCards.flashcards[0].id, 'fc-test-p2');
  assert.strictEqual(mappingWithCards.flashcards[0].shape_text, 'Conveyance to A for life');
});

test('SQLite Foreign Key Enforcement', () => {
  const db = new DbAdapter(':memory:');
  db.initialize();
  
  assert.throws(() => {
    db.runWriteQuery("INSERT INTO sources (id, title, subject_id) VALUES ('source-orphan', 'Title', 'non-existent-subject')");
  }, /FOREIGN KEY constraint failed/);
});

test('Source Paragraph Deletion Nullifies Flashcard Link', () => {
  const db = new DbAdapter(':memory:');
  db.initialize();

  db.runWriteQuery("INSERT INTO subjects (id, name) VALUES ('subj-1', 'Test Subject')");
  db.runWriteQuery("INSERT INTO sources (id, title, subject_id) VALUES ('src-1', 'Test Source', 'subj-1')");
  db.runWriteQuery("INSERT INTO source_paragraphs (id, source_id, anchor_id, content_text) VALUES ('para-1', 'src-1', 'p1', 'Some content')");
  db.runWriteQuery("INSERT INTO shapes (id, subject_id, shape_text) VALUES ('shape-1', 'subj-1', 'Test Shape')");
  db.runWriteQuery(
    "INSERT INTO flashcards (id, subject_id, shape_id, source_citation, source_paragraph_id) VALUES (?, ?, ?, ?, ?)",
    ['card-1', 'subj-1', 'shape-1', 'Test Citation', 'para-1']
  );

  let card = db.db.prepare("SELECT * FROM flashcards WHERE id = 'card-1'").get();
  assert.strictEqual(card.source_paragraph_id, 'para-1');

  // Delete the source paragraph
  db.runWriteQuery("DELETE FROM source_paragraphs WHERE id = 'para-1'");

  // Verify the flashcard's source_paragraph_id is null and NO error was thrown
  card = db.db.prepare("SELECT * FROM flashcards WHERE id = 'card-1'").get();
  assert.strictEqual(card.source_paragraph_id, null);
});



