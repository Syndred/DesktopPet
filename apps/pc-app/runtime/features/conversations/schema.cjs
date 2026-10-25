// Executed by the shared database migration runner, on the shared connection.
const migrations = [{
  id: "conversations-001",
  sql: `
    CREATE TABLE IF NOT EXISTS conversation_profiles (
      owner_account_id TEXT NOT NULL, pet_id TEXT NOT NULL,
      persona TEXT NOT NULL DEFAULT '', reply_style TEXT NOT NULL DEFAULT 'natural',
      memory_enabled INTEGER NOT NULL DEFAULT 1, pause_while_chatting INTEGER NOT NULL DEFAULT 1,
      use_override INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_account_id, pet_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_connections (
      owner_account_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('account','pet')),
      scope_id TEXT NOT NULL, provider TEXT NOT NULL, base_url TEXT NOT NULL,
      model TEXT NOT NULL, encrypted_key TEXT,
      context_chars INTEGER NOT NULL DEFAULT 24000, max_output_tokens INTEGER NOT NULL DEFAULT 512,
      revision INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_account_id, scope, scope_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_messages (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
      owner_account_id TEXT NOT NULL, pet_id TEXT NOT NULL, action_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')), content TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('complete','pending','streaming','failed','cancelled')),
      error_code TEXT, provider TEXT, model TEXT, attempt INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      UNIQUE(owner_account_id, pet_id, action_id, role)
    );
    CREATE INDEX IF NOT EXISTS conversation_messages_scope
      ON conversation_messages(owner_account_id, pet_id, sequence DESC);
    CREATE TABLE IF NOT EXISTS conversation_memories (
      id TEXT NOT NULL, owner_account_id TEXT NOT NULL, pet_id TEXT NOT NULL,
      content TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(owner_account_id, pet_id, id)
    );
    CREATE INDEX IF NOT EXISTS conversation_memories_scope
      ON conversation_memories(owner_account_id, pet_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS conversation_preferences (
      owner_account_id TEXT PRIMARY KEY, selected_pet_id TEXT NOT NULL
    );
  `
}, {
  id: "conversations-002-local-credentials-and-imports",
  sql: `
    CREATE TABLE IF NOT EXISTS conversation_credentials (
      owner_account_id TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('account','pet')),
      scope_id TEXT NOT NULL, provider TEXT NOT NULL, base_url TEXT NOT NULL,
      encrypted_key TEXT NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY(owner_account_id,scope,scope_id,provider,base_url)
    );
    INSERT OR IGNORE INTO conversation_credentials
      SELECT owner_account_id,scope,scope_id,provider,base_url,encrypted_key,updated_at
      FROM conversation_connections WHERE encrypted_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS conversation_legacy_imports (
      owner_account_id TEXT NOT NULL, source_hash TEXT NOT NULL,
      result TEXT NOT NULL, imported_at INTEGER NOT NULL,
      PRIMARY KEY(owner_account_id,source_hash)
    );
  `
}];
module.exports = { migrations };
