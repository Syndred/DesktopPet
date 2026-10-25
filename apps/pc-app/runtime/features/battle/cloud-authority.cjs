const { createHash } = require('node:crypto');
const { canonical, saveDataChecksum } = require('../accounts/util.cjs');
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const fail = (code,message) => { throw Object.assign(new Error(message),{code}); };

/** Main-process only. A fresh action-specific HTTPS readback is required before
 * a cloud reward can replace the canonical local consistency units. */
class BattleCloudAuthority {
  constructor(services) { this.services=services;this.db=services.db; }
  owner(owner) { if(this.services.get('accounts')?.getOwnerAccountId()!==owner)fail('AUTH_CHANGED','账号已切换，请重新打开对战'); }
  async apply(owner,proof) {
    this.owner(owner);
    if(proof?.owner_account_id!==owner||proof.reward?.actionId!==proof.action_id||proof.reward?.petId!==proof.pet_id||proof.authority?.actionId!==proof.action_id||!Number.isSafeInteger(proof.authority?.revision))fail('INVALID_SETTLEMENT_PROOF','云端结算归属不一致');
    const actor=await this.services.get('cloudActor').requireActor();this.owner(owner);
    const remote=await actor.invoke('lingjing-save',{op:'read',actionId:proof.action_id});this.owner(owner);
    if(remote?.actionId!==proof.action_id||remote.revision!==proof.authority.revision||remote.checksum!==proof.authority.checksum||remote.envelope?.checksum!==remote.checksum)fail('CLOUD_READBACK_MISMATCH','尚未读回本次结算的匹配存档，请重试原结算');
    const backups=this.services.get('backups'),envelope=remote.envelope;backups.validate(envelope,owner);
    if(envelope.provenance?.mode!=='live')fail('INVALID_SETTLEMENT_PROOF','云端结算来源无效');
    const modules=envelope.data.modules,companions=backups.adapters.get('companions'),garden=backups.adapters.get('garden'),battle=backups.adapters.get('battle');
    if(!companions||!garden||!battle||modules.companions?.version!==1||modules.garden?.version!==1||modules.battle?.version!==1)fail('CLOUD_MODULE_UNAVAILABLE','完整结算模块尚未就绪');
    const c=modules.companions.data,g=modules.garden.data,b=modules.battle.data;
    companions.validate(c,owner);garden.validate(g,owner);battle.validate(b,owner);
    const report=b.reports.find(row=>row.id===proof.report?.id);
    if(!report||hash(JSON.parse(report.data_json))!==hash(proof.report)||!b.rewards.some(row=>row.action_id===proof.action_id&&row.pet_id===proof.pet_id))fail('INVALID_SETTLEMENT_PROOF','战报与存档中的结算记录不一致');
    // Keep every independent local operation. Never silently discard an offline
    // branch just because a later cloud battle has a valid reward receipt.
    for(const [name,rows] of [['companion_actions',c.tables.companion_actions],['garden_actions',g.tables.garden_actions]]) {
      const incoming=new Map(rows.map(row=>[row.action_id,row.request_hash]));
      for(const row of this.db.prepare(`SELECT action_id,request_hash FROM ${name} WHERE owner_account_id=?`).all(owner))if(incoming.get(row.action_id)!==row.request_hash)fail('CLOUD_LOCAL_CONFLICT','云端已结算；本机有未核验的伙伴或菜园操作，已保留，请在账号页面预览云端存档');
    }
    const remotePets=new Map(c.tables.companion_pets.map(row=>[row.pet_id,row]));
    for(const row of this.db.prepare('SELECT * FROM companion_pets WHERE owner_account_id=?').all(owner)) {
      const next=remotePets.get(row.pet_id);if(!next||next.revision<row.revision)fail('CLOUD_LOCAL_CONFLICT','本机伙伴进度较新，已保留原存档');
      if(next.revision===row.revision&&hash(JSON.parse(next.data_json))!==hash(JSON.parse(row.data_json)))fail('CLOUD_LOCAL_CONFLICT','伙伴存在不同进度，请先处理账号存档冲突');
    }
    const gardenHash=data=>saveDataChecksum({modules:{garden:{version:1,data}},tables:{}});
    const changed=hash(companions.export(owner))!==hash(c)||gardenHash(garden.export(owner))!==gardenHash(g);
    if(changed)backups.save(owner,null,'before-cloud-battle-readback');
    const restore=()=>{
      this.owner(owner);companions.restore(owner,c,'replace');garden.restore(owner,g,'replace');battle.restore(owner,b,'replace');
    };
    // The shared connection exposes better-sqlite3 transactions in production.
    // SAVEPOINT also composes with supported node:sqlite acceptance fixtures.
    this.db.exec('SAVEPOINT battle_cloud_readback');
    try {restore();this.db.exec('RELEASE SAVEPOINT battle_cloud_readback');}
    catch(error){this.db.exec('ROLLBACK TO SAVEPOINT battle_cloud_readback');this.db.exec('RELEASE SAVEPOINT battle_cloud_readback');throw error;}
    try {this.services.get('accounts')?.sync?.acceptAuthoritativeReadback(owner,{envelope,cloudRevision:remote.revision});}
    catch(error){if(!['CLOUD_LOCAL_CONFLICT','SYNC_PENDING','SYNC_BUSY'].includes(error.code))throw error;this.services.events?.emit('accounts:authority-readback-pending',{ownerAccountId:owner,code:error.code});}
    this.services.events?.emit('companions:changed',{ownerAccountId:owner,petId:proof.pet_id});this.services.events?.emit('garden:changed',{ownerAccountId:owner});
    return proof;
  }
}
module.exports={BattleCloudAuthority};
