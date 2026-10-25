const migrations = [{ id: 'resources-002-cloud-packages', sql: `
  -- Preserve independently imported IDs with identical bytes on two clients.
  -- Ordinary import deduplication remains in the serialized ResourcesService path.
  DROP INDEX IF EXISTS lingjing_resources_import_dedupe;
  CREATE INDEX IF NOT EXISTS lingjing_resources_import_hash ON lingjing_resources(owner_account_id,content_hash);
  CREATE TABLE IF NOT EXISTS lingjing_resource_cloud_outbox (
    owner_account_id TEXT NOT NULL, action_id TEXT NOT NULL, resource_id TEXT NOT NULL,
    auth_user_id TEXT, manifest_json TEXT, manifest_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at TEXT NOT NULL, verified_at TEXT,
    PRIMARY KEY(owner_account_id,action_id,resource_id)
  );
  CREATE INDEX IF NOT EXISTS lingjing_resource_cloud_pending ON lingjing_resource_cloud_outbox(owner_account_id,status,next_attempt_at);
  CREATE TABLE IF NOT EXISTS lingjing_resource_cloud_receipts (
    owner_account_id TEXT NOT NULL, resource_id TEXT NOT NULL, auth_user_id TEXT NOT NULL,
    manifest_sha256 TEXT NOT NULL, content_hash TEXT NOT NULL, direction TEXT NOT NULL,
    verified_at TEXT NOT NULL, PRIMARY KEY(owner_account_id,resource_id,auth_user_id,manifest_sha256,direction)
  );
  CREATE TABLE IF NOT EXISTS lingjing_resource_cloud_downloads (
    owner_account_id TEXT NOT NULL, resource_id TEXT NOT NULL, auth_user_id TEXT NOT NULL,
    manifest_sha256 TEXT NOT NULL, manifest_json TEXT, directory TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', last_error TEXT, verified_at TEXT,
    PRIMARY KEY(owner_account_id,resource_id,auth_user_id,manifest_sha256)
  );` }];
migrations.push({id:'resources-003-cloud-proof-source',sql:`
  ALTER TABLE lingjing_resource_cloud_outbox ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'unverified';
  ALTER TABLE lingjing_resource_cloud_downloads ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'unverified';
  ALTER TABLE lingjing_resource_cloud_receipts ADD COLUMN data_mode TEXT NOT NULL DEFAULT 'unverified';
`});
migrations.push({id:'resources-004-authority-stage',sql:`
  ALTER TABLE lingjing_resource_cloud_outbox ADD COLUMN storage_verified INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE lingjing_resource_cloud_outbox ADD COLUMN storage_verified_at TEXT;
  ALTER TABLE lingjing_resource_cloud_outbox ADD COLUMN authority_registered INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE lingjing_resource_cloud_downloads ADD COLUMN authority_registered INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE lingjing_resource_cloud_receipts ADD COLUMN authority_action_id TEXT;
  ALTER TABLE lingjing_resource_cloud_receipts ADD COLUMN authority_revision INTEGER;
  ALTER TABLE lingjing_resource_cloud_receipts ADD COLUMN authority_checksum TEXT;
  UPDATE lingjing_resource_cloud_outbox SET storage_verified=1,storage_verified_at=verified_at WHERE status='verified';
`});
module.exports = { migrations };
