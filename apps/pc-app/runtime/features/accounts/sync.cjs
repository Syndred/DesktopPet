const { invariant } = require("./errors.cjs");
const { actionId, saveDataChecksum, checksum, transaction } = require("./util.cjs");
const { randomUUID }=require('node:crypto');
const {cloudProjection}=require('./cloud-projection.cjs');
const personalModules=new Set(['settings','conversations']);
function meaningfulData(data){
  const modules={...data.modules};if(modules.legacy?.data===null)delete modules.legacy;
  if(modules['character-resources']?.version===2&&modules['character-resources'].data.references?.length===0)delete modules['character-resources'];
  const battle=modules.battle;
  if(battle?.version===1&&battle.data&&Object.keys(battle.data).sort().join('|')==='actions|reports|rewards|sessions'
    &&Object.values(battle.data).every(rows=>Array.isArray(rows)&&rows.length===0))delete modules.battle;
  const garden=modules.garden,gardenData=garden?.data;
  if(garden?.version===1&&gardenData&&Object.keys(gardenData).every(key=>['ownerAccountId','tables','territoryArchive'].includes(key))
    &&gardenData.tables&&Object.values(gardenData.tables).every(rows=>Array.isArray(rows)&&rows.length===0)
    &&(!gardenData.territoryArchive||Object.keys(gardenData.territoryArchive).sort().join('|')==='logs|territories'
      &&gardenData.territoryArchive.logs?.length===0&&gardenData.territoryArchive.territories?.length===0))delete modules.garden;
  return {...data,modules,tables:Object.fromEntries(Object.entries(data.tables).filter(([,table])=>table.rows?.length))};
}
function protectedData(data){const copy=meaningfulData(data);return {...copy,modules:Object.fromEntries(Object.entries(copy.modules).filter(([key])=>!personalModules.has(key)))};}
function sameSession(current,expected){
  if(!current||current.ownerAccountId!==expected.ownerAccountId||current.provider!==expected.provider)return false;
  if(expected.authKind==='supabase')return current.authKind==='supabase'&&typeof expected.sessionId==='string'&&current.sessionId===expected.sessionId;
  return current.sessionToken===expected.sessionToken;
}

