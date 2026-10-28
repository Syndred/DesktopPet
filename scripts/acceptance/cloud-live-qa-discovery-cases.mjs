// Granted synthetic coordinates, real signed location receipts and normal cloud APIs.
// Never OS location, SQL, territory mutation, fabricated battle or a new namespace.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {planTargetWindow,waitTargetWindow} from './cloud-live-qa-target-window.mjs';
export const originalConcurrentEvidence=Object.freeze({runId:40607080843,artifactId:12783353029,sha256:'7424bc1bab2e207687ee37ee56c3f3952983b44e3ed914307858ffdb57bbf5ce',reuseSha256:'870e1a8cb5cff1857744985483243451dc174325271cb5faf252bbe04de09208',packageSource:'1c9af85185bc0fd09a30b02c624c29e9f6cc0bbd'});
export function verifyPriorConcurrentEvidence(bytes,binding,scenario,reuseBytes){
 assert.equal(binding?.runId,originalConcurrentEvidence.runId);assert.equal(binding?.artifactId,originalConcurrentEvidence.artifactId);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),originalConcurrentEvidence.sha256);
 assert.equal(createHash('sha256').update(reuseBytes).digest('hex'),originalConcurrentEvidence.reuseSha256);const reuse=JSON.parse(reuseBytes.toString('utf8'));assert.equal(reuse.packageSourceCommit,originalConcurrentEvidence.packageSource);assert.equal(reuse.auditReceiptVerified,true);assert.equal(reuse.productPathsUnchanged,true);
 const original=JSON.parse(bytes.toString('utf8'));assert.equal(original.scenario,scenario);
 const row=original.cases.find(x=>x.id==='C11-concurrent-create');assert.equal(row.status,'passed-scoped');assert.deepEqual(row.newNumbers,['4','5']);assert.equal(row.uniqueInstances,2);assert.equal(row.replayedOriginals,true);
 assert.equal(original.cases.find(x=>x.id==='C11-observe-stability')?.errorCode,'PRECONDITION_NO_TARGET');
 return {...originalConcurrentEvidence,templateId:row.templateId,numbers:row.newNumbers,actionIds:row.actionIds};
}
export function verifyExistingConcurrentPets(byRole,actors,prior,originalActions){
 assert.equal(originalActions.length,2);for(const [i,role]of ['a','b'].entries()){const a=originalActions[i];assert.equal(a.owner,actors[role].ownerAccountId);assert.equal(a.actionId,prior.actionIds[i]);assert.equal(a.templateId,prior.templateId);assert.ok(typeof a.petId==='string'&&a.petId.length>0);}
 const selected=[];for(const role of ['a','b'])for(const pet of byRole[role]){assert.equal(pet.ownerAccountId,actors[role].ownerAccountId);if(pet.templateId===prior.templateId&&prior.numbers.includes(String(pet.globalSerial)))selected.push({role,petId:pet.petId,number:String(pet.globalSerial)});}
 for(const pet of selected){const i=pet.role==='a'?0:1;assert.equal(pet.petId,originalActions[i].petId,'Original successful action must identify this exact pet');}assert.equal(selected.length,2);assert.equal(new Set(selected.map(p=>p.role)).size,2);assert.equal(new Set(selected.map(p=>p.petId)).size,2);assert.deepEqual(selected.map(p=>p.number).sort(),['4','5']);return selected;
}
// Read only the two sealed original intentions through each owner's normal SDK.
// Context and projected action results remain inside the owned main process.
async function readOriginalConcurrentAction(model,expected,actionId,assertActive){
 let installed=false;try{await assertActive();
 await model.main((_e,expected)=>{const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),p=req('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs').SupabaseRemote.prototype;if(globalThis.__concurrentOriginalRead)throw Error('Duplicate own read context');const h={p,original:p.cloudContext,context:null};globalThis.__concurrentOriginalRead=h;p.cloudContext=async function(...args){const c=await h.original.apply(this,args);if(c.ownerAccountId===expected.ownerAccountId&&c.authUserId===expected.authUserId&&c.deviceId===expected.deviceId){h.context=c;p.cloudContext=h.original;}return c;};},expected);installed=true;
 await model.call('companions','list');await assertActive();
 return await model.main(async(_e,{expected,actionId})=>{const c=globalThis.__concurrentOriginalRead?.context;if(!c||c.ownerAccountId!==expected.ownerAccountId||c.authUserId!==expected.authUserId||c.deviceId!==expected.deviceId)throw Error('Exact own SDK required');
 const r=await c.client.from('lingjing_save_actions').select('owner_id,action_id,kind,revision,actions:envelope->data->modules->companions->data->tables->companion_actions').eq('owner_id',expected.ownerAccountId).eq('action_id','companions:'+actionId).limit(2);
 if(r.error||r.data?.length!==1)throw Error('Unique original authority action missing');const row=r.data[0];if(row.owner_id!==expected.ownerAccountId||row.action_id!=='companions:'+actionId||row.kind!=='authority'||!Array.isArray(row.actions))throw Error('Original action binding invalid');
 const matches=row.actions.filter(x=>x.owner_account_id===expected.ownerAccountId&&x.action_id===actionId&&x.operation==='adopt');if(matches.length!==1)throw Error('Unique original adopt missing');const result=JSON.parse(matches[0].result_json),pet=result.data?.pet;if(result.ok!==true||pet?.ownerAccountId!==expected.ownerAccountId||typeof pet.petId!=='string'||pet.templateId!=='animal-wood-deer')throw Error('Original adopt result invalid');
 return {owner:expected.ownerAccountId,actionId,petId:pet.petId,templateId:pet.templateId};},{expected,actionId});
 }finally{if(installed)await model.main(()=>{const h=globalThis.__concurrentOriginalRead;if(h){h.p.cloudContext=h.original;delete globalThis.__concurrentOriginalRead;}});}
}
export async function runCloudLiveQaDiscoveryCases({models,expectedActors,assertActive,scenario,runId,output,businessDeadline,mode='full',priorConcurrent,m07BeforeSend=false}){
 assert.ok(['full','wild-only'].includes(mode));assert.equal(typeof m07BeforeSend,'boolean');
 let prior;if(mode==='wild-only'){assert.ok(typeof priorConcurrent?.path==='string'&&typeof priorConcurrent.reusePath==='string');prior=verifyPriorConcurrentEvidence(readFileSync(priorConcurrent.path),priorConcurrent,scenario,readFileSync(priorConcurrent.reusePath));}
 else assert.equal(priorConcurrent,undefined);

 const file=join(output,'live-discovery-evidence.json'),intentFile=join(output,'live-discovery-intents.json');
 assert.ok(!existsSync(intentFile),'An uncertain batch must not be replaced');
 const proof={runId,scenario,scope:'simulated-qa coordinates; actual packaged signer + normal HTTPS authority. Not M03 GPS or native discovery UI acceptance. No territory/grid writes.',mode,m07BeforeSend,priorConcurrentEvidence:prior||null,cases:[],passed:false},intentions={runId,scenario,actions:{}};
 const safe=new Set(['CLOUD_DEVICE_KEY_UNAVAILABLE','DEVICE_KEY_CHANGED','LOCATION_SIGNATURE_INVALID','LOCATION_OWNER_MISMATCH','LOCATION_SCENARIO_MISMATCH','REAL_LOCATION_REQUIRED','GLOBAL_SERIAL_INVALID','CLOUD_PET_NOT_SYNCED','ENCOUNTER_EXPIRED','ROUND_CONFLICT','ACTION_ID_CONFLICT','AUTH_REQUIRED','SESSION_CHANGED','CLOUD_UNAVAILABLE','DISCOVERY_UNAVAILABLE','LOCATION_PROOF_EXPIRED','LOCATION_RATE_LIMITED','GLOBAL_SERIAL_SCOPE_REVOKED','GLOBAL_SERIAL_SCOPE_CONFLICT','SPAWN_EXPIRED','ENCOUNTER_PENDING','VICTORY_REQUIRED','TERRITORY_CONFLICT','SYNC_CONFLICT','REVISION_CONFLICT','PRECONDITION_UNRESOLVED','PRECONDITION_FOREIGN_VISIBLE_TERRITORY','PRECONDITION_NO_TARGET','PRECONDITION_TARGET_WINDOW_DEADLINE','DISCOVERY_TARGET_SCHEMA_INVALID','DISCOVERY_TARGET_CLOCK_UNCERTAIN','PRECONDITION_NOT_WON','PRECONDITION_FAILED']);
 const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));
 const id=key=>{assert.ok(!intentions.actions[key]);const value=randomUUID();intentions.actions[key]={actionId:value,submittedAt:new Date().toISOString()};writeFileSync(intentFile,JSON.stringify(intentions,null,2));return value;};
 async function step(name,coverage,work){const row={id:name,coverage,fullCasePassed:false,status:'running'};proof.cases.push(row);save();try{await assertActive();Object.assign(row,await work());row.status='passed-scoped';}catch(e){row.errorCode=safe.has(e?.code)?e.code:'ASSERTION_OR_STAGE_FAILED';row.status=row.errorCode.startsWith('PRECONDITION_')?'blocked':'failed';}save();}
 const fail=code=>{throw Object.assign(Error(),{code});};
 async function call(role,feature,command,payload={}){await assertActive();const r=await models[role].page.evaluate(x=>window.lingjing.invoke(x.feature,x.command,x.payload),{feature,command,payload});if(!r.ok)fail(r.code);return r.data;}
 async function cloud(op,input={}){await assertActive();return models.a.main(async(_e,x)=>{try{return {ok:true,data:await globalThis.__liveQaDiscovery.call(x.op,x.input)};}catch(e){return {ok:false,code:e.code};}},{op,input}).then(r=>{if(!r.ok)fail(r.code);return r.data;});}
 const pets=role=>call(role,'companions','list').then(x=>x.pets);
 let installed=false,ready=false,concurrency=false,observed,spawn,permit,session,captured,initialPets=[];
 try{
 await step('fixture-discovery-scope','Exact original devices/grant; no active or unresolved preceding battle; normal visible territory read, no grid writes',async()=>{
  for(const role of ['a','b']){const overview=await call(role,'battle','overview');if((overview.session&&!['finished','abandoned','cancelled','expired'].includes(overview.session.status))||overview.session?.pendingAction)fail('PRECONDITION_UNRESOLVED');}
  for(const role of ['a','b']){const s=await call(role,'accounts','session');assert.equal(s.currentUser?.id,expectedActors[role].ownerAccountId);assert.equal(s.currentUser?.authUserId,expectedActors[role].authUserId);assert.equal(s.currentUser?.authKind,'supabase');assert.equal(s.dataMode,'live');}
  if(prior){const originalActions=[];for(const [i,role]of ['a','b'].entries())originalActions.push(await readOriginalConcurrentAction(models[role],expectedActors[role],prior.actionIds[i],assertActive));proof.priorConcurrentReadback=verifyExistingConcurrentPets({a:await pets('a'),b:await pets('b')},expectedActors,prior,originalActions);concurrency=true;save();}
  await models.a.main((_e,target)=>{const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');const {AccountsService}=req('./apps/pc-app/runtime/features/accounts/service.cjs');const proto=AccountsService.prototype;
   if(globalThis.__liveQaDiscovery)throw Error('Duplicate discovery harness');const state={proto,original:proto.requireCloudActor,accounts:null};globalThis.__liveQaDiscovery=state;
   proto.requireCloudActor=async function(...args){const result=await state.original.apply(this,args);if(result.ownerAccountId===target.ownerAccountId&&result.deviceId===target.deviceId){state.accounts=this;proto.requireCloudActor=state.original;}return result;};
  },expectedActors.a);installed=true;
  initialPets=await pets('a');
  const initialized=await models.a.main(async({app,safeStorage},input)=>{
   const state=globalThis.__liveQaDiscovery;if(!state?.accounts)throw Error('Actual account capability not observed');state.proto.requireCloudActor=state.original;
   const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');const {CloudDiscoveryAuthority}=req('./apps/pc-app/runtime/features/discovery/cloud-adapter.cjs');const {CloudLocationProofs}=req('./apps/pc-app/runtime/features/discovery/cloud-location.cjs');
   let failNearby=false,blockedNearby=0;
   const authority=new CloudDiscoveryAuthority({requireActor:async()=>{const context=await state.accounts.requireCloudActor();return {...context,invoke:async(feature,body)=>{if(failNearby&&feature==='discovery'&&body?.op==='nearby'){failNearby=false;blockedNearby++;throw Object.assign(Error('Controlled before-send request failure'),{code:'CLOUD_UNAVAILABLE'});}return context.invoke(feature,body);}};}});
   state.armNearbyFailure=()=>{if(failNearby)throw Error('Fault already armed');failNearby=true;};state.faultStatus=()=>({armed:failNearby,blocked:blockedNearby});state.disarmNearbyFailure=()=>{const status=state.faultStatus();failNearby=false;return status;};
   let point={lat:45.3001,lng:70.1001};const proofs=new CloudLocationProofs({authority,getFix:()=>({...point,coordinateSystem:'wgs84',source:'simulated',provider:'qa-discovery',scenarioId:input.scenario,accuracyMeters:5,timestampMs:Date.now()}),safeStorage,userData:app.getPath('userData')});
   const requests=new Map();
   async function gate(){const actor=await authority.getActor();for(const key of ['ownerAccountId','authUserId','deviceId'])if(actor[key]!==input.actor[key])throw Object.assign(Error(),{code:'SESSION_CHANGED'});const context=await state.accounts.requireCloudActor();const policy=await context.invoke('discovery',{op:'protocol'});if(!policy.simulatedLocationAllowed||policy.scenarioId!==input.scenario)throw Object.assign(Error(),{code:'GLOBAL_SERIAL_SCOPE_REVOKED'});}
   state.clear=()=>{failNearby=false;proofs.clear();authority.clear();requests.clear();};
   state.call=async(op,arg)=>{await gate();
    if(op==='territories')return state.accounts.cloudInvoke('territory-sync',{op:'snapshot'});
    if(op==='nearby'){const p=await proofs.prove('discover','');return authority.invoke('nearby',{proofId:p.id});}
    if(op==='position'){if(!Number.isFinite(arg.lat)||!Number.isFinite(arg.lng)||Math.abs(arg.lat)>90||Math.abs(arg.lng)>180)throw Error('Invalid synthetic position');point={lat:arg.lat,lng:arg.lng};return {source:'simulated',scenarioId:input.scenario};}
    if(op==='observe'){const p=await proofs.prove('discover','');return authority.observe({spawnId:arg.spawnId,proofId:p.id});}
    if(op==='reserve'||op==='confirm'){
     let body=requests.get(arg.actionId);if(!body){const p=await proofs.prove(op==='reserve'?'begin':'capture',op==='reserve'?arg.spawnId:arg.permitId);body={...arg,proofId:p.id};requests.set(arg.actionId,{op,body,input:JSON.stringify(arg)});}else{if(body.op!==op||body.input!==JSON.stringify(arg))throw Error('Intent changed');body=body.body;}
     return authority.invoke(op,body);
    }
    if(op==='session')return authority.sessionFor(arg.permitId);
    if(op==='act')return authority.act(arg);
    if(op==='captures')return authority.captures();
    if(op==='permits')return authority.invoke('permits');
    throw Error('Operation not allowed');
   };
   await gate();return {ready:true,source:'simulated',scenarioId:input.scenario};
  },{scenario,actor:expectedActors.a});assert.equal(initialized.ready,true);
  const territory=await cloud('territories');const allowed=new Set([expectedActors.a.ownerAccountId,expectedActors.b.ownerAccountId]);
  const visible=territory.snapshot?.territories||territory.territories||[];
  if(visible.some(t=>t.scenarioId===scenario&&t.ownerAccountId&&!allowed.has(t.ownerAccountId)))fail('PRECONDITION_FOREIGN_VISIBLE_TERRITORY');
  const permits=await cloud('permits');
  if(permits.some(x=>['active','won'].includes(x.status)||x.session?.status==='active'||x.session?.pendingAction))fail('PRECONDITION_UNRESOLVED');ready=true;
  return {source:'simulated',namespace:`qa:${scenario}`,visibleTerritoryCount:visible.length,territoryWrites:0,territoryCoverage:'Visible snapshot only, not a whole-grid occupancy claim; no territory mutation is issued.'};
 });
 if(mode==='full')await step('C11-concurrent-create','Two owners concurrently submit original same-template intentions; replay both original action IDs, no replacement intentions',async()=>{
  if(!ready)fail('PRECONDITION_FAILED');const templateId='animal-wood-deer';const before=[...await pets('a'),...await pets('b')].filter(p=>p.templateId===templateId);const max=before.reduce((n,p)=>BigInt(p.globalSerial)>n?BigInt(p.globalSerial):n,0n);
  const inputs=Object.fromEntries(['a','b'].map(role=>[role,{actionId:id(`concurrent:${role}`),templateId,name:'云端编号验收',showOnDesktop:false}]));
  const results=await Promise.allSettled(['a','b'].map(role=>call(role,'companions','adopt',inputs[role])));
  assert.ok(results.every(r=>r.status==='fulfilled'),'Unknown creation outcomes must retain original IDs');
  const created=results.map(r=>r.value.pet);assert.equal(new Set(created.map(p=>p.petId)).size,2);
  for(const [i,role]of ['a','b'].entries()){const again=await call(role,'companions','adopt',inputs[role]);assert.equal(again.pet.petId,created[i].petId);}
  const after=[...await pets('a'),...await pets('b')].filter(p=>p.templateId===templateId);assert.equal(after.length,before.length+2);const numbers=created.map(p=>BigInt(after.find(q=>q.petId===p.petId).globalSerial)).sort((a,b)=>a<b?-1:1);assert.deepEqual(numbers,[max+1n,max+2n]);concurrency=true;
  return {templateId,priorHighest:String(max),newNumbers:numbers.map(String),actionIds:Object.values(inputs).map(x=>x.actionId),uniqueInstances:2,replayedOriginals:true};
 });
 if(m07BeforeSend)await step('M07-discovery-before-send-api','One exact authenticated discovery nearby invocation rejected before send, then original signer and real authority recovery. API-only, not UI/GPS/full M07.',async()=>{
  if(!ready)fail('PRECONDITION_FAILED');const beforePets={a:await pets('a'),b:await pets('b')},beforeCaptures=await cloud('captures'),beforePermits=await cloud('permits');
  const baseline=await cloud('nearby');assert.equal(baseline.source,'simulated');assert.equal(baseline.scenarioId,scenario);
  await models.a.main(()=>{globalThis.__liveQaDiscovery.armNearbyFailure();return true;});
  let failed=false,fault;try{await cloud('nearby');}catch(error){assert.equal(error.code,'CLOUD_UNAVAILABLE');failed=true;}finally{fault=await models.a.main(()=>globalThis.__liveQaDiscovery.disarmNearbyFailure());}assert.equal(failed,true);
  assert.deepEqual(fault,{armed:false,blocked:1});
  const restored=await cloud('nearby');assert.equal(restored.source,'simulated');assert.equal(restored.scenarioId,scenario);assert.ok(Array.isArray(restored.spawns));
  assert.deepEqual(await cloud('captures'),beforeCaptures);assert.deepEqual(await cloud('permits'),beforePermits);
  assert.deepEqual({a:await pets('a'),b:await pets('b')},beforePets);
  return {beforeSendBlockedExactlyOnce:true,normalSignedRequestRecovered:true,syntheticFailureResponse:false,gameplayEffectsUnchanged:true,locationProofAuditMayBeAdded:true,baselineCount:baseline.spawns.length,restoredCount:restored.spawns.length,nativeUi:false,uncovered:['actual UI error and stale-location presentation','OS GPS','committed response loss']};
 });
 await step('C11-observe-stability','Server encounter allocation, fresh nearby refresh and away/back synthetic position retain original wild number',async()=>{
  if(!ready||!concurrency)fail('PRECONDITION_FAILED');
  proof.targetWindowObservations=[];
  for(let attempt=0;attempt<2;attempt++){
   const requestedAt=Date.now(),nearby=await cloud('nearby'),receivedAt=Date.now();assert.equal(nearby.source,'simulated');assert.equal(nearby.scenarioId,scenario);
   const plan=planTargetWindow(nearby,{requestedAt,receivedAt,deadline:businessDeadline});proof.targetWindowObservations.push(plan.observation);save();
   if(plan.selected){spawn=plan.selected;break;}
   if(!plan.waitMs||attempt===1)fail('PRECONDITION_NO_TARGET');
   await waitTargetWindow(plan.waitMs,{deadline:businessDeadline,assertActive});
  }
  if(!spawn)fail('PRECONDITION_NO_TARGET');
  await cloud('position',spawn.position);observed=await cloud('observe',{spawnId:spawn.id});assert.equal(observed.namespace,`qa:${scenario}`);assert.equal(observed.source,'simulated');assert.equal(observed.scenarioId,scenario);assert.equal(observed.templateId,spawn.templateId);
  const own=[...await pets('a'),...await pets('b')].filter(p=>p.templateId===spawn.templateId);const max=own.reduce((n,p)=>BigInt(p.globalSerial)>n?BigInt(p.globalSerial):n,0n);assert.equal(BigInt(observed.globalSerial),max+1n);
  let refreshed=await cloud('nearby');assert.equal(refreshed.spawns.find(s=>s.id===spawn.id)?.globalSerial,observed.globalSerial);
  await cloud('position',{lat:spawn.position.lat+.018,lng:spawn.position.lng+.018});await cloud('nearby');await cloud('position',spawn.position);
  refreshed=await cloud('nearby');assert.equal(refreshed.spawns.find(s=>s.id===spawn.id)?.globalSerial,observed.globalSerial);const again=await cloud('observe',{spawnId:spawn.id});assert.equal(again.globalSerial,observed.globalSerial);
  return {spawnId:spawn.id,templateId:spawn.templateId,globalSerial:observed.globalSerial,priorOwnedHighest:String(max),sameNumberAfterFreshProofAndReturn:true};
 });
 await step('C11-wild-capture','Normal server reserve/rounds/natural victory/capture, original confirm replay preserves encounter serial; no fabricated victory',async()=>{
  if(proof.cases.find(x=>x.id==='C11-observe-stability')?.status!=='passed-scoped')fail('PRECONDITION_FAILED');
  const owned=await pets('a');const pet=owned.find(p=>p.templateId==='animal-wood-deer');assert.ok(pet);const reserve={spawnId:spawn.id,petId:pet.petId,actionId:id('wild:reserve')};permit=await cloud('reserve',reserve);assert.ok(permit.id);session=await cloud('session',{permitId:permit.id});assert.equal(session.enemy.globalSerial,observed.globalSerial);
  for(let n=0;n<80&&session.status==='active';n++){const input={permitId:permit.id,action:session.snapshot.player.anger>=(session.rules?.ultimateAnger||60)?'ultimate':'normal_attack',expectedRound:session.snapshot.round+1,actionId:id(`wild:round:${session.snapshot.round+1}`)};session=await cloud('act',input);}
  assert.equal(session.status,'finished');if(session.winner!=='player')fail('PRECONDITION_NOT_WON');
  const request={permitId:permit.id,name:'云端相遇验收',actionId:id('wild:confirm')};captured=await cloud('confirm',request);const again=await cloud('confirm',request);assert.equal(again.petId,captured.petId);assert.equal(captured.globalSerial,observed.globalSerial);
  const after=await pets('a');const instance=after.find(p=>p.petId===captured.petId);assert.ok(instance);assert.equal(instance.globalSerial,observed.globalSerial);assert.equal(after.filter(p=>p.petId===captured.petId).length,1);assert.equal(instance.templateId,spawn.templateId);
  const captures=await cloud('captures');assert.equal(captures.filter(c=>c.petId===captured.petId).length,1);
  return {spawnId:spawn.id,petId:captured.petId,globalSerial:instance.globalSerial,permitId:permit.id,rounds:session.snapshot.round,replayedOriginalConfirm:true,source:'simulated-qa',nativeUi:false};
 });
 }finally{if(installed){await models.a.main(()=>{const state=globalThis.__liveQaDiscovery;if(state){state.proto.requireCloudActor=state.original;state.clear?.();delete globalThis.__liveQaDiscovery;}return true;});}}
 proof.passed=proof.cases.length===(mode==='full'?4:3)+(m07BeforeSend?1:0)&&proof.cases.every(x=>x.status==='passed-scoped');proof.completedAt=new Date().toISOString();save();return proof;
}
