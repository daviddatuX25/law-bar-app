# Philippine Bar Examination Retrieval Funnel Application

An interactive, visual, and highly efficient review platform engineered for the Philippine Bar Examinations. Rather than re-teaching core legal definitions, this application is a **connective index** that allows bar candidates to map a complex case fact-pattern to its 2–4 candidate provisions and isolate the winning rule in under a minute.

---

## The Concept: The Retrieval Funnel

Most reviewees spend their time refilling their knowledge pool, but blank on exam day due to a routing bottleneck. This application structures retrieval into 5 deliberate tiers:

1. **Tier 1 (The Pool)**: All statutory provisions (Civil Code, Revised Penal Code, etc.) — thousands of lines of code.
2. **Tier 2 (Shapes)**: 15–25 recurring abstracted fact-pattern structures (e.g. *double sale of immovable*, *forged deed nullity*).
3. **Tier 3 (Triggers)**: 3–6 signaling words that examiners use to flag a shape. Highlights *ambiguous triggers* where candidates lose points.
4. **Tier 4 (The Short List)**: A numbered checklist of elements (no codal prose) to choose between candidate rules.
5. **Tier 5 (Committed)**: The single rule applied straight into the ALAC/IRAC essay writing format.

---

## Key Features

* **Relational Decoy Drills**: Compares two similar shapes sharing a trigger word side-by-side (e.g. valid double-sale vs. forged deed nullity) highlighting the distinguishing factor.
* **AST Markdown Parser & Ingestion Validator**: Drag-and-drop or paste pipeline-generated Markdown files (`{{SUBJECT}}-shapes-triggers-flashcards.md`). The parser builds an Abstract Syntax Tree (AST), validates formatting (e.g. numbered elements, trigger words), and reports errors before committing.
* **Linked Codal Reader**: A split-screen document viewer syncing codified paragraphs (left) directly with their shapes and elements checklists (right) on click or hover.
* **Native Node SQLite Support**: Utilizes the native synchronous SQLite API in Node 24 (`node:sqlite`), requiring zero binary compilation steps or external NPM database drivers.
* **Model Context Protocol (MCP) Server**: Provides a standard MCP gateway (`mcp-server.js`) so external AI agents can connect, extract decks, search trigger words, or bulk import books automatically.

---

## Installation & Setup

### Prerequisites
* **Node.js**: Version 22.5.0 or higher (to support native `node:sqlite`).

### Setup
1. Clone the repository and navigate into the folder:
   ```bash
   cd "LAW BAR"
   ```
2. Install the Express web server dependency:
   ```bash
   npm install
   ```
3. Initialize the database and run migrations:
   ```bash
   npm run seed
   ```
4. Start the Express web server (configured on port **3005** to avoid port conflicts):
   ```bash
   npm start
   ```
5. Open your browser to `http://localhost:3005` to study!

---

## Project Structure

```
├── db.js                 # Unified database adapter (local SQLite vs cloud LibSQL/Turso)
├── parser.js             # AST line-based Markdown parser and schema validator
├── schema.sql            # Normalized SQLite schema migrations
├── server.js             # Express API routing and static asset server (Port 3005)
├── mcp-server.js         # Model Context Protocol (MCP) server integration
├── scripts/
│   ├── seed.js           # Seeds core Civil Law and Criminal Law retrieval data
│   └── verify-relations.js # relational integrity verification rules
├── public/               # UI components (Vanilla HTML / CSS / JS)
│   ├── app.css           # Premium design style custom properties and tokens
│   ├── app.js            # Global scripts and UI routing
│   ├── index.html        # Funnel Dashboard
│   ├── deck.html         # Interactive Study deck and Decoy drills
│   ├── reader.html       # Split-screen Codal reader
│   └── studio.html       # Markdown Ingestion parser studio
├── tests/                # Test-Driven Development (TDD) assertions
```

---

## Database Schema (Normalized)

* **`subjects`**: Subject registry (Civil Law, Criminal Law, etc.).
* **`sources`**: Codal and book reference details.
* **`source_paragraphs`**: Split structural paragraph nodes mapped with `anchor_id`.
* **`shapes`**: Abstracted case facts containing frequency counts.
* **`provisions`**: Articles containing element checklists and common wrong-answer rules.
* **`shape_provisions`**: Many-to-many junction mapping shapes to candidate provisions.
* **`trigger_words`**: Phrases signaling shapes, highlighting ambiguous triggers and distinguishing criteria.
* **`decoy_pairs`**: Mapped pairs of confusable shapes sharing a trigger word.
* **`flashcards`**: Flashcard index mapping shapes to exam source citations.

---

## REST API Documentation

### Subjects
* **`GET /api/subjects`** — Returns all subjects and card counts.
* **`GET /api/subjects/:id/deck`** — Returns all flashcards (both standard and decoy pairs) for the specified subject.
* **`GET /api/subjects/:id/triggers`** — Returns a list of all trigger words mapped to shapes in the subject.

### Document Reader
* **`GET /api/sources/:id`** — Returns structured codal text with links to shapes and checklists.

### Import / Ingestion
* **`POST /api/import`** — Parses a Markdown template string and bulk inserts into SQLite.
  * *Request Body*: `{ subjectId: string, markdown: string }`

---

## MCP Server Integration

To connect an AI agent to this codebase, run the MCP server:
```bash
node mcp-server.js
```

### Supported Tools
1. `import_subject_markdown` (args: `subjectId`, `markdown`): Bulk imports cards into the SQLite database.
2. `get_flashcard_deck` (args: `subjectId`): Queries flashcard lists for a subject.

---

## Verification & Testing

All backend APIs, database initialization, parser validation edge-cases, and seed consistency are protected by Node's native test runner:

```bash
npm test
```
