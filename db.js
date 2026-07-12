const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

class DbAdapter {
  constructor(dbPath = process.env.DATABASE_PATH || './bar_exam.db') {
    this.dbPath = dbPath;
    this.db = null;
  }

  initialize() {
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA foreign_keys = ON;");
    const migration = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    this.db.exec(migration);

    // Dynamic migration for existing databases
    try {
      const info = this.db.prepare("PRAGMA table_info(flashcards)").all();
      const hasCol = info.some(col => col.name === 'source_paragraph_id');
      if (!hasCol) {
        this.db.exec("ALTER TABLE flashcards ADD COLUMN source_paragraph_id TEXT REFERENCES source_paragraphs(id) ON DELETE SET NULL;");
      }
    } catch (err) {
      console.error("Migration error on flashcards:", err.message);
    }
  }

  getSubjects() {
    const stmt = this.db.prepare('SELECT * FROM subjects');
    return stmt.all();
  }

  getFlashcards(subjectId) {
    const query = `
      SELECT f.id, f.subject_id, s.shape_text as front_shape, f.source_citation,
             f.source_paragraph_id, sp_ref.content_text as source_paragraph_text,
             (SELECT json_group_array(word) FROM trigger_words WHERE shape_id = s.id) as front_triggers,
             p.citation || ' (' || p.short_title || ')' as back_provision,
             p.elements_checklist as back_elements,
             p.common_confusion as back_confusion,
             (SELECT CASE WHEN COUNT(*) > 0 THEN 1 ELSE 0 END FROM decoy_pairs dp WHERE dp.shape_a_id = s.id OR dp.shape_b_id = s.id) as is_decoy,
             (SELECT id FROM decoy_pairs dp WHERE dp.shape_a_id = s.id OR dp.shape_b_id = s.id LIMIT 1) as decoy_pair_id
      FROM flashcards f
      JOIN shapes s ON f.shape_id = s.id
      JOIN shape_provisions sp ON s.id = sp.shape_id AND sp.is_primary = 1
      JOIN provisions p ON sp.provision_id = p.id
      LEFT JOIN source_paragraphs sp_ref ON f.source_paragraph_id = sp_ref.id
      WHERE f.subject_id = ?
    `;
    const stmt = this.db.prepare(query);
    return stmt.all(subjectId).map(row => ({
      ...row,
      front_triggers: JSON.parse(row.front_triggers),
      back_elements: JSON.parse(row.back_elements),
      is_decoy: row.is_decoy === 1
    }));
  }

  getDecoyPairs(subjectId) {
    const query = `
      SELECT d.id, d.shared_trigger, 
             sa.shape_text as shape_a, pa.citation || ' (' || pa.short_title || ')' as provision_a,
             sb.shape_text as shape_b, pb.citation || ' (' || pb.short_title || ')' as provision_b,
             d.distinguishing_fact
      FROM decoy_pairs d
      JOIN shapes sa ON d.shape_a_id = sa.id
      JOIN shapes sb ON d.shape_b_id = sb.id
      JOIN shape_provisions spa ON sa.id = spa.shape_id AND spa.is_primary = 1
      JOIN provisions pa ON spa.provision_id = pa.id
      JOIN shape_provisions spb ON sb.id = spb.shape_id AND spb.is_primary = 1
      JOIN provisions pb ON spb.provision_id = pb.id
      WHERE d.subject_id = ?
    `;
    const stmt = this.db.prepare(query);
    return stmt.all(subjectId);
  }

  getTriggers(subjectId) {
    const query = `
      SELECT t.word, t.is_ambiguous, t.distinguishing_fact, s.shape_text
      FROM trigger_words t
      JOIN shapes s ON t.shape_id = s.id
      WHERE s.subject_id = ?
    `;
    const stmt = this.db.prepare(query);
    return stmt.all(subjectId).map(row => ({
      ...row,
      is_ambiguous: row.is_ambiguous === 1
    }));
  }

