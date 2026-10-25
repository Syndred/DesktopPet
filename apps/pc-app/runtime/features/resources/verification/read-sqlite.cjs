// Run with Electron as Node so better-sqlite3 uses the same native ABI as the real app.
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const profile = path.resolve(process.argv[2]);
const db = new Database(path.join(profile, 'lingjing.sqlite'), { readonly: true });
try {
  const evidence = {
    at: new Date().toISOString(),
    resources: db.prepare('SELECT resource_id,owner_account_id,content_hash,document_json FROM lingjing_resources WHERE owner_account_id IS NOT NULL').all(),
    imports: db.prepare('SELECT import_id,resource_id,source_filename,provenance_json,imported_at FROM lingjing_resource_imports').all(),
    preferences: db.prepare('SELECT resource_id,calibration_json,actions_json,revision FROM lingjing_resource_preferences').all(),
  };
  if (process.argv[3]) fs.writeFileSync(path.resolve(process.argv[3]), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ imports: evidence.imports.length, resourceIds: evidence.resources.map(row => row.resource_id), preferences: evidence.preferences.map(row => ({ id: row.resource_id, revision: row.revision })) }));
} finally { db.close(); }
