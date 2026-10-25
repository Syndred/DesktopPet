const { randomUUID } = require("node:crypto");
const { join } = require("node:path");
const { existsSync } = require("node:fs");
const { AccountError, invariant } = require("./errors.cjs");
const { transaction, checksum, accountName, username, password, hashPassword, verifyPassword, actionId, publicIdentity } = require("./util.cjs");
const { defaultSettings, validateSettings } = require("./settings.cjs");
const { importLegacy } = require("./legacy.cjs");
const { BackupManager } = require("./backups.cjs");
const { AccountSync } = require("./sync.cjs");
const { SessionVault } = require("./vault.cjs");
const { assertQaDatabase, publicScenario, qaRemoteBoundary, qaHostBoundary } = require("./qa-scenario.cjs");

class AccountsService {
  constructor({ services, remote, host, qaScenario = null }) {
    assertQaDatabase(services.db, qaScenario);
    if (qaScenario) { remote = qaRemoteBoundary(); host = qaHostBoundary(host); }
    this.services = services; this.db = services.db; this.remote = remote; this.host = host;
    this.qaScenario = qaScenario;
    this.current = null; this.epoch = 0; this.authBusy = false; this.profileBusy = false; this.settingsBusy = false;
    this.startupIssue = null;
    this.vault = new SessionVault({ userData: services.paths.userData, safeStorage: services.safeStorage });
    this.backups = new BackupManager({ db: this.db, directory: join(services.paths.userData, "accounts", "backups"),
      getIdentity: owner => this.identity(owner), scenario: qaScenario ? { mode: "simulated", scenarioId: qaScenario.id, runId: qaScenario.runId } : null });
    this.sync = new AccountSync({ db: this.db, backups: this.backups, remote, getSession: () => this.privateSession(), getSettings: owner => this.settings(owner),
      onInvalidSession: owner => this.invalidateSession(owner) });
    this.remoteUnsubscribe = remote.onInvalidated?.(({ userId,sessionId }) => {
      if(sessionId&&this.privateSession()?.sessionId!==sessionId)return;
      if (this.current?.provider === "runtime" && this.identity(this.current.ownerAccountId)?.subject_id === userId) this.invalidateSession(this.current.ownerAccountId);
    });
    this.proofUnsubscribe=remote.onProofChanged?.(({ownerAccountId,previousProof,proof})=>{
      if(this.current?.ownerAccountId!==ownerAccountId||this.current.proof!==previousProof)return;
      this.current.proof=proof;this.persistSession(this.current.rememberSession);
    });
    const file = services.paths.legacyDataExisted === false ? null : services.paths.legacyDataFile;
    this.migration = importLegacy({ db: this.db, filePath: file && existsSync(`${file}.before-lingjing.bak`) ? `${file}.before-lingjing.bak` : file,
      archiveDir: join(services.paths.userData, "accounts", "legacy-archives") });
    this.ready = this.initialize();
    this.retryTimer = setInterval(() => {
      if (this.current?.provider === "runtime" && this.settings().document.sync.enabled) {
        void this.sync.flush(this.requireOwner()).catch(() => {});
      }
    }, 30_000);
    this.retryTimer.unref?.();
  }
  identity(owner) { return this.db.prepare("SELECT * FROM account_identities WHERE owner_account_id=?").get(owner); }
  getCurrentUser() {
    if(!this.current)return null;
    const link=this.current.authKind==='supabase'?this.db.prepare('SELECT auth_user_id FROM account_cloud_links WHERE owner_account_id=?').get(this.current.ownerAccountId):null;
    return {...publicIdentity(this.identity(this.current.ownerAccountId)),dataMode:this.qaScenario?'simulated':'live',
      ...(link?{authKind:'supabase',authUserId:link.auth_user_id}:{})};
  }
  getOwnerAccountId() { return this.current?.ownerAccountId || null; }
  requireOwner() { const id = this.getOwnerAccountId(); invariant(id, "LOGIN_REQUIRED", "请先登录。"); return id; }
  privateSession() {
    if (!this.current) return null;
    const row = this.identity(this.current.ownerAccountId);
    const cloud=this.current.authKind==='supabase',actor=cloud?require('./supabase-remote.cjs').decodeProof(this.current.proof).actor:null;
    return {ownerAccountId:row.owner_account_id,provider:row.provider,id:row.subject_id,account:row.account,username:row.username,
      authKind:cloud?'supabase':row.provider,sessionToken:row.provider==='runtime'&&!cloud?this.current.proof:null,
      ...(cloud?{cloudProof:this.current.proof,authUserId:actor.authUserId,deviceId:actor.deviceId,sessionId:actor.sessionId}:{})};
  }
  requireRuntimeUser() {
    invariant(!this.qaScenario, "SIMULATED_SESSION_ONLY", "测试场景不连接真实云端。");
    const session = this.privateSession();
    invariant(session?.provider === "runtime", "CLOUD_LOGIN_REQUIRED", "此功能需要云端账号。");
    invariant(session.authKind!=='supabase','CLOUD_PROTOCOL_UPGRADE_REQUIRED','该模块需要使用新的云端身份接口。');
    return session;
  }
  async requireCloudActor(){
    invariant(!this.qaScenario,'SIMULATED_SESSION_ONLY','测试场景不连接真实云端。');
    const session=this.privateSession();
    invariant(session?.authKind==='supabase'&&this.remote.cloudContext,'CLOUD_LOGIN_REQUIRED','请登录升级后的云端账号。');
    const epoch=this.epoch,context=await this.remote.cloudContext(session);
    invariant(this.epoch===epoch&&this.current?.ownerAccountId===session.ownerAccountId,'SESSION_CHANGED','账号已切换，请重试。');return context;
  }
  async cloudInvoke(name,body){const actor=await this.requireCloudActor();return actor.invoke(name,body);}
  session() {
    return { currentUser: this.getCurrentUser(), defaultProvider: !this.qaScenario && this.remote.enabled ? "runtime" : "local",
      dataMode: this.qaScenario ? "simulated" : "live", scenario: publicScenario(this.qaScenario),
      secureStorageAvailable: !this.qaScenario && this.vault.available(), persistence: this.current?.persistence || "none",
      migration: { status: this.migration.status, imported: this.migration.imported,
        unresolved: this.migration.unresolved.map(({ reason }) => ({ reason })) }, startupIssue: this.startupIssue };
  }
  async initialize() {
    if (this.qaScenario) return;
    if (this.db.prepare("SELECT blocked FROM account_session_control WHERE singleton=1").get()?.blocked) return;
    const saved = this.vault.load();
    if (!saved) return;
    const row = this.identity(saved.ownerAccountId);
    if (!row) { this.vault.clear(); return; }
    const epoch = this.epoch;
    try {
      if (row.provider === "runtime") {
        const verified=await this.remote.verify({id:row.subject_id,ownerAccountId:row.owner_account_id,account:row.account,username:row.username,sessionToken:saved.proof,cloudProof:saved.proof});
        if(verified?.proof)saved.proof=verified.proof;
        invariant(epoch===this.epoch,'SESSION_CHANGED','账号状态已变化。');
        if(verified?.authKind==='supabase')this.remoteIdentity(verified);
      } else {
        const proof = this.db.prepare("SELECT * FROM account_login_sessions WHERE proof_hash=? AND owner_account_id=? AND expires_at>?")
          .get(checksum(saved.proof), row.owner_account_id, Date.now());
        invariant(proof, "SESSION_EXPIRED", "登录已过期，请重新登录。");
      }
      invariant(epoch === this.epoch, "SESSION_CHANGED", "账号状态已变化。");
      await this.adopt(row, saved.proof, true);
    } catch (error) {
      this.startupIssue = error.code || "SESSION_RECHECK_FAILED";
      // Keep an encrypted remote proof during temporary outages, but never treat it as verified.
      if (["SESSION_INVALIDATED", "SESSION_EXPIRED"].includes(error.code)) this.vault.clear();
    }
  }
  emitSession({ notifyApp = true } = {}) {
    const session = this.session();
    if (notifyApp) this.services.events?.emit("app:session", session.currentUser);
    this.services.events?.emit("accounts:session-changed", session);
    this.services.events?.emit("session:changed", session.currentUser);
    return session;
  }
  async adopt(row, proof, rememberSession) {
    this.epoch++;
    const epoch = this.epoch;
    this.current = { ownerAccountId: row.owner_account_id, provider: row.provider, proof, persistence: "memory", rememberSession,
      authKind:row.provider==='runtime'&&this.remote.authKind==='supabase'?'supabase':row.provider };
    this.startupIssue = null;
    this.settings(row.owner_account_id);
    this.persistSession(rememberSession);
    this.remote.setCurrentUser(row.provider === "runtime" ? this.privateSession() : null);
    await this.host?.apply?.(this.settings(row.owner_account_id).document);
    invariant(this.epoch === epoch && this.current?.ownerAccountId === row.owner_account_id, "SESSION_CHANGED", "账号状态已改变，请重新登录。");
    return this.emitSession({ notifyApp: false });
  }
  persistSession(rememberSession) {
    this.db.prepare("INSERT INTO account_session_control VALUES(1,1) ON CONFLICT(singleton) DO UPDATE SET blocked=1").run();
    try {
      if (!this.qaScenario && rememberSession && this.vault.available()) {
        this.vault.save({ ownerAccountId: this.current.ownerAccountId, proof: this.current.proof }); this.current.persistence = "secure";
        this.db.prepare("UPDATE account_session_control SET blocked=0 WHERE singleton=1").run();
      } else this.vault.clear();
    } catch {
      this.current.persistence = "memory"; this.startupIssue = "SECURE_SESSION_WRITE_FAILED";
      try { this.vault.clear(); } catch { /* The session remains in memory and UI reports persistence failure. */ }
    }
  }
  localProof(owner) {
    const proof = randomUUID() + randomUUID();
    this.db.prepare("INSERT INTO account_login_sessions VALUES(?,?,?,?)")
      .run(checksum(proof), owner, Date.now() + 30 * 24 * 60 * 60 * 1000, new Date().toISOString());
    return proof;
  }
  remoteIdentity(user) {
    const alias = this.db.prepare("SELECT owner_account_id FROM account_aliases WHERE provider='runtime' AND subject_id=?").get(user.id);
    const idExists = this.identity(user.id);
    invariant(!idExists || idExists.provider === "runtime", "IDENTITY_CONFLICT", "账号标识与已有本机身份冲突，原存档已保留。");
    const owner = alias?.owner_account_id || user.id;
    const sameName = this.db.prepare("SELECT * FROM account_identities WHERE provider='runtime' AND account_key=?").get(user.account.toLowerCase());
    invariant(!sameName || sameName.subject_id === user.id, "IDENTITY_CONFLICT", "云端身份发生变化，已保留旧存档，请联系维护者核对身份映射。");
    const now = new Date().toISOString();
    transaction(this.db, () => {
      this.db.prepare(`INSERT INTO account_identities
        (owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at)
        VALUES(?,'runtime',?,?,?,?,?,?) ON CONFLICT(owner_account_id)
        DO UPDATE SET username=excluded.username,updated_at=excluded.updated_at`)
        .run(owner, user.id, user.account, user.account.toLowerCase(), user.username, user.createdAt || now, now);
      this.db.prepare("INSERT OR IGNORE INTO account_aliases VALUES('runtime',?,?,?,?)").run(user.id, owner, "verified-runtime-session", now);
      if(user.authKind==='supabase'){
        const existing=this.db.prepare('SELECT * FROM account_cloud_links WHERE owner_account_id=? OR auth_user_id=?').all(owner,user.authUserId);
        const project=this.remote.config?.url;
        invariant(typeof project==='string'&&existing.every(link=>link.owner_account_id===owner&&link.auth_user_id===user.authUserId&&link.project_url===project),
          'IDENTITY_CONFLICT','云端映射与原账号不同，原存档已保留。');
        this.db.prepare(`INSERT INTO account_cloud_links VALUES(?,?,?,?,?) ON CONFLICT(owner_account_id)
          DO UPDATE SET updated_at=excluded.updated_at`).run(owner,user.authUserId,project,now,now);
      }
    });
    return this.identity(owner);
  }
  async authenticate(input, register = false) {
    await this.ready;
    invariant(!this.authBusy, "AUTH_BUSY", "正在处理登录，请稍候。");
    this.authBusy = true;
    const epoch = this.epoch;
    try {
      const name = accountName(input.account), secret = password(input.password);
      const provider = input.provider || (this.remote.enabled ? "runtime" : "local");
      invariant(provider === "local" || provider === "runtime", "INVALID_PROVIDER", "请选择账号类型。");
      invariant(!this.qaScenario || provider === "local", "SIMULATED_SESSION_ONLY", "测试场景不连接真实云端。");
      const label = register ? username(input.username) : null;
      if (register) invariant(secret === password(input.confirmPassword), "PASSWORD_MISMATCH", "两次输入的密码不一致。");
      let row, proof;
      if (provider === "runtime") {
        const remoteUser = register ? await this.remote.register(name, secret, label) : await this.remote.login(name, secret);
        invariant(this.epoch === epoch, "SESSION_CHANGED", "登录状态已改变，请重试。");
        row = this.remoteIdentity(remoteUser); proof = remoteUser.proof||remoteUser.sessionToken;
      } else {
        row = this.db.prepare("SELECT * FROM account_identities WHERE provider='local' AND account_key=?").get(name.toLowerCase());
        if (register) {
          invariant(!row, "ACCOUNT_EXISTS", "本机账号已存在。");
          const id = `${this.qaScenario ? `qa:${this.qaScenario.runId}:` : ""}local-${randomUUID()}`, now = new Date().toISOString();
          transaction(this.db, () => {
            this.db.prepare(`INSERT INTO account_identities
              (owner_account_id,provider,subject_id,account,account_key,username,password_hash,created_at,updated_at)
              VALUES(?,'local',?,?,?,?,?,?,?)`).run(id, id, name, name.toLowerCase(), label, hashPassword(secret), now, now);
            this.db.prepare("INSERT INTO account_aliases VALUES('local',?,?,?,?)").run(id, id, "local-registration", now);
          });
          row = this.identity(id);
        } else {
          invariant(row && verifyPassword(secret, row.password_hash), "INVALID_CREDENTIALS", "账号或密码不正确，请检查账号类型。");
          if (!row.password_hash.startsWith("scrypt$")) {
            this.db.prepare("UPDATE account_identities SET password_hash=? WHERE owner_account_id=?").run(hashPassword(secret), row.owner_account_id);
          }
        }
        proof = this.localProof(row.owner_account_id);
      }
      return await this.adopt(row, proof, input.rememberSession === true);
    } finally { this.authBusy = false; }
  }
  async logout() {
    const prior = this.current;
    const previousCloudSession = this.privateSession();
    this.epoch++; this.current = null;
    this.db.prepare("INSERT INTO account_session_control VALUES(1,1) ON CONFLICT(singleton) DO UPDATE SET blocked=1").run();
    try { this.vault.clear(); } catch { this.startupIssue = "SECURE_SESSION_CLEAR_FAILED"; }
    this.host?.clear?.();
    if (prior?.provider === "local") this.db.prepare("DELETE FROM account_login_sessions WHERE proof_hash=?").run(checksum(prior.proof));
    if (this.remote.signOut) this.signOutPending=this.remote.signOut(previousCloudSession).then(()=>({confirmed:true}),()=>({confirmed:false}));
    else this.remote.setCurrentUser(null);
    this.emitSession({ notifyApp: false });
    return { currentUser: null };
  }
  invalidateSession(owner) {
    if (this.current?.provider !== "runtime" || this.current.ownerAccountId !== owner) return;
    this.epoch++; this.current = null; this.startupIssue = "SESSION_INVALIDATED";
    this.db.prepare("INSERT INTO account_session_control VALUES(1,1) ON CONFLICT(singleton) DO UPDATE SET blocked=1").run();
    try { this.vault.clear(); } catch { /* SQLite revocation still prevents this proof from resuming. */ }
    this.host?.clear?.(); this.remote.setCurrentUser(null); this.emitSession();
  }
  settings(owner = this.requireOwner()) {
    invariant(this.identity(owner), "LOGIN_REQUIRED", "请先登录。");
    let row = this.db.prepare("SELECT * FROM account_settings WHERE owner_account_id=?").get(owner);
    if (!row) {
      const document = defaultSettings();
      this.db.prepare("INSERT INTO account_settings VALUES(?,0,?,?)").run(owner, JSON.stringify(document), new Date().toISOString());
      row = this.db.prepare("SELECT * FROM account_settings WHERE owner_account_id=?").get(owner);
    }
    return { document: validateSettings(JSON.parse(row.document)), revision: row.revision, updatedAt: row.updated_at };
  }
  async saveSettings(input) {
    invariant(!this.settingsBusy, "SETTINGS_BUSY", "正在保存设置，请稍候。");
    this.settingsBusy = true;
    try {
    const owner = this.requireOwner(), epoch = this.epoch;
    const id = actionId(input.actionId), document = validateSettings(input.document);
    const hash = checksum({ document, revision: input.revision });
    const prior = this.db.prepare("SELECT * FROM account_actions WHERE owner_account_id=? AND action_id=?").get(owner, id);
    if (prior) {
      invariant(prior.kind === "settings" && prior.input_hash === hash, "ACTION_ID_REUSED", "操作标识已用于其他请求。");
      return { ...JSON.parse(prior.result), duplicate: true, host: this.host?.status?.() };
    }
    const current = this.settings(owner);
    invariant(Number.isInteger(input.revision) && current.revision === input.revision, "REVISION_CONFLICT", "设置已更新，请重新加载后再保存。", { revision: current.revision });
    await this.host?.apply?.(document, { explicitStartupChange: document.desktop.launchAtLogin !== current.document.desktop.launchAtLogin });
    invariant(this.epoch === epoch, "SESSION_CHANGED", "账号已切换，请重新保存。");
    const saved = transaction(this.db, () => {
      const at = new Date().toISOString();
      const updated = this.db.prepare("UPDATE account_settings SET document=?,revision=revision+1,updated_at=? WHERE owner_account_id=? AND revision=?")
        .run(JSON.stringify(document), at, owner, input.revision);
      invariant(Number(updated.changes) === 1, "REVISION_CONFLICT", "设置已更新，请重新加载。");
      const value = { document, revision: input.revision + 1, updatedAt: at };
      this.db.prepare("INSERT INTO account_actions VALUES(?,?,?,?,?,?)").run(owner, id, "settings", hash, JSON.stringify(value), at);
      return value;
    });
    this.services.events?.emit("accounts:settings-changed", { ownerAccountId: owner, ...saved });
    return { ...saved, host: this.host?.status?.() };
    } finally { this.settingsBusy = false; }
  }
  async updateProfile(input, changePassword = false) {
    const owner = this.requireOwner(), epoch = this.epoch;
    invariant(!this.profileBusy, "PROFILE_BUSY", "正在保存账号资料，请稍候。");
    const row = this.identity(owner);
    invariant(Number.isInteger(input.revision) && input.revision === row.profile_revision, "REVISION_CONFLICT", "账号资料已更新，请重新加载。");
    const label = changePassword ? row.username : username(input.username);
    const newSecret = changePassword ? password(input.newPassword) : null;
    if (changePassword) invariant(newSecret === password(input.confirmPassword), "PASSWORD_MISMATCH", "两次输入的新密码不一致。");
    const oldSecret = changePassword || (row.provider === "runtime"&&this.current.authKind!=='supabase') ? password(input.oldPassword) : null;
    this.profileBusy = true;
    try {
      let updatedUser;
      if (row.provider === "runtime") {
        updatedUser = await this.remote.update(this.privateSession(), { username: label, oldPassword: oldSecret, newPassword: newSecret || "" });
        invariant(updatedUser.id === row.subject_id, "IDENTITY_CONFLICT", "更新返回了不同的账号身份，操作已停止。");
      } else if (changePassword) {
        invariant(verifyPassword(oldSecret, row.password_hash), "INVALID_OLD_PASSWORD", "当前密码不正确。");
      }
      invariant(this.epoch === epoch && this.current?.ownerAccountId === owner, "SESSION_CHANGED", "账号已切换，请重新加载资料。");
      transaction(this.db, () => {
        const updated = this.db.prepare(`UPDATE account_identities SET username=?,password_hash=?,profile_revision=profile_revision+1,updated_at=?
          WHERE owner_account_id=? AND profile_revision=?`).run(label,
          changePassword && row.provider === "local" ? hashPassword(newSecret) : row.password_hash,
          new Date().toISOString(), owner, input.revision);
        invariant(Number(updated.changes) === 1, "REVISION_CONFLICT", "账号资料已更新，请重新加载。");
        if (changePassword && row.provider === "local") this.db.prepare("DELETE FROM account_login_sessions WHERE owner_account_id=?").run(owner);
      });
      if (changePassword && row.provider === "local") this.current.proof = this.localProof(owner);
      if (updatedUser) this.current.proof = updatedUser.proof||updatedUser.sessionToken;
      this.persistSession(this.current.rememberSession);
      this.remote.setCurrentUser(row.provider === "runtime" ? this.privateSession() : null);
      this.emitSession();
      return { currentUser: this.getCurrentUser(), changed: true };
    } catch (error) {
      if (error.code === "SESSION_INVALIDATED") this.invalidateSession(owner);
      throw error;
    } finally { this.profileBusy = false; }
  }
  getLegacyInventory(owner = this.requireOwner()) {
    const row = this.db.prepare("SELECT document FROM account_legacy_data WHERE owner_account_id=?").get(owner);
    return row ? JSON.parse(row.document) : null;
  }
  requireScenarioIdentity(scenarioId) {
    invariant(this.qaScenario && this.qaScenario.id === scenarioId, "QA_SCENARIO_REQUIRED", "当前未运行对应测试场景。");
    const owner = this.requireOwner(), row = this.identity(owner);
    invariant(row.provider === "local" && owner.startsWith(`qa:${this.qaScenario.runId}:`), "QA_IDENTITY_MISMATCH", "测试身份归属不匹配。");
    return Object.freeze({ authority: "simulated", scenarioId: this.qaScenario.id, runId: this.qaScenario.runId, id: row.subject_id, ownerAccountId: owner,
      provider: "qa", account: row.account, username: row.username });
  }
  async exportBackup() {
    const owner = this.requireOwner(), epoch = this.epoch;
    const file = await this.host?.chooseBackupDestination?.();
    invariant(epoch === this.epoch, "SESSION_CHANGED", "账号已切换，请重新导出。");
    return file ? this.backups.save(owner, file) : { canceled: true };
  }
  async previewBackup() {
    const owner = this.requireOwner(), epoch = this.epoch;
    const file = await this.host?.chooseBackupSource?.();
    invariant(epoch === this.epoch, "SESSION_CHANGED", "账号已切换，请重新选择备份。");
    return file ? this.backups.preview(owner, file) : { canceled: true };
  }
  async restoreBackup(input) {
    const owner = this.requireOwner();
    const preview = this.backups.previews.get(input.previewId);
    const restored = transaction(this.db, () => {
      const result = this.backups.restore(owner, input);
      if (preview?.cloudRevision) this.sync.acceptCloudRestore(owner, preview);
      return result;
    });
    await this.host?.apply?.(this.settings(owner).document);
    this.services.events?.emit("accounts:save-restored", { ownerAccountId: owner });
    return restored;
  }
  dispose() { clearInterval(this.retryTimer); this.remoteUnsubscribe?.(); this.proofUnsubscribe?.(); this.remote.dispose?.(); this.host?.dispose?.(); }
}
module.exports = { AccountsService };
