const { DbAdapter } = require('../db');

function verify(dbOrPath) {
  let db;
  if (dbOrPath && dbOrPath instanceof DbAdapter) {
    db = dbOrPath;
  } else {
    const dbPath = typeof dbOrPath === 'string' ? dbOrPath : undefined;
    db = new DbAdapter(dbPath);
    db.initialize();
  }

  let clean = true;
  
  // Check shapes without primary provisions
  const shapes = db.db.prepare(`
    SELECT id FROM shapes 
    WHERE id NOT IN (SELECT shape_id FROM shape_provisions WHERE is_primary = 1)
  `).all();
  if (shapes.length > 0) {
    console.error(`Relation Error: Shapes lacking primary provision: ${shapes.map(s => s.id).join(', ')}`);
    clean = false;
  }

  // Check decoy pairs linking non-existent shapes
  const decoys = db.db.prepare(`
    SELECT id FROM decoy_pairs 
    WHERE shape_a_id NOT IN (SELECT id FROM shapes) OR shape_b_id NOT IN (SELECT id FROM shapes)
  `).all();
  if (decoys.length > 0) {
    console.error(`Relation Error: Decoys referencing missing shapes: ${decoys.map(d => d.id).join(', ')}`);
    clean = false;
  }

  if (clean) {
    console.log('Relational checks passed.');
  }
  return clean;
}

if (require.main === module) verify();

module.exports = { verify };
