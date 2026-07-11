const express = require('express');
const path = require('path');
const { parseMarkdown } = require('./parser');

function startServer(db, port = process.env.PORT || 3000) {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/api/subjects', (req, res) => {
    try {
      const subjects = db.getSubjects();
      res.json(subjects);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/subjects/:id/deck', (req, res) => {
    try {
      const flashcards = db.getFlashcards(req.params.id);
      const decoys = db.getDecoyPairs(req.params.id);
      res.json({ flashcards, decoys });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/subjects/:id/triggers', (req, res) => {
    try {
      const triggers = db.getTriggers(req.params.id);
      res.json(triggers);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sources/:id', (req, res) => {
    try {
      const source = db.getSource(req.params.id);
      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }
      res.json(source);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/subjects/:id/sources', (req, res) => {
    try {
      const sources = db.getSourcesForSubject(req.params.id);
      res.json(sources);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/paragraphs/:id', (req, res) => {
    try {
      const mapping = db.getParagraphMapping(req.params.id);
      if (!mapping) {
        return res.status(404).json({ error: 'Paragraph not found' });
      }
      res.json(mapping);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/import', (req, res) => {
    const { subjectId, markdown } = req.body;
    if (!subjectId || !markdown) {
      return res.status(400).json({ error: 'Missing subjectId or markdown content.' });
    }

    const parseResult = parseMarkdown(markdown);
    if (!parseResult.success) {
      return res.status(422).json({ error: 'Validation failed', details: parseResult.errors });
    }

    try {
      // Bulk transaction insert
      db.db.exec('BEGIN TRANSACTION');
      
      // Ensure the subject exists in the subjects table
      db.runWriteQuery("INSERT OR IGNORE INTO subjects (id, name) VALUES (?, ?)", [subjectId, subjectId]);

      for (const card of parseResult.data) {
        const shapeId = `shape-${card.id}`;
        const provisionId = `prov-${card.id}`;

        // Clear existing associated records to preserve idempotency & avoid duplicates
        db.runWriteQuery("DELETE FROM trigger_words WHERE shape_id = ?", [shapeId]);
        db.runWriteQuery("DELETE FROM shape_provisions WHERE shape_id = ?", [shapeId]);

        db.runWriteQuery("INSERT OR REPLACE INTO shapes (id, subject_id, shape_text) VALUES (?, ?, ?)", [shapeId, subjectId, card.shape]);
        db.runWriteQuery("INSERT OR REPLACE INTO provisions (id, subject_id, citation, short_title, elements_checklist, common_confusion) VALUES (?, ?, ?, ?, ?, ?)", [
          provisionId, subjectId, card.provision.split('-')[0].trim(), card.provision.split('-')[1]?.trim() || '', JSON.stringify(card.elements), card.confusion
        ]);
        db.runWriteQuery("INSERT OR REPLACE INTO shape_provisions (shape_id, provision_id, is_primary) VALUES (?, ?, 1)", [shapeId, provisionId]);
        db.runWriteQuery("INSERT OR REPLACE INTO flashcards (id, subject_id, shape_id, source_citation) VALUES (?, ?, ?, ?)", [card.id, subjectId, shapeId, card.source]);

        for (const trigger of card.triggers) {
          db.runWriteQuery("INSERT INTO trigger_words (shape_id, word) VALUES (?, ?)", [shapeId, trigger]);
        }
      }
      db.db.exec('COMMIT');
      res.json({ success: true, count: parseResult.data.length });
    } catch (err) {
      try {
        db.db.exec('ROLLBACK');
      } catch (rollbackErr) {
        // Ignore rollback errors if transaction was not active
      }
      res.status(500).json({ error: err.message });
    }
  });

  const server = app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });

  return server;
}

if (require.main === module) {
  const { DbAdapter } = require('./db');
  const db = new DbAdapter();
  db.initialize();
  startServer(db);
}

module.exports = { startServer };
