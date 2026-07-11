# Source-Linked Flashcards Ingestion and Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link flashcards to source paragraphs in the database, enable paragraph-grounded AI generation with UI selection in Ingestion Studio, show related cards in Codal Reader, and backfill existing cards.

**Architecture:** Add a nullable foreign key `source_paragraph_id` to the `flashcards` table, update database queries, adapt `parser.js` to parse `SOURCE_PARAGRAPH`, implement grounding parameters in LiteLLM endpoint, and wire UI components.

**Tech Stack:** Node.js, Express, SQLite (`node:sqlite`), Vanilla JS, HTML, CSS.

## Global Constraints
* Maintain documentation integrity: Preserve existing comments and docstrings.
* Use HSL colors and CSS variables for high-fidelity dark-mode designs.
* All tests must pass before completing any task.
* Database path defaults to `./bar_exam.db` or `:memory:` for testing.

---

### Task 1: Database Migration & Schema Adapter Updates

**Files:**
* Modify: [schema.sql](file:///home/user/Documents/LAW%20BAR/schema.sql)
* Modify: [db.js](file:///home/user/Documents/LAW%20BAR/db.js)
* Modify: [tests/db.test.js](file:///home/user/Documents/LAW%20BAR/tests/db.test.js)

**Interfaces:**
* Consumes: Existing SQLite connection
* Produces: Migrated database schema and updated `getFlashcards()`, `importSubjectData()`, and `insertSubjectData()` responses and parameters.

- [ ] **Step 1: Write the failing test**
  Modify [tests/db.test.js](file:///home/user/Documents/LAW%20BAR/tests/db.test.js) to assert that `source_paragraph_id` is retrieved by `getFlashcards()`.
  
  ```javascript
  // Add this inside the "Database Sync & Retrieval" test block in tests/db.test.js, around line 90:
  db.insertSubjectData('subject-1', {
    subjectName: 'Real Property',
    sources: [
      {
        id: 'source-1',
        title: 'Restatement of Property',
        paragraphs: [
          {
            id: 'p1',
            text: 'A fee simple absolute is the largest estate known to the law.'
          }
        ]
      }
    ],
    provisions: [
      {
        id: 'prov-1',
        citation: 'Restatement § 1',
        short_title: 'Fee Simple Absolute',
        elements_checklist: ['Intent to convey'],
        common_confusion: 'Confused with Fee Tail',
        distinguishing_fact: 'Fee simple is devisable.'
      }
    ],
    shapes: [
      {
        id: 'shape-1',
        shape_text: 'Conveyance to A and his heirs',
        frequency: 5,
        provisions: [{ id: 'prov-1', is_primary: 1 }]
      }
    ],
    trigger_words: [
      {
        shape_id: 'shape-1',
        word: 'heirs',
        is_ambiguous: 0,
        distinguishing_fact: null
      }
    ],
    decoy_pairs: [],
    flashcards: [
      {
        id: 'fc-1',
        shape_id: 'shape-1',
        source_citation: 'Restatement § 1',
        source_paragraph_id: 'source-1:p1'
      }
    ]
  });
  const testFc = db.getFlashcards('subject-1');
  assert.strictEqual(testFc[0].source_paragraph_id, 'source-1:p1');
  assert.strictEqual(testFc[0].source_paragraph_text, 'A fee simple absolute is the largest estate known to the law.');
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/db.test.js`
  Expected: FAIL (SQLite table constraints or assertion mismatch on `source_paragraph_id`)

- [ ] **Step 3: Update schema definition**
  Modify [schema.sql](file:///home/user/Documents/LAW%20BAR/schema.sql#L60-L65) to include `source_paragraph_id TEXT REFERENCES source_paragraphs(id)`.
  ```sql
  CREATE TABLE IF NOT EXISTS flashcards (
    id TEXT PRIMARY KEY,
    subject_id TEXT REFERENCES subjects(id),
    shape_id TEXT REFERENCES shapes(id),
    source_citation TEXT NOT NULL,
    source_paragraph_id TEXT REFERENCES source_paragraphs(id)
  );
  ```

- [ ] **Step 4: Implement schema auto-migration**
  Modify `initialize()` in [db.js](file:///home/user/Documents/LAW%20BAR/db.js#L12-L17) to dynamically migrate existing databases:
  ```javascript
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
          this.db.exec("ALTER TABLE flashcards ADD COLUMN source_paragraph_id TEXT REFERENCES source_paragraphs(id);");
        }
      } catch (err) {
        console.error("Migration error on flashcards:", err.message);
      }
    }
  ```

- [ ] **Step 5: Update database retrieval and insertion paths**
  * Update `getFlashcards(subjectId)` query in [db.js](file:///home/user/Documents/LAW%20BAR/db.js#L24-L46) to retrieve paragraph details:
    ```javascript
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
    ```
  * Update `importSubjectData()` in [db.js](file:///home/user/Documents/LAW%20BAR/db.js#L268-L274) to set `source_paragraph_id`:
    ```javascript
        flashcards.push({
          id: card.id,
          shape_id: shapeId,
          source_citation: card.source,
          source_paragraph_id: card.source_paragraph_id || null
        });
    ```
  * Update `insertSubjectData()` in [db.js](file:///home/user/Documents/LAW%20BAR/db.js#L384-L395):
    ```javascript
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
    ```

- [ ] **Step 6: Run test to verify it passes**
  Run: `node --test tests/db.test.js`
  Expected: PASS

- [ ] **Step 7: Commit changes**
  ```bash
  git add schema.sql db.js tests/db.test.js
  git commit -m "feat: add source_paragraph_id column to flashcards schema and db queries"
  ```

---

### Task 2: Parser Update

**Files:**
* Modify: [parser.js](file:///home/user/Documents/LAW%20BAR/parser.js)
* Modify: [tests/parser.test.js](file:///home/user/Documents/LAW%20BAR/tests/parser.test.js)

**Interfaces:**
* Consumes: Markdown source string
* Produces: Card objects list containing `source_paragraph_id` property.

- [ ] **Step 1: Write parser tests for SOURCE_PARAGRAPH**
  Add a test in [tests/parser.test.js](file:///home/user/Documents/LAW%20BAR/tests/parser.test.js) checking parser outputs:
  ```javascript
  // Add this inside tests/parser.test.js:
  test('Parser Ingestion Validation - Parse SOURCE_PARAGRAPH', () => {
    const md = `CARD civil-10
  FRONT (shape): Double buyers.
  FRONT (trigger words): double, buy
  BACK (provision): Art. 1544 - Double Sale
  BACK (elements):
  1. Element 1
  BACK (common confusion): Confusion :: Fact
  SOURCE: Civil Code Art. 1544
  SOURCE_PARAGRAPH: civil-code-p1544`;
    const res = parseMarkdown(md);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.data[0].source_paragraph_id, 'civil-code-p1544');
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/parser.test.js`
  Expected: FAIL (assertion on `source_paragraph_id` fails)

- [ ] **Step 3: Modify parser to support SOURCE_PARAGRAPH**
  Modify [parser.js](file:///home/user/Documents/LAW%20BAR/parser.js#L20-L55):
  ```javascript
      currentCard = {
        id: line.substring(5).trim(),
        shape: '',
        triggers: [],
        provision: '',
        elements: [],
        confusion: '',
        source: '',
        source_paragraph_id: null
      };
  ```
  And inside the `else if (currentCard)` blocks:
  ```javascript
      } else if (line.startsWith('SOURCE_PARAGRAPH:')) {
        currentCard.source_paragraph_id = line.replace('SOURCE_PARAGRAPH:', '').trim();
      } else if (line.startsWith('SOURCE:')) {
        currentCard.source = line.replace('SOURCE:', '').trim();
      }
  ```
  *(Note: Checking `SOURCE_PARAGRAPH:` first prevents `SOURCE:` matching prefix collision.)*

- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/parser.test.js`
  Expected: PASS

- [ ] **Step 5: Commit changes**
  ```bash
  git add parser.js tests/parser.test.js
  git commit -m "feat: parse optional SOURCE_PARAGRAPH field in parser"
  ```

---

### Task 3: Backend API Endpoints

**Files:**
* Modify: [server.js](file:///home/user/Documents/LAW%20BAR/server.js)
* Modify: [tests/server.test.js](file:///home/user/Documents/LAW%20BAR/tests/server.test.js)

**Interfaces:**
* Consumes: HTTP endpoints `/api/sources/:id/paragraphs` and `/api/generate/flashcards`
* Produces: JSON payload and Generated Markdown output string

- [ ] **Step 1: Write server routing tests**
  Add tests inside [tests/server.test.js](file:///home/user/Documents/LAW%20BAR/tests/server.test.js) asserting endpoint status codes and responses.
  ```javascript
  // Add this inside the "Express Server API routes" test suite in tests/server.test.js:
  test('GET /api/sources/:id/paragraphs returns list of paragraphs', async () => {
    const res = await fetch(`http://localhost:${port}/api/sources/source-1/paragraphs`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data));
  });

  test('POST /api/generate/flashcards returns generated markdown text', async () => {
    const payload = {
      subjectId: 'civil-law',
      sourceId: 'civil-code',
      paragraphIds: ['civil-code-p1'],
      prompt: 'double sale'
    };
    const res = await fetch(`http://localhost:${port}/api/generate/flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.markdown.includes('CARD'));
  });
  ```

- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/server.test.js`
  Expected: FAIL (404/Connection refused on routes)

- [ ] **Step 3: Implement GET /api/sources/:id/paragraphs**
  Add route in [server.js](file:///home/user/Documents/LAW%20BAR/server.js#L116-L127):
  ```javascript
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
        content_text: p.text
      }));
      res.json(paragraphs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  ```

- [ ] **Step 4: Implement POST /api/generate/flashcards**
  In [server.js](file:///home/user/Documents/LAW%20BAR/server.js), import `callLiteLLM` from `./lib/litellm` (or evaluate, but since litellm has `evaluateALAC` but not a generic generator, we can add `generateFlashcards` to [lib/litellm.js](file:///home/user/Documents/LAW%20BAR/lib/litellm.js) or call the internal `callLiteLLM` function).
  Wait, [lib/litellm.js](file:///home/user/Documents/LAW%20BAR/lib/litellm.js) exports `evaluateALAC`, `extractJSON`, etc. Let's add a public export `generateFlashcards` to it.
  
  First, define the API route in [server.js](file:///home/user/Documents/LAW%20BAR/server.js):
  ```javascript
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
      systemPrompt = systemPrompt.replace('{{SUBJECT}}', subName);

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
      const { generateFlashcards } = require('./lib/litellm');
      const result = await generateFlashcards(systemPrompt, prompt || 'double sale', groundingContext, {
        paragraphIds: paragraphIds || []
      });

      res.json({ success: true, markdown: result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  ```

- [ ] **Step 5: Export generateFlashcards in lib/litellm.js**
  Open [lib/litellm.js](file:///home/user/Documents/LAW%20BAR/lib/litellm.js#L474-L487) and define `generateFlashcards`:
  ```javascript
  // Insert inside lib/litellm.js:
  async function generateFlashcards(systemPrompt, prompt, groundingContext, options = {}) {
    const userPrompt = `USER REQUEST: ${prompt}\n\n${groundingContext}\n\nGenerate flashcards based on the instructions. Provide the output in markdown code blocks.`;

    if (!LLM_GATEWAY_URL || !LLM_GATEWAY_KEY) {
      // Mock generation when gateway is unavailable
      const mockCards = [];
      const paras = options.paragraphIds || [];
      const count = Math.max(1, paras.length);
      for (let i = 0; i < count; i++) {
        const pId = paras[i] || 'mock-source-p1';
        mockCards.push(`CARD gen-${i + 1}
  FRONT (shape): Abstracted fact pattern related to prompt: "${prompt}" (Mock #${i + 1}).
  FRONT (trigger words): trigger, keyphrase, signal
  BACK (provision): Art. 1544 - Double Sale (Mock)
  BACK (elements):
  1. First buyer valid sale
  2. Second buyer valid sale
  BACK (common confusion): Art. 1458 - Sale :: Distinction is double sale requires two sales.
  SOURCE: Civil Code Art. 1544
  SOURCE_PARAGRAPH: ${pId}`);
      }
      return mockCards.join('\n\n');
    }

    try {
      const response = await callLiteLLM(systemPrompt, userPrompt, {
        model: process.env.LLM_MODEL || 'openrouter/anthropic/claude-sonnet-4',
        maxTokens: 4000,
        temperature: 0.2
      });
      return response.content;
    } catch (err) {
      throw new Error(`LLM generation failed: ${err.message}`);
    }
  }

  // Add to module.exports:
  module.exports = {
    evaluateALAC,
    extractJSON,
    sanitizeUserInput,
    validateEvaluationStructure,
    buildUserPrompt,
    generateFlashcards, // <--- Add this line
    _internal: {
      generateMockEvaluation,
      callLiteLLM,
      DEFAULTS,
    },
  };
  ```

- [ ] **Step 6: Run tests to verify they pass**
  Run: `node --test tests/server.test.js`
  Expected: PASS

- [ ] **Step 7: Commit changes**
  ```bash
  git add server.js lib/litellm.js tests/server.test.js
  git commit -m "feat: implement source paragraphs list and AI generation endpoints"
  ```

---

### Task 4: Ingestion Studio UI (Studio Tab 3 UI Update)

**Files:**
* Modify: [public/studio.html](file:///home/user/Documents/LAW%20BAR/public/studio.html)

**Interfaces:**
* Consumes: `/api/sources/:id/paragraphs`, `/api/generate/flashcards`, `/api/import`
* Produces: Grounded generation UI controls, interactive paragraph list, generation runner, and import trigger.

- [ ] **Step 1: Add HTML markup for checklist, search input, select buttons, and import button**
  Replace the Tab 3 panel markup in [public/studio.html](file:///home/user/Documents/LAW%20BAR/public/studio.html#L199-L232):
  ```html
      <div class="studio-tab-panel" id="tab-generator">
        <div class="source-import-form">
          <div class="form-row">
            <div class="form-group">
              <label for="gen-subject-select">Subject:</label>
              <select id="gen-subject-select" class="select-box">
                <option value="">-- Select Subject --</option>
              </select>
            </div>
            <div class="form-group">
              <label for="gen-source-select">Attach Source (for grounding):</label>
              <select id="gen-source-select" class="select-box">
                <option value="">-- Select source (optional) --</option>
              </select>
            </div>
          </div>

          <!-- New Checklist Container -->
          <div id="gen-paragraphs-container" class="form-group" style="display: none;">
            <label>Select Grounding Paragraphs (UI Selection):</label>
            <div class="form-row" style="margin-bottom: 8px;">
              <input type="text" id="gen-para-search" placeholder="Search articles/paragraphs..." class="input-box" style="flex: 1; margin-right: 8px;" />
              <button id="gen-para-select-all" class="btn-secondary" style="margin-right: 8px; padding: 6px 12px; font-size: 13px;">Select All</button>
              <button id="gen-para-clear" class="btn-secondary" style="padding: 6px 12px; font-size: 13px;">Clear Selection</button>
            </div>
            <div id="gen-paragraphs-list" style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; background: rgba(255, 255, 255, 0.03);">
              <!-- Rendered dynamically -->
            </div>
            <div id="gen-selection-summary" style="font-size: 12px; margin-top: 6px; opacity: 0.8;">0 paragraphs selected</div>
          </div>

          <div class="form-group">
            <label for="gen-prompt-input">Generation Prompt:</label>
            <textarea id="gen-prompt-input" placeholder="Generate 5 flashcards about double sales..." style="min-height: 120px;"></textarea>
          </div>
          <div class="action-row" style="margin-top: 0; display: flex; gap: 10px;">
            <button id="gen-submit-btn" class="btn-premium btn-primary" style="flex: 1;">Generate</button>
            <button id="gen-import-btn" class="btn-premium" style="flex: 1; display: none; background: linear-gradient(135deg, #10b981 0%, #059669 100%);">Import Cards</button>
          </div>
          <div class="log-box" id="gen-logs" style="margin-top: 0; min-height: 120px;">
            <span class="system">[AI Generator Ready] Attach a source document above to select grounding paragraphs.</span>
          </div>
        </div>
      </div>
  ```

- [ ] **Step 2: Add dynamic checklist and generation handlers**
  In [public/studio.html](file:///home/user/Documents/LAW%20BAR/public/studio.html#L513-L538), replace the placeholder event listener with:
  ```javascript
      const genSubjectSelect = document.getElementById('gen-subject-select');
      const genSourceSelect = document.getElementById('gen-source-select');
      const genParagraphsContainer = document.getElementById('gen-paragraphs-container');
      const genParagraphsList = document.getElementById('gen-paragraphs-list');
      const genParaSearch = document.getElementById('gen-para-search');
      const genSelectionSummary = document.getElementById('gen-selection-summary');
      const genSelectAllBtn = document.getElementById('gen-para-select-all');
      const genClearBtn = document.getElementById('gen-para-clear');
      
      const genSubmitBtn = document.getElementById('gen-submit-btn');
      const genImportBtn = document.getElementById('gen-import-btn');
      const genLogs = document.getElementById('gen-logs');
      const genPromptInput = document.getElementById('gen-prompt-input');

      let paragraphsData = [];
      let generatedMarkdown = '';

      if (genSourceSelect) {
        genSourceSelect.addEventListener('change', () => {
          const sourceId = genSourceSelect.value;
          paragraphsData = [];
          genParagraphsList.innerHTML = '';
          genParagraphsContainer.style.display = 'none';
          genSelectionSummary.textContent = '0 paragraphs selected';
          genImportBtn.style.display = 'none';

          if (!sourceId) return;

          genLogs.innerHTML = '<span class="system">[Loading] Fetching source paragraphs...</span>';
          fetch(`/api/sources/${sourceId}/paragraphs`)
            .then(res => res.json())
            .then(paras => {
              paragraphsData = paras;
              genParagraphsContainer.style.display = 'block';
              renderParagraphs();
              genLogs.innerHTML = `<span class="system">[Loaded] ${paras.length} paragraphs loaded from source. Select the ones you wish to ground generation.</span>`;
            })
            .catch(err => {
              genLogs.innerHTML = `<span class="err">Error loading paragraphs: ${err.message}</span>`;
            });
        });
      }

      function renderParagraphs() {
        const query = genParaSearch.value.toLowerCase();
        genParagraphsList.innerHTML = '';

        const filtered = paragraphsData.filter(p => 
          p.anchor_id.toLowerCase().includes(query) || 
          p.content_text.toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
          genParagraphsList.innerHTML = '<div style="opacity: 0.6; font-size: 13px; text-align: center; padding: 20px;">No matching paragraphs found.</div>';
          return;
        }

        filtered.forEach(p => {
          const item = document.createElement('div');
          item.style.display = 'flex';
          item.style.alignItems = 'flex-start';
          item.style.gap = '8px';
          item.style.marginBottom = '6px';
          item.style.fontSize = '13px';
          item.style.cursor = 'pointer';

          const cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.value = p.id;
          cb.dataset.anchor = p.anchor_id;
          cb.style.marginTop = '3px';
          cb.checked = p.checked || false;

          cb.addEventListener('change', () => {
            p.checked = cb.checked;
            updateSelectionCount();
          });

          item.addEventListener('click', (e) => {
            if (e.target !== cb) {
              cb.checked = !cb.checked;
              p.checked = cb.checked;
              updateSelectionCount();
            }
          });

          const label = document.createElement('div');
          label.innerHTML = `<strong>${escapeHtml(p.anchor_id)}</strong>: ${escapeHtml(p.content_text.substring(0, 120))}${p.content_text.length > 120 ? '...' : ''}`;
          
          item.appendChild(cb);
          item.appendChild(label);
          genParagraphsList.appendChild(item);
        });
      }

      function updateSelectionCount() {
        const count = paragraphsData.filter(p => p.checked).length;
        genSelectionSummary.textContent = `${count} paragraphs selected`;
      }

      genParaSearch.addEventListener('input', renderParagraphs);

      genSelectAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        paragraphsData.forEach(p => p.checked = true);
        renderParagraphs();
        updateSelectionCount();
      });

      genClearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        paragraphsData.forEach(p => p.checked = false);
        renderParagraphs();
        updateSelectionCount();
      });

      genSubmitBtn.addEventListener('click', () => {
        const subjectId = genSubjectSelect.value;
        const sourceId = genSourceSelect.value;
        const prompt = genPromptInput.value.trim();
        const selectedParaIds = paragraphsData.filter(p => p.checked).map(p => p.id);

        if (!subjectId) {
          genLogs.innerHTML = '<span class="err"><strong>Error:</strong> Please select a subject.</span>';
          return;
        }
        if (!prompt) {
          genLogs.innerHTML = '<span class="err"><strong>Error:</strong> Please enter a generation prompt.</span>';
          return;
        }

        genLogs.innerHTML = '<span class="system">[AI Generator] Sending prompt to LiteLLM gateway... (this may take 15-30 seconds)</span>';
        genSubmitBtn.disabled = true;
        genImportBtn.style.display = 'none';

        fetch('/api/generate/flashcards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectId,
            sourceId: sourceId || null,
            paragraphIds: selectedParaIds,
            prompt
          })
        })
        .then(res => {
          if (!res.ok) return res.json().then(e => { throw e; });
          return res.json();
        })
        .then(res => {
          generatedMarkdown = res.markdown;
          genLogs.innerHTML = `<span class="ok"><strong>Generation Complete!</strong> Review the markdown below:</span><br><br><pre style="white-space: pre-wrap; font-family: monospace; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px; font-size: 13px;">${escapeHtml(generatedMarkdown)}</pre>`;
          genSubmitBtn.disabled = false;
          genImportBtn.style.display = 'block';
        })
        .catch(err => {
          genLogs.innerHTML = `<span class="err"><strong>Generation Failed:</strong> ${escapeHtml(err.error || err.message || 'Unknown error')}</span>`;
          genSubmitBtn.disabled = false;
        });
      });

      genImportBtn.addEventListener('click', () => {
        const subjectId = genSubjectSelect.value;
        if (!generatedMarkdown) return;

        genLogs.innerHTML = '<span class="system">[Inbound Ingestion] Ingesting generated cards into the database...</span>';
        genImportBtn.disabled = true;

        fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subjectId,
            markdown: generatedMarkdown
          })
        })
        .then(res => {
          if (!res.ok) return res.json().then(e => { throw e; });
          return res.json();
        })
        .then(res => {
          genLogs.innerHTML = `<span class="ok"><strong>Import Success!</strong> Ingested ${res.count} shapes and flashcards into the database.</span><br><br><pre style="white-space: pre-wrap; font-family: monospace; background: rgba(0,0,0,0.2); padding: 10px; border-radius: 4px; font-size: 13px;">${escapeHtml(generatedMarkdown)}</pre>`;
          genImportBtn.disabled = false;
          genImportBtn.style.display = 'none';
          generatedMarkdown = '';
        })
        .catch(err => {
          genLogs.innerHTML = `<span class="err"><strong>Import Failed:</strong> ${escapeHtml(err.error || err.message)}</span>`;
          genImportBtn.disabled = false;
        });
      });
  ```

- [ ] **Step 3: Test local page serving**
  Run: `node server.js` inside `/home/user/Documents/LAW BAR`
  Open `http://localhost:3005/studio.html` and verify the AI Generator Tab shows the dynamic paragraph list and search functions.

- [ ] **Step 4: Commit changes**
  ```bash
  git add public/studio.html
  git commit -m "feat: implement interactive UI selected grounding paragraphs checklist in Studio"
  ```

---

### Task 5: Codal Reader & ALAC Integration

**Files:**
* Modify: [public/reader.html](file:///home/user/Documents/LAW%20BAR/public/reader.html)
* Modify: [public/app.js](file:///home/user/Documents/LAW%20BAR/public/app.js)

**Interfaces:**
* Consumes: Database paragraph mappings and flashcards relations.
* Produces: Badge count in Codal Reader and clickable drawer displays.

- [ ] **Step 1: Add a badge count retrieval to getParagraphMapping**
  Modify `getParagraphMapping()` in [db.js](file:///home/user/Documents/LAW%20BAR/db.js#L210-L218) to retrieve connected flashcard counts:
  ```javascript
      // Inside getParagraphMapping(paragraphIdOrAnchor):
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
        flashcards: relatedCards // <--- Add this line
      };
  ```

- [ ] **Step 2: Add badge UI rendering in Codal Reader**
  Modify [public/reader.html](file:///home/user/Documents/LAW%20BAR/public/reader.html) to render a list of cards if they exist.
  Let's see how paragraphs are currently rendered in [public/reader.html](file:///home/user/Documents/LAW%20BAR/public/reader.html). Let's query lines containing `render` or `paragraphs` in it.
  
  Let's search inside reader.html:
  Run a search to understand where paragraphs are listed. We know `reader.html` loads paragraphs and renders them.
  Let's inspect reader.html rendering. In the design spec, we will update the javascript inside reader.html to check for `flashcards` and render a clickable pill:
  ```html
  <!-- Badge code block to insert during rendering in reader.html -->
  ```
  Let's specify the exact replacement chunks.
  
  In [public/reader.html](file:///home/user/Documents/LAW%20BAR/public/reader.html), look for the function that creates the paragraph elements (around line 200) and update it:
  ```javascript
  // Update rendering logic inside public/reader.html:
  const badgeHtml = mapping.flashcards && mapping.flashcards.length > 0 
    ? `<span class="flashcard-badge" style="background: var(--primary-color); color: #fff; border-radius: 12px; padding: 2px 8px; font-size: 11px; margin-left: 8px; cursor: pointer; display: inline-block;">⚡ ${mapping.flashcards.length} shapes</span>` 
    : '';
  ```
  When the badge is clicked, display a slide-out drawer or overlay showing the cards.
  
  Let's add the drawer container in [public/reader.html](file:///home/user/Documents/LAW%20BAR/public/reader.html):
  ```html
  <!-- Add Drawer element at the bottom of public/reader.html body -->
  <div id="reader-drawer" style="position: fixed; right: -400px; top: 0; width: 380px; height: 100%; background: #1e1e2e; border-left: 1px solid var(--border-color); box-shadow: -5px 0 15px rgba(0,0,0,0.5); z-index: 1000; transition: right 0.3s ease; padding: 20px; box-sizing: border-box; overflow-y: auto;">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
      <h3 style="margin: 0; color: var(--primary-color);">Related Shapes</h3>
      <button onclick="document.getElementById('reader-drawer').style.right = '-400px'" class="btn-secondary" style="padding: 4px 8px; font-size: 12px;">Close</button>
    </div>
    <div id="reader-drawer-content"></div>
  </div>
  ```
  And wire the click event to open the drawer:
  ```javascript
  window.showRelatedCards = function(paraId) {
    fetch(`/api/paragraphs/${paraId}`)
      .then(res => res.json())
      .then(mapping => {
        const content = document.getElementById('reader-drawer-content');
        content.innerHTML = '';
        if (!mapping.flashcards || mapping.flashcards.length === 0) {
          content.innerHTML = '<p style="opacity: 0.6;">No related cards found.</p>';
        } else {
          mapping.flashcards.forEach(fc => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.style.padding = '15px';
            cardEl.style.marginBottom = '15px';
            cardEl.style.background = 'rgba(255,255,255,0.03)';
            cardEl.style.borderRadius = '8px';
            cardEl.style.border = '1px solid var(--border-color)';
            cardEl.innerHTML = `
              <div style="font-weight: bold; margin-bottom: 8px; font-size: 14px;">${escapeHtml(fc.shape_text)}</div>
              <div style="font-size: 12px; opacity: 0.7;">Card ID: ${escapeHtml(fc.id)}</div>
            `;
            content.appendChild(cardEl);
          });
        }
        document.getElementById('reader-drawer').style.right = '0';
      });
  };
  ```

- [ ] **Step 3: Run integration test**
  Verify that when viewing articles in the Reader page, paragraphs containing linked flashcards show the badge correctly.

- [ ] **Step 4: Commit changes**
  ```bash
  git add public/reader.html db.js public/app.js
  git commit -m "feat: show source-linked flashcards badge in Codal Reader"
  ```

---

### Task 6: Backfill Migration Script

**Files:**
* Create: `scripts/backfill-flashcard-sources.js`

**Interfaces:**
* Consumes: Existing SQLite database `./bar_exam.db`
* Produces: Migration updates inside SQLite database.

- [ ] **Step 1: Create the backfill script**
  Create the migration script `scripts/backfill-flashcard-sources.js`:
  ```javascript
  const { DbAdapter } = require('../db');
  const db = new DbAdapter();
  db.initialize();

  console.log("Starting backfill migration of flashcard source links...");

  const flashcards = db.db.prepare("SELECT * FROM flashcards WHERE source_paragraph_id IS NULL").all();
  console.log(`Found ${flashcards.length} unlinked flashcards.`);

  let successCount = 0;

  db.db.exec("BEGIN");
  try {
    for (const fc of flashcards) {
      // Try to parse the citation for article numbers (e.g. "Art. 1544")
      const cit = fc.source_citation;
      const match = cit.match(/\bart\.?\s*(\d+)/i);
      if (!match) continue;

      const artNum = match[1]; // e.g. "1544"
      
      // Look for a source paragraph under this card's subject containing "p1544" or "Art. 1544"
      const stmt = db.db.prepare(`
        SELECT sp.id, sp.content_text 
        FROM source_paragraphs sp
        JOIN sources s ON sp.source_id = s.id
        WHERE s.subject_id = ? AND (sp.anchor_id LIKE ? OR sp.content_text LIKE ?)
      `);
      
      const paras = stmt.all(fc.subject_id, `%p${artNum}%`, `%Art%${artNum}%`);
      if (paras.length === 1) {
        db.db.prepare("UPDATE flashcards SET source_paragraph_id = ? WHERE id = ?").run(paras[0].id, fc.id);
        successCount++;
        console.log(`Linked card "${fc.id}" ("${cit}") to paragraph "${paras[0].id}"`);
      } else if (paras.length > 1) {
        // Tie-breaker: pick the one where anchor matches exactly
        const exactMatch = paras.find(p => p.id.endsWith(`p${artNum}`));
        if (exactMatch) {
          db.db.prepare("UPDATE flashcards SET source_paragraph_id = ? WHERE id = ?").run(exactMatch.id, fc.id);
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
  ```

- [ ] **Step 2: Run the script to verify**
  Run: `node scripts/backfill-flashcard-sources.js`
  Expected: Reports success linking cards (or 0 if none match, but runs without errors).

- [ ] **Step 3: Commit changes**
  ```bash
  git add scripts/backfill-flashcard-sources.js
  git commit -m "feat: add backfill migration script to link existing cards"
  ```
