// Preparation-only follow-on. No work on import; no account/grant/new battle or
// economy creation. Future holder must install the observer BEFORE entering the
// already-authorized exact room, then run its normal game without disabling polls.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {writeFileSync,renameSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {friendSession,reportFor} from '../../infra/supabase/functions/lingjing-battle/projection.js';
const require=createRequire(import.meta.url);
const {canonical,checksum}=require('../../apps/pc-app/runtime/features/accounts/util.cjs');
const {presentReport}=require('../../apps/pc-app/runtime/features/battle/presentation.cjs');
const digest=x=>createHash('sha256').update(canonical(x)).digest('hex');
const save=(file,value)=>{writeFileSync(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});renameSync(file+'.tmp',file);};
export function canonicalPerspective(value,side){
 assert.ok(['host','guest'].includes(side));const peer=side==='host'?'guest':'host';
 const visit=(x,key='')=>{if(Array.isArray(x))return x.map(v=>visit(v));if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k==='player'?side:k==='enemy'?peer:k,visit(v,k)]));if(['id','sourceId','winner'].includes(key))return x==='player'?side:x==='enemy'?peer:x;return x;};
 return visit(value);
}
export function validateEconomicReadback(remote,owner,intents){
 assert.equal(remote?.source,'normal-authenticated-SDK-lingjing-save');assert.equal(remote.owner,owner);assert.ok(Number.isSafeInteger(remote.revision));
 assert.ok(intents.length>0&&intents.length<=50);assert.equal(new Set(intents.map(x=>x.actionId)).size,intents.length);
 for(const intent of intents){assert.ok(['plant','harvest','craft','feed'].includes(intent.kind));assert.match(intent.requestHash,/^[a-f0-9]{64}$/);const rows=remote.actions.filter(x=>x.action_id===intent.actionId);assert.equal(rows.length,1);assert.equal(rows[0].kind,intent.kind);assert.equal(rows[0].request_hash,intent.requestHash);assert.ok(remote.events.some(x=>x.action_id===intent.actionId));}
 return remote;
}
function runtime(context){
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
 const {models,expectedActors,assertActive,runId,scenario}=context;assert.equal(typeof assertActive,'function');assert.equal(expectedActors.a.ownerAccountId,expectedActors.a2.ownerAccountId);assert.notEqual(expectedActors.a.ownerAccountId,expectedActors.b.ownerAccountId);
 assert.equal(new Set(['a','a2','b'].map(r=>expectedActors[r].deviceId)).size,3);assert.ok(runId&&scenario);
 const active=async()=>{await assertActive();for(const role of['a','a2','b']){const session=await models[role].call('accounts','session'),e=expectedActors[role];assert.equal(session.currentUser?.id,e.ownerAccountId);assert.equal(session.currentUser?.authUserId,e.authUserId);assert.equal(session.currentUser?.authKind,'supabase');}await assertActive();};
 return {models,expectedActors,active};
}
export async function beginCloudAuthorityObservation(context,{roomId,sessions}){
 const {models,expectedActors,active}=runtime(context);assert.match(roomId,/^[a-f0-9-]{36}$/);assert.equal(sessions.a,`online-${roomId}`);assert.equal(sessions.b,`online-${roomId}`);await active();
 const installed=[];
 try{for(const role of['a','b']){await models[role].main((_electron,expected,roomId,runId)=>{
  const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),p=req('./apps/pc-app/runtime/services/online-duel-service.cjs').OnlineDuelService.prototype;
  if(globalThis.__authorityReadbackObserver)throw Error('Own observer exists');const o={prototype:p,original:p.emit,roomId,runId,events:[],overflow:false};globalThis.__authorityReadbackObserver=o;
  p.emit=function(type,payload={}){const actor=this.cloudActor,id=payload.room?.id||payload.roomId;if(actor?.ownerAccountId===expected.ownerAccountId&&actor?.authUserId===expected.authUserId&&actor?.deviceId===expected.deviceId&&id===roomId){
   if((type==='realtime-status'&&payload.status==='SUBSCRIBED')||(['room-updated','round-updated'].includes(type)&&payload.source==='realtime')){
    if(o.events.length>=512)o.overflow=true;else o.events.push({type,at:Date.now(),status:type==='realtime-status'?'SUBSCRIBED':null,source:payload.source==='realtime'?'realtime':null,roomId,round:payload.round?.round_no??payload.room?.last_resolved_round??null});
   }}return o.original.call(this,type,payload);};
 },expectedActors[role],roomId,context.runId);installed.push(role);}
 return {runId:context.runId,scenario:context.scenario,roomId,sessions,installedAt:Date.now(),uiProgress:{}};
 }catch(error){for(const role of installed)await removeObserver(models[role]).catch(()=>{});throw error;}
}
async function removeObserver(model){return model.main(()=>{const o=globalThis.__authorityReadbackObserver;if(o){o.prototype.emit=o.original;if(o.originalInvoke)o.prototype.invoke=o.originalInvoke;delete globalThis.__authorityReadbackObserver;}});}
export async function endCloudAuthorityObservation(context){
 const result={};for(const role of['a','b'])try{await removeObserver(context.models[role]);result[role]=true;}catch{result[role]=false;}return result;
}
export async function observeCloudRealtimeUi(context,observation,{timeoutMs=30000}={}){
 const {models,active}=runtime(context);assert.equal(observation.runId,context.runId);assert.ok(timeoutMs>0&&timeoutMs<=30000);const end=Date.now()+timeoutMs;
 // DOM reads only: never invoke sync/get_room here. Normal production 1.5s polling
 // remains enabled. Actual production push provenance, not exclusive causality.
 const observationFile=join(context.output,'live-authority-realtime-observation.json');observation.status='observing';observation.substage='production-subscription-and-push-ui';observation.lastSafe={};save(observationFile,observation);
 try{while(Date.now()<end){await active();for(const role of['a','b']){
  const stream=await models[role].main((_e,roomId,runId)=>{const o=globalThis.__authorityReadbackObserver;if(!o||o.roomId!==roomId||o.runId!==runId||o.overflow)throw Error('Exact observer unavailable');return o.events;},observation.roomId,context.runId);
  const subscribed=stream.find(x=>x.type==='realtime-status'&&x.status==='SUBSCRIBED'),push=stream.find(x=>x.type==='round-updated'&&x.source==='realtime'&&Number.isSafeInteger(x.round)&&x.round>0);
  const selector=`.battle-screen[data-session-id="${observation.sessions[role]}"] .battle-stage`,stage=models[role].page.locator(selector);
  const stageCount=await stage.count();observation.lastSafe[role]={subscribed:!!subscribed,realtimePush:!!push,pushRound:push?.round??null,stageCount,uiRound:null};if(subscribed&&push&&stageCount===1){const round=Number(await stage.getAttribute('data-round'));observation.lastSafe[role].uiRound=Number.isSafeInteger(round)?round:null;if(round>=push.round)observation.uiProgress[role]={subscribed,push,uiRound:round,observedAt:Date.now()};}
 }save(observationFile,observation);if(observation.uiProgress.a&&observation.uiProgress.b){observation.status='observed';return observation;}await new Promise(r=>setTimeout(r,250));}
 throw Object.assign(Error(),{code:'REALTIME_UI_UNOBSERVED'});
 }catch(error){observation.status='failed';observation.errorCode=error.code==='REALTIME_UI_UNOBSERVED'?'REALTIME_UI_UNOBSERVED':'SCOPED_OBSERVATION_FAILED';throw error;}finally{observation.lastObservedAt=new Date().toISOString();save(observationFile,observation);}
}
async function withNormalContext(context,role,work,args){
 const {models,expectedActors,active}=runtime(context);await active();const model=models[role],expected=expectedActors[role];let installed=false;
 try{
  await model.main((_e,expected)=>{const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),p=req('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs').SupabaseRemote.prototype;if(globalThis.__authorityReadbackContext)throw Error('Own SDK hook exists');const hook={prototype:p,original:p.cloudContext,context:null};globalThis.__authorityReadbackContext=hook;p.cloudContext=async function(...args){const c=await hook.original.apply(this,args);if(c.ownerAccountId===expected.ownerAccountId&&c.authUserId===expected.authUserId&&c.deviceId===expected.deviceId){hook.context=c;p.cloudContext=hook.original;}return c;};},expected);installed=true;
  // Normal initialized garden snapshot obtains this client's supported SDK. Fail
  // on cache; do not manufacture auth/session or export the context/token.
  const snapshot=await model.call('garden','snapshot');assert.equal(snapshot.ownerAccountId,expected.ownerAccountId);assert.equal(snapshot.sync?.mode,'cloud');assert.equal(snapshot.sync.pending,0);
  await active();return await model.main(work,expected,args);
 }finally{if(installed)await model.main(()=>{const h=globalThis.__authorityReadbackContext;if(h){h.prototype.cloudContext=h.original;delete globalThis.__authorityReadbackContext;}});}
}
async function economicRead(context,role,intents){return withNormalContext(context,role,async(_e,expected,intents)=>{
 const c=globalThis.__authorityReadbackContext?.context;if(!c||c.ownerAccountId!==expected.ownerAccountId)throw Error('Own context missing');
 const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),{canonical,checksum}=req('./apps/pc-app/runtime/features/accounts/util.cjs'),crypto=process.getBuiltinModule('node:crypto');
 const saved=await c.invoke('lingjing-save',{op:'read'}),env=saved?.envelope;if(!env||env.ownerAccountId!==expected.ownerAccountId||env.provenance?.mode!=='live'||env.identity?.subjectId!==expected.ownerAccountId)throw Error('Fresh authority invalid');const {checksum:sum,...body}=env;if(checksum(body)!==sum||saved.checksum!==sum)throw Error('Checksum invalid');
 const garden=env.data.modules.garden.data,companions=env.data.modules.companions.data;if(garden.ownerAccountId!==expected.ownerAccountId||companions.ownerAccountId!==expected.ownerAccountId)throw Error('Module owner invalid');
 const ids=new Set(intents.map(x=>x.actionId));return {source:'normal-authenticated-SDK-lingjing-save',owner:expected.ownerAccountId,revision:saved.revision,checksum:sum,
  stateSha256:crypto.createHash('sha256').update(canonical({garden,companions})).digest('hex'),quantities:garden.tables.garden_items.filter(x=>x.quantity!==0).map(x=>({id:x.item_id,quantity:x.quantity})).sort((a,b)=>a.id.localeCompare(b.id)),plots:garden.tables.garden_plots.map(x=>({plotId:x.plot_id,cropType:x.crop_type,plantedAt:x.planted_at,maturesAt:x.matures_at,yieldQuantity:x.yield_quantity,revision:x.revision})).sort((a,b)=>a.plotId.localeCompare(b.plotId)),pets:companions.tables.companion_pets.map(x=>JSON.parse(x.data_json)).map(x=>({petId:x.petId,growth:x.growth})).sort((a,b)=>a.petId.localeCompare(b.petId)),actions:garden.tables.garden_actions.filter(x=>ids.has(x.action_id)),events:garden.tables.garden_events.filter(x=>ids.has(x.action_id)),receipts:garden.tables.garden_reward_receipts.filter(x=>ids.has(x.action_id))};
 },intents);}
