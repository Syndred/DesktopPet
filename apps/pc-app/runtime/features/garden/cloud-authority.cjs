"use strict";
const { createHash } = require('node:crypto');
const { canonical, GardenError } = require('./service.cjs');
const { createGardenBackupAdapter } = require('./backup.cjs');
const checksum = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const problem = (code, message) => { throw new GardenError(code, message); };
class CloudGardenAuthority {
  constructor(services, garden) { this.services = services; this.garden = garden; this.db = services.db; this.backup = createGardenBackupAdapter(this.db); }
  session() {
    const accounts = this.services.get('accounts');
    if (accounts?.privateSession) return accounts.privateSession();
    const user = this.services.session.getCurrentUser();
    return user?.sessionToken ? { ...user, ownerAccountId: user.id, provider: 'runtime' } : null;
  }
  isCloud(context) { const session = this.session(); return session?.provider === 'runtime' && session.ownerAccountId === context.ownerAccountId; }
  async request(op, context, extra = {}) {
    const session = this.session();
    if (!session || session.provider !== 'runtime' || session.ownerAccountId !== context.ownerAccountId || session.id !== context.ownerAccountId) problem('CLOUD_IDENTITY_MISMATCH', '云端身份映射尚未就绪，已保留本机存档');
    const client = this.services.legacy?.onlineDuelService?.client;
    if (!client) problem('GARDEN_CLOUD_UNAVAILABLE', '云端菜园尚未配置，本机缓存已保留');
    const endpoint = new URL(this.services.legacy.onlineDuelService.supabaseUrl || client.supabaseUrl);
    if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname))) problem('CLOUD_TLS_REQUIRED', '云端菜园需要 HTTPS 连接，本机缓存已保留');
    let response;
    try { response = await client.functions.invoke(process.env.SUPABASE_GARDEN_FUNCTION || 'garden-sync', { body: { ...extra, op, userId: session.id, sessionToken: session.sessionToken } }); }
    catch { problem('GARDEN_CLOUD_UNAVAILABLE', '连接云端菜园失败，可重试原操作'); }
    if (this.services.session.getOwnerAccountId() !== context.ownerAccountId) problem('SESSION_CHANGED', '账号已切换，请重新打开菜园');
    if (response.error) {
      let data; try { data = await response.error.context?.json?.(); } catch { /* No readable body on a network failure. */ }
      problem(data?.code || 'GARDEN_CLOUD_UNAVAILABLE', data?.message || '云端菜园端点尚不可用，未在本机重复结算');
    }
    if (!response.data?.ok) problem(response.data?.code || 'GARDEN_CLOUD_UNAVAILABLE', response.data?.message || '云端菜园没有返回有效回执');
    return response.data.data;
  }
  applyReadback(context, remote) {
    const owner = context.ownerAccountId, envelope = remote?.envelope;
    if (!envelope || envelope.ownerAccountId !== owner || envelope.identity?.subjectId !== owner || envelope.identity?.provider !== 'runtime' || !Number.isSafeInteger(remote.accountRevision)) problem('CLOUD_RECEIPT_MISMATCH', '云端存档回执归属不一致');
    const { checksum: digest, ...body } = envelope;
    if (checksum(body) !== digest) problem('CLOUD_RECEIPT_MISMATCH', '云端存档完整性校验失败');
    const incoming = envelope.data?.modules?.garden?.data; this.backup.validate(incoming, owner);
    const knownActions = new Map(incoming.tables.garden_actions.map(row => [row.action_id, row]));
    // Never discard an offline branch or rebase its inventory onto a newer save.
    for (const row of this.db.prepare('SELECT action_id,request_hash FROM garden_actions WHERE owner_account_id=?').all(owner)) if (knownActions.get(row.action_id)?.request_hash !== row.request_hash) problem('CLOUD_LOCAL_CONFLICT', '本机还有未同步的菜园操作，请先在账号页面保留备份并处理存档冲突');
    const remotePets = envelope.data?.tables?.companion_pets?.rows;
    const remotePetActions = envelope.data?.tables?.companion_actions?.rows;
    if (!Array.isArray(remotePets) || !Array.isArray(remotePetActions)) problem('COMPANIONS_UNAVAILABLE', '云端存档尚未包含伙伴实例');
    const petActions = new Map(remotePetActions.map(row => [row.action_id, row]));
    for (const row of this.db.prepare('SELECT action_id,request_hash FROM companion_actions WHERE owner_account_id=?').all(owner)) if (petActions.get(row.action_id)?.request_hash !== row.request_hash) problem('CLOUD_LOCAL_CONFLICT', '伙伴有尚未同步的本机操作，请先在账号页面同步或预览云端存档');
    const localPets = this.db.prepare('SELECT * FROM companion_pets WHERE owner_account_id=?').all(owner);
    const remoteById = new Map(remotePets.map(row => [row.pet_id, row]));
    for (const row of localPets) {
      const remoteRow = remoteById.get(row.pet_id);
      if (!remoteRow || remoteRow.owner_account_id !== owner || remoteRow.revision < row.revision) problem('CLOUD_LOCAL_CONFLICT', '本机伙伴进度较新，已保留原数据');
      const local = JSON.parse(row.data_json), incomingPet = JSON.parse(remoteRow.data_json);
      const metadata = ({ growth, revision, updatedAt, ...value }) => { void growth; void revision; void updatedAt; return value; };
      if (checksum(metadata(local)) !== checksum(metadata(incomingPet)) || (row.revision === remoteRow.revision && checksum(local) !== checksum(incomingPet))) problem('CLOUD_LOCAL_CONFLICT', '伙伴状态存在不同进度，请在账号页面处理存档冲突');
    }
    return this.garden.transaction(() => {
      const checkpoint = this.db.prepare('SELECT account_revision FROM garden_cloud_state WHERE owner_account_id=?').get(owner);
      if (checkpoint && remote.accountRevision < checkpoint.account_revision) problem('CLOUD_STALE_READBACK', '云端读回版本较旧，请重试');
      this.backup.restore(owner, incoming, 'replace');
      // Keep the authoritative document byte-for-byte, including its outbox
      // metadata. Cloud snapshots report confirmation from the server receipt.
      const companionAccount = envelope.data?.tables?.companion_accounts?.rows?.find(row => row.owner_account_id === owner);
      if (companionAccount) this.db.prepare('INSERT INTO companion_accounts(owner_account_id,revision,selections_json,legacy_imported_at) VALUES (?,?,?,?) ON CONFLICT(owner_account_id) DO UPDATE SET revision=MAX(companion_accounts.revision,excluded.revision)').run(owner,companionAccount.revision,companionAccount.selections_json,companionAccount.legacy_imported_at);
      for (const row of remotePets) {
        const pet = JSON.parse(row.data_json);
        if (row.owner_account_id !== owner || pet.ownerAccountId !== owner || pet.petId !== row.pet_id || row.revision !== pet.revision) problem('CLOUD_RECEIPT_MISMATCH', '伙伴读回记录归属不一致');
        this.db.prepare(`INSERT INTO companion_pets(owner_account_id,pet_id,template_id,revision,data_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(owner_account_id,pet_id) DO UPDATE SET revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at`).run(owner,row.pet_id,row.template_id,row.revision,row.data_json,row.created_at,row.updated_at);
      }
      for (const row of remotePetActions) {
        if (row.owner_account_id !== owner) problem('CLOUD_RECEIPT_MISMATCH', '伙伴操作归属不一致');
        this.db.prepare('INSERT OR IGNORE INTO companion_actions(owner_account_id,action_id,operation,request_hash,result_json,created_at) VALUES (?,?,?,?,?,?)').run(owner,row.action_id,row.operation,row.request_hash,row.result_json,row.created_at);
      }
      this.db.prepare('INSERT INTO garden_cloud_state VALUES (?,?,?,?) ON CONFLICT(owner_account_id) DO UPDATE SET account_revision=excluded.account_revision,checksum=excluded.checksum,server_time=excluded.server_time').run(owner,remote.accountRevision,digest,remote.snapshot.serverTime);
      this.services.get('accounts')?.sync?.acceptAuthoritativeReadback?.(owner, { envelope, cloudRevision: remote.accountRevision });
      return remote.snapshot;
    });
  }
  async snapshot(context) {
    // Only cloud-confirmed battle/capture identities are submitted; the endpoint
    // independently looks them up in authoritative settlement tables.
    const battle = this.services.get('battle');
    if (battle?.getOutcome) {
      const reports = await this.services.invoke('battle','listReports',{limit:200});
      if (reports.ok) for (const report of reports.data || []) {
        if (report.mode !== 'friend' || report.reward?.applied !== true) continue;
        const outcome = battle.getOutcome({ownerAccountId:context.ownerAccountId,sessionId:report.sessionId});
        if (outcome?.settled && outcome.session?.room?.id) await this.request('claimReward',context,{source:'battle',receiptId:outcome.session.room.id});
      }
    }
    const discovery = this.services.get('discovery'), companions = this.services.get('companions');
    for (const capture of discovery?.repo?.captures?.(context.ownerAccountId) || []) if (capture.validation === 'cloud') {
      const receiptId = companions?.getPet?.(context.ownerAccountId,capture.petId)?.origin?.cloudReceiptId;
      if (receiptId) await this.request('claimReward',context,{source:'exploration',receiptId});
    }
    const remote = await this.request('snapshot', context); this.applyReadback(context,remote);
    const snapshot = this.garden.snapshot(context);
    if (snapshot.ok) { snapshot.data.serverTime = remote.snapshot.serverTime; snapshot.data.plots = remote.snapshot.plots; snapshot.data.sync = { mode: 'cloud', pending: 0, conflicts: 0 }; }
    return snapshot;
  }
  async command(context, kind, input) {
    const receipt = await this.request('command', context, { command: kind, input });
    if (receipt.actionId !== input.actionId || receipt.requestHash !== checksum({ kind,input }) || !receipt.result?.ok) problem('CLOUD_RECEIPT_MISMATCH', '云端回执与本次操作不一致');
    try {
      const readback = await this.request('snapshot', context);
      if (readback.accountRevision < receipt.accountRevision) problem('CLOUD_STALE_READBACK', '云端尚未读回本次操作');
      this.applyReadback(context, readback);
    } catch { problem('CLOUD_APPLY_PENDING', '云端已受理，落盘读回尚待确认；请重试原操作，不会重复扣除或发放物品'); }
    this.services.events.emit('garden:changed', { ownerAccountId: context.ownerAccountId });
    if (kind === 'feed') this.services.events.emit('companions:changed', { ownerAccountId: context.ownerAccountId, petId: input.petId });
    return { ...receipt.result, replayed: receipt.replayed || receipt.result.replayed };
  }
}
module.exports = { CloudGardenAuthority };