  getSource(sourceId) {
    const sourceStmt = this.db.prepare('SELECT * FROM sources WHERE id = ?');
    const source = sourceStmt.get(sourceId);
    if (!source) return null;

    const paraStmt = this.db.prepare('SELECT * FROM source_paragraphs WHERE source_id = ?');
    const paragraphs = paraStmt.all(sourceId);

    const countStmt = this.db.prepare(`
      SELECT source_paragraph_id, COUNT(*) as count 
      FROM flashcards 
      WHERE source_paragraph_id LIKE ? 
      GROUP BY source_paragraph_id
    `);
    const counts = countStmt.all(`${sourceId}:%`);
    const countMap = {};
    for (const row of counts) {
      countMap[row.source_paragraph_id] = row.count;
    }

    return {
      ...source,
      paragraphs: paragraphs.map(p => {
        const cardCount = countMap[p.id] || countMap[p.anchor_id] || 0;
        return {
          id: p.anchor_id,
          text: p.content_text,
          cardCount: cardCount
        };
      })
    };
  }

  getSourcesForSubject(subjectId) {
    const stmt = this.db.prepare('SELECT * FROM sources WHERE subject_id = ?');
    return stmt.all(subjectId);
  }

  getParagraphMapping(paragraphIdOrAnchor) {
    const paraStmt = this.db.prepare(`
      SELECT * FROM source_paragraphs 
      WHERE id = ? OR anchor_id = ?
      LIMIT 1
    `);
    const para = paraStmt.get(paragraphIdOrAnchor, paragraphIdOrAnchor);
    if (!para) return null;

    // 1. Try to find a provision via linked flashcards (most accurate)
    let prov = null;
    const provViaFlashcardStmt = this.db.prepare(`
      SELECT p.* 
      FROM provisions p
      JOIN shape_provisions sp ON p.id = sp.provision_id
      JOIN flashcards f ON f.shape_id = sp.shape_id
      WHERE (f.source_paragraph_id = ? OR f.source_paragraph_id = ?) AND sp.is_primary = 1
      LIMIT 1
    `);
    prov = provViaFlashcardStmt.get(para.id, para.anchor_id);

    // 2. Fallback to direct ID or citation-like match
    if (!prov) {
      const provStmt = this.db.prepare(`
        SELECT * FROM provisions 
        WHERE id = ? OR id = ? OR citation LIKE ?
        LIMIT 1
      `);
      prov = provStmt.get(para.id, para.anchor_id, `%${para.anchor_id}%`);
    }

    // 3. Fallback to extracting article/section/rule number from paragraph text
    if (!prov) {
      const match = para.content_text.match(/\b(?:article|art|section|sec|rule)\.?\s*(\d+)/i);
      if (match) {
        const num = match[1];
        const provFallbackStmt = this.db.prepare(`
          SELECT * FROM provisions 
          WHERE subject_id = ? AND (citation LIKE ? OR citation LIKE ? OR citation LIKE ?)
          LIMIT 1
        `);
        const sourceStmt = this.db.prepare('SELECT subject_id FROM sources WHERE id = ?');
        const source = sourceStmt.get(para.source_id);
        const subId = source ? source.subject_id : '';
        if (subId) {
          prov = provFallbackStmt.get(subId, `%Art%${num}%`, `%Sec%${num}%`, `%Rule%${num}%`);
        }
      }
    }

    let provisionData = null;
    let shapes = [];

    if (prov) {
      provisionData = {
        ...prov,
        elements_checklist: JSON.parse(prov.elements_checklist)
      };

      const shapesStmt = this.db.prepare(`
        SELECT s.*, sp.is_primary 
        FROM shapes s
        JOIN shape_provisions sp ON s.id = sp.shape_id
        WHERE sp.provision_id = ?
      `);
      const mappedShapes = shapesStmt.all(prov.id);

      for (const shape of mappedShapes) {
        const triggersStmt = this.db.prepare('SELECT * FROM trigger_words WHERE shape_id = ?');
        const triggers = triggersStmt.all(shape.id).map(t => ({
          ...t,
          is_ambiguous: t.is_ambiguous === 1
        }));

        const decoyStmt = this.db.prepare(`
          SELECT d.*, 
                 sa.shape_text as shape_a_text, 
                 sb.shape_text as shape_b_text
          FROM decoy_pairs d
          JOIN shapes sa ON d.shape_a_id = sa.id
          JOIN shapes sb ON d.shape_b_id = sb.id
          WHERE d.shape_a_id = ? OR d.shape_b_id = ?
        `);
        const decoys = decoyStmt.all(shape.id, shape.id);

        shapes.push({
          ...shape,
          triggers,
          decoys
        });
      }
    } else {
      const sourceStmt = this.db.prepare('SELECT subject_id FROM sources WHERE id = ?');
      const srcObj = sourceStmt.get(para.source_id);
      if (srcObj) {
        const shapesStmt = this.db.prepare('SELECT id, shape_text FROM shapes WHERE subject_id = ?');
        const subjectShapes = shapesStmt.all(srcObj.subject_id);
        const matchingShapes = subjectShapes.filter(s => 
          para.content_text.toLowerCase().includes(s.shape_text.toLowerCase())
        );

        for (const shape of matchingShapes) {
          const triggersStmt = this.db.prepare('SELECT * FROM trigger_words WHERE shape_id = ?');
          const triggers = triggersStmt.all(shape.id).map(t => ({
            ...t,
            is_ambiguous: t.is_ambiguous === 1
          }));

          const decoyStmt = this.db.prepare(`
            SELECT d.*, 
                   sa.shape_text as shape_a_text, 
                   sb.shape_text as shape_b_text
            FROM decoy_pairs d
            JOIN shapes sa ON d.shape_a_id = sa.id
            JOIN shapes sb ON d.shape_b_id = sb.id
            WHERE d.shape_a_id = ? OR d.shape_b_id = ?
          `);
          const decoys = decoyStmt.all(shape.id, shape.id);

          const provsForShapeStmt = this.db.prepare(`
            SELECT p.* FROM provisions p
            JOIN shape_provisions sp ON p.id = sp.provision_id
            WHERE sp.shape_id = ? AND sp.is_primary = 1
          `);
          const provsForShape = provsForShapeStmt.all(shape.id).map(pr => ({
            ...pr,
            elements_checklist: JSON.parse(pr.elements_checklist)
          }));

          shapes.push({
            ...shape,
            triggers,
            decoys,
            provisions: provsForShape
          });
        }
      }
    }

    const flashcardsStmt = this.db.prepare(`
      SELECT f.id, s.shape_text
      FROM flashcards f
      JOIN shapes s ON f.shape_id = s.id
      WHERE f.source_paragraph_id = ? OR f.source_paragraph_id = ?
    `);
    const relatedCards = flashcardsStmt.all(para.id, para.anchor_id);

    return {
      paragraph: {
        id: para.id,
        anchor_id: para.anchor_id,
        content_text: para.content_text
      },
      provision: provisionData,
      shapes: shapes,
      flashcards: relatedCards
    };
  }

