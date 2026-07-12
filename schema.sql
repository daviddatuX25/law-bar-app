CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id)
);

CREATE TABLE IF NOT EXISTS source_paragraphs (
  id TEXT PRIMARY KEY,
  source_id TEXT REFERENCES sources(id),
  anchor_id TEXT NOT NULL,
  content_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shapes (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id),
  shape_text TEXT NOT NULL,
  frequency INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS provisions (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id),
  citation TEXT NOT NULL,
  short_title TEXT NOT NULL,
  elements_checklist TEXT NOT NULL, -- JSON String Array
  common_confusion TEXT,
  distinguishing_fact TEXT
);

CREATE TABLE IF NOT EXISTS shape_provisions (
  shape_id TEXT REFERENCES shapes(id),
  provision_id TEXT REFERENCES provisions(id),
  is_primary BOOLEAN DEFAULT 0,
  PRIMARY KEY (shape_id, provision_id)
);

CREATE TABLE IF NOT EXISTS trigger_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shape_id TEXT REFERENCES shapes(id),
  word TEXT NOT NULL,
  is_ambiguous BOOLEAN DEFAULT 0,
  distinguishing_fact TEXT
);

CREATE TABLE IF NOT EXISTS decoy_pairs (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id),
  shape_a_id TEXT REFERENCES shapes(id),
  shape_b_id TEXT REFERENCES shapes(id),
  shared_trigger TEXT NOT NULL,
  distinguishing_fact TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flashcards (
  id TEXT PRIMARY KEY,
  subject_id TEXT REFERENCES subjects(id),
  shape_id TEXT REFERENCES shapes(id),
  source_citation TEXT NOT NULL,
  source_paragraph_id TEXT REFERENCES source_paragraphs(id) ON DELETE SET NULL
);

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
