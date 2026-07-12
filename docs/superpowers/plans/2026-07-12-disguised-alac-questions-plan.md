# Disguised ALAC Questions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple ALAC practice from raw flashcards by introducing disguised questions linked to one or more flashcards, providing hints, combined answer keys, and AI evaluations.

**Architecture:** We introduce SQLite tables `alac_questions` and `alac_question_flashcards` to model many-to-many relationships. The ingestion pipeline (`parser.js`) is updated to parse questions from markdown, and `server.js` is updated to expose fetching/evaluation APIs. The frontend provides a hint-system and a management interface in the Studio tab.

**Tech Stack:** Node.js, Express, Better-SQLite3, Vanilla JS/CSS/HTML

## Global Constraints
- Do not use placeholders or TODOs.
- Maintain documentation integrity and preserve existing unrelated comments.
- All database operations must be wrapped in `db.js` database class methods.
- Write tests for database queries, parser, and server APIs first before implementation (TDD).

---

### Task 1: Database Migration & Model Methods

**Files:**
- Modify: `schema.sql` (to add new table definitions)
- Modify: `db.js` (to add query methods)
- Modify: `tests/db.test.js` (to write and run unit tests)

**Interfaces:**
- Produces: `db.getAlacQuestions(subjectId)`: returns array of questions with nested linked flashcards.
- Produces: `db.createAlacQuestion({ id, subject_id, question_text, linked_flashcard_ids })`: inserts/updates a question.
- Produces: `db.deleteAlacQuestion(id)`: deletes a question.

- [ ] **Step 1: Write database tests**
  Add tests at the end of `tests/db.test.js` to assert ALAC questions CRUD operations:
  ```javascript
  // tests/db.test.js
  test('ALAC Questions CRUD operations', () => {
    // 1. Create subject & flashcards first
    db.db.exec("INSERT OR IGNORE INTO subjects (id, name) VALUES ('test-subject', 'Test Subject')");
    db.db.exec("INSERT OR IGNORE INTO shapes (id, subject_id, shape_text) VALUES ('test-shape-1', 'test-subject', 'Shape 1')");
    db.db.exec("INSERT OR IGNORE INTO provisions (id, subject_id, citation, short_title, elements_checklist) VALUES ('test-prov-1', 'test-subject', 'Art. 1', 'Title 1', '[\"El 1\"]')");
    db.db.exec("INSERT OR IGNORE INTO shape_provisions (shape_id, provision_id, is_primary) VALUES ('test-shape-1', 'test-prov-1', 1)");
    db.db.exec("INSERT OR IGNORE INTO flashcards (id, subject_id, shape_id, source_citation) VALUES ('fc-1', 'test-subject', 'test-shape-1', 'Source 1')");

    // 2. Create ALAC question
    const qData = {
      id: 'alac-q-1',
      subject_id: 'test-subject',
      question_text: 'This is a disguised bar-exam question.',
      linked_flashcard_ids: ['fc-1']
    };
    db.createAlacQuestion(qData);

    // 3. Fetch ALAC questions and verify
    const questions = db.getAlacQuestions('test-subject');
    assert.strictEqual(questions.length, 1);
    assert.strictEqual(questions[0].id, 'alac-q-1');
    assert.strictEqual(questions[0].question_text, 'This is a disguised bar-exam question.');
    assert.strictEqual(questions[0].linked_cards.length, 1);
    assert.strictEqual(questions[0].linked_cards[0].id, 'fc-1');

    // 4. Delete ALAC question
    db.deleteAlacQuestion('alac-q-1');
    const questionsAfter = db.getAlacQuestions('test-subject');
    assert.strictEqual(questionsAfter.length, 0);
  });
  ```

- [ ] **Step 2: Run tests and verify failure**
  Run: `npm test tests/db.test.js`
  Expected: FAIL with "db.createAlacQuestion is not a function"

