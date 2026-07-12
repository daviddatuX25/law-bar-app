const fs = require('fs');
const path = require('path');
const { DbAdapter } = require('../db');

const PIPELINE_SOURCE_MAP = {
  'civil-code':       { subjectId: 'civil-law',       sourceId: 'civil-code',             title: 'Civil Code of the Philippines (RA 386)' },
  'family-code':      { subjectId: 'civil-law',       sourceId: 'family-code',            title: 'Family Code of the Philippines (EO 209)' },
  'property-reg':     { subjectId: 'civil-law',       sourceId: 'property-reg',           title: 'Property Registration Decree (PD 1529)' },
  'rpc':              { subjectId: 'criminal-law',    sourceId: 'rpc',                    title: 'Revised Penal Code (Act 3815)' },
  'dangerous-drugs':  { subjectId: 'criminal-law',    sourceId: 'dangerous-drugs',        title: 'Dangerous Drugs Act of 2002 (RA 9165)' },
  'constitution':     { subjectId: 'political-law',   sourceId: 'constitution',           title: '1987 Constitution of the Philippines' },
  'lgc':              { subjectId: 'political-law',   sourceId: 'lgc',                    title: 'Local Government Code of 1991 (RA 7160)' },
  'corporation-code': { subjectId: 'commercial-law',  sourceId: 'corporation-code',       title: 'Revised Corporation Code (RA 11232)' },
  'insurance-code':   { subjectId: 'commercial-law',  sourceId: 'insurance-code',         title: 'Insurance Code (RA 10607)' },
  'negotiable-instruments': { subjectId: 'commercial-law', sourceId: 'negotiable-instruments', title: 'Negotiable Instruments Law (Act 2031)' },
  'labor-code':       { subjectId: 'labor-law',       sourceId: 'labor-code',             title: 'Labor Code of the Philippines (PD 442)' },
  'nirc':             { subjectId: 'taxation',        sourceId: 'nirc',                   title: 'National Internal Revenue Code (NIRC / RA 8424)' },
  'remedial-civil-rules':    { subjectId: 'remedial-law',  sourceId: 'remedial-civil',    title: 'Rules of Civil Procedure (A.M. No. 19-10-20-SC)' },
  'remedial-evidence-rules': { subjectId: 'remedial-law',  sourceId: 'remedial-evidence', title: 'Rules on Evidence (A.M. No. 19-08-15-SC)' },
  'remedial-criminal-rules': { subjectId: 'remedial-law',  sourceId: 'remedial-criminal', title: 'Rules of Criminal Procedure' },
  'legal-ethics-cpra':       { subjectId: 'legal-ethics', sourceId: 'cpra',              title: 'Code of Professional Responsibility and Accountability' },
};


const SUBJECT_NAMES = {
  'civil-law': 'Civil Law',
  'criminal-law': 'Criminal Law',
  'political-law': 'Political Law',
  'remedial-law': 'Remedial Law',
  'commercial-law': 'Commercial Law',
  'labor-law': 'Labor Law',
  'taxation': 'Taxation',
  'legal-ethics': 'Legal Ethics',
};

function run() {
  const db = new DbAdapter();
  db.initialize();

  const sourcesDir = path.join(__dirname, '..', 'pipeline', 'sources');
  console.log(`Seeding sources from ${sourcesDir}...`);

  let totalParagraphs = 0;
  for (const [fileBase, mapping] of Object.entries(PIPELINE_SOURCE_MAP)) {
    let filePath = path.join(sourcesDir, `${fileBase}.txt`);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(sourcesDir, `${fileBase}.html`);
    }
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Skipped: ${fileBase} (No text or HTML file found)`);
      continue;
    }

    const rawText = fs.readFileSync(filePath, 'utf8');
    const subjectName = SUBJECT_NAMES[mapping.subjectId] || mapping.subjectId;
    const result = db.importSource(mapping.subjectId, subjectName, mapping.sourceId, mapping.title, rawText);

    totalParagraphs += result.count;
    console.log(`✅ Imported: ${mapping.title} (${result.count} paragraphs, replaced: ${result.replaced})`);
  }

  console.log(`\nAll sources seeded successfully. Total paragraphs: ${totalParagraphs}`);
}

run();