export async function captureCloudEconomicCheckpoint(context,{intents}){
 const {active}=runtime(context);await active();const owner=context.expectedActors.a.ownerAccountId;
 const fresh=validateEconomicReadback(await economicRead(context,'a2',intents),owner,intents);
 const value={runId:context.runId,scenario:context.scenario,owner,intents:structuredClone(intents),capturedAt:new Date().toISOString(),fresh};
 const file=join(context.output,'live-authority-economic-checkpoint.json');assert.equal(existsSync(file),false,'Existing checkpoint must be reconciled, not replaced');save(file,value);return value;
}
async function battleRead(context,role,roomId){return withNormalContext(context,role,async(_e,expected,roomId)=>{
 const c=globalThis.__authorityReadbackContext?.context;if(!c||c.ownerAccountId!==expected.ownerAccountId)throw Error('Own context missing');
 const one=async q=>{const r=await q;if(r.error)throw Error('AUTHORITY_SELECT_FAILED');return r.data;};
 const rooms=await one(c.client.from('lingjing_battle_rooms').select('*').eq('id',roomId).limit(2));if(rooms.length!==1)throw Error('Exact room unavailable');const room=rooms[0];
 if(![room.host_user_id,room.guest_user_id].includes(expected.ownerAccountId))throw Error('Room owner mismatch');
 const rounds=await one(c.client.from('lingjing_battle_rounds').select('*').eq('room_id',roomId).order('round_no').limit(501));if(rounds.length>500)throw Error('Bounded history exceeded');
 const settlements=await one(c.client.from('lingjing_battle_settlements').select('owner_account_id,room_id,pet_id,action_id,won,experience,authority_revision,result_json').eq('owner_account_id',expected.ownerAccountId).eq('actor_auth_uid',expected.authUserId).eq('room_id',roomId).limit(2));if(settlements.length!==1)throw Error('Unique settlement missing');
 const proof=settlements[0].result_json;if(!proof?.authority?.actionId)throw Error('Settlement authority missing');
 const saved=await c.invoke('lingjing-save',{op:'read',actionId:proof.authority.actionId});const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),{checksum}=req('./apps/pc-app/runtime/features/accounts/util.cjs');const env=saved?.envelope,{checksum:sum,...body}=env||{};
 if(!env||env.ownerAccountId!==expected.ownerAccountId||env.provenance?.mode!=='live'||env.identity?.subjectId!==expected.ownerAccountId||checksum(body)!==sum||saved.checksum!==sum||saved.actionId!==proof.authority.actionId||saved.revision!==proof.authority.revision||sum!==proof.authority.checksum)throw Error('Exact settlement save invalid');
 const battle=env.data.modules.battle.data;if(battle.ownerAccountId&&battle.ownerAccountId!==expected.ownerAccountId)throw Error('Battle owner mismatch');
 return {source:'normal-authenticated-SDK-RLS-and-action-specific-save',owner:expected.ownerAccountId,room,rounds,settlements,save:{actionId:saved.actionId,revision:saved.revision,checksum:saved.checksum},reports:battle.reports.filter(x=>x.id===`online-${roomId}`),rewards:battle.rewards.filter(x=>x.session_id===`online-${roomId}`)};
 },roomId);}
