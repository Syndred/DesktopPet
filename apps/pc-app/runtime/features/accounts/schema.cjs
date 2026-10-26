const migrations = [{
  id: "accounts-001-identity-settings-sync",
  sql: `
    CREATE TABLE IF NOT EXISTS account_identities (
      owner_account_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK(provider IN ('local','runtime')),
      subject_id TEXT NOT NULL,
      account TEXT NOT NULL,
      account_key TEXT NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT,
      profile_revision INTEGER NOT NULL DEFAULT 0,
      player_profile_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(provider,subject_id), UNIQUE(provider,account_key)
    );
    CREATE TABLE IF NOT EXISTS account_aliases (
      provider TEXT NOT NULL, subject_id TEXT NOT NULL,
      owner_account_id TEXT NOT NULL REFERENCES account_identities(owner_account_id),
      evidence TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(provider,subject_id)
    );
    CREATE TABLE IF NOT EXISTS account_settings (
      owner_account_id TEXT PRIMARY KEY REFERENCES account_identities(owner_account_id),
      revision INTEGER NOT NULL DEFAULT 0,
      document TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_login_sessions (
      proof_hash TEXT PRIMARY KEY, owner_account_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_actions (
      owner_account_id TEXT NOT NULL, action_id TEXT NOT NULL,
      kind TEXT NOT NULL, input_hash TEXT NOT NULL, result TEXT NOT NULL,
      created_at TEXT NOT NULL, PRIMARY KEY(owner_account_id,action_id)
    );
    CREATE TABLE IF NOT EXISTS account_legacy_data (
      owner_account_id TEXT PRIMARY KEY REFERENCES account_identities(owner_account_id),
      source_hash TEXT NOT NULL, document TEXT NOT NULL, imported_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_migration_sources (
      source_hash TEXT PRIMARY KEY, source_path TEXT, archive_path TEXT,
      owner_account_id TEXT, status TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_backup_receipts (
      id TEXT PRIMARY KEY, owner_account_id TEXT NOT NULL,
      checksum TEXT NOT NULL, file_path TEXT NOT NULL,
      reason TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_sync_state (
      owner_account_id TEXT PRIMARY KEY, cloud_revision INTEGER NOT NULL DEFAULT 0,
      last_checksum TEXT, last_verified_at TEXT, last_error TEXT
    );
    CREATE TABLE IF NOT EXISTS account_sync_outbox (
      owner_account_id TEXT NOT NULL, action_id TEXT NOT NULL,
      base_revision INTEGER NOT NULL, checksum TEXT NOT NULL, document TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','retry','conflict','verified','superseded')),
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, created_at TEXT NOT NULL, verified_at TEXT,
      PRIMARY KEY(owner_account_id,action_id)
    );
    CREATE INDEX IF NOT EXISTS account_sync_outbox_due
      ON account_sync_outbox(owner_account_id,status,next_attempt_at);
  `
}, {
  id: "accounts-002-secure-session-revocation",
  sql: `CREATE TABLE IF NOT EXISTS account_session_control (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    blocked INTEGER NOT NULL CHECK(blocked IN (0,1))
  );`
}, {
  id: "accounts-003-authoritative-checkpoints",
  sql: `CREATE TABLE IF NOT EXISTS account_sync_checkpoints (
    owner_account_id TEXT PRIMARY KEY REFERENCES account_identities(owner_account_id),
    cloud_revision INTEGER NOT NULL, envelope_checksum TEXT NOT NULL,
    data_checksum TEXT NOT NULL, verified_at TEXT NOT NULL
  );`
}, {
  id: "accounts-003-isolated-qa-profile",
  sql: `CREATE TABLE IF NOT EXISTS account_qa_profile (
    singleton INTEGER PRIMARY KEY CHECK(singleton=1),
    profile_id TEXT NOT NULL, scenario_id TEXT NOT NULL
  );`
}, {
  id: 'accounts-004-supabase-identity-link',
  sql: `CREATE TABLE IF NOT EXISTS account_cloud_links (
    owner_account_id TEXT PRIMARY KEY REFERENCES account_identities(owner_account_id),
    auth_user_id TEXT NOT NULL UNIQUE, project_url TEXT NOT NULL,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );`
}, {
  id:'accounts-005-protected-sync-source-preservation',
  sql:`CREATE TABLE IF NOT EXISTS account_sync_sources (
    owner_account_id TEXT NOT NULL,action_id TEXT NOT NULL,
    original_document TEXT NOT NULL,original_checksum TEXT NOT NULL,
    archive_action_id TEXT NOT NULL,archive_reason TEXT,cloud_archive_id TEXT,
    authority_pending INTEGER NOT NULL DEFAULT 0,prepared_at TEXT,created_at TEXT NOT NULL,
    PRIMARY KEY(owner_account_id,action_id)
  );`
}, {
  id:'accounts-006-cloud-projection-audit',
  sql:`ALTER TABLE account_sync_sources ADD COLUMN cloud_projection_checksum TEXT;
    ALTER TABLE account_sync_sources ADD COLUMN cloud_excluded TEXT NOT NULL DEFAULT '[]';`
}, {
  id:'accounts-007-automatic-sync-baselines',
  sql:`CREATE TABLE IF NOT EXISTS account_sync_baselines (
    owner_account_id TEXT PRIMARY KEY REFERENCES account_identities(owner_account_id),
    cloud_revision INTEGER NOT NULL, envelope_checksum TEXT NOT NULL,
    data_checksum TEXT NOT NULL, personal_checksum TEXT NOT NULL, protected_checksum TEXT NOT NULL
  );`
}, {
  id:'accounts-008-confirmed-cloud-document',
  sql:'ALTER TABLE account_sync_baselines ADD COLUMN cloud_document TEXT;'
}, {
  id:'accounts-009-domain-cloud-readbacks',
  sql:`CREATE TABLE IF NOT EXISTS account_cloud_readbacks (
    owner_account_id TEXT NOT NULL REFERENCES account_identities(owner_account_id),
    domain TEXT NOT NULL CHECK(domain IN ('companions','garden','battle')),
    cloud_revision INTEGER NOT NULL, envelope_checksum TEXT NOT NULL,
    module_checksum TEXT NOT NULL, verified_at TEXT NOT NULL,
    PRIMARY KEY(owner_account_id,domain)
  );`
}];

module.exports = { migrations };
