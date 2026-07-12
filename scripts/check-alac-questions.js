const { DbAdapter } = require('../db.js');
const Database = DbAdapter;
const db = new Database('./bar_exam.db');
db.initialize();

async function main() {
  const subjects = await db.getSubjects();
  let total = 0;
  for (const sub of subjects) {
    const qs = await db.getAlacQuestions(sub.id);
    console.log(`${sub.name}: ${qs.length} questions`);
    if (qs.length > 0) {
      qs.forEach(q => console.log(`  - ${q.question_text.substring(0, 70)}...`));
    }
    total += qs.length;
  }
  console.log(`\nTotal: ${total} ALAC questions`);
}
main().catch(err => console.error(err.message));
