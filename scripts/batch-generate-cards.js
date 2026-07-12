const fs = require('fs');
const path = require('path');

// Load environment variables from .env first before requiring other modules
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.substring(1, value.length - 1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.substring(1, value.length - 1);
        }
        process.env[key] = value;
      }
    }
  }
}
loadEnv();

const { DbAdapter } = require('../db');
const { generateFlashcards } = require('../lib/litellm');


async function run() {


  if (!process.env.LLM_GATEWAY_URL || !process.env.LLM_GATEWAY_KEY) {
    console.error('❌ Error: LLM_GATEWAY_URL or LLM_GATEWAY_KEY not configured in .env file.');
    process.exit(1);
  }

  const db = new DbAdapter();
  db.initialize();

  // Load the system prompt template
  const systemPromptPath = path.join(__dirname, '..', 'pipeline', 'generation-prompt.md');
  if (!fs.existsSync(systemPromptPath)) {
    console.error(`❌ System prompt template not found at ${systemPromptPath}`);
    process.exit(1);
  }
  const systemPromptTemplate = fs.readFileSync(systemPromptPath, 'utf8');

  // Command line args: node scripts/batch-generate-cards.js [subjectId] [sourceId] [limit=10]
  const args = process.argv.slice(2);
  const subjectId = args[0];
  const sourceId = args[1];
  const limit = parseInt(args[2] || '10', 10);

  if (!subjectId || !sourceId) {
    console.log('ℹ️ Usage: node scripts/batch-generate-cards.js [subjectId] [sourceId] [limit]');
    console.log('Example: node scripts/batch-generate-cards.js civil-law family-code 10');
    process.exit(0);
  }

  console.log(`🤖 Starting batch generation for subject: ${subjectId}, source: ${sourceId} (Limit: ${limit})...`);

  // Find paragraphs that are NOT yet linked to any flashcard
  const query = `
    SELECT sp.id, sp.content_text, sp.anchor_id
    FROM source_paragraphs sp
    WHERE sp.source_id = ?
      AND sp.id NOT IN (
        SELECT source_paragraph_id FROM flashcards WHERE source_paragraph_id IS NOT NULL
      )
    LIMIT ?
  `;
  
  const paragraphs = db.db.prepare(query).all(sourceId, limit);
  if (paragraphs.length === 0) {
    console.log('✅ No unmapped paragraphs found for this source. All are already linked!');
    process.exit(0);
  }

  console.log(`Found ${paragraphs.length} unmapped paragraphs. Batching...`);

  // Format grounding context
  const groundingContext = `Here are the official source paragraphs to ground your generation. You MUST include a SOURCE_PARAGRAPH tag in every card matching the exact Paragraph ID.
Example format:
SOURCE_PARAGRAPH: ${sourceId}:${paragraphs[0].anchor_id}

Source Paragraphs:
` + paragraphs.map(p => `[Paragraph ID: ${p.id}]\n${p.content_text}`).join('\n\n');

  const systemPrompt = systemPromptTemplate.replaceAll('{{SUBJECT}}', subjectId);
  const prompt = `Generate shape-trigger flashcards for the provided paragraphs. Focus on extracting the core legal provisions and creating high-quality elements checklists.`;

  try {
    const result = await generateFlashcards(systemPrompt, prompt, groundingContext, {
      paragraphIds: paragraphs.map(p => p.id)
    });

    console.log('\n✨ Generated Flashcards:\n');
    console.log(result);

    // Save to scratch output first so the user can verify
    const outDir = path.join(__dirname, '..', '.gemini', 'antigravity-cli', 'brain', 'd8dac0aa-8d85-4189-aa84-1ec9e31a9574', 'scratch');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
    const outFile = path.join(outDir, `generated-${subjectId}-${sourceId}.md`);
    fs.writeFileSync(outFile, result, 'utf8');
    console.log(`\n💾 Saved generated markdown to ${outFile}`);
    console.log('You can review this file and append it to your subject flashcards file when ready.');
  } catch (err) {
    console.error('❌ Generation failed:', err.message);
  }
}

run();
