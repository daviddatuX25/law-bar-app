const test = require('node:test');
const assert = require('node:assert');
const { DbAdapter } = require('../db');
const { getMcpTools, handleMessage, setDb } = require('../mcp-server');

// Capture process.stdout.write outputs
function captureStdout(fn) {
  const outputs = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    outputs.push(chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return outputs.map(line => JSON.parse(line.trim()));
}

test('MCP Tools Schema Verification', () => {
  const tools = getMcpTools();
  assert.strictEqual(tools.length, 4, 'Should expose exactly 4 tools');

  const importTool = tools.find(t => t.name === 'import_subject_markdown');
  assert.ok(importTool, 'Should expose import_subject_markdown tool');
  
  const getDeckTool = tools.find(t => t.name === 'get_flashcard_deck');
  assert.ok(getDeckTool, 'Should expose get_flashcard_deck tool');

  const getDecoyTool = tools.find(t => t.name === 'get_decoy_pairs');
  assert.ok(getDecoyTool, 'Should expose get_decoy_pairs tool');

  const getTriggersTool = tools.find(t => t.name === 'get_trigger_words');
  assert.ok(getTriggersTool, 'Should expose get_trigger_words tool');
});

test('MCP Protocol - Initialize', () => {
  const responses = captureStdout(() => {
    handleMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 'init-1',
      method: 'initialize',
      params: {}
    }));
  });

  assert.strictEqual(responses.length, 1);
  assert.strictEqual(responses[0].id, 'init-1');
  assert.strictEqual(responses[0].result.serverInfo.name, 'law-bar-mcp');
});

test('MCP Protocol - Tools List', () => {
  const responses = captureStdout(() => {
    handleMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 'list-1',
      method: 'tools/list'
    }));
  });

  assert.strictEqual(responses.length, 1);
  assert.strictEqual(responses[0].id, 'list-1');
  assert.ok(Array.isArray(responses[0].result.tools));
  assert.strictEqual(responses[0].result.tools.length, 4);
});