class AccountSync {
  constructor({ db, backups, remote, getSession, getSettings, onInvalidSession }) {
    this.db = db; this.backups = backups; this.remote = remote;
    this.getSession = getSession; this.getSettings = getSettings; this.running = new Set();
    this.onInvalidSession = onInvalidSession;
  }
  cloudView(data,owner){
    const view=owner&&this.backups.normalizeData?this.backups.normalizeData(data,owner):data;
    return owner&&this.remote.authKind==='supabase'&&this.backups.cloudData?this.backups.cloudData(view,owner):view;
  }
  dataChecksum(data,owner){
    const view=this.cloudView(data,owner);return saveDataChecksum(this.remote.authKind==='supabase'?meaningfulData(view):view);
  }
  status(owner) {
    const state = this.db.prepare("SELECT * FROM account_sync_state WHERE owner_account_id=?").get(owner);
    const counts = this.db.prepare(`SELECT status,COUNT(*) AS count FROM account_sync_outbox
      WHERE owner_account_id=? AND status IN ('pending','retry','conflict') GROUP BY status`).all(owner);
    const receipt = this.db.prepare(`SELECT document FROM account_sync_outbox WHERE owner_account_id=?
      AND status='verified' ORDER BY verified_at DESC LIMIT 1`).get(owner);
    const checkpoint = this.db.prepare('SELECT * FROM account_sync_checkpoints WHERE owner_account_id=?').get(owner);
    const savedChecksum = checkpoint && state && checkpoint.cloud_revision === state.cloud_revision && checkpoint.envelope_checksum === state.last_checksum
      ? checkpoint.data_checksum : receipt ? this.dataChecksum(JSON.parse(receipt.document).data,owner) : null;
    const unresolved=this.db.prepare('SELECT count(*) count FROM account_sync_sources WHERE owner_account_id=? AND authority_pending=1').get(owner).count;
    const projections=this.db.prepare("SELECT cloud_excluded FROM account_sync_sources WHERE owner_account_id=? AND cloud_excluded<>'[]'").all(owner);
    return { configured: Boolean(this.remote.enabled), cloudRevision: state?.cloud_revision || 0,
      lastVerifiedAt: state?.last_verified_at || null, lastError: state?.last_error || null,
      pending: counts.reduce((n, c) => n + c.count, 0), conflicts: counts.find(c => c.status === "conflict")?.count || 0,
      localChanged:savedChecksum!==this.dataChecksum(this.backups.snapshot(owner).data,owner),unverifiedLocal:unresolved,
      privacyRedactions:projections.length,
      running: this.running.has(owner) };
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
    transaction(this.db,()=>{
      const at=new Date().toISOString();
      this.db.prepare("INSERT INTO account_sync_outbox(owner_account_id,action_id,base_revision,checksum,document,status,created_at) VALUES(?,?,?,?,?,'pending',?)")
        .run(owner,id,base,snapshot.checksum,JSON.stringify(snapshot),at);
      if(this.remote.authKind==='supabase')this.db.prepare('INSERT INTO account_sync_sources(owner_account_id,action_id,original_document,original_checksum,archive_action_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(owner,id,JSON.stringify(snapshot),snapshot.checksum,`archive:${randomUUID()}`,at);
    });
    return { queued: true, actionId: id, status: "pending" };
  }
  async prepareProtected(owner,row,session){
    if(this.remote.authKind!=='supabase')return row;
    let source=this.db.prepare('SELECT * FROM account_sync_sources WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id);
    if(!source){
      this.db.prepare('INSERT INTO account_sync_sources(owner_account_id,action_id,original_document,original_checksum,archive_action_id,created_at) VALUES(?,?,?,?,?,?)')
        .run(owner,row.action_id,row.document,row.checksum,`archive:${randomUUID()}`,new Date().toISOString());
      source=this.db.prepare('SELECT * FROM account_sync_sources WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id);
    }
    if(source.prepared_at)return row; // Retry exactly the same CAS input after an uncertain response.
    const local=JSON.parse(source.original_document);this.backups.validate(local,owner);
    const projection=cloudProjection(local);
    this.db.prepare('UPDATE account_sync_sources SET cloud_projection_checksum=?,cloud_excluded=? WHERE owner_account_id=? AND action_id=?')
      .run(projection.projectedChecksum,JSON.stringify(projection.excluded),owner,row.action_id);
    const cloud=await this.remote.cloudSave('read',session);
    if(cloud?.envelope)this.backups.validate(cloud.envelope,owner);
    const protectedCloud=cloud?.envelope?.data||{modules:{},tables:{}};
    const localView=this.cloudView(local.data,owner),cloudView=this.cloudView(protectedCloud,owner);
    const different=saveDataChecksum(protectedData(localView))!==saveDataChecksum(protectedData(cloudView));
    const conflict=(cloud?.revision||0)!==row.base_revision;
    if(different||conflict||!projection.originalCloudComplete){
      const reason=source.archive_reason||(conflict?'pre-conflict':'unverified-local');
      this.db.prepare('UPDATE account_sync_sources SET archive_reason=?,authority_pending=? WHERE owner_account_id=? AND action_id=?')
        .run(reason,different?1:0,owner,row.action_id);
      if(!source.cloud_archive_id){
        const receipt=await this.remote.cloudSave('archive',session,{actionId:source.archive_action_id,reason,envelope:projection.envelope});
        invariant(receipt?.promoted===false&&receipt.checksum===projection.projectedChecksum&&typeof receipt.id==='string','SYNC_RECEIPT_MISMATCH','安全存档投影的归档回执不一致。');
        this.db.prepare('UPDATE account_sync_sources SET cloud_archive_id=? WHERE owner_account_id=? AND action_id=?').run(receipt.id,owner,row.action_id);
      }
    }
    invariant(!conflict,'SYNC_CONFLICT','云端已有较新版本，本机原档已保留，请先预览云端存档。');
    const modules={...(cloud?.envelope?.data.modules||{})};
    for(const [name,value]of Object.entries(projection.envelope.data.modules))if(personalModules.has(name))modules[name]=value;
    const {checksum:oldDigest,...body}=local;
    const nextBody={...body,data:{modules,tables:cloud?.envelope?.data.tables||{}}};
    const envelope={...nextBody,checksum:checksum(nextBody)};
    transaction(this.db,()=>{
      this.db.prepare('UPDATE account_sync_outbox SET checksum=?,document=? WHERE owner_account_id=? AND action_id=?').run(envelope.checksum,JSON.stringify(envelope),owner,row.action_id);
      this.db.prepare('UPDATE account_sync_sources SET prepared_at=? WHERE owner_account_id=? AND action_id=?').run(new Date().toISOString(),owner,row.action_id);
    });
    return {...row,checksum:envelope.checksum,document:JSON.stringify(envelope)};
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
    let row = rows[0];
    try {
      row=await this.prepareProtected(owner,row,session);
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
      const unresolved=this.db.prepare('SELECT authority_pending FROM account_sync_sources WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id)?.authority_pending===1;
      const redacted=this.db.prepare('SELECT cloud_excluded FROM account_sync_sources WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id)?.cloud_excluded;
      const privacyRedactions=Boolean(redacted&&redacted!=='[]');
      return {verified:!unresolved&&!privacyRedactions,personalVerified:true,requiresAuthority:unresolved,privacyRedactions,actionId:row.action_id,revision:receipt.revision,checksum:row.checksum};
    } catch (error) {
      const conflict = ['SYNC_CONFLICT','PROTECTED_STATE_MISMATCH','PROTECTED_STATE_REQUIRES_AUTHORITY','PET_OWNER_MISMATCH'].includes(error.code);
      const attempts = row.attempts + 1;
      const delay = Math.min(30 * 60 * 1000, 2000 * 2 ** Math.min(attempts, 10));
      transaction(this.db, () => {
        this.db.prepare("UPDATE account_sync_outbox SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE owner_account_id=? AND action_id=?")
          .run(conflict ? "conflict" : "retry", attempts, Date.now() + delay, error.code || "SYNC_UNAVAILABLE", owner, row.action_id);
        this.db.prepare(`INSERT INTO account_sync_state(owner_account_id,last_error) VALUES(?,?)
          ON CONFLICT(owner_account_id) DO UPDATE SET last_error=excluded.last_error`).run(owner, error.code || "SYNC_UNAVAILABLE");
      });
      if (error.code === "SESSION_INVALIDATED") this.onInvalidSession?.(owner);
      throw error;
    } finally { this.running.delete(owner); }
  }
  async previewCloud(owner) {
    const session = this.getSession();
    invariant(session?.ownerAccountId === owner && session.provider === "runtime", "CLOUD_LOGIN_REQUIRED", "请先登录云端账号。");
    const remote = await this.remote.cloudSave("read", session);
    invariant(remote?.envelope, "CLOUD_SAVE_NOT_FOUND", "云端还没有此账号的存档。");
    this.backups.validate(remote.envelope, owner);
    await this.backups.prepareCloud?.(remote.envelope,owner);
    invariant(sameSession(this.getSession(),session),"SESSION_CHANGED","登录状态已变化，请重新预览云端存档。");
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
      const at=new Date().toISOString(),digest=this.dataChecksum(preview.envelope.data,owner);
      this.db.prepare(`INSERT INTO account_sync_state VALUES(?,?,?,?,NULL)
        ON CONFLICT(owner_account_id) DO UPDATE SET cloud_revision=excluded.cloud_revision,last_checksum=excluded.last_checksum,last_verified_at=excluded.last_verified_at,last_error=NULL`)
        .run(owner,preview.cloudRevision,preview.envelope.checksum,at);
      this.db.prepare(`INSERT INTO account_sync_checkpoints VALUES(?,?,?,?,?) ON CONFLICT(owner_account_id)
        DO UPDATE SET cloud_revision=excluded.cloud_revision,envelope_checksum=excluded.envelope_checksum,data_checksum=excluded.data_checksum,verified_at=excluded.verified_at`)
        .run(owner,preview.cloudRevision,preview.envelope.checksum,digest,at);
      if(this.dataChecksum(this.backups.snapshot(owner).data,owner)===digest)
        this.db.prepare('UPDATE account_sync_sources SET authority_pending=0 WHERE owner_account_id=?').run(owner);
    });
  }
  /** Main-only bridge for another authoritative module. Advance the shared CAS
   * base only after its complete verified save exactly matches local domain data.
   * Pending/in-flight saves are retained and must be reconciled explicitly. */
  acceptAuthoritativeReadback(owner, { envelope, cloudRevision }) {
    const session = this.getSession();
    invariant(session?.ownerAccountId === owner && session.provider === 'runtime', 'CLOUD_LOGIN_REQUIRED', '请重新登录云端账号。');
    invariant(Number.isSafeInteger(cloudRevision) && cloudRevision >= 0, 'SYNC_RECEIPT_MISMATCH', '云端存档版本无效。');
    this.backups.validate(envelope, owner);
    invariant(!this.running.has(owner), 'SYNC_BUSY', '账号存档正在同步，请稍后重试菜园读回。');
    const pending = this.db.prepare("SELECT 1 FROM account_sync_outbox WHERE owner_account_id=? AND status IN ('pending','retry','conflict') LIMIT 1").get(owner);
    invariant(!pending, 'SYNC_PENDING', '已有待确认的账号存档，请先重试或预览该记录。');
    const current = this.db.prepare('SELECT * FROM account_sync_state WHERE owner_account_id=?').get(owner);
    invariant(!current || cloudRevision >= current.cloud_revision, 'SYNC_STALE_READBACK', '云端存档读回版本较旧。');
    invariant(!current || cloudRevision !== current.cloud_revision || !current.last_checksum || current.last_checksum === envelope.checksum,
      'SYNC_RECEIPT_MISMATCH', '同一云端版本返回了不同的存档。');
    const digest = this.dataChecksum(envelope.data,owner);
    invariant(this.dataChecksum(this.backups.snapshot(owner).data,owner) === digest, 'CLOUD_LOCAL_CONFLICT', '其他本机进度尚未与完整云端存档一致，已保留原数据。');
    transaction(this.db, () => {
      const at = new Date().toISOString();
      this.db.prepare(`INSERT INTO account_sync_state VALUES(?,?,?,?,NULL) ON CONFLICT(owner_account_id)
        DO UPDATE SET cloud_revision=excluded.cloud_revision,last_checksum=excluded.last_checksum,last_verified_at=excluded.last_verified_at,last_error=NULL`)
        .run(owner, cloudRevision, envelope.checksum, at);
      this.db.prepare(`INSERT INTO account_sync_checkpoints VALUES(?,?,?,?,?) ON CONFLICT(owner_account_id)
        DO UPDATE SET cloud_revision=excluded.cloud_revision,envelope_checksum=excluded.envelope_checksum,data_checksum=excluded.data_checksum,verified_at=excluded.verified_at`)
        .run(owner, cloudRevision, envelope.checksum, digest, at);
      this.db.prepare('UPDATE account_sync_sources SET authority_pending=0 WHERE owner_account_id=?').run(owner);
    });
    return { verified: true, revision: cloudRevision };
  }
}
module.exports = { AccountSync };
