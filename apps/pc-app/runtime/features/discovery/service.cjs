const {randomUUID}=require('node:crypto');
const {DiscoveryRepository,atomic}=require('./repository.cjs');
const {LocationService}=require('./location-adapter.cjs');
const {MapAdapter}=require('./map-adapter.cjs');
const {nearbySpawns}=require('./spawns.cjs');
const {RegisteredWildBattleAdapter}=require('./battle-adapter.cjs');
const {checkFix,geofence,distanceMeters}=require('./coordinates.cjs');
const {getBattleRules}=require('../../services/battle-runtime.cjs');
const {confirmedSerial,withoutGlobalSerials}=require('./global-serial.cjs');
function problem(code,message) {throw Object.assign(new Error(message),{code});}
const ok=data=>({ok:true,data});
const clone=value=>structuredClone(value);
function publicEncounter(value) {
  if(!value) return null;
  const result=withoutGlobalSerials(value); if(result.battle) {delete result.battle.engineState;result.battle.rules ||= getBattleRules();}
  delete result.initialFix; delete result.cloudPermit;
  return result;
}

class DiscoveryService {
  constructor({db,getCompanions,getOwner,getBattle,invokeBattle,location=new LocationService(),map=new MapAdapter(),authority=null,getAuthority,now=Date.now,events={emit(){}}}) {
    this.db=db; this.repo=new DiscoveryRepository(db); this.getCompanions=getCompanions; this.getOwner=getOwner;
    this.getBattle=getBattle; this.invokeBattle=invokeBattle; this.location=location; this.map=map; this.getAuthority=getAuthority || (()=>authority); this.now=now; this.events=events;
    this.locks=new Map();
  }
  get authority() {return this.getAuthority();}
  scenario() {return this.location.mode==='demo'?'demo':this.location.adapter.scenario==='qa'?'qa':'live';}
  owner() {const owner=this.getOwner(); if(!owner || typeof owner!=='string') problem('AUTH_REQUIRED','请先登录，再邀请新伙伴加入'); return owner;}
  companions() {const service=this.getCompanions?.(); if((!service?.getPet && !service?.requirePet) || !service?.createCapturedInstance) problem('COMPANIONS_UNAVAILABLE','伙伴服务暂未连接，请稍后重试'); return service;}
  pet(owner,id) {const api=this.companions(); return api.getPet ? api.getPet(owner,id) : api.requirePet(owner,id);}
  currentEncounter(owner,id) {const value=this.repo.get(owner,id); if(!value) problem('ENCOUNTER_NOT_FOUND','找不到这次遭遇'); return value;}
  getBattleContext({ownerAccountId,sessionId}) {
    const owner=this.owner();if(owner!==ownerAccountId)problem('AUTH_CHANGED','账号已切换');
    const saved=this.repo.list(owner).find(encounter=>encounter.battle?.battleId===sessionId);
    if(!saved)return {returnTo:'/discovery'};
    const encounter=this.syncExternal(saved);
    return {returnTo:'/discovery',action:encounter.status==='won'?'capture':undefined,name:encounter.spawn.name,settled:encounter.status==='captured',resultPath:encounter.status==='captured'?`/discovery/result/${encounter.encounterId}`:undefined};
  }
  async settleBattleContext({ownerAccountId,sessionId,actionId,name,showOnDesktop}) {
    const owner=this.owner();if(owner!==ownerAccountId)problem('AUTH_CHANGED','账号已切换');
    const saved=this.repo.list(owner).find(encounter=>encounter.battle?.battleId===sessionId);
    if(!saved)problem('ENCOUNTER_NOT_FOUND','未找到这次相遇');
    const encounter=this.syncExternal(saved);
    const result=await this.confirm({encounterId:encounter.encounterId,actionId,name:name||encounter.spawn.name,showOnDesktop,expectedRevision:encounter.revision});
    return result.ok?{...result,data:{...result.data,resultPath:`/discovery/result/${encounter.encounterId}`}}:result;
  }
  checkRevision(value,expected) {if(expected!==undefined && expected!==value.revision) problem('REVISION_CONFLICT','遭遇进度已更新，请刷新后重试');}
  requireFix(spawn) {
    if(!this.location.policyAllowed()) {const failure=this.location.blockByPolicy();problem(failure.error.code,failure.error.message);}
    const fix=this.location.snapshot().fix;
    const basic=this.location.quality(fix);if(!basic.ok)problem(basic.code,basic.message);
    const quality=spawn ? geofence(this.location.metricFix(fix),spawn.position,100,this.now()) : basic;
    if(!quality.ok) problem(quality.code,quality.message); return fix;
  }
  notify(owner) {this.events.emit('discovery:changed',{ownerAccountId:owner});}
  nearby() {
    const location=this.location.snapshot(),fix=location.fix;
    if(!fix) return {spawns:[],territories:[],captureRadiusMeters:100};
    const owner=this.getOwner(),encounters=owner ? this.repo.list(owner) : [];
    if(this.authority&&this.cloudRuntime&&location.mode!=='demo'){
      const remote=this.cloudRuntime.nearbyState;
      // Watch samples advance while HTTPS discovery is in flight. A new sample
      // must not disable a still-nearby server-generated point solely because
      // its timestamp differs. This is only a preview: reserve/capture require
      // a fresh signed proof and the server checks the original 100m geofence.
      const eligible=location.status==='ready'&&this.location.policyAllowed()&&remote?.source===fix.source&&(remote.scenarioId||null)===(fix.scenarioId||null);
      const metric=this.location.metricFix(fix);
      return{spawns:(remote?.spawns||[]).map(spawn=>({...spawn,demo:false,distanceMeters:Math.round(distanceMeters(metric,spawn.position)),inRange:Boolean(eligible&&spawn.expiresAt>this.now()&&geofence(metric,spawn.position,100,this.now()).ok),captureState:encounters.find(e=>e.spawn.id===spawn.id&&!['lost','cancelled'].includes(e.status))?.status||'available'})),territories:[],captureRadiusMeters:100};
    }
    const spawns=nearbySpawns(fix,this.now(),450,this.getCompanions?.()?.listTemplates?.()).map(spawn=>{
      const existing=encounters.find(e=>e.spawn.id===spawn.id && !['lost','cancelled'].includes(e.status));
      const range=fix.source!=='demo'&&this.location.quality(fix).ok ? geofence(this.location.metricFix(fix),spawn.position,100,this.now()) : {ok:false};
      return {...spawn,demo:location.mode==='demo',inRange:range.ok,captureState:existing?.status || 'available'};
    });
    return {spawns,territories:[],captureRadiusMeters:100};
  }
  captureViews(owner,owned) {
    if(!owner)return [];
    const pets=owned || this.getCompanions?.()?.listPets?.(owner) || [];
    return this.repo.captures(owner).map(capture=>{
      const pet=pets.find(value=>value.ownerAccountId===owner&&value.petId===capture.petId&&value.templateId===capture.templateId);
      const globalSerial=confirmedSerial(pet?.globalSerial)||(this.authority?this.cloudRuntime?.numberForEncounter(owner,this.repo.get(owner,capture.encounterId)):undefined);
      return {...withoutGlobalSerials(capture),...(pet?{resourceId:pet.resource.resourceId,showOnDesktop:Boolean(pet.desktop?.visible)}:{}),...(globalSerial?{globalSerial}:{})};
    });
  }
  snapshot() {
    if(this.getOwner()&&this.authority&&this.cloudRuntime)return this.cloudRuntime.refresh().then(()=>this.snapshotLocal());
    return this.snapshotLocal();
  }
  snapshotLocal() {
    const owner=this.getOwner(),companion=this.getCompanions?.();
    const owned=owner ? (companion?.listPets?.(owner) || companion?.snapshot?.(owner)?.data?.pets || []) : [];
    const pets=owned.map(p=>({petId:p.petId,templateId:p.templateId,name:p.name,element:p.element,resource:p.resource,level:p.growth?.level || 1,...(confirmedSerial(p.globalSerial)?{globalSerial:p.globalSerial}:{})}));
    if(owner) for(const encounter of this.repo.list(owner)) this.syncExternal(encounter);
    const nearby=this.nearby(),fix=this.location.snapshot().fix;
    const territories=this.territories?.nearby(owner,fix) || {available:false,items:[]};
    return ok({scenario:this.scenario(),location:this.location.snapshot(),map:this.map.snapshot(),...nearby,
      mapLocation:fix ? this.map.project(fix) : null,spawns:nearby.spawns.map(s=>({...s,mapPosition:this.map.project(s.position)})),territories:territories.items,territoriesAvailable:territories.available,pets,
      encounters:owner ? this.repo.list(owner).map(value=>this.authority&&this.cloudRuntime?this.cloudRuntime.encounterView(owner,value):publicEncounter(value)) : [],captures:this.captureViews(owner,owned),
      signedIn:Boolean(owner),storage:this.authority?'cloud':'local',cloudConfigured:Boolean(this.authority),
      cloudStatus:!this.authority ? 'disabled' : !this.getBattle?.()?.supportsCloudWild ? 'battle_adapter_missing' : 'ready'});
  }
  async observe(input) {
    if(this.authority&&this.cloudRuntime)return this.cloudRuntime.observe(input);
    this.owner();const spawn=this.nearby().spawns.find(value=>value.id===input.spawnId);
    if(!spawn)problem('SPAWN_EXPIRED','附近伙伴已刷新，请重新查看地图');
    this.requireFix(spawn);return ok({spawnId:spawn.id,templateId:spawn.templateId});
  }
  async begin(input) {
    if(this.authority&&this.cloudRuntime)return this.cloudRuntime.begin(input);
    const owner=this.owner(),request={op:'begin',spawnId:input.spawnId,petId:input.petId};
    const replay=this.repo.replay(owner,input.actionId,request); if(replay) return replay;
    if(this.authority && !this.getBattle?.()?.supportsCloudWild) problem('CLOUD_BATTLE_INTEGRATION_REQUIRED','云端野外对战适配尚未连接，可先使用本机探索模式');
    this.requireFix();
    const pet=this.pet(owner,input.petId);
    if(!['2d','spritesheet'].includes(pet.resource?.kind)) problem('PET_2D_REQUIRED','本版只支持 2D 出战伙伴，请先领养或选择一位 2D 伙伴');
    const spawn=this.nearby().spawns.find(s=>s.id===input.spawnId);
    if(!spawn) problem('SPAWN_EXPIRED','附近伙伴已刷新，请重新查看地图');
    const fix=this.requireFix(spawn);
    if(this.repo.list(owner).some(e=>['challenging','won'].includes(e.status))) problem('ENCOUNTER_PENDING','还有一场挑战等待处理，请先继续或离开');
    // Network authorization, if configured, happens before the SQLite transaction.
    const cloudPermit=this.authority ? await this.authority.reserve({spawnId:spawn.id,fix,petId:pet.petId,playerElement:pet.element,actionId:input.actionId}) : null;
    if(this.owner()!==owner) problem('AUTH_CHANGED','账号已切换，请重新打开探索');
    return this.repo.action(owner,input.actionId,{op:'begin',spawnId:input.spawnId,petId:input.petId},()=>{
      const active=this.repo.list(owner).find(e=>['challenging','won'].includes(e.status));
      if(active) problem('ENCOUNTER_PENDING','还有一场挑战等待处理，请先继续或离开');
      const captured=this.repo.list(owner).some(e=>e.spawn.id===spawn.id && e.status==='captured');
      if(captured) problem('SPAWN_ALREADY_CAPTURED','这位伙伴已经加入，请寻找新的相遇');
      const encounterId=`encounter-${randomUUID()}`,battleId=`wild-battle-${randomUUID()}`;
      const scenario=this.scenario();
      const battle=this.battleAdapter().begin({ownerAccountId:owner,pet,spawn,battleId,encounterId,scenario,actionId:`${encounterId}:battle`});
      if(battle?.then) problem('BATTLE_ADAPTER_INVALID','野外挑战适配器必须支持同步存档');
      const encounter={encounterId,ownerAccountId:owner,scenario,spawn:clone(spawn),petId:pet.petId,battle,status:'challenging',revision:1,createdAt:this.now(),updatedAt:this.now(),cloudPermit};
      this.repo.put(encounter); this.notify(owner); return ok(publicEncounter(encounter));
    });
  }
  battleAdapter() {
    const battle=this.getBattle?.();
    if (!battle?.beginWildChallenge || !this.invokeBattle) problem('BATTLE_UNAVAILABLE','对战服务尚未就绪');
    return new RegisteredWildBattleAdapter(battle,this.invokeBattle);
  }
  syncExternal(encounter) {
    if(encounter.cloudPermit?.id)return encounter;
    if(encounter.battle?.adapter!=='battle-feature' || !['challenging','won'].includes(encounter.status)) return encounter;
    const adapter=this.battleAdapter(); if(!adapter.read) return encounter;
    const battle=adapter.read(encounter.ownerAccountId,encounter.battle.battleId);
    const status=battle.externalStatus==='abandoned' ? 'cancelled' : battle.finished ? battle.winner==='player' ? 'won' : 'lost' : 'challenging';
    if(battle.view.round!==encounter.battle.view.round || status!==encounter.status) {
      const revision=encounter.revision;encounter.battle=battle;encounter.status=status;encounter.revision++;encounter.updatedAt=this.now();this.repo.put(encounter,revision);
    }
    return encounter;
  }
  async serial(owner,fn) {const previous=this.locks.get(owner)||Promise.resolve();const task=previous.catch(()=>{}).then(fn);this.locks.set(owner,task);try{return await task;}finally{if(this.locks.get(owner)===task)this.locks.delete(owner);}}
  act(input) {return this.serial(this.owner(),()=>this.performAct(input));}
  async performAct(input) {
    const owner=this.owner();
    const cloudEncounter=this.repo.get(owner,input.encounterId);
    if(cloudEncounter?.cloudPermit?.id&&this.cloudRuntime){
      const pending=this.cloudRuntime.intent(owner,input.actionId),expectedRound=pending?.request?.expectedRound||cloudEncounter.battle.view.round+1;
      await this.cloudRuntime.command('act',{sessionId:cloudEncounter.battle.battleId,action:input.action,actionId:input.actionId,expectedRound},{ownerAccountId:owner});
      return ok(publicEncounter(this.repo.get(owner,input.encounterId)));
    }
    const replay=this.repo.replay(owner,input.actionId,{op:'act',encounterId:input.encounterId,action:input.action,expectedRevision:input.expectedRevision});if(replay) return replay;
    let encounter=this.currentEncounter(owner,input.encounterId);
    this.checkRevision(encounter,input.expectedRevision);
    if(encounter.status!=='challenging') problem('BATTLE_FINISHED','这场挑战已结束');
    this.pet(owner,encounter.petId);
    let battle;
    if(encounter.battle.adapter==='battle-feature') {
      if(!this.battleAdapter().read) problem('BATTLE_UNAVAILABLE','对战服务暂未连接，请稍后恢复挑战');
      const adapter=this.battleAdapter(); battle=await adapter.act(encounter.battle,input.action,input.actionId);
      if(this.owner()!==owner) problem('AUTH_CHANGED','账号已切换，请重新打开探索');
    }
    return this.repo.action(owner,input.actionId,{op:'act',encounterId:input.encounterId,action:input.action,expectedRevision:input.expectedRevision},()=>{
      encounter=this.currentEncounter(owner,input.encounterId); this.checkRevision(encounter,input.expectedRevision);
      if(encounter.status!=='challenging') problem('BATTLE_FINISHED','这场挑战已结束');
      this.pet(owner,encounter.petId);
      const previous=encounter.revision;
      if (!battle) problem('LEGACY_BATTLE_READ_ONLY','历史挑战已保留，请开始新的相遇');
      encounter.battle=battle;
      if(encounter.battle?.then) problem('BATTLE_ADAPTER_INVALID','野外挑战适配器必须支持同步存档');
      if(encounter.battle.finished) encounter.status=encounter.battle.winner==='player' ? 'won' : 'lost';
      encounter.revision++; encounter.updatedAt=this.now(); this.repo.put(encounter,previous); this.notify(owner);
      return ok(publicEncounter(encounter));
    });
  }
  async cancel(input) {
    const cloudEncounter=this.repo.get(this.owner(),input.encounterId);
    if(cloudEncounter?.cloudPermit?.id&&this.cloudRuntime)return this.cloudRuntime.cancel(input);
    const owner=this.owner();
    const replay=this.repo.replay(owner,input.actionId,{op:'cancel',encounterId:input.encounterId});if(replay) return replay;
    const existing=this.currentEncounter(owner,input.encounterId);
    if(existing.battle?.adapter==='battle-feature' && !['captured','cancelled'].includes(existing.status)) {
      await this.battleAdapter().cancel(existing.battle);
      if(this.owner()!==owner) problem('AUTH_CHANGED','账号已切换，请重新打开探索');
    }
    return this.repo.action(owner,input.actionId,{op:'cancel',encounterId:input.encounterId},()=>{
      const encounter=this.currentEncounter(owner,input.encounterId);
      if(encounter.status==='captured') problem('CAPTURE_ALREADY_CONFIRMED','新伙伴已经加入');
      if(encounter.status!=='cancelled') {const previous=encounter.revision; encounter.status='cancelled'; encounter.revision++; encounter.updatedAt=this.now(); this.repo.put(encounter,previous);}
      this.notify(owner); return ok(publicEncounter(encounter));
    });
  }
  async confirm(input) {
    const cloudEncounter=this.repo.get(this.owner(),input.encounterId);
    if(cloudEncounter?.cloudPermit?.id&&this.cloudRuntime)return this.cloudRuntime.confirm(input);
    const owner=this.owner(),encounter=this.syncExternal(this.currentEncounter(owner,input.encounterId));
    const name=typeof input.name==='string' ? input.name.trim() : encounter.spawn.name;
    const replay=this.repo.replay(owner,input.actionId,{op:'confirm',encounterId:input.encounterId,name,showOnDesktop:Boolean(input.showOnDesktop)});if(replay) return replay;
    const existing=this.repo.capture(owner,encounter.encounterId);
    if(existing) return {...ok(existing),duplicate:true};
    if(encounter.status!=='won'||encounter.battle?.winner!=='player'||!encounter.battle.finished) problem('VICTORY_REQUIRED','赢得挑战后才能邀请伙伴加入');
    this.checkRevision(encounter,input.expectedRevision);
    if(!name || [...name].length>24 || /[\u0000-\u001f]/u.test(name)) problem('INVALID_NAME','昵称需为 1–24 个字符');
    const fix=this.requireFix(encounter.spawn);
    if(this.now()-encounter.createdAt>30*60*1000) problem('ENCOUNTER_EXPIRED','这次相遇已超过 30 分钟，请重新探索');
    const cloudReceipt=this.authority ? await this.authority.confirm({encounter,fix,permit:encounter.cloudPermit,actionId:input.actionId}) : null;
    if(this.owner()!==owner) problem('AUTH_CHANGED','账号已切换，请重新打开探索');
    return this.repo.action(owner,input.actionId,{op:'confirm',encounterId:input.encounterId,name,showOnDesktop:Boolean(input.showOnDesktop)},()=>atomic(this.db,()=>{
      // Re-read after await. Concurrent confirmations cannot create a second instance.
      const prior=this.repo.capture(owner,encounter.encounterId); if(prior) return {...ok(prior),duplicate:true};
      const current=this.currentEncounter(owner,encounter.encounterId); this.checkRevision(current,encounter.revision);
      const companion=this.companions(),capturedAtMs=this.now();
      const territoryContext=this.territories?.captureContext(owner,fix) || {territoryId:null,captureMultiplier:1};
      const tags=[{id:`${encounter.encounterId}:first-meeting`,kind:'first_meeting',title:'我们的第一次见面',text:`在${encounter.spawn.placeLabel}相遇，赢得挑战后成为了伙伴。`,placeLabel:encounter.spawn.placeLabel,createdAt:new Date(capturedAtMs).toISOString()}];
      const captureActionId=`discovery:${encounter.encounterId}`;
      const result=companion.createCapturedInstance(owner,{actionId:captureActionId,templateId:encounter.spawn.templateId,name,stats:encounter.spawn.stats,showOnDesktop:Boolean(input.showOnDesktop),
        origin:{wildPetId:encounter.spawn.id,wildSerial:encounter.spawn.wildSerial,battleId:encounter.battle.battleId,scenario:encounter.scenario||'live',scenarioId:encounter.scenario==='qa'?this.location.adapter.scenarioId:undefined,capturedAt:new Date(capturedAtMs).toISOString(),encounterId:encounter.encounterId,placeLabel:encounter.spawn.placeLabel,memoryTags:tags,...territoryContext,validation:encounter.scenario==='qa'?'simulated':cloudReceipt ? 'cloud' : 'local-os',cloudReceiptId:cloudReceipt?.id || null}});
      if(!result.ok || !result.data?.pet?.petId) problem(result.code || 'CAPTURE_FAILED',result.message || '收服未完成，请重试');
      const pet=result.data.pet;
      if(!['2d','spritesheet'].includes(pet.resource?.kind)) problem('CAPTURE_2D_REQUIRED','这次相遇尚未提供 2D 形象，请保留记录并重新探索');
      const capture={ownerAccountId:owner,encounterId:encounter.encounterId,scenario:encounter.scenario||'live',scenarioId:encounter.scenario==='qa'?this.location.adapter.scenarioId:undefined,petId:pet.petId,actionId:captureActionId,name:pet.name,templateId:pet.templateId,resourceId:pet.resource.resourceId,element:pet.element,serial:pet.serial,...territoryContext,
        capturedAtMs,placeLabel:encounter.spawn.placeLabel,memoryTags:tags,showOnDesktop:Boolean(pet.desktop?.visible),validation:encounter.scenario==='qa'?'simulated':cloudReceipt ? 'cloud' : 'local-os',distanceMeters:Math.round(distanceMeters(fix,encounter.spawn.position))};
      this.repo.putCapture(capture); for(const tag of tags) this.repo.putMemory(owner,pet.petId,tag);
      const revision=current.revision; current.status='captured'; current.capturePetId=pet.petId; current.revision++; current.updatedAt=this.now(); this.repo.put(current,revision);
      this.events.emit('companions:changed',{ownerAccountId:owner,petId:pet.petId}); this.notify(owner); return ok(capture);
    }));
  }
  memories(input) {const owner=this.owner(); this.pet(owner,input.petId); return ok(this.repo.memories(owner,input.petId));}
  dispose() {this.location.dispose();}
}
module.exports={DiscoveryService,publicEncounter};
