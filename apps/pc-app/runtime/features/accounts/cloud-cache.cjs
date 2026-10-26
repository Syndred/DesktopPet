/* eslint-disable @typescript-eslint/no-require-imports -- Electron runtime uses CommonJS. */
const { invariant } = require('./errors.cjs');
const { saveDataChecksum, transaction } = require('./util.cjs');

const DOMAINS = new Set(['companions', 'garden', 'battle']);

/** Verified server projections, independently of editable personal records.
 * This is a read cache checkpoint, never permission to upload a full local save. */
class CloudReadbackCache {
  constructor({ db, backups, getSession, cloudView }) {
    this.db = db; this.backups = backups; this.getSession = getSession; this.cloudView = cloudView;
  }
  revision(owner) {
    return this.db.prepare('SELECT max(cloud_revision) revision FROM account_cloud_readbacks WHERE owner_account_id=?').get(owner)?.revision || 0;
  }
  status(owner) {
    return { mode: 'cloud-authority', revision: this.revision(owner), domains: this.db.prepare(
      'SELECT domain,cloud_revision AS revision,verified_at AS verifiedAt FROM account_cloud_readbacks WHERE owner_account_id=? ORDER BY domain'
    ).all(owner) };
  }
  accept(owner, { envelope, cloudRevision, domains }) {
    const session = this.getSession();
    invariant(session?.ownerAccountId === owner && session.authKind === 'supabase', 'CLOUD_LOGIN_REQUIRED', '请重新登录云端账号。');
    invariant(Number.isSafeInteger(cloudRevision) && cloudRevision >= 0, 'SYNC_RECEIPT_MISMATCH', '云端数据版本无效。');
    invariant(Array.isArray(domains) && domains.length > 0 && new Set(domains).size === domains.length && domains.every(name => DOMAINS.has(name)),
      'INVALID_CLOUD_DOMAIN', '云端数据范围无效。');
    this.backups.validate(envelope, owner);
    const remote = this.cloudView(envelope.data, owner), local = this.cloudView(this.backups.snapshot(owner).data, owner);
    const records = domains.map(domain => {
      invariant(remote.modules[domain] && local.modules[domain], 'CLOUD_MODULE_REQUIRED', '云端业务数据尚未完整读取。');
      const digest = value => saveDataChecksum({ modules: { [domain]: value }, tables: {} });
      const moduleChecksum = digest(remote.modules[domain]);
      invariant(digest(local.modules[domain]) === moduleChecksum, 'CLOUD_READBACK_PENDING', '云端业务结果尚未完整读取，请重试原操作。');
      return { domain, moduleChecksum };
    });
    return transaction(this.db, () => {
      const previous = this.db.prepare('SELECT * FROM account_cloud_readbacks WHERE owner_account_id=? ORDER BY cloud_revision DESC LIMIT 1').get(owner);
      invariant(!previous || cloudRevision >= previous.cloud_revision, 'SYNC_STALE_READBACK', '云端业务读回版本较旧。');
      invariant(!previous || cloudRevision !== previous.cloud_revision || envelope.checksum === previous.envelope_checksum,
        'SYNC_RECEIPT_MISMATCH', '同一云端版本返回了不同的业务数据。');
      const at = new Date().toISOString();
      for (const { domain, moduleChecksum } of records) this.db.prepare(`INSERT INTO account_cloud_readbacks VALUES(?,?,?,?,?,?)
        ON CONFLICT(owner_account_id,domain) DO UPDATE SET cloud_revision=excluded.cloud_revision,
        envelope_checksum=excluded.envelope_checksum,module_checksum=excluded.module_checksum,verified_at=excluded.verified_at`)
        .run(owner, domain, cloudRevision, envelope.checksum, moduleChecksum, at);
      return { verified: true, revision: cloudRevision, domains: [...domains] };
    });
  }
}

module.exports = { CloudReadbackCache };
