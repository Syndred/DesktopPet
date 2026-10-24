"use strict";

// Executed against the foundation-owned connection. This module never opens a DB.
const migration = {
  id: "garden-20261024-v1",
  sql: `
CREATE TABLE IF NOT EXISTS garden_accounts (
  owner_account_id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  initialized_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS garden_plots (
  owner_account_id TEXT NOT NULL REFERENCES garden_accounts(owner_account_id),
  plot_id TEXT NOT NULL,
  crop_type TEXT CHECK(crop_type IN ('carrot','tomato','berry','rice')),
  planted_at INTEGER,
  matures_at INTEGER,
  yield_quantity INTEGER NOT NULL DEFAULT 0 CHECK(yield_quantity >= 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  PRIMARY KEY(owner_account_id, plot_id),
  CHECK ((crop_type IS NULL AND planted_at IS NULL AND matures_at IS NULL AND yield_quantity = 0)
    OR (crop_type IS NOT NULL AND planted_at IS NOT NULL AND matures_at >= planted_at AND yield_quantity > 0))
);
CREATE TABLE IF NOT EXISTS garden_items (
  owner_account_id TEXT NOT NULL REFERENCES garden_accounts(owner_account_id),
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity >= 0 AND quantity <= 1000000000),
  PRIMARY KEY(owner_account_id, item_id)
);
CREATE TABLE IF NOT EXISTS garden_actions (
  owner_account_id TEXT NOT NULL REFERENCES garden_accounts(owner_account_id),
  action_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_account_id, action_id)
);
CREATE TABLE IF NOT EXISTS garden_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_account_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  item_id TEXT NOT NULL,
  delta INTEGER NOT NULL,
  balance INTEGER NOT NULL CHECK(balance >= 0),
  pet_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS garden_ledger_owner_time ON garden_ledger(owner_account_id, id DESC);
CREATE TABLE IF NOT EXISTS garden_reward_receipts (
  owner_account_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('exploration','battle')),
  receipt_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  PRIMARY KEY(owner_account_id, source, receipt_id)
);
CREATE TABLE IF NOT EXISTS garden_garrisons (
  owner_account_id TEXT NOT NULL,
  territory_id TEXT NOT NULL,
  pet_id TEXT NOT NULL,
  territory_revision INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_account_id, territory_id),
  UNIQUE(owner_account_id, pet_id)
);
CREATE TABLE IF NOT EXISTS garden_outbox (
  owner_account_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','synced','conflict')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner_account_id, action_id)
);`
};
function migrate(db) { db.exec(migration.sql); }
module.exports = { migration, migrations: [migration], migrate };
