/** Additive only. The host owns the SQLite connection and migration execution. */
const migrations = [{
  id: 'companions-001-independent-instances',
  sql: `
    CREATE TABLE IF NOT EXISTS companion_accounts (
      owner_account_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL DEFAULT 0,
      selections_json TEXT NOT NULL DEFAULT '{"chatPetId":null,"battlePetId":null,"guardPetId":null}',
      legacy_imported_at TEXT
    );
    CREATE TABLE IF NOT EXISTS companion_pets (
      owner_account_id TEXT NOT NULL,
      pet_id TEXT NOT NULL,
      template_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_account_id, pet_id),
      FOREIGN KEY (owner_account_id) REFERENCES companion_accounts(owner_account_id)
    );
    CREATE INDEX IF NOT EXISTS companion_pets_template ON companion_pets(owner_account_id, template_id);
    CREATE TABLE IF NOT EXISTS companion_actions (
      owner_account_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (owner_account_id, action_id)
    );
    CREATE TABLE IF NOT EXISTS companion_legacy_archive (
      owner_account_id TEXT NOT NULL,
      legacy_pet_id TEXT NOT NULL,
      source_json TEXT NOT NULL,
      imported_at TEXT NOT NULL,
      PRIMARY KEY (owner_account_id, legacy_pet_id)
    );
    CREATE TABLE IF NOT EXISTS companion_interactions (
      owner_account_id TEXT NOT NULL,
      pet_id TEXT NOT NULL,
      last_interacted_at INTEGER NOT NULL,
      PRIMARY KEY(owner_account_id, pet_id)
    );
  `
}, {
  id: 'companions-002-capture-receipts',
  sql: `CREATE TABLE IF NOT EXISTS companion_capture_receipts (
    owner_account_id TEXT NOT NULL,
    battle_id TEXT NOT NULL,
    wild_pet_id TEXT NOT NULL,
    pet_id TEXT NOT NULL,
    PRIMARY KEY(owner_account_id, battle_id, wild_pet_id),
    FOREIGN KEY(owner_account_id, pet_id) REFERENCES companion_pets(owner_account_id, pet_id)
  );`
}, {
  id: 'companions-003-verified-owner-alias',
  sql: `CREATE TABLE IF NOT EXISTS companion_identity_imports (
    source_owner_account_id TEXT PRIMARY KEY, target_owner_account_id TEXT NOT NULL,
    archive_json TEXT NOT NULL, created_at TEXT NOT NULL
  );`
}];

function migrateCompanions(db) {
  for (const migration of migrations) db.exec(migration.sql);
}

module.exports = { migrations, migrateCompanions };
