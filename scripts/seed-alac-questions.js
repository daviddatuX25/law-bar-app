/**
 * scripts/seed-alac-questions.js
 * Wrapper around lib/seed-alac-questions.js to allow manual seeding from the CLI.
 */

const { DbAdapter } = require('../db.js');
const { seedAlacQuestions } = require('../lib/seed-alac-questions.js');

async function main() {
  const db = new DbAdapter('./bar_exam.db');
  db.initialize();
  await seedAlacQuestions(db);
}

if (require.main === module) {
  main().catch(err => console.error('Seed error:', err.message));
}

module.exports = { seedAlacQuestions };
