const {checksum}=require('../accounts/util.cjs');
const {PROTOCOL}=require('./cloud-adapter.cjs');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const clone=value=>structuredClone(value);
const {confirmedSerial,withoutGlobalSerials}=require('./global-serial.cjs');
const sessionPattern=/^battle-cloud-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;
const TABLES=['discovery_encounters','discovery_actions','discovery_captures','discovery_memory_tags'];
class CloudDiscoveryRuntime {
  constructor(services,discovery,proofs){this.services=services;this.discovery=discovery;this.proofs=proofs;this.db=services.db;this.sessions=new Map();this.locks=new Map();this.nearbyState=null;this.pendingRefresh=null;this.refreshedAt=0;}
  owner(){return this.services.session.requireOwner();}
  assertOwner(owner){if(this.owner()!==owner)fail('AUTH_CHANGED','账号已切换，请重新打开探索');}
  authority(){const value=this.discovery.authority;if(!value)fail('CLOUD_AUTH_REQUIRED','请先登录云端账号');return value;}
  handlesSession(id){return typeof id==='string'&&sessionPattern.test(id);}
  permitId(id){const match=sessionPattern.exec(id);if(!match)fail('INVALID_SESSION','云端对战编号无效');return match[1];}
  key(owner,id){return owner+'\0'+id;}
  peek(owner,id){return this.sessions.get(this.key(owner,id))||null;}
  remember(owner,session){
    this.assertOwner(owner);
    if(!this.handlesSession(session?.id)||session.mode!=='wild'||session.context?.cloudAuthority!=='discovery'||!session.snapshot||!Array.isArray(session.rounds))fail('CLOUD_RESPONSE_INVALID','云端对战回执无效');
    const old=this.peek(owner,session.id);if(old&&(old.revision>session.revision||old.snapshot.round>session.snapshot.round))return old;
    const saved=clone(session),pending=this.pending(owner,session.id);saved.player.level??=saved.player.growth?.level||1;saved.player.resourceRef??=saved.player.resource?.resourceId;saved.pendingAction=pending?{actionId:pending.request.actionId,action:pending.request.action,roundNo:pending.request.expectedRound,uncertain:true}:null;
    this.sessions.set(this.key(owner,session.id),saved);return saved;
  }
  intent(owner,actionId){const row=this.db.prepare('SELECT * FROM account_actions WHERE owner_account_id=? AND action_id=?').get(owner,'discovery-client:'+actionId);return row&&row.kind==='discovery-cloud-command'?{row,...JSON.parse(row.result)}:null;}
  pending(owner,id){return this.db.prepare("SELECT result FROM account_actions WHERE owner_account_id=? AND kind='discovery-cloud-command' AND json_extract(result,'$.status') IN ('pending','retry') ORDER BY created_at,rowid").all(owner).map(row=>JSON.parse(row.result)).find(value=>value.sessionId===id)||null;}
  saveIntent(owner,request,status,extra={}){
    const id='discovery-client:'+request.actionId,hash=checksum(request),prior=this.db.prepare('SELECT kind,input_hash,result FROM account_actions WHERE owner_account_id=? AND action_id=?').get(owner,id);
    if(prior&&(prior.kind!=='discovery-cloud-command'||prior.input_hash!==hash))fail('ACTION_ID_CONFLICT','操作编号已用于其他请求');
    const value={...(prior?JSON.parse(prior.result):{}),request,status,...extra};
    // Main command intents are part of backup state; display metadata is not.
    if(Object.hasOwn(value,'result'))value.result=withoutGlobalSerials(value.result);
    this.db.prepare('INSERT INTO account_actions(owner_account_id,action_id,kind,input_hash,result,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_account_id,action_id) DO UPDATE SET result=excluded.result').run(owner,id,'discovery-cloud-command',hash,JSON.stringify(value),new Date().toISOString());return value;
  }
  async serial(owner,work){const previous=this.locks.get(owner)||Promise.resolve(),next=previous.catch(()=>{}).then(()=>{this.assertOwner(owner);return work();});this.locks.set(owner,next);try{return await next;}finally{if(this.locks.get(owner)===next)this.locks.delete(owner);}}
  async request(owner,body,sessionId){
    if(typeof body.actionId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$/.test(body.actionId))fail('ACTION_ID_REQUIRED','需要有效操作编号');
    this.assertOwner(owner);const prior=this.intent(owner,body.actionId),authority=this.authority();
    if(prior&&prior.row.input_hash!==checksum(body))fail('ACTION_ID_CONFLICT','操作编号已用于其他请求');
    if(prior?.status==='verified')return withoutGlobalSerials(prior.result);
    this.saveIntent(owner,body,'pending',{sessionId});
    try{
      let data;
      if(prior){try{const receipt=await authority.action(body.actionId);const{actionId,...request}=body;void actionId;if(receipt.requestHash!==checksum({protocol:PROTOCOL,...request}))fail('CLOUD_RECEIPT_MISMATCH','原操作读回不一致');data=receipt.result;}catch(error){if(error.code!=='ACTION_NOT_FOUND')throw error;}}
      if(!data)data=await authority.invoke(body.op,Object.fromEntries(Object.entries(body).filter(([key])=>key!=='op')));
      this.assertOwner(owner);this.saveIntent(owner,body,'verified',{sessionId:sessionId||data.sessionId,result:data,verifiedAt:new Date().toISOString()});return data;
    }catch(error){this.assertOwner(owner);const terminal=/CONFLICT|INVALID_|FINISHED|VICTORY_REQUIRED|EXPIRED|CANCELLED/.test(error.code||'');this.saveIntent(owner,body,terminal?'conflict':'retry',{sessionId,error:error.code||'CLOUD_UNAVAILABLE'});throw error;}
  }
  async head(owner){const result=await this.services.get('cloudActor').invoke('companions-sync',{op:'snapshot'});this.assertOwner(owner);if(result?.authority!=='live'||result.ownerAccountId!==owner||!result.envelope||result.envelope.ownerAccountId!==owner)fail('CLOUD_RESPONSE_INVALID','云端存档归属不一致');const{checksum:digest,...body}=result.envelope;if(checksum(body)!==digest)fail('CLOUD_RESPONSE_INVALID','云端存档完整性校验失败');return result;}
  apply(owner,head){
    this.assertOwner(owner);const envelope=head.envelope,records=envelope.data.tables;
    // Existing02/05 adapters own their complete units and reject unsynced local
    // progress. All domain restores share this outer SQLite transaction.
    this.db.transaction(()=>{
      const companions=this.services.get('companions');companions.applyCloudReadback(owner,{authority:'live',ownerAccountId:owner,revision:head.revision,envelope,module:envelope.data.modules.companions,serialRegistry:head.serialRegistry});
      this.services.get('garden').applyCloudReadback(owner,{envelope,accountRevision:head.revision,serverTime:Date.now()});
      for(const name of TABLES){
        const record=records[name];if(!record)continue;
        const columns=this.db.prepare('PRAGMA table_info('+name+')').all().map(({name,type,notnull,pk,dflt_value})=>({name,type,notnull,pk,dflt_value}));
        if(checksum(columns)!==checksum(record.schema)||!Array.isArray(record.rows))fail('CLOUD_RESPONSE_INVALID','探索存档版本不匹配');
        const names=columns.map(c=>c.name),keys=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
        const select=this.db.prepare('SELECT * FROM '+name+' WHERE '+keys.map(key=>key+'=?').join(' AND '));
        const updates=names.filter(key=>!keys.includes(key)).map(key=>key+'=excluded.'+key).join(',');
        const insert=this.db.prepare('INSERT INTO '+name+'('+names.join(',')+') VALUES('+names.map(()=>'?').join(',')+') ON CONFLICT('+keys.join(',')+') DO UPDATE SET '+updates);
        for(const row of record.rows){
          if(row.owner_account_id!==owner||Object.keys(row).sort().join()!==[...names].sort().join())fail('CLOUD_RESPONSE_INVALID','探索存档归属或字段不匹配');
          const old=select.get(...keys.map(key=>row[key]));if(old&&checksum(old)===checksum(row))continue;
          if(old){let original,incoming;try{original=JSON.parse(old.data_json);incoming=JSON.parse(row.data_json);}catch{}
            if(name!=='discovery_encounters'||!original?.cloudPermit?.id||original.cloudPermit.id!==incoming?.cloudPermit?.id||row.revision<old.revision)fail('CLOUD_LOCAL_CONFLICT','本机探索历史有未核验的变化，原记录已保留');}
          insert.run(...names.map(key=>row[key]));
        }
      }
      try{this.services.get('accounts').sync.acceptAuthoritativeReadback(owner,{envelope,cloudRevision:head.revision});}
      catch(error){if(!['CLOUD_LOCAL_CONFLICT','SYNC_PENDING','SYNC_BUSY','BACKUP_MODULE_UNSUPPORTED'].includes(error.code))throw error;}
    })();
    this.services.events.emit('discovery:changed',{ownerAccountId:owner});
  }
  async refresh(force=false){
    const owner=this.owner();if(this.pendingRefresh){await this.pendingRefresh;if(!force)return;}this.assertOwner(owner);
    const current=this.discovery.location.snapshot(),changedFix=current.status==='ready'&&this.discovery.location.policyAllowed()&&current.fix?.timestampMs!==this.nearbyState?.timestampMs;
    if(!force&&!changedFix&&Date.now()-this.refreshedAt<1500)return;
    const task=(async()=>{
      const permits=await this.authority().invoke('permits');this.assertOwner(owner);for(const permit of permits){if(permit.ownerAccountId!==owner)fail('CLOUD_RESPONSE_INVALID','云端相遇归属不匹配');this.remember(owner,permit.session);}
      if(permits.length)this.apply(owner,await this.head(owner));
      const location=this.discovery.location.snapshot();
      if(location.status==='ready'&&this.discovery.location.policyAllowed()&&this.nearbyState?.timestampMs!==location.fix?.timestampMs){
        const position=await this.proofs.prove('discover',''),nearby=await this.authority().invoke('nearby',{proofId:position.id});this.assertOwner(owner);this.nearbyState={...nearby,timestampMs:position.fix.timestampMs};
      }
      this.refreshedAt=Date.now();
    })();this.pendingRefresh=task;try{return await task;}finally{if(this.pendingRefresh===task)this.pendingRefresh=null;}
  }
  async read(owner,id){const session=await this.authority().sessionFor(this.permitId(id));this.assertOwner(owner);return this.remember(owner,session);}
  numberForEncounter(owner,encounter){
    if(!encounter||encounter.ownerAccountId!==owner)return undefined;
    const enemy=this.peek(owner,encounter.battle?.battleId)?.enemy;
    return enemy?.petId===encounter.spawn?.id&&enemy.templateId===encounter.spawn.templateId?confirmedSerial(enemy.globalSerial):undefined;
  }
  encounterView(owner,encounter){
    const value=require('./service.cjs').publicEncounter(encounter);if(!value)return value;
    delete value.spawn.globalSerial;const serial=this.numberForEncounter(owner,encounter);if(serial!==undefined)value.spawn.globalSerial=serial;return value;
  }
  async observe(input){
    const owner=this.owner();
    const spawn=this.discovery.nearby().spawns.find(value=>value.id===input.spawnId);
    if(!spawn)fail('SPAWN_EXPIRED','附近伙伴已刷新，请重新查看地图');
    this.discovery.requireFix(spawn);
    // A new signed discover proof per attempt preserves proof-consumer scope.
    // The server's stable owner/world/spawn identity handles lost responses.
    const proof=await this.proofs.prove('discover','');
    const data=await this.authority().observe({spawnId:spawn.id,proofId:proof.id});this.assertOwner(owner);
    if(data?.ownerAccountId!==owner||data.spawnId!==spawn.id||data.templateId!==spawn.templateId||!confirmedSerial(data.globalSerial)
      ||typeof data.namespace!=='string'||!(data.namespace==='live'||/^qa:.+/.test(data.namespace))
      ||data.source!==proof.fix.source||(data.scenarioId||null)!==(proof.fix.scenarioId||null))fail('CLOUD_RESPONSE_INVALID','相遇编号读回不一致');
    if(this.nearbyState?.source===data.source&&(this.nearbyState.scenarioId||null)===(data.scenarioId||null))this.nearbyState={...this.nearbyState,spawns:this.nearbyState.spawns.map(value=>value.id===spawn.id&&value.templateId===spawn.templateId?{...value,globalSerial:data.globalSerial}:value)};
    this.discovery.notify(owner);return{ok:true,data};
  }
  async begin(input){
    const owner=this.owner();return this.serial(owner,async()=>{
      const original=this.intent(owner,input.actionId);
      if(original&&(original.request.op!=='reserve'||original.request.spawnId!==input.spawnId||original.request.petId!==input.petId))fail('ACTION_ID_CONFLICT','操作编号已用于其他请求');
      // A prior operation is read back before mutable position/selection checks.
      // It cannot create a different encounter or change its owned participant.
      if(!original){
        this.discovery.requireFix();
        await this.services.get('companions').refreshCloud(owner);
        this.services.get('companions').getPet(owner,input.petId);
        if(this.services.get('companions').getSelections(owner).battlePetId!==input.petId){const selected=await this.services.invoke('companions','select',{actionId:'wild-selection:'+checksum({actionId:input.actionId}),petId:input.petId,slot:'battlePetId'});if(!selected.ok)fail(selected.code,selected.message);}
        const garden=await this.services.invoke('garden','snapshot');if(!garden.ok)fail(garden.code,garden.message);
        this.discovery.requireFix();
      }
      const body=original?.request||{op:'reserve',spawnId:input.spawnId,petId:input.petId,proofId:(await this.proofs.prove('begin',input.spawnId)).id,actionId:input.actionId};
      const permit=await this.request(owner,body);
      await this.refresh(true);const encounter=this.discovery.repo.get(owner,'encounter-'+permit.id);if(!encounter)fail('CLOUD_APPLY_PENDING','云端相遇已保存，本机读回待确认');return{ok:true,data:this.encounterView(owner,encounter)};
    });
  }
  async cancel(input){const owner=this.owner(),encounter=this.discovery.currentEncounter(owner,input.encounterId);return this.serial(owner,async()=>{await this.request(owner,{op:'cancel',permitId:encounter.cloudPermit.id,actionId:input.actionId},encounter.battle.battleId);await this.refresh(true);return{ok:true,data:this.encounterView(owner,this.discovery.repo.get(owner,input.encounterId))};});}
  async confirm(input){
    const owner=this.owner();return this.serial(owner,async()=>{
      const encounter=this.discovery.currentEncounter(owner,input.encounterId),permitId=encounter.cloudPermit.id;
      const name=(input.name||encounter.spawn.name).trim(),original=this.intent(owner,input.actionId),existing=this.discovery.repo.capture(owner,input.encounterId);
      if(original&&(original.request.op!=='confirm'||original.request.permitId!==permitId||original.request.name!==name))fail('ACTION_ID_CONFLICT','操作编号已用于其他请求');
      const body=original?.request||{op:'confirm',permitId,proofId:existing?permitId:(await this.proofs.prove('capture',permitId)).id,name,actionId:input.actionId};
      const receipt=await this.request(owner,body,encounter.battle.battleId);
      this.apply(owner,await this.head(owner));await this.refresh(true);
      if(input.showOnDesktop){const displayed=await this.services.invoke('companions','desktop',{actionId:'capture-desktop:'+permitId,petId:receipt.petId,visible:true});if(!displayed.ok)fail(displayed.code,'伙伴已收服，桌面显示待确认：'+displayed.message);}
      const current=this.discovery.captureViews(owner).find(value=>value.petId===receipt.petId&&value.encounterId===input.encounterId);
      return{ok:true,data:{...receipt,...(current?.globalSerial?{globalSerial:current.globalSerial}:{}),resultPath:'/discovery/result/'+input.encounterId}};
    });
  }
  getOutcome(input){const owner=this.owner();if(input.ownerAccountId!==owner)fail('AUTH_CHANGED','账号已切换');const session=this.peek(owner,input.sessionId);if(!session)fail('CLOUD_SESSION_SYNC_REQUIRED','请先同步云端对局');return{session,won:session.status==='finished'&&session.winner==='player',settled:session.status==='finished'};}
  async resolvePending(owner,id){const pending=this.pending(owner,id);if(!pending)return;try{const receipt=await this.authority().action(pending.request.actionId);const{actionId,...request}=pending.request;void actionId;if(receipt.requestHash!==checksum({protocol:PROTOCOL,...request}))fail('CLOUD_RECEIPT_MISMATCH','原行动回执不匹配');this.assertOwner(owner);this.saveIntent(owner,pending.request,'verified',{sessionId:id,result:receipt.result});}catch(error){if(error.code!=='ACTION_NOT_FOUND')throw error;}}
  handlesReport(id){return typeof id==='string'&&/^report-cloud-[a-f0-9-]{36}$/i.test(id);}
  report(session){return{id:session.reportId||'report-cloud-'+this.permitId(session.id),sessionId:session.id,mode:'wild',status:session.status,player:session.player,enemy:session.enemy,winner:session.winner,rounds:session.rounds,rules:session.rules,reward:session.reward,context:session.context,historyComplete:true,startedAt:session.startedAt,endedAt:session.endedAt||session.startedAt};}
  async listReports(owner){if(!this.discovery.authority)return[];this.assertOwner(owner);try{await this.refresh();}catch(error){if(!['CLOUD_UNAVAILABLE','DISCOVERY_UNAVAILABLE','DISCOVERY_STORAGE_UNAVAILABLE'].includes(error.code))throw error;}return[...this.sessions.entries()].filter(([key,s])=>key.startsWith(owner+'\0')&&['finished','abandoned'].includes(s.status)).map(([,s])=>this.report(s));}
  async command(name,payload,context){
    const owner=this.owner();if(context.ownerAccountId!==owner)fail('AUTH_CHANGED','账号已切换');
    if(name==='getReport'){const id='battle-cloud-'+payload.reportId.slice('report-cloud-'.length);return this.report(await this.read(owner,id));}
    if(['snapshot','sync','retrySettlement'].includes(name)){await this.resolvePending(owner,payload.sessionId);const data=await this.read(owner,payload.sessionId);if(data.status==='finished')this.apply(owner,await this.head(owner));return data;}
    if(name==='context'){await this.read(owner,payload.sessionId);await this.refresh(true);return this.discovery.getBattleContext({ownerAccountId:owner,sessionId:payload.sessionId});}
    if(name==='settleContext'){await this.read(owner,payload.sessionId);return(await this.discovery.settleBattleContext({...payload,ownerAccountId:owner})).data;}
    if(name==='act'||name==='retryAction')return this.serial(owner,async()=>{
      const pending=name==='retryAction'?this.pending(owner,payload.sessionId):null;if(name==='retryAction'&&!pending)fail('NO_PENDING_ACTION','当前没有待确认的行动');
      const locked=this.pending(owner,payload.sessionId);if(name==='act'&&locked&&locked.request.actionId!==payload.actionId)fail('ACTION_PENDING','原行动结果待确认，请先同步或重试原操作');
      const body=pending?.request||{op:'act',permitId:this.permitId(payload.sessionId),action:payload.action,expectedRound:payload.expectedRound,actionId:payload.actionId};
      const session=await this.request(owner,body,payload.sessionId);this.remember(owner,session);await this.refresh(true);return this.peek(owner,payload.sessionId);
    });
    if(name==='leave'){const session=await this.read(owner,payload.sessionId);if(session.status!=='active')return session;await this.request(owner,{op:'cancel',permitId:this.permitId(payload.sessionId),actionId:'leave:'+this.permitId(payload.sessionId)},payload.sessionId);await this.refresh(true);return this.peek(owner,payload.sessionId);}
    fail('CLOUD_COMMAND_UNAVAILABLE','此云端对局操作暂不可用');
  }
  clear(){this.sessions.clear();this.nearbyState=null;this.refreshedAt=0;this.pendingRefresh=null;}
}
module.exports={CloudDiscoveryRuntime};
