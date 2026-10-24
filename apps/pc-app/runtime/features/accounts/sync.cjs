const { invariant } = require("./errors.cjs");
const { actionId, checksum, transaction } = require("./util.cjs");

class AccountSync {
  constructor({ db, backups, remote, getSession, getSettings }) {
    this.db = db; this.backups = backups; this.remote = remote;
    this.getSession = getSession; this.getSettings = getSettings; this.running = new Set();
  }
  status(owner) {
    const state = this.db.prepare("SELECT * FROM account_sync_state WHERE owner_account_id=?").get(owner);
    const counts = this.db.prepare(`SELECT status,COUNT(*) AS count FROM account_sync_outbox
      WHERE owner_account_id=? AND status IN ('pending','retry','conflict') GROUP BY status`).all(owner);
    const receipt = this.db.prepare(`SELECT document FROM account_sync_outbox WHERE owner_account_id=?
      AND status='verified' ORDER BY verified_at DESC LIMIT 1`).get(owner);
    const savedChecksum = receipt ? checksum(JSON.parse(receipt.document).data) : null;
    return { configured: Boolean(this.remote.enabled), cloudRevision: state?.cloud_revision || 0,
      lastVerifiedAt: state?.last_verified_at || null, lastError: state?.last_error || null,
      pending: counts.reduce((n, c) => n + c.count, 0), conflicts: counts.find(c => c.status === "conflict")?.count || 0,
      localChanged: savedChecksum !== this.backups.dataChecksum(owner), running: this.running.has(owner) };
  }
  enqueue(owner, inputId) {
    const id = actionId(inputId);
    const session = this.getSession();
    invariant(session?.ownerAccountId === owner && session.provider === "runtime", "CLOUD_LOGIN_REQUIRED", "请使用云端账号登录后同步。本机账号可导出备份。");
    invariant(this.getSettings(owner).document.sync.enabled, "SYNC_DISABLED", "请先开启存档同步。");
    const previous = this.db.prepare("SELECT * FROM account_sync_outbox WHERE owner_account_id=? AND action_id=?").get(owner, id);
    if (previous) return { queued: true, actionId: id, duplicate: true, status: previous.status };
    const pending = this.db.prepare("SELECT action_id,status FROM account_sync_outbox WHERE owner_account_id=? AND status IN ('pending','retry','conflict') LIMIT 1").get(owner);
    invariant(!pending, pending?.status === "conflict" ? "SYNC_CONFLICT" : "SYNC_PENDING",
      pending?.status === "conflict" ? "云端有较新存档，请先预览云端版本。" : "已有待同步记录，请先重试该记录。",
      pending ? { actionId: pending.action_id } : undefined);
    const snapshot = this.backups.snapshot(owner);
    const base = this.db.prepare("SELECT cloud_revision FROM account_sync_state WHERE owner_account_id=?").get(owner)?.cloud_revision || 0;
    this.db.prepare("INSERT INTO account_sync_outbox(owner_account_id,action_id,base_revision,checksum,document,status,created_at) VALUES(?,?,?,?,?,'pending',?)")
      .run(owner, id, base, snapshot.checksum, JSON.stringify(snapshot), new Date().toISOString());
    return { queued: true, actionId: id, status: "pending" };
  }
  async flush(owner, force = false) {
    if (this.running.has(owner)) return { busy: true };
    const session = this.getSession();
    invariant(session?.ownerAccountId === owner && session.provider === "runtime", "CLOUD_LOGIN_REQUIRED", "请重新登录云端账号。");
    invariant(this.getSettings(owner).document.sync.enabled, "SYNC_DISABLED", "存档同步已关闭。");
    const rows = this.db.prepare(`SELECT * FROM account_sync_outbox WHERE owner_account_id=?
      AND status IN ('pending','retry') AND (next_attempt_at<=? OR ?=1) ORDER BY created_at LIMIT 1`).all(owner, Date.now(), force ? 1 : 0);
    if (!rows.length) return { verified: false, idle: true };
    this.running.add(owner);
    const row = rows[0];
    try {
      const receipt = await this.remote.cloudSave("push", session, { actionId: row.action_id, baseRevision: row.base_revision,
        envelope: JSON.parse(row.document) });
      invariant(receipt?.actionId === row.action_id && receipt.checksum === row.checksum && Number.isInteger(receipt.revision)
        && receipt.revision === row.base_revision + 1, "SYNC_RECEIPT_MISMATCH", "云端存档回执与本次操作不一致。");
      // Only a second request reading this exact action back can mark a save as verified.
      const readback = await this.remote.cloudSave("read", session, { actionId: row.action_id });
      this.backups.validate(readback?.envelope, owner);
      invariant(readback?.actionId === row.action_id && readback.revision === receipt.revision && readback.envelope.checksum === row.checksum,
        "SYNC_READBACK_MISMATCH", "云端读回结果不一致，尚未确认同步成功。");
      transaction(this.db, () => {
        const at = new Date().toISOString();
        this.db.prepare("UPDATE account_sync_outbox SET status='verified',verified_at=?,last_error=NULL WHERE owner_account_id=? AND action_id=?")
          .run(at, owner, row.action_id);
        this.db.prepare(`INSERT INTO account_sync_state VALUES(?,?,?,?,NULL) ON CONFLICT(owner_account_id)
          DO UPDATE SET cloud_revision=excluded.cloud_revision,last_checksum=excluded.last_checksum,last_verified_at=excluded.last_verified_at,last_error=NULL`)
          .run(owner, receipt.revision, row.checksum, at);
      });
      return { verified: true, actionId: row.action_id, revision: receipt.revision, checksum: row.checksum };
    } catch (error) {
      const conflict = error.code === "SYNC_CONFLICT";
      const attempts = row.attempts + 1;
      const delay = Math.min(30 * 60 * 1000, 2000 * 2 ** Math.min(attempts, 10));
      transaction(this.db, () => {
        this.db.prepare("UPDATE account_sync_outbox SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE owner_account_id=? AND action_id=?")
          .run(conflict ? "conflict" : "retry", attempts, Date.now() + delay, error.code || "SYNC_UNAVAILABLE", owner, row.action_id);
        this.db.prepare(`INSERT INTO account_sync_state(owner_account_id,last_error) VALUES(?,?)
          ON CONFLICT(owner_account_id) DO UPDATE SET last_error=excluded.last_error`).run(owner, error.code || "SYNC_UNAVAILABLE");
      });
      throw error;
    } finally { this.running.delete(owner); }
  }
  async previewCloud(owner) {
    const session = this.getSession();
    invariant(session?.ownerAccountId === owner && session.provider === "runtime", "CLOUD_LOGIN_REQUIRED", "请先登录云端账号。");
    const remote = await this.remote.cloudSave("read", session);
    invariant(remote?.envelope, "CLOUD_SAVE_NOT_FOUND", "云端还没有此账号的存档。");
    this.backups.validate(remote.envelope, owner);
    const id = require("node:crypto").randomUUID();
    this.backups.previews.set(id, { owner, envelope: remote.envelope, currentChecksum: this.backups.dataChecksum(owner),
      expiresAt: Date.now() + 10 * 60 * 1000, cloudRevision: remote.revision });
    return { previewId: id, cloudRevision: remote.revision, checksum: remote.envelope.checksum,
      createdAt: remote.envelope.createdAt, modules: Object.keys(remote.envelope.data.modules),
      tables: Object.entries(remote.envelope.data.tables).map(([name, table]) => ({ name, count: table.rows.length })) };
  }
  acceptCloudRestore(owner, preview) {
    if (!Number.isInteger(preview?.cloudRevision)) return;
    // Superseded pending local data remains archived in the outbox; never rebase and push it blindly.
    transaction(this.db, () => {
      this.db.prepare("UPDATE account_sync_outbox SET status='superseded',last_error='CLOUD_RESTORE_SUPERSEDED' WHERE owner_account_id=? AND status IN ('pending','retry','conflict')").run(owner);
      this.db.prepare(`INSERT INTO account_sync_state(owner_account_id,cloud_revision,last_checksum) VALUES(?,?,?)
        ON CONFLICT(owner_account_id) DO UPDATE SET cloud_revision=excluded.cloud_revision,last_checksum=excluded.last_checksum,last_error=NULL`)
        .run(owner, preview.cloudRevision, preview.envelope.checksum);
    });
  }
}
module.exports = { AccountSync };