- [ ] **Step 3: Modify `schema.sql`**
  Append the table definitions to [schema.sql](file:///home/user/Documents/LAW%20BAR/schema.sql):
  ```sql
  CREATE TABLE IF NOT EXISTS alac_questions (
    id TEXT PRIMARY KEY,
    subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS alac_question_flashcards (
    alac_question_id TEXT REFERENCES alac_questions(id) ON DELETE CASCADE,
    flashcard_id TEXT REFERENCES flashcards(id) ON DELETE CASCADE,
    PRIMARY KEY (alac_question_id, flashcard_id)
  );
  ```

- [ ] **Step 4: Implement methods in `db.js`**
  Modify [db.js](file:///home/user/Documents/LAW%20BAR/db.js) to initialize these tables in constructor (if not already handled by schema.sql execution) and implement methods:
  ```javascript
  createAlacQuestion({ id, subject_id, question_text, linked_flashcard_ids }) {
    const runTx = this.db.transaction(() => {
      // Insert/replace alac_question
      const insertQ = this.db.prepare(`
        INSERT OR REPLACE INTO alac_questions (id, subject_id, question_text)
        VALUES (?, ?, ?)
      `);
      insertQ.run(id, subject_id, question_text);

      // Clear existing links
      const deleteLinks = this.db.prepare(`
        DELETE FROM alac_question_flashcards WHERE alac_question_id = ?
      `);
      deleteLinks.run(id);

      // Insert new links
      if (linked_flashcard_ids && linked_flashcard_ids.length > 0) {
        const insertLink = this.db.prepare(`
          INSERT INTO alac_question_flashcards (alac_question_id, flashcard_id)
          VALUES (?, ?)
        `);
        for (const fcId of linked_flashcard_ids) {
          insertLink.run(id, fcId);
        }
      }
    });
    runTx();
  }

  getAlacQuestions(subjectId) {
    const questionsQuery = this.db.prepare(`
      SELECT id, subject_id, question_text FROM alac_questions WHERE subject_id = ?
    `);
    const rows = questionsQuery.all(subjectId);

    const linksQuery = this.db.prepare(`
      SELECT f.id, s.shape_text as front_shape,
             (SELECT json_group_array(word) FROM trigger_words WHERE shape_id = s.id) as front_triggers,
             p.citation || ' (' || p.short_title || ')' as back_provision,
             p.elements_checklist as back_elements,
             p.common_confusion as back_confusion
      FROM alac_question_flashcards aqf
      JOIN flashcards f ON aqf.flashcard_id = f.id
      JOIN shapes s ON f.shape_id = s.id
      JOIN shape_provisions sp ON s.id = sp.shape_id AND sp.is_primary = 1
      JOIN provisions p ON sp.provision_id = p.id
      WHERE aqf.alac_question_id = ?
    `);

    return rows.map(q => {
      const cards = linksQuery.all(q.id).map(c => ({
        ...c,
        front_triggers: JSON.parse(c.front_triggers),
        back_elements: JSON.parse(c.back_elements)
      }));
      return {
        ...q,
        linked_cards: cards
      };
    });
  }

  deleteAlacQuestion(id) {
    const stmt = this.db.prepare('DELETE FROM alac_questions WHERE id = ?');
    stmt.run(id);
  }
  ```

- [ ] **Step 5: Run tests and verify success**
  Run: `npm test tests/db.test.js`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add schema.sql db.js tests/db.test.js && git commit -m "feat(db): add alac_questions schema and database queries"`

---

### Task 2: Pipeline Ingestion (Parser Updates)

**Files:**
- Modify: `parser.js` (to parse `### ALAC QUESTIONS` block)
- Modify: `tests/parser.test.js` (to test parser changes)

- [ ] **Step 1: Write parser tests**
  Add unit tests to `tests/parser.test.js` asserting parsing of markdown with `### ALAC QUESTIONS`:
  ```javascript
  // tests/parser.test.js snippet
  test('Parse ALAC Questions from markdown', () => {
    const md = `
  CARD civil-1
  FRONT (shape): Sale 1
  FRONT (trigger words): sale
  BACK (provision): Art. 1
  BACK (elements):
  1. Element 1
  BACK (common confusion): None
  SOURCE: Civil Code Art. 1

  ### ALAC QUESTIONS

  QUESTION civil-alac-1
  SUBJECT: civil-law
  QUESTION_TEXT: A sold to B...
  LINKED_FLASHCARDS: civil-1
  `;
    const parsed = parseSubjectMarkdown(md);
    assert.strictEqual(parsed.alacQuestions.length, 1);
    assert.strictEqual(parsed.alacQuestions[0].id, 'civil-alac-1');
    assert.strictEqual(parsed.alacQuestions[0].subject_id, 'civil-law');
    assert.strictEqual(parsed.alacQuestions[0].question_text, 'A sold to B...');
    assert.deepStrictEqual(parsed.alacQuestions[0].linked_flashcard_ids, ['civil-1']);
  });
  ```

- [ ] **Step 2: Run tests and verify failure**
  Run: `npm test tests/parser.test.js`
  Expected: FAIL (cannot read property length of undefined, or incorrect parsed elements)

- [ ] **Step 3: Modify `parser.js`**
  Modify [parser.js](file:///home/user/Documents/LAW%20BAR/parser.js) to parse the `### ALAC QUESTIONS` section.
  Add helper method or logic inside `parseSubjectMarkdown`:
  ```javascript
  // Near the end of parseSubjectMarkdown block
  const result = { flashcards: [], decoyPairs: [], alacQuestions: [] };
  // Find "### ALAC QUESTIONS" block
  const parts = markdown.split(/### ALAC QUESTIONS/i);
  const flashcardPart = parts[0];
  const alacPart = parts[1] || '';

  // Parse flashcards and decoy pairs from flashcardPart as before...

  // Parse ALAC Questions
  const questionBlocks = alacPart.split(/QUESTION\s+/i);
  for (const block of questionBlocks) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    const id = lines[0].trim();
    let subject_id = '';
    let question_text = '';
    let linked_flashcard_ids = [];

    for (const line of lines.slice(1)) {
      const matchSub = line.match(/^SUBJECT:\s*(.*)/i);
      const matchText = line.match(/^QUESTION_TEXT:\s*(.*)/i);
      const matchLinks = line.match(/^LINKED_FLASHCARDS:\s*(.*)/i);

      if (matchSub) subject_id = matchSub[1].trim();
      if (matchText) question_text = matchText[1].trim();
      if (matchLinks) {
        linked_flashcard_ids = matchLinks[1].split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (id && question_text) {
      result.alacQuestions.push({ id, subject_id, question_text, linked_flashcard_ids });
    }
  }
  ```

- [ ] **Step 4: Update importer script**
  Verify that scripts like `scripts/import-political-law.js` or standard `POST /api/import` endpoint calls insert the parsed `alacQuestions` using `db.createAlacQuestion(q)`.

- [ ] **Step 5: Run tests and verify success**
  Run: `npm test tests/parser.test.js`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add parser.js tests/parser.test.js && git commit -m "feat(parser): support parsing and importing ALAC questions from markdown"`

---

### Task 3: Backend API routes

**Files:**
- Modify: `server.js` (to expose API endpoints)
- Modify: `tests/server.test.js` (to test server routes)

- [ ] **Step 1: Write API integration tests**
  Add assertions in `tests/server.test.js` for `GET /api/subjects/:id/alac-questions`, `POST /api/alac-questions`, and update `POST /api/alac/evaluate`.
  ```javascript
  // tests/server.test.js snippet
  test('POST /api/alac-questions and GET endpoints', async () => {
    const resPost = await request(app)
      .post('/api/alac-questions')
      .send({
        id: 'alac-q-test-1',
        subject_id: 'civil-law',
        question_text: 'A sold to B...',
        linked_flashcard_ids: []
      });
    assert.strictEqual(resPost.status, 200);

    const resGet = await request(app).get('/api/subjects/civil-law/alac-questions');
    assert.strictEqual(resGet.status, 200);
    const body = resGet.body;
    assert(body.some(q => q.id === 'alac-q-test-1'));
  });
  ```

- [ ] **Step 2: Run tests and verify failure**
  Run: `npm test tests/server.test.js`
  Expected: FAIL with status 404/500

- [ ] **Step 3: Modify `server.js` to implement endpoints**
  Inject these routes in [server.js](file:///home/user/Documents/LAW%20BAR/server.js):
  ```javascript
  app.get('/api/subjects/:id/alac-questions', (req, res) => {
    try {
      const questions = db.getAlacQuestions(req.params.id);
      res.json(questions);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/alac-questions', (req, res) => {
    try {
      const { id, subject_id, question_text, linked_flashcard_ids } = req.body;
      if (!subject_id || !question_text) {
        return res.status(400).json({ error: 'Missing subject_id or question_text' });
      }
      const qId = id || `alac-${subject_id}-${Date.now()}`;
      db.createAlacQuestion({ id: qId, subject_id, question_text, linked_flashcard_ids });
      res.json({ success: true, id: qId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/alac-questions/:id', (req, res) => {
    try {
      db.deleteAlacQuestion(req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  ```

- [ ] **Step 4: Update API evaluation route**
  In the `POST /api/alac/evaluate` endpoint inside [server.js](file:///home/user/Documents/LAW%20BAR/server.js), update the validation and prompt assembly:
  - If input is an ALAC Question, merge the provisions, elements, and confusion traps of all linked cards into the criteria sent to LiteLLM.

- [ ] **Step 5: Run tests and verify success**
  Run: `npm test tests/server.test.js`
  Expected: PASS

- [ ] **Step 6: Commit**
  Run: `git add server.js tests/server.test.js && git commit -m "feat(api): add endpoints to manage and evaluate ALAC questions"`

---

### Task 4: Frontend Practice UI Integration

**Files:**
- Modify: `public/alac.html`
- Modify: `public/app.js`
- Modify: `public/app.css`

- [ ] **Step 1: Modify HTML structure (`alac.html`)**
  Update [alac.html](file:///home/user/Documents/LAW%20BAR/public/alac.html) to show hint container and structure for displaying multiple answer keys:
  - Add an inline Hint Banner or a toggled box: `<div id="alac-hint-box" class="hint-box" style="display:none;"></div>`
  - Add `💡 Get Hint` button next to `🔑 Reveal Answer Key` button.
  
- [ ] **Step 2: Update frontend fetch and state logic (`app.js`)**
  Modify [app.js](file:///home/user/Documents/LAW%20BAR/public/app.js) to load ALAC Questions instead of flashcards directly.
  Replace the subject change handler:
  ```javascript
  // Inside alacSubjectDropdown listener
  fetch(`/api/subjects/${subjectId}/alac-questions`)
    .then(res => res.json())
    .then(data => {
      alacQuestionsList = data || [];
      alacIndex = 0;
      renderAlacQuestion();
    });
  ```
  Implement the `renderAlacQuestion` function:
  * Display `question.question_text` as the primary challenge prompt.
  * Clicking `💡 Get Hint` displays the shapes and trigger words of `linked_cards`.
  * Clicking `🔑 Reveal Answer Key` displays the combined checklist/provisions.
  * Wire up AI evaluation to send `question_text` and merged checklist metadata.

- [ ] **Step 3: Modify CSS (`app.css`)**
  Add styles for the `.hint-box` styling, badge overlays, and structured markdown alignment.

- [ ] **Step 4: Commit**
  Run: `git add public/alac.html public/app.js public/app.css && git commit -m "feat(ui): update ALAC Practice page to use disguised questions and hint system"`

---

### Task 5: Studio UI Editor Tab

**Files:**
- Modify: `public/studio.html`
- Modify: `public/app.js`

- [ ] **Step 1: Add ALAC Questions tab to Studio HTML**
  Modify `public/studio.html` to add a panel for editing, creating, and viewing ALAC questions. Include checkboxes to link flashcards.

- [ ] **Step 2: Implement editor JavaScript logic in `app.js`**
  Modify `public/app.js` (Studio block) to:
  * Populate flashcards checklist depending on selected subject.
  * Save questions via `POST /api/alac-questions`.
  * Trigger AI to auto-generate a disguised question prompt using `POST /api/alac/generate-disguised` or standard system prompt.

- [ ] **Step 3: Commit**
  Run: `git add public/studio.html public/app.js && git commit -m "feat(studio): add ALAC Question manager and custom card mapping tab"`