test('MCP Protocol - Tool Call (import_subject_markdown and queries)', () => {
  // Use in-memory DB for tests
  const db = new DbAdapter(':memory:');
  db.initialize();
  setDb(db);

  // 1. Test import with invalid markdown
  const responsesInvalid = captureStdout(() => {
    handleMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 'import-invalid',
      method: 'tools/call',
      params: {
        name: 'import_subject_markdown',
        arguments: {
          subjectId: 'crim-law',
          markdown: 'CARD missing-all-info\nFRONT (shape):\n'
        }
      }
    }));
  });

  assert.strictEqual(responsesInvalid.length, 1);
  assert.strictEqual(responsesInvalid[0].id, 'import-invalid');
  assert.ok(responsesInvalid[0].error, 'Should return error for invalid markdown');
  assert.ok(responsesInvalid[0].error.message.includes('Invalid template'));

  // Seed some decoy pairs so they can be retrieved
  db.runWriteQuery("INSERT OR REPLACE INTO subjects (id, name) VALUES ('crim-law', 'Criminal Law')");
  db.runWriteQuery("INSERT OR REPLACE INTO shapes (id, subject_id, shape_text) VALUES ('shape-fc-1', 'crim-law', 'Taking property by force')");
  db.runWriteQuery("INSERT OR REPLACE INTO shapes (id, subject_id, shape_text) VALUES ('shape-fc-2', 'crim-law', 'Taking property without force')");
  db.runWriteQuery("INSERT OR REPLACE INTO provisions (id, subject_id, citation, short_title, elements_checklist, common_confusion) VALUES ('prov-fc-1', 'crim-law', '18 U.S.C. § 2111', 'Robbery', '[]', '')");
  db.runWriteQuery("INSERT OR REPLACE INTO provisions (id, subject_id, citation, short_title, elements_checklist, common_confusion) VALUES ('prov-fc-2', 'crim-law', '18 U.S.C. § 661', 'Larceny', '[]', '')");
  db.runWriteQuery("INSERT OR REPLACE INTO shape_provisions (shape_id, provision_id, is_primary) VALUES ('shape-fc-1', 'prov-fc-1', 1)");
  db.runWriteQuery("INSERT OR REPLACE INTO shape_provisions (shape_id, provision_id, is_primary) VALUES ('shape-fc-2', 'prov-fc-2', 1)");
  db.runWriteQuery(`
    INSERT OR REPLACE INTO decoy_pairs (id, subject_id, shape_a_id, shape_b_id, shared_trigger, distinguishing_fact)
    VALUES ('decoy-1', 'crim-law', 'shape-fc-1', 'shape-fc-2', 'Taking property', 'Robbery requires force, larceny does not')
  `);

  // 2. Test import with valid markdown (should overwrite or insert)
  const validMd = `
CARD fc-1
FRONT (shape): Taking property of another by trespass with intent to permanently deprive.
FRONT (trigger words): trespassory taking, permanent deprivation
BACK (provision): 18 U.S.C. § 661 - Larceny
BACK (elements):
1. Trespassory taking
2. Carrying away
3. Personal property of another
4. Intent to permanently deprive
BACK (common confusion): Robbery :: Robbery requires force or intimidation.
SOURCE: Common Law Larceny
  `;

  const responsesValid = captureStdout(() => {
    handleMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 'import-valid',
      method: 'tools/call',
      params: {
        name: 'import_subject_markdown',
        arguments: {
          subjectId: 'crim-law',
          markdown: validMd
        }
      }
    }));
  });

  assert.strictEqual(responsesValid.length, 1);
  assert.strictEqual(responsesValid[0].id, 'import-valid');
  assert.ok(responsesValid[0].result, 'Should succeed importing valid markdown');
  assert.strictEqual(responsesValid[0].result.content[0].text, 'Imported 1 flashcards.');

  // 3. Test get_flashcard_deck
  const responsesDeck = captureStdout(() => {
    handleMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 'deck-1',
      method: 'tools/call',
      params: {
        name: 'get_flashcard_deck',
        arguments: {
          subjectId: 'crim-law'
        }
      }
    }));
  });

  assert.strictEqual(responsesDeck.length, 1);
  assert.strictEqual(responsesDeck[0].id, 'deck-1');
  const deck = JSON.parse(responsesDeck[0].result.content[0].text);
  assert.strictEqual(deck.length, 1);
  assert.strictEqual(deck[0].id, 'fc-1');
  assert.strictEqual(deck[0].front_shape, 'Taking property of another by trespass with intent to permanently deprive.');
  assert.deepStrictEqual(deck[0].front_triggers, ['trespassory taking', 'permanent deprivation']);
  assert.strictEqual(deck[0].back_provision, '18 U.S.C. § 661 (Larceny)');

  // 4. Test get_trigger_words
  const responsesTriggers = captureStdout(() => {
    handleMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 'triggers-1',
      method: 'tools/call',
      params: {
        name: 'get_trigger_words',
        arguments: {
          subjectId: 'crim-law'
        }
      }
    }));
  });

  assert.strictEqual(responsesTriggers.length, 1);
  assert.strictEqual(responsesTriggers[0].id, 'triggers-1');
  const triggers = JSON.parse(responsesTriggers[0].result.content[0].text);
  assert.strictEqual(triggers.length, 2);
  assert.ok(triggers.some(t => t.word === 'trespassory taking'));
  assert.ok(triggers.some(t => t.word === 'permanent deprivation'));

  // 5. Test get_decoy_pairs (should be empty since importSubjectData cleared the decoy-1 decoy pair we inserted earlier)
  const responsesDecoy = captureStdout(() => {
    handleMessage(JSON.stringify({
      jsonrpc: '2.0',
      id: 'decoy-1',
      method: 'tools/call',
      params: {
        name: 'get_decoy_pairs',
        arguments: {
          subjectId: 'crim-law'
        }
      }
    }));
  });

  assert.strictEqual(responsesDecoy.length, 1);
  assert.strictEqual(responsesDecoy[0].id, 'decoy-1');
  const decoys = JSON.parse(responsesDecoy[0].result.content[0].text);
  assert.strictEqual(decoys.length, 0, 'Decoy pairs should be cleared by the importSubjectData transaction since they were not in the markdown');
});

test('MCP Server - Stdin/Stdout Integration', () => {
  return new Promise((resolve, reject) => {
    const { spawn } = require('node:child_process');
    const path = require('node:path');
    const child = spawn(process.execPath, [path.join(__dirname, '../mcp-server.js')], {
      env: { ...process.env, DATABASE_PATH: ':memory:' }
    });

    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      if (buffer.includes('\n')) {
        try {
          const resp = JSON.parse(buffer.trim());
          assert.strictEqual(resp.id, 'integration-1');
          assert.ok(Array.isArray(resp.result.tools));
          child.kill();
          resolve();
        } catch (err) {
          child.kill();
          reject(err);
        }
      }
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 'integration-1',
      method: 'tools/list'
    }) + '\n');
  });
});
