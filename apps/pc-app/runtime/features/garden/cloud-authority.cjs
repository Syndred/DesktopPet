"use strict";
const {createHash}=require('node:crypto');
const {canonical,GardenError}=require('./service.cjs');
const {createGardenBackupAdapter}=require('./backup.cjs');
const {createCompanionBackupAdapter,TABLES}=require('../companions/backup.cjs');
const {BattleStore}=require('../battle/store.cjs');
const checksum=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const problem=(code,message)=>{throw new GardenError(code,message);};
const territoryOps={territoryLocate:'locate',territoryChallenge:'challenge',territorySettle:'settle',garrison:'garrison'};
const actorKey=actor=>[actor.ownerAccountId,actor.authUserId,actor.deviceId,actor.sessionId].join('\0');
class CloudGardenAuthority{
  constructor(services,garden){this.services=services;this.garden=garden;this.db=services.db;this.backup=createGardenBackupAdapter(this.db);this.companions=createCompanionBackupAdapter(this.db);this.battles=new BattleStore(this.db);this.locks=new Map();}
  session(){return this.services.get('accounts')?.privateSession?.()||null;}
  isCloud(context){const session=this.session();return !this.services.get('qaScenario')&&session?.provider==='runtime'&&session.ownerAccountId===context.ownerAccountId;}
  assertOwner(context){if(this.services.session.getOwnerAccountId()!==context.ownerAccountId)problem('SESSION_CHANGED','账号已切换，请重新打开菜园');}
  async actor(context){
    this.assertOwner(context);
    const capability=this.services.get('cloudActor'),accounts=this.services.get('accounts');
    const cloud=capability?.requireActor?await capability.requireActor():await accounts?.requireCloudActor?.(),actor=cloud?.actor||cloud;
    if(actor?.schemaVersion!==1||actor.authority!=='live'||actor.authKind!=='supabase'||actor.ownerAccountId!==context.ownerAccountId||!actor.authUserId||!actor.deviceId||!actor.sessionId||typeof cloud.invoke!=='function')problem('CLOUD_AUTH_REQUIRED','请先登录统一云端账号');
    let url;try{url=new URL(cloud.url);}catch{problem('GARDEN_CLOUD_UNAVAILABLE','云端菜园未配置');}
    if(url.href!=='https://jbvrdmrkwpznbrvteive.supabase.co/'||!cloud.publishableKey?.startsWith('sb_publishable_'))problem('CLOUD_PROJECT_MISMATCH','云端菜园项目不匹配');
    this.assertOwner(context);return {cloud,actor};
  }
  async request(endpoint,body,context){
    const {cloud,actor}=await this.actor(context),reply=await cloud.invoke(endpoint,body);
    this.assertOwner(context);
    if(actorKey((await this.actor(context)).actor)!==actorKey(actor))problem('SESSION_CHANGED','登录状态已变化，原操作可在原账号恢复');
    return reply;
  }
  companionUnit(envelope,owner){
    const module=envelope.data?.modules?.companions;
    if(module!==undefined){
      if(module.version!==1||TABLES.some(name=>Object.hasOwn(envelope.data.tables||{},name)))problem('CLOUD_RECEIPT_MISMATCH','伙伴存档包含两份状态或版本无效');
      this.companions.validate(module.data,owner);return module.data;
    }
    return this.companions.fromLegacyTables(envelope.data?.tables||{},owner);
  }
  applyReadback(context,remote){
    this.assertOwner(context);const owner=context.ownerAccountId,envelope=remote?.envelope;
    if(envelope?.ownerAccountId!==owner||envelope.identity?.provider!=='runtime'||envelope.identity.subjectId!==owner||envelope.provenance?.mode!=='live'||!Number.isSafeInteger(remote.accountRevision)||remote.accountRevision<1)problem('CLOUD_RECEIPT_MISMATCH','云端存档回执归属不一致');
    const {checksum:digest,...body}=envelope;if(checksum(body)!==digest)problem('CLOUD_RECEIPT_MISMATCH','云端存档完整性校验失败');
    const incoming=envelope.data?.modules?.garden?.data;this.backup.validate(incoming,owner);
    const unit=this.companionUnit(envelope,owner),remotePets=unit.tables.companion_pets;
    const sameActions=(name,remoteRows)=>{
      const known=new Map(remoteRows.map(row=>[row.action_id,row]));
      for(const row of this.db.prepare(`SELECT action_id,request_hash FROM ${name} WHERE owner_account_id=?`).all(owner))if(known.get(row.action_id)?.request_hash!==row.request_hash)problem('CLOUD_LOCAL_CONFLICT','本机有未同步的操作，原存档已保留，请在账号页面处理冲突');
    };
    sameActions('garden_actions',incoming.tables.garden_actions);sameActions('companion_actions',unit.tables.companion_actions);
    const localUnit=this.companions.export(owner),remoteById=new Map(remotePets.map(row=>[row.pet_id,row]));
    const remoteAccounts=unit.tables.companion_accounts,localAccount=localUnit.tables.companion_accounts[0],remoteAccount=remoteAccounts[0];
    if(localAccount&&(!remoteAccount||remoteAccount.revision<localAccount.revision||(remoteAccount.revision===localAccount.revision&&checksum(localAccount)!==checksum(remoteAccount))))problem('CLOUD_LOCAL_CONFLICT','本机伙伴选择或进度较新，已保留原数据');
    for(const row of localUnit.tables.companion_pets){
      const next=remoteById.get(row.pet_id);if(!next||next.revision<row.revision)problem('CLOUD_LOCAL_CONFLICT','本机伙伴进度较新，已保留原数据');
      if(next.revision===row.revision&&checksum(row)!==checksum(next))problem('CLOUD_LOCAL_CONFLICT','伙伴有不同的本机进度，已保留原数据');
    }
    // Retained archives/interactions/captures/identity imports are a complete
    // consistency unit; no row union and no loss of an offline-only history.
    for(const name of TABLES.filter(name=>!['companion_accounts','companion_pets','companion_actions','companion_interactions'].includes(name))){const known=new Set(unit.tables[name].map(checksum));if(localUnit.tables[name].some(row=>!known.has(checksum(row))))problem('CLOUD_LOCAL_CONFLICT','本机伙伴历史尚未同步，原记录已保留');}
    if(localUnit.tables.companion_interactions.some(row=>!unit.tables.companion_interactions.some(next=>next.pet_id===row.pet_id&&next.last_interacted_at>=row.last_interacted_at)))problem('CLOUD_LOCAL_CONFLICT','本机伙伴互动进度尚未同步');
    const identity=new Set(unit.identityImports.map(checksum));if(localUnit.identityImports.some(row=>!identity.has(checksum(row))))problem('CLOUD_LOCAL_CONFLICT','本机伙伴迁移历史尚未同步');
    return this.garden.transaction(()=>{
      const checkpoint=this.db.prepare('SELECT account_revision FROM garden_cloud_state WHERE owner_account_id=?').get(owner);
      const shared=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='account_sync_state'").get();
      const sharedRevision=shared?this.db.prepare('SELECT cloud_revision FROM account_sync_state WHERE owner_account_id=?').get(owner)?.cloud_revision:0;
      if(remote.accountRevision<Math.max(checkpoint?.account_revision||0,sharedRevision||0))problem('CLOUD_STALE_READBACK','云端读回版本较旧，请重试');
      this.backup.restore(owner,incoming,'replace');this.companions.restore(owner,unit,'replace');
      for(const record of remote.territories||[])this.services.get('territories')?.importRecord?.(record);
      this.db.prepare('INSERT INTO garden_cloud_state VALUES(?,?,?,?) ON CONFLICT(owner_account_id) DO UPDATE SET account_revision=excluded.account_revision,checksum=excluded.checksum,server_time=excluded.server_time').run(owner,remote.accountRevision,digest,remote.snapshot?.serverTime||remote.serverTime||Date.now());
      // Only08 can advance the complete-save CAS base. A domain readback may
      // retain unrelated local chat/settings work without pretending it synced.
      try{this.services.get('accounts')?.sync?.acceptAuthoritativeReadback?.(owner,{envelope,cloudRevision:remote.accountRevision});}
      catch(error){if(!['CLOUD_LOCAL_CONFLICT','SYNC_PENDING','SYNC_BUSY'].includes(error.code))throw error;}
      return remote.snapshot;
    });
  }
  project(snapshot){const map=this.services.get('discovery')?.map,scenario=(snapshot.territories||[]).find(record=>record.worldMode==='simulated');return {...snapshot,...(scenario?{scenario:{mode:'simulated',id:scenario.scenarioId,label:'云端定位演练'}}:{}),territories:(snapshot.territories||[]).map(record=>({...record,...(map?.project?{mapBoundary:record.boundary.map(point=>map.project(point))}:{})}))};}
  async snapshot(context){
    await this.request('garden-sync',{op:'snapshot'},context);
    const remote=await this.request('territory-sync',{op:'snapshot'},context);this.applyReadback(context,remote);
    const pending=this.db.prepare("SELECT count(*) count FROM garden_cloud_requests WHERE owner_account_id=? AND status='pending'").get(context.ownerAccountId).count;
    return {ok:true,data:this.project({...remote.snapshot,sync:{mode:'cloud',pending,conflicts:0}})};
  }
  serial(owner,task){const before=this.locks.get(owner)||Promise.resolve(),next=before.catch(()=>{}).then(task);this.locks.set(owner,next);return next.finally(()=>{if(this.locks.get(owner)===next)this.locks.delete(owner);});}
  async journal(context,endpoint,op,kind,input){
    const owner=context.ownerAccountId,logical=JSON.parse(JSON.stringify(input)),logicalHash=checksum({kind,input:logical});
    if(typeof input.actionId!=='string'||!/^[a-zA-Z0-9:_-]{1,160}$/.test(input.actionId))problem('INVALID_ACTION','操作编号无效');
    if(Object.hasOwn(input,'locationReceiptId'))problem('UNTRUSTED_AUTHORITY_FIELD','定位许可由主进程生成');
    const existing=this.db.prepare('SELECT * FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(owner,input.actionId);
    if(existing){if(existing.endpoint!==endpoint||existing.op!==op||existing.kind!==kind||existing.logical_hash!==logicalHash)problem('ACTION_ID_REUSED','操作编号与原请求不一致');return existing;}
    const wire={...logical};
    let purpose,reference;
    if(op==='locate'){purpose='territory:read';reference='';}
    if(op==='challenge'){purpose='territory:challenge';reference=wire.territoryId;}
    if(op==='settle'){
      const session=this.battles.session(owner,wire.sessionId);
      if(session?.winner==='player'){purpose='territory:settle';reference=wire.sessionId;}
    }
    if(purpose){const proofs=this.services.get('locationProofs');if(!proofs?.prove)problem('LOCATION_PERMIT_REQUIRED','请先打开探索地图并更新系统位置');const proof=await proofs.prove(purpose,reference);if(typeof proof?.id!=='string')problem('LOCATION_PERMIT_REQUIRED','定位许可未签发');wire.locationReceiptId=proof.id;}
    this.assertOwner(context);const at=Date.now(),requestHash=checksum({kind,input:wire});
    this.db.prepare("INSERT OR IGNORE INTO garden_cloud_requests VALUES(?,?,?,?,?,?,?,?,?,'pending',NULL,NULL,?,?)").run(owner,input.actionId,endpoint,op,kind,logicalHash,JSON.stringify(logical),JSON.stringify(wire),requestHash,at,at);
    const row=this.db.prepare('SELECT * FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(owner,input.actionId);
    if(row.logical_hash!==logicalHash)problem('ACTION_ID_REUSED','操作编号与原请求不一致');return row;
  }
  async send(context,endpoint,op,kind,input){
    const row=await this.journal(context,endpoint,op,kind,input),wire=JSON.parse(row.wire_input_json);
    let reply;
    try{reply=await this.request(endpoint,{op,...(endpoint==='garden-sync'?{command:kind}:{}),input:wire},context);}
    catch(error){
      const definitive=Number.isInteger(error.httpStatus)&&error.httpStatus>=400&&error.httpStatus<500&&error.httpStatus!==401;
      this.db.prepare('UPDATE garden_cloud_requests SET status=?,error_code=?,updated_at=? WHERE owner_account_id=? AND action_id=?').run(definitive?'conflict':row.status,error.code||'CLOUD_UNAVAILABLE',Date.now(),context.ownerAccountId,input.actionId);
      if(!definitive&&error.httpStatus!==401&&error.code!=='SESSION_CHANGED')problem('GARDEN_CLOUD_UNAVAILABLE','云端回复尚未确认，可安全重试原操作');throw error;
    }
    if(reply?.actionId!==input.actionId||reply.requestHash!==row.request_hash)problem('CLOUD_RECEIPT_MISMATCH','云端回执与本次操作不一致');
    this.db.prepare("UPDATE garden_cloud_requests SET status='committed',response_json=?,error_code=NULL,updated_at=? WHERE owner_account_id=? AND action_id=?").run(JSON.stringify(reply),Date.now(),context.ownerAccountId,input.actionId);
    return reply;
  }
  cache(context,session,status){
    if(!session)return null;const owner=context.ownerAccountId;
    if(session.mode!=='territory'||session.context?.authority!=='cloud'||session.context.ownerAccountId!==owner||!session.id?.startsWith('btl-'))problem('CLOUD_RECEIPT_MISMATCH','云端战斗归属不一致');
    const previous=this.battles.session(owner,session.id),pending=previous?.pendingAction;
    const request=pending&&this.db.prepare('SELECT status FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(owner,pending.actionId);
    const value={...session,cloudSettlementStatus:status||session.cloudSettlementStatus||'active',pendingAction:pending&&request?.status!=='conflict'&&session.snapshot.round<pending.roundNo?pending:session.pendingAction};
    return this.garden.transaction(()=>{const saved=this.battles.save(owner,value);
      if(saved.status==='finished')this.battles.saveReport(owner,{...saved,id:saved.id,sessionId:saved.id,endedAt:saved.endedAt||saved.updatedAt});
      return saved;});
  }
  async command(context,kind,input){return this.serial(context.ownerAccountId,async()=>{
    this.assertOwner(context);const op=territoryOps[kind];
    const reply=await this.send(context,op?'territory-sync':'garden-sync',op||'command',kind,input);
    if(op&&reply.ok===false)return reply;
    const remote=reply.readback||await this.request('territory-sync',{op:'snapshot'},context);
    const newlyApplied=!this.db.prepare('SELECT 1 FROM garden_actions WHERE owner_account_id=? AND action_id=?').get(context.ownerAccountId,input.actionId);
    try{this.applyReadback(context,remote);if(op)this.cache(context,remote.challenge?.battle_json||reply.battle,remote.challenge?.status);}
    catch(error){if(error.code==='CLOUD_LOCAL_CONFLICT')throw error;problem('CLOUD_APPLY_PENDING','云端已受理，请重试原操作以确认落盘');}
    this.services.events.emit('garden:changed',{ownerAccountId:context.ownerAccountId});
    if(kind==='feed'||kind==='territorySettle')this.services.events.emit('companions:changed',{ownerAccountId:context.ownerAccountId,petId:input.petId||reply.data?.petId});
    if(kind==='feed'&&newlyApplied)try{await this.services.get('companions')?.playAction?.(context.ownerAccountId,{petId:input.petId,action:'eat',actionId:`garden:${input.actionId}`});}catch{}
    return op?{ok:true,data:reply.data,replayed:reply.replayed}: {...reply.result,replayed:reply.replayed||reply.result.replayed};
  });}
  ownsBattle(payload,context){if(!payload?.sessionId||!this.isCloud(context))return false;return payload.sessionId.startsWith('btl-')||this.battles.session(context.ownerAccountId,payload.sessionId)?.context?.authority==='cloud';}
  async remoteBattle(payload,context){
    const pending=this.db.prepare("SELECT input_json FROM garden_cloud_requests WHERE owner_account_id=? AND op='act' AND status='pending' ORDER BY created_at").all(context.ownerAccountId).map(row=>JSON.parse(row.input_json)).find(input=>input.sessionId===payload.sessionId);
    if(pending)try{await this.send(context,'territory-sync','act','territoryAct',pending);}catch(error){
      const row=this.db.prepare('SELECT status FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(context.ownerAccountId,pending.actionId);
      if(row?.status!=='conflict')throw error;
    }
    const remote=await this.request('territory-sync',{op:'session',input:{sessionId:payload.sessionId}},context);this.applyReadback(context,remote);return {remote,session:this.cache(context,remote.session,remote.challenge?.status)};
  }
  async battleCommand(name,payload,context){
    if(name==='context')return (await this.remoteBattle(payload,context)).remote.context;
    if(['snapshot','sync','leave'].includes(name))return (await this.remoteBattle(payload,context)).session;
    if(name==='act')return this.serial(context.ownerAccountId,async()=>{
      const existing=this.battles.session(context.ownerAccountId,payload.sessionId);
      if(existing?.pendingAction&&existing.pendingAction.actionId!==payload.actionId)problem('ACTION_PENDING','原行动尚未确认，请先同步或重试');
      const original=this.db.prepare('SELECT input_json FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(context.ownerAccountId,payload.actionId);
      const saved=original?JSON.parse(original.input_json):null;
      if(saved&&(saved.sessionId!==payload.sessionId||saved.action!==payload.action||payload.expectedRound!==undefined&&saved.expectedRound!==payload.expectedRound))problem('ACTION_ID_REUSED','操作编号与原行动不一致');
      const wire=saved||{actionId:payload.actionId,sessionId:payload.sessionId,action:payload.action,expectedRound:payload.expectedRound??existing?.snapshot.round+1,sessionOwnerAccountId:context.ownerAccountId};
      if(existing)this.cache(context,{...existing,pendingAction:{actionId:wire.actionId,action:wire.action,roundNo:wire.expectedRound,uncertain:true}},existing.cloudSettlementStatus);
      const reply=await this.send(context,'territory-sync','act','territoryAct',wire);this.applyReadback(context,reply.readback);return this.cache(context,reply.data,reply.readback.challenge?.status);
    });
    if(name==='retryAction'){
      const pending=this.battles.session(context.ownerAccountId,payload.sessionId)?.pendingAction;
      const rows=pending?this.db.prepare("SELECT input_json FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=? AND op='act' AND status<>'conflict'").all(context.ownerAccountId,pending.actionId):[];
      const original=rows.map(row=>JSON.parse(row.input_json)).find(input=>input.sessionId===payload.sessionId);if(!original)problem('NO_PENDING_ACTION','没有待确认的原行动');return this.battleCommand('act',original,context);
    }
    if(['settleContext','retrySettlement'].includes(name))return this.settleContext(context,payload);
    problem('CLOUD_OPERATION_UNSUPPORTED','此云端对局请继续同步或确认');
  }
  async settleContext(context,payload){
    const existing=this.db.prepare('SELECT input_json FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(context.ownerAccountId,payload.actionId);
    let input=existing?JSON.parse(existing.input_json):null;
    if(!input){const {session,remote}=await this.remoteBattle(payload,context);if(session.status!=='finished')problem('BATTLE_UNFINISHED','对局尚未结束');input={actionId:payload.actionId,sessionId:payload.sessionId,sessionOwnerAccountId:context.ownerAccountId,expectedRevision:remote.snapshot.revision};}
    const result=await this.command(context,'territorySettle',input);if(!result.ok)throw Object.assign(new Error(result.message),{code:result.code});return {...result.data,resultPath:'/garden'};
  }
}
module.exports={CloudGardenAuthority,checksum};
