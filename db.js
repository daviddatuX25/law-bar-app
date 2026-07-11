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
    const migration = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    this.db.exec(migration);
  }

  getSubjects() {
    const stmt = this.db.prepare('SELECT * FROM subjects');
    return stmt.all();
  }

  getFlashcards(subjectId) {
    const query = `
      SELECT f.id, f.subject_id, s.shape_text as front_shape, f.source_citation,
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

    // Fetch shapes for the source's subject
    const shapesStmt = this.db.prepare('SELECT id, shape_text FROM shapes WHERE subject_id = ?');
    const subjectShapes = shapesStmt.all(source.subject_id);

    return {
      ...source,
      paragraphs: paragraphs.map(p => {
        // Match shapes that appear inside the paragraph text
        const matchingShapes = subjectShapes
          .filter(s => p.content_text.toLowerCase().includes(s.shape_text.toLowerCase()))
          .map(s => s.shape_text);
        return {
          id: p.anchor_id,
          text: p.content_text,
          shapes: matchingShapes
        };
      })
    };
  }

  runWriteQuery(sql, params = []) {
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
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
        const stmtFlashcard = this.db.prepare('INSERT OR REPLACE INTO flashcards (id, subject_id, shape_id, source_citation) VALUES (?, ?, ?, ?)');
        for (const fc of data.flashcards) {
          stmtFlashcard.run(
            fc.id,
            subjectId,
            fc.shape_id,
            fc.source_citation
          );
        }
      }

      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}

module.exports = { DbAdapter };
