const test = require('node:test');
const assert = require('node:assert');
const { DbAdapter } = require('../db');
const { seed } = require('../scripts/seed');
const { verify } = require('../scripts/verify-relations');

test('Verification Pipeline detects orphans', () => {
  const db = new DbAdapter(':memory:');
  db.initialize();
  
  // Disable foreign keys to allow manual insertion of orphan decoy
  db.runWriteQuery("PRAGMA foreign_keys = OFF;");
  
  // Manual insert orphan decoy
  db.runWriteQuery("INSERT INTO subjects (id, name) VALUES ('ethics', 'Legal Ethics')");
  db.runWriteQuery("INSERT INTO decoy_pairs (id, subject_id, shape_a_id, shape_b_id, shared_trigger, distinguishing_fact) VALUES ('decoy-1', 'ethics', 'null-a', 'null-b', 'ethics-trigger', 'fact')");

  const stmt = db.db.prepare("SELECT COUNT(*) as count FROM decoy_pairs WHERE shape_a_id NOT IN (SELECT id FROM shapes)");
  const result = stmt.get();
  assert.strictEqual(result.count, 1, 'Should find 1 orphan decoy pair reference');
});

test('Seeder and Relational Verification works', () => {
  const db = new DbAdapter(':memory:');
  db.initialize();
  
  // Run seed on the in-memory db
  seed(db);
  
  // Run verify on the in-memory db
  const isClean = verify(db);
  assert.strictEqual(isClean, true, 'Seeded database should have clean relations');
});

test('Verification Pipeline flags shapes without primary provisions', () => {
  const db = new DbAdapter(':memory:');
  db.initialize();
  
  // Run seed on the in-memory db to get standard schema & tables populated
  seed(db);
  
  // Add a shape without primary provision
  db.runWriteQuery("INSERT INTO shapes (id, subject_id, shape_text, frequency) VALUES ('shape-orphan', 'civil-law', 'Orphan shape', 1)");
  
  // Run verify on this db - should return false
  const isClean = verify(db);
  assert.strictEqual(isClean, false, 'Database with orphan shape should not be clean');
});
