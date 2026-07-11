const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { execSync } = require('child_process');
const { DbAdapter } = require('../db');

test('Backfill migration script matches and links flashcards correctly', () => {
  const testDbPath = './backfill_test.db';
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const db = new DbAdapter(testDbPath);
  db.initialize();

  // Seed minimal data required for testing the backfill script
  db.insertSubjectData('civil-law', {
    subjectName: 'Civil Law',
    sources: [
      {
        id: 'civil-code',
        title: 'Civil Code of the Philippines',
        paragraphs: [
          {
            id: 'p1544',
            text: 'Article 1544. If the same thing should have been sold to different vendees...'
          },
          {
            id: 'p1545',
            text: 'Article 1545. For the conditions and warranties...'
          }
        ]
      }
    ],
    provisions: [
      {
        id: 'prov-1544',
        citation: 'Art. 1544',
        short_title: 'Double Sale',
        elements_checklist: [],
        common_confusion: '',
        distinguishing_fact: ''
      },
      {
        id: 'prov-1545',
        citation: 'Article 1545',
        short_title: 'Condition/Warranty',
        elements_checklist: [],
        common_confusion: '',
        distinguishing_fact: ''
      }
    ],
    shapes: [
      {
        id: 'shape-1544',
        shape_text: 'Double sale of land',
        frequency: 1,
        provisions: [{ id: 'prov-1544', is_primary: 1 }]
      },
      {
        id: 'shape-1545',
        shape_text: 'Condition failure',
        frequency: 1,
        provisions: [{ id: 'prov-1545', is_primary: 1 }]
      }
    ],
    trigger_words: [],
    decoy_pairs: [],
    flashcards: [
      {
        id: 'fc-1',
        shape_id: 'shape-1544',
        source_citation: 'Art. 1544'
      },
      {
        id: 'fc-2',
        shape_id: 'shape-1545',
        source_citation: 'Article 1545'
      },
      {
        id: 'fc-3',
        shape_id: 'shape-1544',
        source_citation: 'Art. 9999' // No matching article
      }
    ]
  });

  // Verify they start with source_paragraph_id as NULL
  const initialCards = db.db.prepare("SELECT id, source_paragraph_id FROM flashcards").all();
  assert.strictEqual(initialCards.find(c => c.id === 'fc-1').source_paragraph_id, null);
  assert.strictEqual(initialCards.find(c => c.id === 'fc-2').source_paragraph_id, null);
  assert.strictEqual(initialCards.find(c => c.id === 'fc-3').source_paragraph_id, null);

  // Close connection so child process can write to SQLite without locking issues
  db.db.close();

  // Run the backfill migration script in a subprocess with DATABASE_PATH env variable
  try {
    execSync('node scripts/backfill-flashcard-sources.js', {
      env: {
        ...process.env,
        DATABASE_PATH: testDbPath
      },
      stdio: 'inherit'
    });
  } catch (err) {
    assert.fail(`Backfill script execution failed: ${err.message}`);
  }

  // Re-open DB and verify the results
  const verifyDb = new DbAdapter(testDbPath);
  verifyDb.initialize();

  const updatedCards = verifyDb.db.prepare("SELECT id, source_paragraph_id FROM flashcards").all();
  const fc1 = updatedCards.find(c => c.id === 'fc-1');
  const fc2 = updatedCards.find(c => c.id === 'fc-2');
  const fc3 = updatedCards.find(c => c.id === 'fc-3');

  assert.strictEqual(fc1.source_paragraph_id, 'civil-code:p1544', "fc-1 should be linked to civil-code:p1544 (matching 'Art. 1544')");
  assert.strictEqual(fc2.source_paragraph_id, 'civil-code:p1545', "fc-2 should be linked to civil-code:p1545 (matching 'Article 1545')");
  assert.strictEqual(fc3.source_paragraph_id, null, "fc-3 should remain unlinked (no matching paragraph)");

  // Clean up
  verifyDb.db.close();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});
