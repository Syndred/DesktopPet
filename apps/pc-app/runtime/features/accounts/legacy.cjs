const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");
const { createHash } = require("node:crypto");
const { invariant } = require("./errors.cjs");
const { archiveOnce, transaction, checksum } = require("./util.cjs");

/** Read raw legacy bytes before RuntimeDataStore normalizes (and rewrites) them. */
function importLegacy({ db, filePath, archiveDir }) {
  if (!filePath || !existsSync(filePath)) return { imported: 0, status: "absent", unresolved: [] };
  const bytes = readFileSync(filePath);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const prior = db.prepare("SELECT details FROM account_migration_sources WHERE source_hash=?").get(hash);
  if (prior) return { ...JSON.parse(prior.details), duplicate: true };
  const archivePath = archiveOnce(join(archiveDir, `legacy-${hash}.json`), bytes);
  let source;
  try {
    source = JSON.parse(bytes.toString("utf8"));
    invariant(source && typeof source === "object" && !Array.isArray(source), "LEGACY_CORRUPT", "旧存档结构无效，原文件已保留。");
  } catch {
    const details = { imported: 0, status: "corrupt", unresolved: [{ reason: "LEGACY_CORRUPT" }], archivePath, sourceHash: hash };
    db.prepare("INSERT OR IGNORE INTO account_migration_sources VALUES(?,?,?,?,?,?,?)")
      .run(hash, filePath, archivePath, null, "corrupt", JSON.stringify(details), new Date().toISOString());
    return details;
  }
  const users = Array.isArray(source.users) ? source.users : [];
  const rawInventories = source.userInventories && typeof source.userInventories === "object" ? source.userInventories : {};
  const unresolved = [];
  let imported = 0;
  const now = new Date().toISOString();
  return transaction(db, () => {
    const seen = new Set();
    for (const user of users) {
      if (!user || typeof user.id !== "string" || !user.id.trim() || typeof user.account !== "string" || !user.account.trim()) {
        unresolved.push({ reason: "invalid-user" }); continue;
      }
      const id = user.id.trim();
      // A remote session marker is evidence of the original provider, not permission to log in.
      const remotePlaceholder = createHash("sha256").update(`remote-session-${id}`).digest("hex");
      const provider = user.sessionToken || user.passwordHash === remotePlaceholder ? "runtime" : "local";
      const key = user.account.trim().toLowerCase();
      if (seen.has(`${provider}:${key}`)) { unresolved.push({ legacyId: id, reason: "duplicate-account" }); continue; }
      seen.add(`${provider}:${key}`);
      const alias = db.prepare("SELECT owner_account_id FROM account_aliases WHERE provider=? AND subject_id=?").get(provider, id);
      const owner = alias?.owner_account_id || (provider === "local" ? `local:${id}` : id);
      const existing = db.prepare("SELECT * FROM account_identities WHERE owner_account_id=? OR (provider=? AND account_key=?)").get(owner, provider, key);
      if (existing && (existing.subject_id !== id || existing.provider !== provider)) {
        unresolved.push({ legacyId: id, reason: "identity-conflict" }); continue;
      }
      db.prepare(`INSERT OR IGNORE INTO account_identities
        (owner_account_id,provider,subject_id,account,account_key,username,password_hash,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(owner, provider, id, user.account.trim(), key,
        String(user.username || user.account), provider === "local" && typeof user.passwordHash === "string" ? user.passwordHash : null,
        typeof user.createdAt === "string" ? user.createdAt : now, now);
      db.prepare("INSERT OR IGNORE INTO account_aliases VALUES(?,?,?,?,?)").run(provider, id, owner, "legacy-id", now);
      let inventory = Object.hasOwn(rawInventories, id) ? rawInventories[id] : null;
      if (!inventory && (source.currentUserId === id || users.length === 1)) {
        inventory = {};
        for (const field of ["pets", "activePetId", "battleReports", "captureRecords", "chats", "messages", "memories"]) {
          if (source[field] !== undefined) inventory[field] = source[field];
        }
      }
      if (!inventory && (source.pets || source.battleReports)) unresolved.push({ legacyId: id, reason: "unowned-global-history" });
      if (inventory && !db.prepare("SELECT 1 FROM account_legacy_data WHERE owner_account_id=?").get(owner)) {
        db.prepare("INSERT INTO account_legacy_data VALUES(?,?,?,?)").run(owner, checksum(inventory), JSON.stringify(inventory), now);
        imported++;
      }
    }
    if (!users.length && (source.pets || source.battleReports)) unresolved.push({ reason: "unowned-global-history" });
    for (const id of Object.keys(rawInventories)) {
      if (!users.some(u => u?.id === id)) unresolved.push({ legacyId: id, reason: "orphan-inventory" });
    }
    const details = { imported, status: unresolved.length ? "review-required" : "imported", unresolved, archivePath, sourceHash: hash };
    db.prepare("INSERT INTO account_migration_sources VALUES(?,?,?,?,?,?,?)")
      .run(hash, filePath, archivePath, null, details.status, JSON.stringify(details), now);
    return details;
  });
}

function createLegacyBackupAdapter(db) {
  return {
    id: "legacy", version: 1,
    export(owner) {
      const row = db.prepare("SELECT document FROM account_legacy_data WHERE owner_account_id=?").get(owner);
      return row ? JSON.parse(row.document) : null;
    },
    validate(data) { invariant(data === null || (typeof data === "object" && !Array.isArray(data)), "INVALID_BACKUP", "旧存档内容无效。"); },
    restore(owner, data, mode) {
      if (data === null) return;
      const exists = db.prepare("SELECT 1 FROM account_legacy_data WHERE owner_account_id=?").get(owner);
      if (exists && mode === "merge") return;
      db.prepare(`INSERT INTO account_legacy_data VALUES(?,?,?,?) ON CONFLICT(owner_account_id)
        DO UPDATE SET source_hash=excluded.source_hash,document=excluded.document,imported_at=excluded.imported_at`)
        .run(owner, checksum(data), JSON.stringify(data), new Date().toISOString());
    }
  };
}
module.exports = { importLegacy, createLegacyBackupAdapter };
