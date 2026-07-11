const express = require('express');
const path = require('path');
const { parseMarkdown } = require('./parser');

function startServer(db, port = process.env.PORT || 3005) {
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
      db.importSubjectData(subjectId, parseResult.data);
      res.json({ success: true, count: parseResult.data.length });
    } catch (err) {
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