export function validateBattleReadback(value,owner,roomId,settlementId){
 assert.equal(value.source,'normal-authenticated-SDK-RLS-and-action-specific-save');assert.equal(value.owner,owner);assert.equal(value.room.id,roomId);assert.equal(value.room.status,'finished');assert.ok(['host','guest'].includes(value.room.winner_side));
 assert.equal(value.rounds.length,value.room.last_resolved_round);assert.ok(value.rounds.length>0);value.rounds.forEach((r,i)=>{assert.equal(r.room_id,roomId);assert.equal(r.round_no,i+1);});
 assert.equal(value.settlements.length,1);const receipt=value.settlements[0];assert.equal(receipt.owner_account_id,owner);assert.equal(receipt.room_id,roomId);assert.equal(receipt.action_id,settlementId);
 assert.equal(value.reports.length,1);assert.equal(value.rewards.length,1);assert.equal(value.rewards[0].action_id,settlementId);assert.equal(receipt.result_json.action_id,settlementId);assert.equal(receipt.result_json.owner_account_id,owner);
 const projected=friendSession(value.room,value.rounds,owner,receipt.result_json.reward),expected=reportFor(projected),raw=JSON.parse(value.reports[0].data_json);
 assert.deepEqual(raw,expected);assert.deepEqual(receipt.result_json.report,expected);assert.deepEqual(JSON.parse(value.rewards[0].data_json),expected.reward);assert.equal(receipt.won,expected.winner==='player');assert.equal(receipt.experience,receipt.won?20:5);
 return {report:presentReport(expected),canonicalRounds:canonicalPerspective(expected.rounds,projected.side),winner:value.room.winner_side};
}
export function validateAuthorityReadbackSelection(selected){assert.ok(Array.isArray(selected)&&selected.length>0&&new Set(selected).size===selected.length);assert.deepEqual(selected,['B06','B11','I04'].filter(id=>selected.includes(id)));return [...selected];}
export async function runCloudAuthorityReadbackCases(context,{observation,roomId,sessions,settlementIds,economicCheckpoint,selectedCases=['B06','B11']}){
 selectedCases=validateAuthorityReadbackSelection(selectedCases);
 const start=Date.now(),deadline=start+8*60_000,originalAssert=context.assertActive;context={...context,assertActive:async()=>{assert.ok(Date.now()<deadline,'Bounded readback budget');await originalAssert();}};
 const {models,expectedActors,active}=runtime(context);assert.equal(typeof context.relaunch,'function');
 const file=join(context.output,'live-authority-readback-evidence.json');assert.equal(existsSync(file),false,'Do not silently rerun completed/unknown readback');
 const proof={runId:context.runId,scenario:context.scenario,passed:false,fullCasePassed:false,scope:'Existing confirmed same-batch room/economy only; real production Realtime observation with polling retained; normal SDK RLS/action-specific save independent reads; normal original profiles restarted.',cases:[]};
 const step=async(id,work)=>{if(!selectedCases.includes(id))return;assert.ok(Date.now()<deadline);await active();const row={id,passed:false};proof.cases.push(row);save(file,proof);Object.assign(row,await work());row.passed=true;save(file,proof);};
 try{
  await step('B06',async()=>{assert.equal(observation.runId,context.runId);assert.equal(observation.scenario,context.scenario);assert.equal(observation.roomId,roomId);for(const role of['a','b']){const seen=observation.uiProgress[role];const actualEvents=await models[role].main((_e,roomId,runId)=>{const o=globalThis.__authorityReadbackObserver;if(!o||o.overflow||o.roomId!==roomId||o.runId!==runId)throw Error('Original observer unavailable');return o.events;},roomId,context.runId);assert.ok(actualEvents.some(x=>digest(x)===digest(seen.push)));assert.ok(actualEvents.some(x=>digest(x)===digest(seen.subscribed)));assert.equal(seen.subscribed.status,'SUBSCRIBED');assert.ok(seen.subscribed.at<=seen.push.at);assert.equal(seen.push.source,'realtime');assert.equal(seen.push.roomId,roomId);assert.ok(seen.uiRound>=seen.push.round&&seen.push.round>0);assert.ok(seen.observedAt>=seen.push.at);assert.equal(sessions[role],observation.sessions[role]);}return {observations:observation.uiProgress,pollingRemainedEnabled:true,exclusiveUiCausalityNotClaimed:true};});
  await step('B11',async()=>{
   const before={},checked={};for(const role of['a','b']){assert.equal(sessions[role],`online-${roomId}`);before[role]=await battleRead(context,role,roomId);checked[role]=validateBattleReadback(before[role],expectedActors[role].ownerAccountId,roomId,settlementIds[role]);const actual=await models[role].call('battle','getReport',{reportId:sessions[role]});assert.deepEqual(actual,checked[role].report);}
   assert.deepEqual(before.a.room,before.b.room);assert.deepEqual(before.a.rounds,before.b.rounds);assert.deepEqual(checked.a.canonicalRounds,checked.b.canonicalRounds);assert.equal(checked.a.winner,checked.b.winner);
   for(const role of['a','b']){await active();models[role]=await context.relaunch(role);await active();const report=await models[role].call('battle','getReport',{reportId:sessions[role]});assert.deepEqual(report,checked[role].report);const after=await battleRead(context,role,roomId);validateBattleReadback(after,expectedActors[role].ownerAccountId,roomId,settlementIds[role]);assert.deepEqual(after,before[role]);}
   return {roomId,rounds:before.a.rounds.length,fullRoundComparison:true,eachOwnerOneSettlementAndReward:true,bothNormallyRestarted:true,authorityDigest:{a:digest(before.a),b:digest(before.b)}};
  });
  await step('I04',async()=>{
   assert.equal(economicCheckpoint.runId,context.runId);assert.equal(economicCheckpoint.scenario,context.scenario);assert.equal(economicCheckpoint.owner,expectedActors.a.ownerAccountId);
   const intents=economicCheckpoint.intents,prior=validateEconomicReadback(economicCheckpoint.fresh,economicCheckpoint.owner,intents);
   // Holder must capture this checkpoint after all same-owner economy/battle
   // writes and before these restarts. Later legitimate writes fail, not masked.
   await active();models.a2=await context.relaunch('a2');await active();const after=validateEconomicReadback(await economicRead(context,'a2',intents),economicCheckpoint.owner,intents);
   assert.equal(after.stateSha256,prior.stateSha256);assert.deepEqual(after.actions,prior.actions);assert.deepEqual(after.events,prior.events);assert.deepEqual(after.receipts,prior.receipts);
   const local=await models.a2.call('garden','snapshot');assert.equal(local.sync.mode,'cloud');assert.equal(local.sync.pending,0);assert.deepEqual(local.items.filter(x=>x.quantity!==0).map(x=>({id:x.id,quantity:x.quantity})).sort((a,b)=>a.id.localeCompare(b.id)),after.quantities);assert.deepEqual(local.plots.map(({plotId,cropType,plantedAt,maturesAt,yieldQuantity,revision})=>({plotId,cropType,plantedAt,maturesAt,yieldQuantity,revision})).sort((a,b)=>a.plotId.localeCompare(b.plotId)),after.plots);const ownPets=await models.a2.call('companions','list');assert.deepEqual(ownPets.pets.map(x=>({petId:x.petId,growth:x.growth})).sort((a,b)=>a.petId.localeCompare(b.petId)),after.pets);
   return {originalActionIds:intents.map(x=>x.actionId),normalRestart:true,independentFreshSdk:true,unchangedBusinessState:true,priorRevision:prior.revision,currentRevision:after.revision,scope:'Current batch only, not reconstruction of missing historical PG evidence'};
  });
  proof.passed=proof.cases.length===selectedCases.length&&proof.cases.every(x=>x.passed);
 }catch(error){proof.errorCode=['ERR_ASSERTION','REALTIME_UI_UNOBSERVED'].includes(error?.code)?error.code:'AUTHORITY_READBACK_FAILED';}
 finally{proof.cleanup={};for(const role of['a','b'])try{await removeObserver(models[role]);proof.cleanup[role]=true;}catch{proof.cleanup[role]=false;proof.passed=false;}proof.completedAt=new Date().toISOString();save(file,proof);}
 return proof;
}
