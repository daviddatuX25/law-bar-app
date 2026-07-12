const express = require('express');
const path = require('path');
const fs = require('fs');
const { parseMarkdown } = require('./parser');
const { evaluateALAC, generateFlashcards } = require('./lib/litellm');

// Load system prompts at startup
const ALAC_SYSTEM_PROMPT = (() => {
  try {
    return fs.readFileSync(path.join(__dirname, 'prompts', 'alac-evaluation.txt'), 'utf8');
  } catch (_) {
    console.warn('[server] prompts/alac-evaluation.txt not found — ALAC evaluation will use mock mode');
    return '';
  }
})();

// ==========================================================================
// Pipeline source filename → (subjectId, sourceId, title) mapping
// ==========================================================================
const PIPELINE_SOURCE_MAP = {
  'civil-code':       { subjectId: 'civil-law',       sourceId: 'civil-code',             title: 'Civil Code of the Philippines (RA 386)' },
  'family-code':      { subjectId: 'civil-law',       sourceId: 'family-code',            title: 'Family Code of the Philippines (EO 209)' },
  'property-reg':     { subjectId: 'civil-law',       sourceId: 'property-reg',           title: 'Property Registration Decree (PD 1529)' },
  'rpc':              { subjectId: 'criminal-law',    sourceId: 'rpc',                    title: 'Revised Penal Code (Act 3815)' },
  'dangerous-drugs':  { subjectId: 'criminal-law',    sourceId: 'dangerous-drugs',        title: 'Dangerous Drugs Act of 2002 (RA 9165)' },
  'constitution':     { subjectId: 'political-law',   sourceId: 'constitution',           title: '1987 Constitution of the Philippines' },
  'lgc':              { subjectId: 'political-law',   sourceId: 'lgc',                    title: 'Local Government Code of 1991 (RA 7160)' },
  'corporation-code': { subjectId: 'commercial-law',  sourceId: 'corporation-code',       title: 'Revised Corporation Code (RA 11232)' },
  'insurance-code':   { subjectId: 'commercial-law',  sourceId: 'insurance-code',         title: 'Insurance Code (RA 10607)' },
  'negotiable-instruments': { subjectId: 'commercial-law', sourceId: 'negotiable-instruments', title: 'Negotiable Instruments Law (Act 2031)' },
  'labor-code':       { subjectId: 'labor-law',       sourceId: 'labor-code',             title: 'Labor Code of the Philippines (PD 442)' },
  'nirc':             { subjectId: 'taxation',        sourceId: 'nirc',                   title: 'National Internal Revenue Code (NIRC / RA 8424)' },
};

// Subject display names (from subject-sources.json)
const SUBJECT_NAMES = {
  'civil-law': 'Civil Law',
  'criminal-law': 'Criminal Law',
  'political-law': 'Political Law',
  'remedial-law': 'Remedial Law',
  'commercial-law': 'Commercial Law',
  'labor-law': 'Labor Law',
  'taxation': 'Taxation',
  'legal-ethics': 'Legal Ethics',
};