  runWriteQuery(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  importSubjectData(subjectId, cards, decoyPairs = []) {
    const provisions = [];
    const shapes = [];
    const trigger_words = [];
    const flashcards = [];

    for (const card of cards) {
      const shapeId = `shape-${card.id}`;
      const provisionId = `prov-${card.id}`;

      const provisionParts = card.provision.split('-');
      const citation = provisionParts[0].trim();
      const shortTitle = provisionParts[1]?.trim() || '';

      provisions.push({
        id: provisionId,
        citation: citation,
        short_title: shortTitle,
        elements_checklist: card.elements || [],
        common_confusion: card.confusion || null,
        distinguishing_fact: null
      });

      shapes.push({
        id: shapeId,
        shape_text: card.shape,
        frequency: 1,
        provisions: [
          { id: provisionId, is_primary: true }
        ]
      });

      if (card.triggers) {
        for (const word of card.triggers) {
          trigger_words.push({
            shape_id: shapeId,
            word: word,
            is_ambiguous: false,
            distinguishing_fact: null
          });
        }
      }

      flashcards.push({
        id: card.id,
        shape_id: shapeId,
        source_citation: card.source,
        source_paragraph_id: card.source_paragraph_id || null
      });
    }

    const formattedData = {
      subjectName: subjectId,
      provisions,
      shapes,
      trigger_words,
      flashcards,
      decoy_pairs: decoyPairs
    };

    this.insertSubjectData(subjectId, formattedData);
  }

  insertSubjectData(subjectId, data) {
    this.db.exec('BEGIN');
    try {
      // 1. Delete old data
      this.db.prepare('DELETE FROM flashcards WHERE subject_id = ?').run(subjectId);
      this.db.prepare('DELETE FROM decoy_pairs WHERE subject_id = ?').run(subjectId);
      this.db.prepare('DELETE FROM trigger_words WHERE shape_id IN (SELECT id FROM shapes WHERE subject_id = ?)').run(subjectId);
      this.db.prepare('DELETE FROM shape_provisions WHERE shape_id IN (SELECT id FROM shapes WHERE subject_id = ?)').run(subjectId);
      this.db.prepare('DELETE FROM shapes WHERE subject_id = ?').run(subjectId);
      this.db.prepare('DELETE FROM provisions WHERE subject_id = ?').run(subjectId);
      this.db.prepare('DELETE FROM source_paragraphs WHERE source_id IN (SELECT id FROM sources WHERE subject_id = ?)').run(subjectId);
      this.db.prepare('DELETE FROM sources WHERE subject_id = ?').run(subjectId);
      this.db.prepare('DELETE FROM subjects WHERE id = ?').run(subjectId);

      // 2. Insert subject
      const stmtSubject = this.db.prepare('INSERT OR REPLACE INTO subjects (id, name) VALUES (?, ?)');
      stmtSubject.run(subjectId, data.subjectName);

      // 3. Insert sources
      if (data.sources) {
        const stmtSource = this.db.prepare('INSERT OR REPLACE INTO sources (id, title, subject_id) VALUES (?, ?, ?)');
        const stmtParagraph = this.db.prepare('INSERT OR REPLACE INTO source_paragraphs (id, source_id, anchor_id, content_text) VALUES (?, ?, ?, ?)');
        for (const source of data.sources) {
          stmtSource.run(source.id, source.title, subjectId);
          if (source.paragraphs) {
            for (const para of source.paragraphs) {
              const spId = `${source.id}:${para.id}`;
              stmtParagraph.run(spId, source.id, para.id, para.text);
            }
          }
        }
      }

      // 4. Insert provisions
      if (data.provisions) {
        const stmtProvision = this.db.prepare(`
          INSERT OR REPLACE INTO provisions (id, subject_id, citation, short_title, elements_checklist, common_confusion, distinguishing_fact)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        for (const prov of data.provisions) {
          stmtProvision.run(
            prov.id,
            subjectId,
            prov.citation,
            prov.short_title,
            JSON.stringify(prov.elements_checklist || []),
            prov.common_confusion || null,
            prov.distinguishing_fact || null
          );
        }
      }

      // 5. Insert shapes
      if (data.shapes) {
        const stmtShape = this.db.prepare('INSERT OR REPLACE INTO shapes (id, subject_id, shape_text, frequency) VALUES (?, ?, ?, ?)');
        const stmtShapeProv = this.db.prepare('INSERT OR REPLACE INTO shape_provisions (shape_id, provision_id, is_primary) VALUES (?, ?, ?)');
        for (const shape of data.shapes) {
          stmtShape.run(shape.id, subjectId, shape.shape_text, shape.frequency || 1);
          if (shape.provisions) {
            for (const sp of shape.provisions) {
              stmtShapeProv.run(shape.id, sp.id, sp.is_primary ? 1 : 0);
            }
          }
        }
      }

      // 6. Insert trigger words
      if (data.trigger_words) {
        const stmtTrigger = this.db.prepare('INSERT INTO trigger_words (shape_id, word, is_ambiguous, distinguishing_fact) VALUES (?, ?, ?, ?)');
        for (const trig of data.trigger_words) {
          stmtTrigger.run(
            trig.shape_id,
            trig.word,
            trig.is_ambiguous ? 1 : 0,
            trig.distinguishing_fact || null
          );
        }
      }

      // 7. Insert decoy pairs
      if (data.decoy_pairs) {
        const stmtDecoy = this.db.prepare(`
          INSERT OR REPLACE INTO decoy_pairs (id, subject_id, shape_a_id, shape_b_id, shared_trigger, distinguishing_fact)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const dp of data.decoy_pairs) {
          stmtDecoy.run(
            dp.id,
            subjectId,
            dp.shape_a_id,
            dp.shape_b_id,
            dp.shared_trigger,
            dp.distinguishing_fact
          );
        }
      }

      // 8. Insert flashcards
      if (data.flashcards) {
        const stmtFlashcard = this.db.prepare('INSERT OR REPLACE INTO flashcards (id, subject_id, shape_id, source_citation, source_paragraph_id) VALUES (?, ?, ?, ?, ?)');
        for (const fc of data.flashcards) {
          stmtFlashcard.run(
            fc.id,
            subjectId,
            fc.shape_id,
            fc.source_citation,
            fc.source_paragraph_id || null
          );
        }
      }

      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Seed a source document + its paragraphs for a subject.
   * Called by POST /api/import-source.
   * Strips HTML tags, splits on Article/Section/Chapter headings or blank lines.
   * Returns { count, replaced } — replaced is true if the source already existed.
   */
  importSource(subjectId, subjectName, sourceId, title, rawText) {
    // Check if source already exists (for re-import feedback)
    const existing = this.db.prepare('SELECT id FROM sources WHERE id = ?').get(sourceId);
    const replaced = !!existing;

    this.db.exec('PRAGMA foreign_keys = OFF;');
    try {
      // Ensure subject row exists with proper display name
      this.db.prepare('INSERT OR REPLACE INTO subjects (id, name) VALUES (?, ?)').run(subjectId, subjectName);

      // Delete existing source rows for this sourceId (re-import is safe)
      this.db.prepare('DELETE FROM source_paragraphs WHERE source_id = ?').run(sourceId);
      this.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);

      this.db.prepare('INSERT INTO sources (id, title, subject_id) VALUES (?, ?, ?)').run(sourceId, title, subjectId);

      // Strip HTML tags to get clean text
      const cleanText = rawText
        .replace(/<[^>]*>/g, ' ')       // strip all HTML tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&[a-z]+;/gi, ' ')     // remaining HTML entities → space
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/ {2,}/g, ' ')          // collapse multiple spaces
        .replace(/\n{3,}/g, '\n\n');     // collapse 3+ newlines to 2

      // Split into paragraphs: blank lines OR Article/Section/Chapter headings
      const rawParagraphs = cleanText
        .split(/\n{2,}|(?=\b(?:Art(?:icle)?|Sec(?:tion)?|Chapter|Rule|BOOK|TITLE|PRELIMINARY)\b[.\s]*\d)/i)
        .map(p => p.trim())
        .filter(p => p.length > 20);

      const stmtPara = this.db.prepare(
        'INSERT INTO source_paragraphs (id, source_id, anchor_id, content_text) VALUES (?, ?, ?, ?)'
      );

      this.db.exec('BEGIN');
      try {
        rawParagraphs.forEach((text, idx) => {
          const anchorId = `${sourceId}-p${idx + 1}`;
          const paraId = `${sourceId}:${anchorId}`;
          stmtPara.run(paraId, sourceId, anchorId, text);
        });
        this.db.exec('COMMIT');
      } catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
      }

      return { count: rawParagraphs.length, replaced };
    } finally {
      this.db.exec('PRAGMA foreign_keys = ON;');
    }
  }
}

module.exports = { DbAdapter };
