module.exports = [{
  id: "battle-001-sessions-and-settlements",
  sql: `
    CREATE TABLE IF NOT EXISTS battle_sessions (
      owner_account_id TEXT NOT NULL,
      id TEXT NOT NULL,
      room_id TEXT,
      status TEXT NOT NULL,
      data_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_account_id, id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS battle_sessions_room
      ON battle_sessions(owner_account_id, room_id) WHERE room_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS battle_action_receipts (
      owner_account_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      command_json TEXT NOT NULL,
      result_json TEXT,
      PRIMARY KEY (owner_account_id, action_id)
    );
    CREATE TABLE IF NOT EXISTS battle_reports_v2 (
      owner_account_id TEXT NOT NULL,
      id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      PRIMARY KEY (owner_account_id, id),
      UNIQUE (owner_account_id, session_id)
    );
    CREATE TABLE IF NOT EXISTS battle_reward_receipts (
      owner_account_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      action_id TEXT NOT NULL,
      pet_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      PRIMARY KEY (owner_account_id, session_id),
      UNIQUE (owner_account_id, action_id)
    );
  `
}];
