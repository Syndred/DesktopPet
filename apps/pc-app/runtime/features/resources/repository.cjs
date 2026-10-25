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
migrations.push(...require('./cloud-schema.cjs').migrations);
/** The caller owns the connection and migration executor. No second application database. */
class ResourcesRepository {
  constructor(db) { this.db = db; }
  ownerKeys(owner) {
    // Accounts owns the verified mapping. Never infer identity from a display name or renderer field.
    const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_aliases'").get();
    if (!exists) return [owner];
    const matches = this.db.prepare('SELECT owner_account_id, subject_id FROM account_aliases WHERE owner_account_id=? OR subject_id=?').all(owner, owner);
    const exact = matches.filter(row => row.owner_account_id === owner);
    const owners = new Set(matches.map(row => row.owner_account_id));
    const canonical = exact.length ? owner : owners.size === 1 ? matches[0].owner_account_id : owner;
    const keys = new Set([canonical]);
    for (const row of matches.filter(row => row.owner_account_id === canonical)) {
      const identities = this.db.prepare('SELECT DISTINCT owner_account_id FROM account_aliases WHERE subject_id=?').all(row.subject_id);
      // A legacy id shared by multiple providers stays archived until its ownership is disambiguated.
      if (identities.length === 1) keys.add(row.subject_id);
    }
    return [...keys];
  }
  transaction(callback) {
    if (typeof this.db.transaction === 'function') return this.db.transaction(callback)();
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(owner) {
    const keys = this.ownerKeys(owner), placeholders = keys.map(() => '?').join(',');
    return this.db.prepare(`SELECT resource_id FROM lingjing_resources WHERE owner_account_id IS NULL OR owner_account_id IN (${placeholders}) ORDER BY CASE WHEN resource_id LIKE 'builtin:%' THEN 0 WHEN owner_account_id IS NOT NULL THEN 1 ELSE 2 END, created_at DESC, resource_id`).all(...keys).map(row => this.get(owner, row.resource_id));
  }
  get(owner, id) {
    const keys = this.ownerKeys(owner), placeholders = keys.map(() => '?').join(',');
    const row = this.db.prepare(`SELECT * FROM lingjing_resources WHERE resource_id = ? AND (owner_account_id IS NULL OR owner_account_id IN (${placeholders}))`).get(id, ...keys);
    if (!row) throw new ResourceError('RESOURCE_NOT_FOUND', '该角色资源不存在或不属于当前账号');
    const document = JSON.parse(row.document_json);
    const pref = this.db.prepare(`SELECT * FROM lingjing_resource_preferences WHERE resource_id = ? AND owner_account_id IN (${placeholders}) ORDER BY (owner_account_id=?) DESC, revision DESC LIMIT 1`).get(id, ...keys, keys[0]);
    return { ...document, revision: pref?.revision ?? 0, calibration: pref ? JSON.parse(pref.calibration_json) : document.calibration, actions: pref ? JSON.parse(pref.actions_json) : document.actions };
  }
  findHash(owner, hash) {
    const keys = this.ownerKeys(owner), placeholders = keys.map(() => '?').join(',');
    const row = this.db.prepare(`SELECT resource_id FROM lingjing_resources WHERE owner_account_id IN (${placeholders}) AND content_hash = ? ORDER BY (owner_account_id=?) DESC LIMIT 1`).get(...keys, hash, keys[0]);
    return row ? this.get(owner, row.resource_id) : null;
  }
  findGlobalHash(hash) {
    const row = this.db.prepare('SELECT document_json FROM lingjing_resources WHERE owner_account_id IS NULL AND content_hash = ?').get(hash);
    return row ? JSON.parse(row.document_json) : null;
  }
  insert(owner, resource, filePaths) {
    if (owner !== null) owner = this.ownerKeys(owner)[0];
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
    owner = this.ownerKeys(owner)[0];
    this.db.prepare('INSERT INTO lingjing_resource_imports VALUES (?, ?, ?, ?, ?, ?)').run(id, resource.id, owner, sourceFilename, JSON.stringify(resource.provenance), date);
  }
  save(owner, id, expectedRevision, calibration, actions) {
    owner = this.ownerKeys(owner)[0];
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
