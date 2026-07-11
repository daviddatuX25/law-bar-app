const { DbAdapter } = require('../db');

function seed(dbOrPath) {
  let db;
  if (dbOrPath && dbOrPath instanceof DbAdapter) {
    db = dbOrPath;
  } else {
    const dbPath = typeof dbOrPath === 'string' ? dbOrPath : undefined;
    db = new DbAdapter(dbPath);
    db.initialize();
  }

  // Clean DB
  db.db.exec("DELETE FROM decoy_pairs; DELETE FROM trigger_words; DELETE FROM shape_provisions; DELETE FROM provisions; DELETE FROM flashcards; DELETE FROM shapes; DELETE FROM source_paragraphs; DELETE FROM sources; DELETE FROM subjects;");

  // Subjects
  db.runWriteQuery("INSERT INTO subjects (id, name) VALUES ('civil-law', 'Civil Law')");
  db.runWriteQuery("INSERT INTO subjects (id, name) VALUES ('criminal-law', 'Criminal Law')");

  // Sources
  db.runWriteQuery("INSERT INTO sources (id, title, subject_id) VALUES ('cc', 'Civil Code of the Philippines', 'civil-law')");

  // Paragraphs
  db.runWriteQuery("INSERT INTO source_paragraphs (id, source_id, anchor_id, content_text) VALUES ('cc-1544', 'cc', 'art-1544', 'Article 1544. If the same thing should have been sold to different vendees, the ownership shall be transferred to the person who may have first taken possession thereof in good faith, if it should be movable property. Should it be immovable property, the ownership shall belong to the person acquiring it who in good faith first recorded it in the Registry of Property...')");

  // Provisions
  db.runWriteQuery("INSERT INTO provisions (id, subject_id, citation, short_title, elements_checklist, common_confusion, distinguishing_fact) VALUES ('cc-1544', 'civil-law', 'Art. 1544', 'Double Sale of Immovable', '[\"Two or more valid sales contract\",\"Same vendor\",\"Same subject matter (immovable)\",\"Buyers with conflicting rights\",\"Good faith registration by winner\"]', 'Art. 1458 (Simple Contract of Sale)', 'A double sale specifically requires two distinct valid sales contracts by the same vendor to competing buyers.')");
  db.runWriteQuery("INSERT INTO provisions (id, subject_id, citation, short_title, elements_checklist, common_confusion, distinguishing_fact) VALUES ('cc-1409', 'civil-law', 'Art. 1409', 'Void Contracts (Nullity)', '[\"Absence of essential elements (consent, object, cause)\",\"Illegal cause or object\",\"Contracts declared void by law\"]', 'Art. 1544 (Double Sale)', 'If one of the competing sales is void from inception (forged deed by non-owner), it is nullity under Art. 1409, not double sale.')");

  // Shapes
  db.runWriteQuery("INSERT INTO shapes (id, subject_id, shape_text, frequency) VALUES ('shape-double-sale', 'civil-law', 'Two buyers, one immovable, one registered first in good faith.', 6)");
  db.runWriteQuery("INSERT INTO shapes (id, subject_id, shape_text, frequency) VALUES ('shape-forged-deed', 'civil-law', 'Owner sold to A, then B forged a deed from Owner to C and C registered.', 3)");

  // Shape-Provisions Junction
  db.runWriteQuery("INSERT INTO shape_provisions (shape_id, provision_id, is_primary) VALUES ('shape-double-sale', 'cc-1544', 1)");
  db.runWriteQuery("INSERT INTO shape_provisions (shape_id, provision_id, is_primary) VALUES ('shape-forged-deed', 'cc-1409', 1)");

  // Triggers
  db.runWriteQuery("INSERT INTO trigger_words (shape_id, word, is_ambiguous, distinguishing_fact) VALUES ('shape-double-sale', 'double sale', 0, NULL)");
  db.runWriteQuery("INSERT INTO trigger_words (shape_id, word, is_ambiguous, distinguishing_fact) VALUES ('shape-double-sale', 'registered first', 1, 'Only if both transactions are valid sales originating from the true owner.')");
  db.runWriteQuery("INSERT INTO trigger_words (shape_id, word, is_ambiguous, distinguishing_fact) VALUES ('shape-forged-deed', 'forged deed', 1, 'Nullity shape unless the forgery is between competing valid buyers of same owner.')");

  // Decoy Pairs
  db.runWriteQuery(`
    INSERT INTO decoy_pairs (id, subject_id, shape_a_id, shape_b_id, shared_trigger, distinguishing_fact) 
    VALUES ('decoy-double-forged', 'civil-law', 'shape-double-sale', 'shape-forged-deed', 'forged deed', 'If the forged deed is used to sell the owner''s land to a second buyer by a third party, it''s nullity. If the owner selling to A is forced by B under forged deed, it''s void.')
  `);

  // Flashcards
  db.runWriteQuery("INSERT INTO flashcards (id, subject_id, shape_id, source_citation) VALUES ('fc-double-sale', 'civil-law', 'shape-double-sale', 'Bar 2018 Q4')");
  db.runWriteQuery("INSERT INTO flashcards (id, subject_id, shape_id, source_citation) VALUES ('fc-forged-deed', 'civil-law', 'shape-forged-deed', 'Bar 2015 Q2')");

  console.log('Database seeded successfully.');
}

if (require.main === module) seed();

module.exports = { seed };
