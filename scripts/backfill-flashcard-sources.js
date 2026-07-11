const { DbAdapter } = require('../db');
const db = new DbAdapter();
db.initialize();

console.log("Starting backfill migration of flashcard source links...");

const flashcards = db.db.prepare("SELECT * FROM flashcards WHERE source_paragraph_id IS NULL").all();
console.log(`Found ${flashcards.length} unlinked flashcards.`);

let successCount = 0;

// Prepare statements outside the loop to compile queries only once
const selectParagraphStmt = db.db.prepare(`
  SELECT sp.id, sp.content_text 
  FROM source_paragraphs sp
  JOIN sources s ON sp.source_id = s.id
  WHERE s.subject_id = ? AND (sp.anchor_id LIKE ? OR sp.content_text LIKE ?)
`);

const updateFlashcardStmt = db.db.prepare("UPDATE flashcards SET source_paragraph_id = ? WHERE id = ?");

db.db.exec("BEGIN");
try {
  for (const fc of flashcards) {
    // Try to parse the citation for article numbers (e.g. "Art. 1544" or "Article 1544")
    const cit = fc.source_citation;
    const match = cit.match(/\bart(?:icle)?\.?\s*(\d+)/i);
    if (!match) continue;

    const artNum = match[1]; // e.g. "1544"
    
    // Look for a source paragraph under this card's subject containing "p1544" or "Art. 1544"
    const paras = selectParagraphStmt.all(fc.subject_id, `%p${artNum}%`, `%Art%${artNum}%`);
    if (paras.length === 1) {
      updateFlashcardStmt.run(paras[0].id, fc.id);
      successCount++;
      console.log(`Linked card "${fc.id}" ("${cit}") to paragraph "${paras[0].id}"`);
    } else if (paras.length > 1) {
      // Tie-breaker: pick the one where anchor matches exactly
      const exactMatch = paras.find(p => p.id.endsWith(`p${artNum}`));
      if (exactMatch) {
        updateFlashcardStmt.run(exactMatch.id, fc.id);
        successCount++;
        console.log(`Linked card "${fc.id}" ("${cit}") to exact paragraph "${exactMatch.id}"`);
      } else {
        console.log(`Ambiguous match for card "${fc.id}" ("${cit}"): found ${paras.length} options. Skipping.`);
      }
    }
  }
  db.db.exec("COMMIT");
  console.log(`Backfill migration complete. Successfully linked ${successCount} flashcards.`);
} catch (err) {
  db.db.exec("ROLLBACK");
  console.error("Backfill failed:", err.message);
}
