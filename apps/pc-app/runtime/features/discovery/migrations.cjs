const migrations=[{id:'discovery-001-encounters-captures-memory',sql:`
  CREATE TABLE IF NOT EXISTS discovery_encounters (
    owner_account_id TEXT NOT NULL, encounter_id TEXT NOT NULL, status TEXT NOT NULL,
    revision INTEGER NOT NULL, data_json TEXT NOT NULL, updated_at INTEGER NOT NULL,
    PRIMARY KEY(owner_account_id, encounter_id)
  );
  CREATE INDEX IF NOT EXISTS discovery_encounters_status ON discovery_encounters(owner_account_id,status,updated_at);
  CREATE TABLE IF NOT EXISTS discovery_actions (
    owner_account_id TEXT NOT NULL, action_id TEXT NOT NULL, request_hash TEXT NOT NULL,
    result_json TEXT NOT NULL, PRIMARY KEY(owner_account_id,action_id)
  );
  CREATE TABLE IF NOT EXISTS discovery_captures (
    owner_account_id TEXT NOT NULL, encounter_id TEXT NOT NULL, pet_id TEXT NOT NULL,
    action_id TEXT NOT NULL, data_json TEXT NOT NULL, captured_at INTEGER NOT NULL,
    PRIMARY KEY(owner_account_id, encounter_id), UNIQUE(owner_account_id,action_id)
  );
  CREATE TABLE IF NOT EXISTS discovery_memory_tags (
    owner_account_id TEXT NOT NULL, pet_id TEXT NOT NULL, tag_id TEXT NOT NULL,
    data_json TEXT NOT NULL, PRIMARY KEY(owner_account_id,pet_id,tag_id)
  );
`}];
function migrateDiscovery(db) { for(const migration of migrations) db.exec(migration.sql); }
module.exports={migrations,migrateDiscovery};
