# Retrieval Funnel Ingestion Pipeline Instructions

This directory contains the necessary prompts, schemas, and source registries for an incoming AI Agent (such as Claude Code or a Gemini task runner) to crawl legal sources, analyze past bar questions, and output the normalized Retrieval Funnel Markdown decks.

---

## Ingestion Workflow for the Pipeline Agent

1. **Read the Source Registry**: Read `subject-sources.json` to find the target subject's official codal URL.
2. **Retrieve the Codal Text**: Fetch/scrape the codal text for the target subject (using search/web tools or local text references).
3. **Execute the Generation Prompt**: Run `generation-prompt.md` in a fresh LLM context. Feed it the codal text and search results of past Philippine Bar Exam questions in that subject (prioritizing Official SC Q&A).
4. **Produce standard Markdown**: Generate a clean Markdown file named `{{SUBJECT}}-shapes-triggers-flashcards.md` matching the structure in `sample-input-output.md`.
5. **Import into database**: Send the output to the Express server API (`POST /api/import`) or use the MCP tool `import_subject_markdown` in `mcp-server.js` to ingest it into `bar_exam.db`.
