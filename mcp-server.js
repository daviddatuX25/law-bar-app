const { DbAdapter } = require('./db');
const { parseMarkdown } = require('./parser');

let db = null;

function getDb() {
  if (!db) {
    db = new DbAdapter();
    db.initialize();
  }
  return db;
}

// Allows setting a custom/mock db instance for testing if needed
function setDb(customDb) {
  db = customDb;
}

function getMcpTools() {
  return [
    {
      name: 'import_subject_markdown',
      description: 'Parse pipeline markdown and ingest flashcards into SQLite',
      inputSchema: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' },
          markdown: { type: 'string' }
        },
        required: ['subjectId', 'markdown']
      }
    },
    {
      name: 'get_flashcard_deck',
      description: 'Fetch flashcard list for a specific bar subject',
      inputSchema: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' }
        },
        required: ['subjectId']
      }
    },
    {
      name: 'get_decoy_pairs',
      description: 'Fetch decoy pairs for a specific bar subject',
      inputSchema: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' }
        },
        required: ['subjectId']
      }
    },
    {
      name: 'get_trigger_words',
      description: 'Fetch trigger words/distinguishing facts for a specific bar subject',
      inputSchema: {
        type: 'object',
        properties: {
          subjectId: { type: 'string' }
        },
        required: ['subjectId']
      }
    }
  ];
}

function sendResult(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function sendError(id, msg) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { message: msg } }) + '\n');
}

function handleToolCall(id, name, args) {
  if (!args) {
    return sendError(id, 'Missing arguments');
  }
  const adapter = getDb();

  if (name === 'import_subject_markdown') {
    const { subjectId, markdown } = args;
    if (!subjectId || !markdown) {
      return sendError(id, 'Missing required arguments: subjectId or markdown');
    }
    const parsed = parseMarkdown(markdown);
    if (!parsed.success) {
      return sendError(id, `Invalid template: ${parsed.errors.join(', ')}`);
    }

    try {
      adapter.importSubjectData(subjectId, parsed.data);
      sendResult(id, { content: [{ type: 'text', text: `Imported ${parsed.data.length} flashcards.` }] });
    } catch (dbErr) {
      sendError(id, `Database insertion failed: ${dbErr.message}`);
    }
  } else if (name === 'get_flashcard_deck') {
    const { subjectId } = args;
    if (!subjectId) {
      return sendError(id, 'Missing required argument: subjectId');
    }
    try {
      const list = adapter.getFlashcards(subjectId);
      sendResult(id, { content: [{ type: 'text', text: JSON.stringify(list) }] });
    } catch (dbErr) {
      sendError(id, `Database query failed: ${dbErr.message}`);
    }
  } else if (name === 'get_decoy_pairs') {
    const { subjectId } = args;
    if (!subjectId) {
      return sendError(id, 'Missing required argument: subjectId');
    }
    try {
      const list = adapter.getDecoyPairs(subjectId);
      sendResult(id, { content: [{ type: 'text', text: JSON.stringify(list) }] });
    } catch (dbErr) {
      sendError(id, `Database query failed: ${dbErr.message}`);
    }
  } else if (name === 'get_trigger_words') {
    const { subjectId } = args;
    if (!subjectId) {
      return sendError(id, 'Missing required argument: subjectId');
    }
    try {
      const list = adapter.getTriggers(subjectId);
      sendResult(id, { content: [{ type: 'text', text: JSON.stringify(list) }] });
    } catch (dbErr) {
      sendError(id, `Database query failed: ${dbErr.message}`);
    }
  } else {
    sendError(id, `Unknown tool: ${name}`);
  }
}

function handleMessage(line) {
  try {
    const req = JSON.parse(line);
    if (req.method === 'initialize') {
      sendResult(req.id, {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: 'law-bar-mcp',
          version: '1.0.0'
        }
      });
    } else if (req.method === 'tools/list') {
      sendResult(req.id, { tools: getMcpTools() });
    } else if (req.method === 'tools/call') {
      const { name, arguments: args } = req.params || {};
      handleToolCall(req.id, name, args);
    }
  } catch (err) {
    // Ignore invalid JSON or send basic parsing error if possible
  }
}

function startMcpServer() {
  getDb();
  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    let lineIndex;
    while ((lineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, lineIndex).trim();
      buffer = buffer.slice(lineIndex + 1);
      if (line) {
        handleMessage(line);
      }
    }
  });
}

if (require.main === module) {
  startMcpServer();
}

module.exports = {
  getMcpTools,
  startMcpServer,
  handleMessage,
  setDb,
  getDb
};
