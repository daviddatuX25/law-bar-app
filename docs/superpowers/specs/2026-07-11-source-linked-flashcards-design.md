# Design Spec: Grounded AI Flashcard Generation and Source Linking

This document specifies the architecture, data flow, and implementation plan for linking flashcards to their exact source paragraph citations. This closes the gap between flashcards, AI generation, and the Codal Reader, enabling full verification and contextual study.

## 1. Objectives
* Anchor flashcards directly to `source_paragraphs` in the database via a foreign key.
* Enhance `parser.js` to parse optional source paragraph mappings.
* Implement a Studio UI that allows users to select specific source paragraphs to ground AI generation.
* Wire the AI flashcard generator endpoint (`POST /api/generate/flashcards`) to call LiteLLM.
* Add related flashcards trace-back in the Codal Reader.
* Provide a backfill migration script to link existing flashcards to source paragraphs where possible.

## 2. Architecture & Data Flow

```mermaid
graph TD
    subgraph UI (Studio / Reader)
        Studio[Studio Ingestion Tab]
        Reader[Codal Reader]
    end

    subgraph API (server.js)
        GenEP[POST /api/generate/flashcards]
        ImportEP[POST /api/import]
        GetParagraphs[GET /api/sources/:id/paragraphs]
    end

    subgraph Core
        Parser[parser.js]
        DB[db.js SQLite]
        LLM[lib/litellm.js]
    end

    Studio -->|Request Grounding Paragraphs| GetParagraphs
    GetParagraphs -->|Return Paragraphs & IDs| Studio
    Studio -->|Prompt & Paragraph IDs| GenEP
    GenEP -->|Load System Prompt| SystemPrompt[generation-prompt.md]
    GenEP -->|Fetch Paragraph Texts| DB
    GenEP -->|Grounding Text + User Prompt| LLM
    LLM -->|Markdown with SOURCE_PARAGRAPH| GenEP
    GenEP -->|Preview Markdown| Studio
    Studio -->|User clicks Import| ImportEP
    ImportEP -->|Parse Markdown| Parser
    Parser -->|Structured Cards| DB
    Reader -->|Show linked shapes| DB
```

---

## 3. Detailed Components

### A. Database Schema Migration
* **New Column**: Add `source_paragraph_id TEXT REFERENCES source_paragraphs(id)` to the `flashcards` table.
* **Migration Code** in [db.js](file:///home/user/Documents/LAW%20BAR/db.js):
  Check if `source_paragraph_id` exists in `table_info('flashcards')`. If not, run:
  ```sql
  ALTER TABLE flashcards ADD COLUMN source_paragraph_id TEXT REFERENCES source_paragraphs(id);
  ```

### B. Parser Modifications
Update [parser.js](file:///home/user/Documents/LAW%20BAR/parser.js) to support the optional `SOURCE_PARAGRAPH` tag:
```markdown
CARD civil-1
FRONT (shape): Two buyers...
...
SOURCE: Civil Code Art. 1544
SOURCE_PARAGRAPH: civil-code-p1544
```
* **Order of parsing**: Match `SOURCE_PARAGRAPH:` *before* checking for `SOURCE:` prefix to avoid keyword shadowing.
* Pass `source_paragraph_id` as part of the parsed card object.

### C. Backend API Endpoints
1. **`GET /api/sources/:id/paragraphs`**
   * Returns: `{ id, anchor_id, content_text }[]` for all paragraphs in a source.
2. **`POST /api/generate/flashcards`**
   * Receives: `{ subjectId, sourceId, paragraphIds: [], prompt }`
   * Loads system prompt template from `pipeline/generation-prompt.md`.
   * Substitutes `{{SUBJECT}}` placeholder with the corresponding subject display name.
   * If `paragraphIds` is non-empty, fetches the corresponding paragraphs and appends them to the user prompt under a `GROUNDING_CONTEXT` section.
   * Calls `callLiteLLM`.
   * **Offline/Mock Fallback**: If LLM gateway is disabled, generates mock cards using the content of the selected paragraphs to ensure offline functionality.
3. **`POST /api/import`**
   * Handled by [db.js](file:///home/user/Documents/LAW%20BAR/db.js)'s `importSubjectData` / `insertSubjectData`.
   * Inserts the parsed cards, writing `source_paragraph_id` to the database.

### D. Ingestion Studio UI (Studio Tab 3)
* **Checklist Component**: When a source is selected, display a scrollable container listing paragraphs.
* **Filter Search**: Input to dynamically filter visible paragraphs (e.g. typing "1544" filters list to elements containing "1544").
* **Select Actions**: "Select All" / "Clear Selection" buttons.
* **Generate & Ingest**:
  * Send generation request → show loader.
  * Print output to the logs panel.
  * Enable "Import Cards" button if generation is successful.

### E. Codal Reader (reader.html) Integration
* **API Enhancement**: Update `/api/paragraphs/:id` or query flashcards directly.
* **UI**: Each paragraph container showing a clickable badge (e.g. `⚡ 2 cards`) if there are flashcards linked to it.
* **Action**: Clicking the badge expands a card deck overlay or slide-out displaying the shapes and triggers of the linked cards.

---

## 4. Backfill Migration Plan for Existing Flashcards
To link already imported flashcards to source paragraphs, we will implement a one-off backfill script:
* **Script File**: `scripts/backfill-flashcard-sources.js`
* **Process**:
  1. Select all flashcards where `source_paragraph_id` is null.
  2. Parse their `source_citation` to extract article numbers (e.g., "Art. 1544", "Article 1544").
  3. Query `source_paragraphs` under the card's subject matching those article markers in their `content_text` or `anchor_id`.
  4. If a clear single match is found (e.g. a paragraph containing the exact article number), update the card with that `source_paragraph_id`.
  5. Print a report of matches and unresolved citations.
