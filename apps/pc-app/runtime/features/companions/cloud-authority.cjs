const {checksum,transaction}=require('../accounts/util.cjs');
const {companionDataChecksum}=require('./backup.cjs');
const {validateCommand,companionUnit,COMPANION_TABLES}=require('./cloud-domain.mjs');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const HEAD='companions:verified-head',INTENT='companions-cloud-command';

/** Main-only adapter.08 owns credentials/transport/full-save sync; existing
 * account_actions holds local command intents and verified receipt metadata.
 * No second remote account, pet, inventory, reward or save store is introduced. */
class CloudCompanionAuthority {
  constructor(services,service,backup,changed,serialCache=null){this.services=services;this.service=service;this.backup=backup;this.changed=changed;this.serialCache=serialCache;this.db=services.db;this.queues=new Map();this.states=new Map();}
  accounts(){return this.services.get('accounts');}
  enabled(owner){const session=this.accounts()?.privateSession?.();return session?.authKind==='supabase'&&session.ownerAccountId===owner;}
  current(owner){if(this.services.session.getOwnerAccountId()!==owner||!this.enabled(owner))fail('SESSION_CHANGED','账号已切换，请重新操作。');}
  async invoke(owner,name,body){this.current(owner);const actor=this.services.get('cloudActor');const reply=await(actor?actor.invoke(name,body):this.accounts().cloudInvoke(name,body));this.current(owner);return reply;}
  async readSnapshot(owner){
    try{return await this.invoke(owner,'companions-sync',{op:'snapshot'});}
    catch(error){
      // A head can advance between snapshot's head read and serial-registry RPC.
      // That read race must not terminate an already committed command intent.
      // Only this read path translates CAS; command writes keep their original
      // SYNC_CONFLICT terminal semantics and their original input/base revision.
      if(error.code==='SYNC_CONFLICT')fail('COMPANION_SNAPSHOT_RETRY','伙伴状态正在更新，请重试读取。');
      throw error;
    }
  }
  async serial(owner,work){
    const previous=this.queues.get(owner)||Promise.resolve();
    const next=previous.catch(()=>{}).then(async()=>{this.current(owner);const result=await work();this.current(owner);return result;});
    this.queues.set(owner,next);
    try{return await next;}finally{if(this.queues.get(owner)===next)this.queues.delete(owner);}
  }
  row(owner,id){return this.db.prepare('SELECT * FROM account_actions WHERE owner_account_id=? AND action_id=?').get(owner,id);}
  pending(owner){return this.db.prepare("SELECT action_id,result FROM account_actions WHERE owner_account_id=? AND kind=? AND json_extract(result,'$.status') IN ('pending','retry') ORDER BY created_at,rowid").all(owner,INTENT).map(row=>({id:row.action_id,...JSON.parse(row.result)}));}
  busy(owner){return this.queues.has(owner);}
  state(owner){
    const state={...(this.states.get(owner)||{mode:'cloud',status:'cached',sharedSavePending:true})},context=state.sharedSaveContext;
    // Explanations are transient and must not survive a different owner/login.
    delete state.sharedSaveContext;delete state.sharedSaveReason;
    if(state.status==='ready'&&state.sharedSavePending&&context?.reason==='local-difference'&&context.ownerAccountId===owner
      &&Number.isSafeInteger(context.epoch)&&context.epoch===this.accounts()?.sync?.getEpoch?.()&&this.enabled(owner))state.sharedSaveReason=context.reason;
    return{...state,pending:this.pending(owner).length};
  }
  setIntent(owner,id,value){this.db.prepare('UPDATE account_actions SET result=? WHERE owner_account_id=? AND action_id=? AND kind=?').run(JSON.stringify(value),owner,id,INTENT);}
  pristine(data){return data.identityImports.length===0&&Object.entries(data.tables).filter(([name])=>name!=='companion_accounts').every(([,rows])=>rows.length===0)&&data.tables.companion_accounts.every(row=>row.revision<=1&&Object.values(JSON.parse(row.selections_json)).every(value=>value===null));}
  assertNoHistoryLoss(current,incoming){
    const ids=new Set(incoming.tables.companion_pets.map(row=>row.pet_id));
    if(current.tables.companion_pets.some(row=>!ids.has(row.pet_id)))fail('CLOUD_HISTORY_CONFLICT','云端版本缺少本机已有伙伴，原档已保留，请先预览核对。');
    for(const[name,columns]of[['companion_actions',['action_id']],['companion_legacy_archive',['legacy_pet_id']],['companion_capture_receipts',['battle_id','wild_pet_id']]]){
      const key=row=>JSON.stringify(columns.map(column=>row[column])),records=new Map(incoming.tables[name].map(row=>[key(row),row]));
      if(current.tables[name].some(row=>!records.has(key(row))||checksum(row)!==checksum(records.get(key(row)))))fail('CLOUD_HISTORY_CONFLICT','云端版本与本机原始回执或历史不同，已保留，请先预览核对。');
    }
    const imports=new Map(incoming.identityImports.map(row=>[row.source_owner_account_id,row]));
    if(current.identityImports.some(row=>!imports.has(row.source_owner_account_id)||checksum(row)!==checksum(imports.get(row.source_owner_account_id))))fail('CLOUD_HISTORY_CONFLICT','云端版本与本机原始归属档案不同，已保留，请先预览核对。');
    const interactions=new Map(incoming.tables.companion_interactions.map(row=>[row.pet_id,row]));
    if(current.tables.companion_interactions.some(row=>!interactions.has(row.pet_id)||interactions.get(row.pet_id).last_interacted_at<row.last_interacted_at))fail('CLOUD_HISTORY_CONFLICT','云端版本缺少本机互动进度，已保留，请先预览核对。');
  }
  apply(owner,remote){
    this.current(owner);
    if(remote?.authority!=='live'||remote.ownerAccountId!==owner||!Number.isSafeInteger(remote.revision)||remote.revision<0)fail('CLOUD_RECEIPT_MISMATCH','伙伴云端回执不一致。');
    if(!remote.envelope){
      if(!this.pristine(this.backup.export(owner)))fail('COMPANION_SOURCE_REVIEW_REQUIRED','旧伙伴和成长已保留；请先核验旧源或预览对应云端存档。');
      this.states.set(owner,{mode:'cloud',status:'ready',pending:this.pending(owner).length,cloudRevision:0,sharedSavePending:true});return;
    }
    const envelope=remote.envelope,{checksum:digest,...body}=envelope;
    if(envelope.ownerAccountId!==owner||envelope.format!=='lingjing-account-save'||envelope.version!==1||envelope.provenance?.mode!=='live'||checksum(body)!==digest||remote.module?.version!==1)fail('CLOUD_RECEIPT_MISMATCH','伙伴云端完整性或归属不一致。');
    if(!envelope.data?.modules?.companions&&!COMPANION_TABLES.some(name=>Object.hasOwn(envelope.data?.tables||{},name))){
      if(!this.pristine(this.backup.export(owner)))fail('COMPANION_SOURCE_REVIEW_REQUIRED','旧伙伴和成长已保留；请先核验旧源或预览对应云端存档。');
      this.states.set(owner,{mode:'cloud',status:'ready',pending:this.pending(owner).length,cloudRevision:remote.revision,sharedSavePending:true});return;
    }
    const incoming=remote.module.data;this.backup.validate(incoming,owner);
    if(companionDataChecksum(companionUnit(envelope,owner,Date.now()))!==companionDataChecksum(incoming))fail('CLOUD_RECEIPT_MISMATCH','伙伴内容与完整存档不一致。');
    if(remote.serialRegistry!==undefined)this.serialCache?.validate(owner,remote.serialRegistry,incoming.tables.companion_pets,remote.revision);
    const current=this.backup.export(owner),localDigest=companionDataChecksum(current),incomingDigest=companionDataChecksum(incoming),ack=this.row(owner,HEAD),prior=ack?JSON.parse(ack.result):null;
    if(prior&&remote.revision<prior.cloudRevision)fail('SYNC_STALE_READBACK','云端读回版本较旧，本机数据已保留。');
    if(localDigest!==incomingDigest&&!this.pristine(current)){
      if(ack?.kind!=='companions-cloud-readback'||ack.input_hash!==localDigest)fail('CLOUD_LOCAL_CONFLICT','本机伙伴有尚未核验的独立进度，已完整保留，请先预览云端版本。');
      this.assertNoHistoryLoss(current,incoming);
    }
    let sharedSavePending=true,sharedSaveContext;
    transaction(this.db,()=>{
      if(localDigest!==incomingDigest)this.backup.restore(owner,incoming,'replace');
      const accounts=this.accounts(),sync=accounts?.sync;
      if(accounts?.cloudCache){
        accounts.cloudCache.accept(owner,{envelope,cloudRevision:remote.revision,domains:['companions']});sharedSavePending=false;
      }else if(sync?.acceptAuthoritativeReadback){
        try{sync.acceptAuthoritativeReadback(owner,{envelope,cloudRevision:remote.revision});sharedSavePending=false;}
        catch(error){
          if(!['CLOUD_LOCAL_CONFLICT','SYNC_BUSY','SYNC_PENDING'].includes(error.code))throw error;
          const epoch=sync.getEpoch?.();
          if(error.code==='CLOUD_LOCAL_CONFLICT'&&error.details?.sharedSaveReason==='local-difference'&&Number.isSafeInteger(epoch))sharedSaveContext={ownerAccountId:owner,epoch,reason:'local-difference'};
        }
      }
      const info={cloudRevision:remote.revision,checksum:digest,verifiedAt:new Date().toISOString(),sharedSavePending};
      this.db.prepare('INSERT INTO account_actions(owner_account_id,action_id,kind,input_hash,result,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_account_id,action_id) DO UPDATE SET input_hash=excluded.input_hash,result=excluded.result,created_at=excluded.created_at').run(owner,HEAD,'companions-cloud-readback',incomingDigest,JSON.stringify(info),info.verifiedAt);
    });
    this.states.set(owner,{mode:'cloud',status:'ready',pending:this.pending(owner).length,cloudRevision:remote.revision,sharedSavePending,sharedSaveContext});
    const serialChanged=remote.serialRegistry===undefined?false:this.serialCache?.accept(owner,remote.serialRegistry,incoming.tables.companion_pets,remote.revision);
    if(localDigest!==incomingDigest||serialChanged)this.changed(owner);
  }
  async refreshInside(owner,{resume=true}={}){
    this.current(owner);
    if(resume)for(let index=0;index<16;index++){const intent=this.pending(owner)[0];if(!intent)break;await this.perform(owner,intent.id,intent);}
    const remote=await this.readSnapshot(owner);this.apply(owner,remote);return remote;
  }
  async refresh(owner){return this.serial(owner,async()=>{try{return await this.refreshInside(owner);}catch(error){this.states.set(owner,{...this.state(owner),status:['CLOUD_LOCAL_CONFLICT','CLOUD_HISTORY_CONFLICT','COMPANION_SOURCE_REVIEW_REQUIRED'].includes(error.code)?'conflict':'offline',error:error.code,message:error.message,pending:this.pending(owner).length});throw error;}});}
  async perform(owner,id,intent){
    try{
      const latest=JSON.parse(this.row(owner,id).result);if(latest.status==='superseded')return{ok:true,data:{superseded:true},duplicate:true};intent=latest;
      // An uncertain request always reads its exact immutable common receipt
      // first. Only its original actionId/input/base may be sent again.
      let receipt=await this.invoke(owner,'lingjing-save',{op:'read',actionId:id});
      if(receipt){
        const row=receipt.envelope?.data?.modules?.companions?.data?.tables?.companion_actions?.find(row=>row.action_id===intent.input.actionId),result=row&&JSON.parse(row.result_json);
        if(!row||row.owner_account_id!==owner||row.operation!==intent.command||row.request_hash!==checksum(intent.input)||!result?.ok)fail('CLOUD_RECEIPT_MISMATCH','伙伴原操作回执不一致。');
        receipt={...receipt,result,duplicate:true};
      }else{
        if(JSON.parse(this.row(owner,id).result).status==='superseded')return{ok:true,data:{superseded:true},duplicate:true};
        if(intent.baseRevision===null||intent.baseRevision===undefined){
          const prepared=await this.refreshInside(owner,{resume:false});
          if(JSON.parse(this.row(owner,id).result).status==='superseded')return{ok:true,data:{superseded:true},duplicate:true};
          intent={...intent,baseRevision:prepared.revision,preparedAt:new Date().toISOString()};this.setIntent(owner,id,intent);
        }
        intent={...intent,sentAt:intent.sentAt||new Date().toISOString()};this.setIntent(owner,id,intent);
        receipt=await this.invoke(owner,'companions-sync',{op:'command',command:intent.command,input:intent.input,baseRevision:intent.baseRevision});
      }
      if(receipt?.actionId!==id||receipt.kind!=='authority'||!receipt.result?.ok)fail('CLOUD_RECEIPT_MISMATCH','伙伴操作没有匹配的云端回执。');
      const readback=await this.invoke(owner,'lingjing-save',{op:'read',actionId:id});
      const {checksum:readDigest,...readBody}=readback?.envelope||{};
      if(!readback||readback.revision!==receipt.revision||readback.checksum!==receipt.checksum||readback.envelope?.ownerAccountId!==owner||readDigest!==readback.checksum||checksum(readBody)!==readDigest)fail('CLOUD_RECEIPT_MISMATCH','伙伴操作读回尚未确认，请重试原请求。');
      const currentHead=await this.readSnapshot(owner);this.apply(owner,currentHead);
      const result={...receipt.result,duplicate:Boolean(receipt.duplicate||receipt.result.duplicate),cloud:{authority:'live',actionId:id,revision:receipt.revision,checksum:receipt.checksum,sharedSavePending:this.state(owner).sharedSavePending}};
      this.setIntent(owner,id,{...intent,status:'verified',result,verifiedAt:new Date().toISOString()});this.states.set(owner,{...this.state(owner),pending:this.pending(owner).length});this.changed(owner);
      return result;
    }catch(error){
      const terminal=['SYNC_CONFLICT','REVISION_CONFLICT','ACTION_ID_REUSED','ACTION_ID_CONFLICT','INVALID_INPUT','INVALID_REQUEST','PET_NOT_FOUND','TEMPLATE_NOT_FOUND','RESOURCE_UNAVAILABLE','COMPANION_LIMIT','RATE_LIMITED'].includes(error.code);
      this.setIntent(owner,id,{...intent,status:terminal?'conflict':'retry',lastError:error.code||'CLOUD_UNAVAILABLE',message:error.message});
      this.states.set(owner,{...this.state(owner),status:terminal||['CLOUD_LOCAL_CONFLICT','CLOUD_HISTORY_CONFLICT','COMPANION_SOURCE_REVIEW_REQUIRED'].includes(error.code)?'conflict':'offline',error:error.code,message:error.message,pending:this.pending(owner).length});this.changed(owner);throw error;
    }
  }
  async runUntil(owner,id){
    for(let index=0;index<32;index++){
      const saved=JSON.parse(this.row(owner,id).result);
      if(saved.status==='verified')return{...saved.result,duplicate:true};
      if(saved.status==='superseded')return{ok:true,data:{superseded:true},duplicate:true};
      if(saved.status==='conflict')fail(saved.lastError,saved.message);
      const next=this.pending(owner)[0];if(!next)fail('COMPANION_SYNC_PENDING','伙伴原操作仍待确认，请刷新后重试。');
      const result=await this.perform(owner,next.id,next);if(next.id===id)return result;
    }
    fail('SYNC_BUSY','伙伴操作较多，请稍后继续确认。');
  }
  async execute(owner,command,input,{nativePosition=false}={}){
    const payload=JSON.parse(JSON.stringify(input));validateCommand(command,payload);
    this.current(owner);const id='companions:'+payload.actionId,hash=checksum({command,input:payload}),old=this.row(owner,id);
    if(old){if(old.kind!==INTENT||old.input_hash!==hash)fail('ACTION_ID_CONFLICT','操作编号已经用于其他内容。');return this.serial(owner,()=>this.runUntil(owner,id));}
    if(this.accounts()?.sync?.running?.has(owner))fail('SYNC_BUSY','账号存档正在同步，请稍后重试。');
    const pending=this.pending(owner),withoutId=value=>{const{actionId,...rest}=value;void actionId;return rest;};
    const same=pending.find(row=>row.command===command&&checksum(withoutId(row.input))===checksum(withoutId(payload)));
    if(same)return this.serial(owner,()=>this.runUntil(owner,same.id)).then(result=>({...result,duplicate:true}));
    if(pending.length&&!nativePosition)fail('COMPANION_SYNC_PENDING','有伙伴操作尚待确认，请先刷新或重试原操作。');
    if(nativePosition&&(command!=='desktop'||Object.keys(payload).some(key=>!['actionId','petId','position'].includes(key))))fail('INVALID_INPUT','桌面位置队列参数无效。');
    transaction(this.db,()=>{
      if(nativePosition)for(const row of pending)if(row.nativePosition&&row.input.petId===payload.petId&&!row.sentAt)this.setIntent(owner,row.id,{...row,status:'superseded',supersededBy:id});
      const intent={status:'pending',command,input:payload,baseRevision:null,nativePosition,createdAt:new Date().toISOString()};
      this.db.prepare('INSERT INTO account_actions(owner_account_id,action_id,kind,input_hash,result,created_at) VALUES(?,?,?,?,?,?)').run(owner,id,INTENT,hash,JSON.stringify(intent),intent.createdAt);
    });
    this.states.set(owner,{...this.state(owner),status:'pending'});this.changed(owner);
    // The durable intent above exists even if this process closes or the first
    // network read fails. Once sent, its original input/base are never rebased.
    return this.serial(owner,()=>this.runUntil(owner,id));
  }
}
module.exports={CloudCompanionAuthority};