function startServer(db, port = process.env.PORT || 3005) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
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

  app.get('/api/sources/list', (req, res) => {
    try {
      const subjects = db.getSubjects();
      const allSources = [];
      for (const sub of subjects) {
        const sources = db.getSourcesForSubject(sub.id);
        allSources.push(...sources);
      }
      res.json(allSources);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/sources/:id/paragraphs', (req, res) => {
    try {
      const source = db.getSource(req.params.id);
      if (!source) {
        return res.status(404).json({ error: 'Source not found' });
      }
      // Re-map DB paragraphs objects to standard array
      const paragraphs = (source.paragraphs || []).map(p => ({
        id: `${req.params.id}:${p.id}`,
        anchor_id: p.id,
        content_text: p.text,
        cardCount: p.cardCount
      }));
      res.json(paragraphs);
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

  app.post('/api/import-source', (req, res) => {
    const { subjectId, subjectName, sourceId, title, text } = req.body;
    if (!subjectId || !sourceId || !title || !text) {
      return res.status(400).json({ error: 'Missing subjectId, sourceId, title, or text.' });
    }
    try {
      const result = db.importSource(subjectId, subjectName || subjectId, sourceId, title, text);
      res.json({ success: true, paragraphs: result.count, replaced: result.replaced });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/seed-sources', (req, res) => {
    const sourcesDir = path.join(__dirname, 'pipeline', 'sources');
    const results = [];
    let totalParagraphs = 0;
    let totalReimported = 0;

    for (const [fileBase, mapping] of Object.entries(PIPELINE_SOURCE_MAP)) {
      try {
        // Prefer .txt files over .html
        let filePath = path.join(sourcesDir, `${fileBase}.txt`);
        if (!fs.existsSync(filePath)) {
          filePath = path.join(sourcesDir, `${fileBase}.html`);
        }
        if (!fs.existsSync(filePath)) {
          results.push({ subject: mapping.subjectId, title: mapping.title, status: 'skip', reason: 'No source file found' });
          continue;
        }

        const rawText = fs.readFileSync(filePath, 'utf8');
        const subjectName = SUBJECT_NAMES[mapping.subjectId] || mapping.subjectId;
        const result = db.importSource(mapping.subjectId, subjectName, mapping.sourceId, mapping.title, rawText);

        totalParagraphs += result.count;
        if (result.replaced) totalReimported++;
        results.push({
          subject: mapping.subjectId,
          title: mapping.title,
          status: 'ok',
          paragraphs: result.count,
          reimported: result.replaced
        });
      } catch (err) {
        results.push({ subject: mapping.subjectId, title: mapping.title, status: 'error', reason: err.message });
      }
    }

    const okCount = results.filter(r => r.status === 'ok').length;
    const skipCount = results.filter(r => r.status === 'skip').length;
    const errCount = results.filter(r => r.status === 'error').length;
    const summary = `${okCount} imported, ${skipCount} skipped, ${errCount} errors. Total: ${totalParagraphs.toLocaleString()} paragraphs across ${okCount} sources.${totalReimported > 0 ? ` (${totalReimported} were re-imports)` : ''}`;

    res.json({ results, summary, totalParagraphs });
  });

  app.post('/api/alac/evaluate', async (req, res) => {
    const { mode, factPattern, provision, elements, confusion, answer, law, application, conclusion, freeform } = req.body;
    const isFreeform = mode === 'freeform';

    // Validate required fields
    const missing = [];
    if (!factPattern || !factPattern.trim()) missing.push('factPattern');
    if (!provision || !provision.trim()) missing.push('provision');
    if (!Array.isArray(elements) || elements.length === 0) missing.push('elements (non-empty array)');
    if (isFreeform && (!freeform || !freeform.trim())) missing.push('freeform');

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: `Missing or invalid required fields: ${missing.join(', ')}`,
        missing
      });
    }

    try {
      const userData = {
        factPattern: factPattern.trim(),
        provision: provision.trim(),
        elements,
        confusion: (confusion || '').trim(),
        mode: isFreeform ? 'freeform' : 'segmented',
      };

      if (isFreeform) {
        userData.freeform = freeform.trim();
      } else {
        userData.answer = (answer || '').trim();
        userData.law = (law || '').trim();
        userData.application = (application || '').trim();
        userData.conclusion = (conclusion || '').trim();
      }

      const result = await evaluateALAC(ALAC_SYSTEM_PROMPT, userData);

      res.json(result);
    } catch (err) {
      console.error('[alac/evaluate] Error:', err.message);
      res.status(500).json({
        error: 'EVALUATION_FAILED',
        message: 'An unexpected error occurred during evaluation.',
        retryable: true
      });
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
      db.importSubjectData(subjectId, parseResult.data, parseResult.decoy_pairs);
      res.json({ success: true, count: parseResult.data.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/generate/flashcards', async (req, res) => {
    const { subjectId, sourceId, paragraphIds, prompt } = req.body;
    if (!subjectId) {
      return res.status(400).json({ error: 'Missing subjectId' });
    }

    try {
      // 1. Load the template system prompt
      const systemPromptPath = path.join(__dirname, 'pipeline', 'generation-prompt.md');
      let systemPrompt = '';
      try {
        systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
      } catch (_) {
        systemPrompt = 'You are a flashcard generator for the subject: {{SUBJECT}}.';
      }
      
      const subName = SUBJECT_NAMES[subjectId] || subjectId;
      systemPrompt = systemPrompt.replaceAll('{{SUBJECT}}', subName);

      // 2. Load grounding paragraphs if any
      let groundingContext = '';
      if (Array.isArray(paragraphIds) && paragraphIds.length > 0) {
        const paragraphs = [];
        for (const pId of paragraphIds) {
          const mapping = db.getParagraphMapping(pId);
          if (mapping && mapping.paragraph) {
            paragraphs.push(`[Paragraph ID: ${mapping.paragraph.id}]\n${mapping.paragraph.content_text}`);
          }
        }
        if (paragraphs.length > 0) {
          groundingContext = `Here are the official source paragraphs to ground your generation. You MUST include a SOURCE_PARAGRAPH tag in every card matching the exact Paragraph ID. Example: SOURCE_PARAGRAPH: civil-code:civil-code-p1544\n\n${paragraphs.join('\n\n')}`;
        }
      }

      // 3. Call generator from litellm library
      const result = await generateFlashcards(systemPrompt, prompt || 'double sale', groundingContext, {
        paragraphIds: paragraphIds || []
      });

      res.json({ success: true, markdown: result });
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
