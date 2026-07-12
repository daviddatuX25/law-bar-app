const { DbAdapter } = require('../db');
const db = new DbAdapter();
db.initialize();

console.log("Starting backfill migration of flashcard source links...");

const flashcards = db.db.prepare("SELECT * FROM flashcards WHERE source_paragraph_id IS NULL").all();
console.log(`Found ${flashcards.length} unlinked flashcards.`);

let successCount = 0;

// Prepare statements outside the loop to compile queries only once
const selectByContentStmt = db.db.prepare(`
  SELECT sp.id, sp.content_text 
  FROM source_paragraphs sp
  JOIN sources s ON sp.source_id = s.id
  WHERE s.subject_id = ? AND sp.content_text LIKE ?
`);

const selectByAnchorStmt = db.db.prepare(`
  SELECT sp.id, sp.content_text 
  FROM source_paragraphs sp
  JOIN sources s ON sp.source_id = s.id
  WHERE s.subject_id = ? AND sp.anchor_id LIKE ?
`);

const updateFlashcardStmt = db.db.prepare("UPDATE flashcards SET source_paragraph_id = ? WHERE id = ?");

db.db.exec("BEGIN");
try {
  for (const fc of flashcards) {
    // Try to parse the citation for article, section, or rule numbers
    const cit = fc.source_citation;
    const match = cit.match(/\b(art(?:icle)?s?|sec(?:tion)?s?|rules?)\.?\s*(\d+)/i);
    if (!match) {
      console.log(`Skipped card "${fc.id}" ("${cit}"): citation doesn't match regex`);
      continue;
    }

    const type = match[1].toLowerCase();
    const num = match[2];

    let typeNormalized = "";
    if (type.startsWith("art")) {
      typeNormalized = "Art";
    } else if (type.startsWith("sec")) {
      typeNormalized = "Sec";
    } else if (type.startsWith("rule")) {
      typeNormalized = "Rule";
    }

    const anchorPattern = `%p${num}%`;
    const contentPattern = `%${typeNormalized}%${num}%`;

    // 1. Try to match by content (high precision)
    let paras = selectByContentStmt.all(fc.subject_id, contentPattern);

    // Filter content matches to find ones that contain the exact phrase (e.g. "Article 1544") to prevent matching "Article 15440"
    if (paras.length > 1) {
      const regexExact = new RegExp(`\\b(?:article|art|section|sec|rule)s?\\.?\\s*${num}\\b`, 'i');
      const exactContentMatch = paras.filter(p => regexExact.test(p.content_text));
      if (exactContentMatch.length > 0) {
        // Tie-breaker: prioritize the one that starts with the article/section/rule (defining paragraph)
        const regexStart = new RegExp(`^(?:article|art|section|sec|rule)s?\\.?\\s*${num}\\b`, 'i');
        const startMatch = exactContentMatch.find(p => regexStart.test(p.content_text.trim()));
        if (startMatch) {
          paras = [startMatch];
        } else {
          paras = exactContentMatch;
        }
      }
    }

    // 2. If no content matches found, fall back to anchor match (low precision index fallback)
    if (paras.length === 0) {
      paras = selectByAnchorStmt.all(fc.subject_id, anchorPattern);
    }

    if (paras.length === 1) {
      updateFlashcardStmt.run(paras[0].id, fc.id);
      successCount++;
      console.log(`Linked card "${fc.id}" ("${cit}") to paragraph "${paras[0].id}"`);
    } else if (paras.length > 1) {
      // Tie-breaker: pick the one where anchor matches exactly
      const exactMatch = paras.find(p => p.id.endsWith(`p${num}`));
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
  process.exit(0);
} catch (err) {
  db.db.exec("ROLLBACK");
  console.error("Backfill failed:", err.message);
  process.exit(1);
}
