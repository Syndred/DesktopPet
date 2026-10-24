const { ResourceError } = require('./parser.cjs');
const migrations = [{
  id: 'resources-001-library',
  sql: `CREATE TABLE IF NOT EXISTS lingjing_resources (
    resource_id TEXT PRIMARY KEY, owner_account_id TEXT, content_hash TEXT NOT NULL,
    document_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS lingjing_resources_owner ON lingjing_resources(owner_account_id);
  CREATE UNIQUE INDEX IF NOT EXISTS lingjing_resources_import_dedupe ON lingjing_resources(owner_account_id, content_hash) WHERE owner_account_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS lingjing_resource_files (
    resource_id TEXT NOT NULL REFERENCES lingjing_resources(resource_id), asset_key TEXT NOT NULL,
    file_path TEXT NOT NULL, PRIMARY KEY(resource_id, asset_key)
  );
  CREATE TABLE IF NOT EXISTS lingjing_resource_imports (
    import_id TEXT PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES lingjing_resources(resource_id),
    owner_account_id TEXT NOT NULL, source_filename TEXT NOT NULL, provenance_json TEXT NOT NULL, imported_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS lingjing_resource_preferences (
    resource_id TEXT NOT NULL REFERENCES lingjing_resources(resource_id), owner_account_id TEXT NOT NULL,
    calibration_json TEXT NOT NULL, actions_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(resource_id, owner_account_id)
  );`,
}];
/** The caller owns the connection and migration executor. No second application database. */
class ResourcesRepository {
  constructor(db) { this.db = db; }
  transaction(callback) {
    if (typeof this.db.transaction === 'function') return this.db.transaction(callback)();
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(owner) {
    return this.db.prepare("SELECT resource_id FROM lingjing_resources WHERE owner_account_id IS NULL OR owner_account_id = ? ORDER BY CASE WHEN resource_id LIKE 'builtin:%' THEN 0 WHEN owner_account_id IS NOT NULL THEN 1 ELSE 2 END, created_at DESC, resource_id").all(owner).map(row => this.get(owner, row.resource_id));
  }
  get(owner, id) {
    const row = this.db.prepare('SELECT * FROM lingjing_resources WHERE resource_id = ? AND (owner_account_id IS NULL OR owner_account_id = ?)').get(id, owner);
    if (!row) throw new ResourceError('RESOURCE_NOT_FOUND', '该角色资源不存在或不属于当前账号');
    const document = JSON.parse(row.document_json);
    const pref = this.db.prepare('SELECT * FROM lingjing_resource_preferences WHERE resource_id = ? AND owner_account_id = ?').get(id, owner);
    return { ...document, revision: pref?.revision ?? 0, calibration: pref ? JSON.parse(pref.calibration_json) : document.calibration, actions: pref ? JSON.parse(pref.actions_json) : document.actions };
  }
  findHash(owner, hash) {
    const row = this.db.prepare('SELECT resource_id FROM lingjing_resources WHERE owner_account_id = ? AND content_hash = ?').get(owner, hash);
    return row ? this.get(owner, row.resource_id) : null;
  }
  findGlobalHash(hash) {
    const row = this.db.prepare('SELECT document_json FROM lingjing_resources WHERE owner_account_id IS NULL AND content_hash = ?').get(hash);
    return row ? JSON.parse(row.document_json) : null;
  }
  insert(owner, resource, filePaths) {
    this.db.prepare('INSERT INTO lingjing_resources(resource_id, owner_account_id, content_hash, document_json, created_at) VALUES (?, ?, ?, ?, ?)').run(resource.id, owner, resource.contentHash, JSON.stringify(resource), resource.importedAt);
    const add = this.db.prepare('INSERT INTO lingjing_resource_files(resource_id, asset_key, file_path) VALUES (?, ?, ?)');
    for (const [key, filePath] of filePaths) add.run(resource.id, key, filePath);
  }
  hasGlobal(id) { return !!this.db.prepare('SELECT 1 FROM lingjing_resources WHERE resource_id = ? AND owner_account_id IS NULL').get(id); }
  file(owner, id, key) {
    this.get(owner, id);
    const row = this.db.prepare('SELECT file_path FROM lingjing_resource_files WHERE resource_id = ? AND asset_key = ?').get(id, key);
    if (!row) throw new ResourceError('MISSING_ASSET', '角色关联资源不存在');
    return row.file_path;
  }
  files(owner, id) { this.get(owner, id); return this.db.prepare('SELECT asset_key, file_path FROM lingjing_resource_files WHERE resource_id = ?').all(id); }
  recordImport(owner, resource, sourceFilename, id, date) {
    this.db.prepare('INSERT INTO lingjing_resource_imports VALUES (?, ?, ?, ?, ?, ?)').run(id, resource.id, owner, sourceFilename, JSON.stringify(resource.provenance), date);
  }
  save(owner, id, expectedRevision, calibration, actions) {
    return this.transaction(() => {
      const current = this.get(owner, id);
      if (current.revision !== expectedRevision) throw new ResourceError('REVISION_CONFLICT', '设置已在另一窗口更新，请重新载入后保存', { revision: current.revision });
      this.db.prepare(`INSERT INTO lingjing_resource_preferences(resource_id, owner_account_id, calibration_json, actions_json, revision) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(resource_id, owner_account_id) DO UPDATE SET calibration_json = excluded.calibration_json, actions_json = excluded.actions_json, revision = excluded.revision`).run(id, owner, JSON.stringify(calibration), JSON.stringify(actions), current.revision + 1);
      return this.get(owner, id);
    });
  }
}
module.exports = { migrations, ResourcesRepository };
