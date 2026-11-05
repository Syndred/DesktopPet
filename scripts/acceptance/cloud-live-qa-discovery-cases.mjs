// Granted synthetic coordinates, real signed location receipts and normal cloud APIs.
// Never OS location, SQL, territory mutation, fabricated battle or a new namespace.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {planTargetWindow,waitTargetWindow} from './cloud-live-qa-target-window.mjs';

const c11Identifier=value=>typeof value==='string'&&/^[A-Za-z0-9:_-]{1,180}$/.test(value);
export function captureIdentityTuple(pet,owner){
 assert.ok(c11Identifier(owner));assert.equal(pet?.ownerAccountId,owner);
 for(const key of ['petId','templateId'])assert.ok(c11Identifier(pet[key]));
 assert.equal(typeof pet.globalSerial,'string');assert.match(pet.globalSerial,/^[1-9][0-9]*$/);
 return {ownerAccountId:owner,petId:pet.petId,templateId:pet.templateId,globalSerial:pet.globalSerial};
}
export function assertCapturedIdentity(expected,pet){assert.deepEqual(captureIdentityTuple(pet,expected.ownerAccountId),expected);return true;}

// This public status command does not perform a refresh. lastCloudCheckedAt is
// advanced by the product's automatic-sync completion, not companions.list.
export function automaticCaptureCheckpoint(before,after,confirmedAt,now=Date.now()){
 assert.ok(Number.isSafeInteger(confirmedAt)&&Number.isSafeInteger(now)&&now>=confirmedAt);
 for(const state of [before,after]){
  assert.equal(state?.mode,'cloud-authority');assert.equal(typeof state.running,'boolean');
  assert.ok(Number.isSafeInteger(state.pending)&&state.pending>=0);assert.ok(Array.isArray(state.domainStates));
  assert.ok(state.lastCloudCheckedAt===null||typeof state.lastCloudCheckedAt==='string'&&Number.isFinite(Date.parse(state.lastCloudCheckedAt)));
 }
 const old=before.lastCloudCheckedAt===null?-Infinity:Date.parse(before.lastCloudCheckedAt),checked=Date.parse(after.lastCloudCheckedAt);
 const domains=after.domainStates.filter(row=>row.domain==='companions');assert.equal(domains.length,1);
 const domain=domains[0];assert.ok(Number.isSafeInteger(domain.pending)&&domain.pending>=0);
 return !after.running&&after.pending===0&&checked>old&&checked>confirmedAt&&checked<=now
  &&domain.checkedAt===after.lastCloudCheckedAt&&domain.status==='ready'&&domain.pending===0&&!domain.error&&!domain.metadataWarning;
}

// DOM only: no IPC, React internals, refresh, selection or business action.
export function readC11UiSample({route,view,petId,sessionId}){
 const visible=el=>Boolean(el&&el.getClientRects().length&&el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
 const all=(selector,root=document)=>[...root.querySelectorAll(selector)].filter(visible);
 const roots=all('.app-page-motion[data-current-route="true"]'),root=roots.length===1?roots[0]:null;
 const inside=selector=>root?all(selector,root):[],text=el=>el?.textContent?.trim()??null;
 const roster=inside('.cp-pet-card').map(el=>({petId:el.getAttribute('data-pet-id'),numbers:all('.cp-instance-identity code',el).map(text)}));
 const details=inside('.cp-detail-layout').filter(el=>el.getAttribute('data-pet-id')===petId);
 const battles=inside('.battle-screen'),battle=battles.length===1?battles[0]:null;
 const enemy=battle?all('.combatant-status.enemy',battle):[];
 return {routeMatches:location.hash==='#'+route,currentRouteCount:roots.length,currentRouteMatches:root?.getAttribute('data-route-key')===route,
  visibleAlertCount:inside('[role="alert"]').length,openingCount:inside('.opening-state').length,
  surfaceReady:view==='roster'?inside('.cp-roster').length===1:view==='detail'?details.length===1:view==='battle'?battles.length===1:false,
  roster,detailCount:details.length,detailNumbers:details.length===1?all('.cp-detail-copy .cp-instance-identity code',details[0]).map(text):[],
  battleCount:battles.length,battleMatches:Boolean(battle&&battle.getAttribute('data-session-id')===sessionId&&battle.getAttribute('data-battle-mode')==='wild'),
  enemyPetIds:enemy.length===1?all('.battle-portrait[data-pet-id]',enemy[0]).map(el=>el.getAttribute('data-pet-id')):[],
  enemyNumbers:enemy.length===1?all('.battle-identity-number',enemy[0]).map(text):[]};
}
export function validateC11UiSample(sample,{view,petId,globalSerial,enemyPetId}={}){
 assert.ok(sample&&typeof sample==='object');
 for(const key of ['currentRouteCount','visibleAlertCount','openingCount','detailCount','battleCount'])assert.ok(Number.isSafeInteger(sample[key])&&sample[key]>=0);
 for(const key of ['routeMatches','currentRouteMatches','surfaceReady','battleMatches'])assert.equal(typeof sample[key],'boolean');
 for(const key of ['roster','detailNumbers','enemyPetIds','enemyNumbers'])assert.ok(Array.isArray(sample[key]));
 assert.equal(sample.visibleAlertCount,0,'A failed page cannot establish identity');
 assert.equal(new Set(sample.roster.map(row=>row.petId)).size,sample.roster.length,'Duplicate visible pet cards');
 if(!sample.routeMatches||sample.currentRouteCount!==1||!sample.currentRouteMatches||!sample.surfaceReady||sample.openingCount)return false;
 if(view==='roster'&&!petId)return sample.roster.length>0&&sample.battleCount===0;
 assert.ok(typeof globalSerial==='string'&&/^[1-9][0-9]*$/.test(globalSerial));const expected='编号 '+globalSerial.padStart(4,'0');
 const exact=values=>values.length===1&&values[0]===expected;
 if(view==='roster'){const rows=sample.roster.filter(row=>row.petId===petId);return rows.length===1&&exact(rows[0].numbers);}
 if(view==='detail')return sample.detailCount===1&&exact(sample.detailNumbers);
 if(view==='battle')return sample.battleCount===1&&sample.battleMatches&&sample.enemyPetIds.length===1&&sample.enemyPetIds[0]===enemyPetId&&exact(sample.enemyNumbers);
 assert.fail('Unknown C11 public surface');
}
export async function observeC11PublicUi({page,active,until,checkpoint,route,view,petId,globalSerial,sessionId,enemyPetId,navigate=true}){
 assert.ok(['/companions',petId&&'/companions/'+petId,sessionId&&'/battle/session/'+sessionId].filter(Boolean).includes(route));
 if(petId)assert.ok(c11Identifier(petId));if(sessionId)assert.ok(c11Identifier(sessionId));
 if(navigate){await active();await page.evaluate(path=>{location.hash='#'+path;},route);}
 let ready=0,samples=0,last;
 await until(async()=>{await active();last=await page.evaluate(readC11UiSample,{route,view,petId,sessionId});samples++;
  ready=validateC11UiSample(last,{view,petId,globalSerial,enemyPetId})?ready+1:0;checkpoint({route,view,samples,readySamples:ready});return ready;
 },n=>n>=2);
 return {route,view,samples,readySamples:ready,rosterPetIds:last.roster.map(row=>row.petId),readOnly:true};
}
export async function observeC11AutomaticCapture({model,baseline,tuple,confirmedAt,active,until,checkpoint}){
 captureIdentityTuple(tuple,tuple.ownerAccountId);assert.equal(baseline.route,'/companions');
 assert.ok(Array.isArray(baseline.petIds)&&!baseline.petIds.includes(tuple.petId),'Captured pet must be absent from the original A2 list');
 let ready=0,samples=0,last;
 await until(async()=>{
  await active();const ui=await model.page.evaluate(readC11UiSample,{route:'/companions',view:'roster',petId:tuple.petId});
  // Never repair a changed route by navigating or invoke list/get/syncNow here.
  assert.equal(ui.routeMatches,true,'C11_AUTOMATIC_ROUTE_CHANGED');
  const status=await model.call('accounts','syncStatus');await active();samples++;
  const complete=validateC11UiSample(ui,{view:'roster',...tuple})&&automaticCaptureCheckpoint(baseline.status,status,confirmedAt);
  ready=complete?ready+1:0;last={checkedAt:status.lastCloudCheckedAt,running:status.running,pending:status.pending};checkpoint({...last,samples,readySamples:ready});return ready;
 },n=>n>=2,90000);
 return {...last,samples,readySamples:ready,originalPageRetained:true,automaticCheckpointAfterCapture:true,manualRefreshUsed:false,realtimeOnly:false};
}

// The existing fixed holder owns this capability. Only public identity fields
// and the read-only local identity projection leave its main process.
export function readC11HeldIdentity({app},{expected,role,profile,petId=null}){
 const h=globalThis.__qaUiCaseContext,a=h?.accounts,fs=process.getBuiltinModule('node:fs');
 const fail=()=>{throw Object.assign(Error('C11 current held identity required'),{code:'SESSION_CHANGED'});};
 if(!h||!a||h.released!==true||!Number.isSafeInteger(h.epoch)||h.epoch!==a.epoch||!Number.isSafeInteger(h.expiresAt)||h.expiresAt<=Date.now()
  ||h.binding?.role!==role||h.binding?.profile!==profile||h.binding?.owner!==expected.ownerAccountId||h.binding?.deviceId!==expected.deviceId)fail();
 if(fs.realpathSync.native(app.getPath('userData'))!==fs.realpathSync.native(profile))fail();
 const session=a.session();if(session.currentUser?.id!==expected.ownerAccountId||session.currentUser?.authUserId!==expected.authUserId||session.currentUser?.authKind!=='supabase'||session.dataMode!=='live'||a.remote.deviceId!==expected.deviceId)fail();
 const binding={ownerAccountId:expected.ownerAccountId,authUserId:expected.authUserId,deviceId:expected.deviceId};
 if(petId===null)return binding;
 const pet=a.services.get('companions').readIdentityPet(expected.ownerAccountId,petId);
 return {ownerAccountId:pet.ownerAccountId,petId:pet.petId,templateId:pet.templateId,globalSerial:pet.globalSerial};
}
export function wildSessionCheckpoint(session,{permitId,spawnId,templateId,globalSerial,playerPetId,ownerAccountId,scenario}){
 assert.ok(typeof globalSerial==='string'&&/^[1-9][0-9]*$/.test(globalSerial));
 assert.equal(session?.id,'battle-cloud-'+permitId);assert.equal(session.mode,'wild');assert.equal(session.status,'active');assert.ok(!session.pendingAction);
 assert.equal(session.player?.petId,playerPetId);assert.equal(session.player?.ownerAccountId,ownerAccountId);
 assert.equal(session.enemy?.petId,spawnId);assert.equal(session.enemy?.templateId,templateId);assert.equal(session.enemy?.globalSerial,globalSerial);
 assert.equal(session.context?.permitId,permitId);assert.equal(session.context?.cloudAuthority,'discovery');assert.equal(session.context?.authority,'simulated');assert.equal(session.context?.scenarioId,scenario);
 assert.equal(session.context?.inputSource,'simulated');assert.ok(Number.isSafeInteger(session.revision)&&session.revision>0);
 assert.ok(Number.isSafeInteger(session.snapshot?.round)&&session.snapshot.round>=0&&Array.isArray(session.rounds));
 return {id:session.id,revision:session.revision,status:session.status,winner:session.winner,snapshot:session.snapshot,rounds:session.rounds,
  playerPetId,ownerAccountId,spawnId,templateId,globalSerial,context:session.context};
}
export async function relaunchC11OriginalProfile({models,expectedActor,relaunch,cleanup,active}){
 const previous=models.a;assert.ok(previous&&typeof previous.profile==='string'&&Number.isSafeInteger(previous.epoch));
 await active();assert.equal(await cleanup(),true,'C11_DISCOVERY_CLEANUP_REQUIRED');await active();
 const next=await relaunch('a');assert.equal(models.a,next,'Current holder registry required');assert.notEqual(next,previous);
 assert.equal(next.profile,previous.profile,'Original A profile required');assert.equal(next.epoch,previous.epoch+1);
 for(const key of ['ownerAccountId','authUserId','deviceId'])assert.equal(next.actor?.[key],expectedActor[key]);
 await active();return {sameOriginalProfile:true,sameOriginalDevice:true,previousEpoch:previous.epoch,epoch:next.epoch,holderRelaunch:true,cleanExitWithoutForceVerified:false};
}

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
export async function runCloudLiveQaDiscoveryCases({models,expectedActors,relaunch,assertActive,scenario,runId,output,businessDeadline,mode='full',priorConcurrent,m07BeforeSend=false}){
 assert.ok(['full','wild-only'].includes(mode));assert.equal(typeof m07BeforeSend,'boolean');
 assert.equal(typeof assertActive,'function');assert.equal(typeof relaunch,'function');
 assert.ok(Number.isSafeInteger(businessDeadline)&&businessDeadline>Date.now(),'Verified holder business deadline required');
 assert.equal(expectedActors.a.ownerAccountId,expectedActors.a2.ownerAccountId);assert.equal(expectedActors.a.authUserId,expectedActors.a2.authUserId);
 assert.notEqual(expectedActors.a.ownerAccountId,expectedActors.b.ownerAccountId);assert.notEqual(expectedActors.a.deviceId,expectedActors.a2.deviceId);
 assert.ok(models.a.profile&&models.a2.profile&&models.a.profile!==models.a2.profile);
 let prior;if(mode==='wild-only'){assert.ok(typeof priorConcurrent?.path==='string'&&typeof priorConcurrent.reusePath==='string');prior=verifyPriorConcurrentEvidence(readFileSync(priorConcurrent.path),priorConcurrent,scenario,readFileSync(priorConcurrent.reusePath));}
 else assert.equal(priorConcurrent,undefined);

 const file=join(output,'live-discovery-evidence.json'),intentFile=join(output,'live-discovery-intents.json');
 assert.ok(!existsSync(intentFile),'An uncertain batch must not be replaced');
 const proof={runId,scenario,scope:'simulated-qa coordinates; actual packaged signer + normal HTTPS authority. Read-only public numbering, original wild-session navigation, A2 automatic-sync checkpoint and fixed-profile A relaunch only. Not M03 GPS or full native discovery acceptance. No territory/grid writes.',mode,m07BeforeSend,priorConcurrentEvidence:prior||null,cases:[],passed:false,fullCasePassed:false,
  uncovered:['Real-cloud same-profile account A to B to A transition','Independent other-template sequence start/increment','Realtime-only automatic propagation','Clean app exit without taskkill fallback']},intentions={runId,scenario,actions:{}};
 const safe=new Set(['CLOUD_DEVICE_KEY_UNAVAILABLE','DEVICE_KEY_CHANGED','LOCATION_SIGNATURE_INVALID','LOCATION_OWNER_MISMATCH','LOCATION_SCENARIO_MISMATCH','REAL_LOCATION_REQUIRED','GLOBAL_SERIAL_INVALID','CLOUD_PET_NOT_SYNCED','ENCOUNTER_EXPIRED','ROUND_CONFLICT','ACTION_ID_CONFLICT','AUTH_REQUIRED','SESSION_CHANGED','CLOUD_UNAVAILABLE','DISCOVERY_UNAVAILABLE','LOCATION_PROOF_EXPIRED','LOCATION_RATE_LIMITED','GLOBAL_SERIAL_SCOPE_REVOKED','GLOBAL_SERIAL_SCOPE_CONFLICT','SPAWN_EXPIRED','ENCOUNTER_PENDING','VICTORY_REQUIRED','TERRITORY_CONFLICT','SYNC_CONFLICT','REVISION_CONFLICT','PRECONDITION_UNRESOLVED','PRECONDITION_FOREIGN_VISIBLE_TERRITORY','PRECONDITION_NO_TARGET','PRECONDITION_TARGET_WINDOW_DEADLINE','DISCOVERY_TARGET_SCHEMA_INVALID','DISCOVERY_TARGET_CLOCK_UNCERTAIN','PRECONDITION_NOT_WON','PRECONDITION_FAILED']);
 const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));
 const id=key=>{assert.ok(!intentions.actions[key]);const value=randomUUID();intentions.actions[key]={actionId:value,submittedAt:new Date().toISOString()};writeFileSync(intentFile,JSON.stringify(intentions,null,2));return value;};
 let currentRow=null;
 async function step(name,coverage,work){const row={id:name,coverage,fullCasePassed:false,status:'running'};proof.cases.push(row);currentRow=row;save();try{await active();Object.assign(row,await work());row.status='passed-scoped';}catch(e){row.errorCode=safe.has(e?.code)?e.code:'ASSERTION_OR_STAGE_FAILED';row.status=row.errorCode.startsWith('PRECONDITION_')?'blocked':'failed';}finally{save();currentRow=null;}}
 const fail=code=>{throw Object.assign(Error(),{code});};
 safe.add('C11_READBACK_TIMEOUT');safe.add('PRECONDITION_C11_DEADLINE');
 async function active(){await assertActive();if(Date.now()>=businessDeadline)fail('PRECONDITION_C11_DEADLINE');}
 async function call(role,feature,command,payload={}){await active();const r=await models[role].page.evaluate(x=>window.lingjing.invoke(x.feature,x.command,x.payload),{feature,command,payload});if(!r.ok)fail(r.code);return r.data;}
 async function cloud(op,input={}){await active();return models.a.main(async(_e,x)=>{try{return {ok:true,data:await globalThis.__liveQaDiscovery.call(x.op,x.input)};}catch(e){return {ok:false,code:e.code};}},{op,input}).then(r=>{if(!r.ok)fail(r.code);return r.data;});}
 const pets=role=>call(role,'companions','list').then(x=>x.pets);
 const mark=(stage,observation)=>{if(currentRow){currentRow.substage=stage;if(observation)currentRow.lastReadOnlyObservation=observation;}save();};
 async function until(read,accept,timeout=25000){const end=Math.min(businessDeadline,Date.now()+timeout);while(Date.now()<end){await active();const value=await read();await active();if(accept(value))return value;await new Promise(r=>setTimeout(r,Math.min(250,Math.max(0,end-Date.now()))));}await active();fail('C11_READBACK_TIMEOUT');}
 async function localIdentity(role,petId=null){await active();return models[role].main(readC11HeldIdentity,{role,profile:models[role].profile,expected:expectedActors[role],petId});}
 async function ui(role,stage,input){mark(stage);return observeC11PublicUi({page:models[role].page,active,until,checkpoint:v=>mark(stage,v),...input});}
 async function shot(role,name,selector){await active();if(selector)await models[role].page.locator(selector).scrollIntoViewIfNeeded({timeout:10000});await active();await models[role].page.screenshot({path:join(output,name),timeout:10000});(proof.screenshots??=[]).push(name);save();}
 let installed=false,installedModel=null,ready=false,concurrency=false,observed,spawn,permit,session,captured;
 async function cleanupDiscovery(){
  if(!installed)return true;
  try{const cleaned=await installedModel.main(()=>{const state=globalThis.__liveQaDiscovery;if(!state)throw Error('Original discovery hook missing');state.proto.requireCloudActor=state.original;state.clear?.();if(state.proto.requireCloudActor!==state.original)throw Error('Discovery hook not restored');delete globalThis.__liveQaDiscovery;return !globalThis.__liveQaDiscovery;});
   assert.equal(cleaned,true);installed=false;proof.cleanup={discoveryHarness:true};save();return true;
  }catch(error){proof.cleanup={discoveryHarness:false};save();throw error;}
 }
 try{
 await step('fixture-discovery-scope','Exact original devices/grant; no active or unresolved preceding battle; normal visible territory read, no grid writes',async()=>{
  for(const role of ['a','b']){const overview=await call(role,'battle','overview');if((overview.session&&!['finished','abandoned','cancelled','expired'].includes(overview.session.status))||overview.session?.pendingAction)fail('PRECONDITION_UNRESOLVED');}
  for(const role of ['a','a2','b']){const s=await call(role,'accounts','session');assert.equal(s.currentUser?.id,expectedActors[role].ownerAccountId);assert.equal(s.currentUser?.authUserId,expectedActors[role].authUserId);assert.equal(s.currentUser?.authKind,'supabase');assert.equal(s.dataMode,'live');const status=await call(role,'accounts','syncStatus');if(status.pending!==0)fail('PRECONDITION_UNRESOLVED');}
  for(const role of ['a','a2'])assert.deepEqual(await localIdentity(role),expectedActors[role]);
  if(prior){const originalActions=[];for(const [i,role]of ['a','b'].entries())originalActions.push(await readOriginalConcurrentAction(models[role],expectedActors[role],prior.actionIds[i],active));proof.priorConcurrentReadback=verifyExistingConcurrentPets({a:await pets('a'),b:await pets('b')},expectedActors,prior,originalActions);concurrency=true;save();}
  await models.a.main((_e,target)=>{const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');const {AccountsService}=req('./apps/pc-app/runtime/features/accounts/service.cjs');const proto=AccountsService.prototype;
   if(globalThis.__liveQaDiscovery)throw Error('Duplicate discovery harness');const state={proto,original:proto.requireCloudActor,accounts:null};globalThis.__liveQaDiscovery=state;
   proto.requireCloudActor=async function(...args){const result=await state.original.apply(this,args);if(result.ownerAccountId===target.ownerAccountId&&result.deviceId===target.deviceId){state.accounts=this;proto.requireCloudActor=state.original;}return result;};
  },expectedActors.a);installed=true;installedModel=models.a;
  await pets('a');
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
   await waitTargetWindow(plan.waitMs,{deadline:businessDeadline,assertActive:active});
  }
  if(!spawn)fail('PRECONDITION_NO_TARGET');
  await cloud('position',spawn.position);observed=await cloud('observe',{spawnId:spawn.id});assert.equal(observed.ownerAccountId,expectedActors.a.ownerAccountId);assert.equal(observed.namespace,`qa:${scenario}`);assert.equal(observed.source,'simulated');assert.equal(observed.scenarioId,scenario);assert.equal(observed.templateId,spawn.templateId);
  const own=[...await pets('a'),...await pets('b')].filter(p=>p.templateId===spawn.templateId);const max=own.reduce((n,p)=>BigInt(p.globalSerial)>n?BigInt(p.globalSerial):n,0n);assert.equal(BigInt(observed.globalSerial),max+1n);
  let refreshed=await cloud('nearby');assert.equal(refreshed.spawns.find(s=>s.id===spawn.id)?.globalSerial,observed.globalSerial);
  await cloud('position',{lat:spawn.position.lat+.018,lng:spawn.position.lng+.018});await cloud('nearby');await cloud('position',spawn.position);
  refreshed=await cloud('nearby');assert.equal(refreshed.spawns.find(s=>s.id===spawn.id)?.globalSerial,observed.globalSerial);const again=await cloud('observe',{spawnId:spawn.id});assert.equal(again.globalSerial,observed.globalSerial);
  return {spawnId:spawn.id,templateId:spawn.templateId,preferredTemplate:'animal-wood-deer',fallbackTemplateUsed:spawn.templateId!=='animal-wood-deer',independentOtherTemplateSequenceVerified:false,globalSerial:observed.globalSerial,priorOwnedHighest:String(max),sameNumberAfterFreshProofAndReturn:true};
 });
 await step('C11-wild-capture','Original server reserve/rounds/natural victory/capture and confirm replay; read-only original battle page return, A2 automatic sync and original A profile restart preserve exact captured identity',async()=>{
  if(proof.cases.find(x=>x.id==='C11-observe-stability')?.status!=='passed-scoped')fail('PRECONDITION_FAILED');
  const owned=await pets('a');const pet=owned.find(p=>p.templateId==='animal-wood-deer');assert.ok(pet);const reserve={spawnId:spawn.id,petId:pet.petId,actionId:id('wild:reserve')};permit=await cloud('reserve',reserve);assert.equal(permit.ownerAccountId,expectedActors.a.ownerAccountId);assert.equal(permit.authUserId,expectedActors.a.authUserId);session=await cloud('session',{permitId:permit.id});assert.equal(session.enemy.globalSerial,observed.globalSerial);
  const binding={permitId:permit.id,spawnId:spawn.id,templateId:spawn.templateId,globalSerial:observed.globalSerial,playerPetId:pet.petId,ownerAccountId:expectedActors.a.ownerAccountId,scenario};
  const originalBattle=wildSessionCheckpoint(session,binding),battleUi={route:'/battle/session/'+session.id,view:'battle',sessionId:session.id,enemyPetId:spawn.id,globalSerial:observed.globalSerial};
  const navigation=[];navigation.push(await ui('a','original-wild-session-before-navigation',battleUi));await shot('a','C11-wild-session.png');
  navigation.push(await ui('a','leave-original-wild-page',{route:'/companions',view:'roster'}));
  navigation.push(await ui('a','return-original-wild-session',battleUi));
  session=await cloud('session',{permitId:permit.id});assert.deepEqual(wildSessionCheckpoint(session,binding),originalBattle);await shot('a','C11-wild-session-return.png');
  currentRow.originalBattleNavigation={sessionId:session.id,permitId:permit.id,navigation,sameRoundAndHistory:true,noCancelOrReplacementReserve:true};save();
  for(let n=0;n<80&&session.status==='active';n++){const input={permitId:permit.id,action:session.snapshot.player.anger>=(session.rules?.ultimateAnger||60)?'ultimate':'normal_attack',expectedRound:session.snapshot.round+1,actionId:id(`wild:round:${session.snapshot.round+1}`)};session=await cloud('act',input);}
  assert.equal(session.status,'finished');if(session.winner!=='player')fail('PRECONDITION_NOT_WON');
  const a2Roster=await ui('a2','a2-original-roster-before-confirm',{route:'/companions',view:'roster'}),a2Status=await until(()=>call('a2','accounts','syncStatus'),s=>s.pending===0&&!s.running);
  const baseline={route:a2Roster.route,petIds:a2Roster.rosterPetIds,status:a2Status};currentRow.a2Baseline={petIds:baseline.petIds,lastCloudCheckedAt:a2Status.lastCloudCheckedAt};save();
  const request={permitId:permit.id,name:'云端相遇验收',actionId:id('wild:confirm')};captured=await cloud('confirm',request);const confirmedAt=Date.now();
  currentRow.confirmedCapture={petId:captured.petId,permitId:permit.id,actionId:request.actionId,confirmedAt};save();
  const again=await cloud('confirm',request);assert.equal(again.petId,captured.petId);assert.equal(captured.globalSerial,observed.globalSerial);
  const after=await pets('a');const instance=after.find(p=>p.petId===captured.petId);assert.ok(instance);assert.equal(instance.globalSerial,observed.globalSerial);assert.equal(after.filter(p=>p.petId===captured.petId).length,1);assert.equal(instance.templateId,spawn.templateId);
  const captures=await cloud('captures');assert.equal(captures.filter(c=>c.petId===captured.petId).length,1);
  const tuple=captureIdentityTuple(instance,expectedActors.a.ownerAccountId);currentRow.capturedIdentity=tuple;save();
  mark('a2-automatic-capture-readback');currentRow.automaticSync=await observeC11AutomaticCapture({model:models.a2,baseline,tuple,confirmedAt,active,until,checkpoint:v=>mark('a2-automatic-capture-readback',v)});
  assertCapturedIdentity(tuple,await localIdentity('a2',tuple.petId));currentRow.automaticSync.sameLocalTuple=true;save();await shot('a2','C11-a2-auto-sync.png',`.cp-pet-card[data-pet-id="${tuple.petId}"]`);
  const publicIdentity=[];publicIdentity.push(await ui('a','captured-roster-number',{route:'/companions',view:'roster',...tuple}));await shot('a','C11-captured-list.png',`.cp-pet-card[data-pet-id="${tuple.petId}"]`);
  publicIdentity.push(await ui('a','captured-detail-number',{route:'/companions/'+tuple.petId,view:'detail',...tuple}));await shot('a','C11-captured-detail.png');
  assertCapturedIdentity(tuple,await localIdentity('a',tuple.petId));currentRow.publicIdentity=publicIdentity;save();
  mark('original-a-profile-relaunch');currentRow.restart=await relaunchC11OriginalProfile({models,expectedActor:expectedActors.a,relaunch,cleanup:cleanupDiscovery,active});save();
  // A's fresh normal renderer may perform its ordinary reads. No discovery
  // harness, credential injection or replacement profile is installed here.
  await ui('a','relaunch-original-capture-number',{route:'/companions',view:'roster',...tuple});assertCapturedIdentity(tuple,await localIdentity('a',tuple.petId));
  await shot('a','C11-a-relaunch.png',`.cp-pet-card[data-pet-id="${tuple.petId}"]`);currentRow.restart.sameLocalTupleAndVisibleNumber=true;save();
  return {spawnId:spawn.id,petId:captured.petId,globalSerial:instance.globalSerial,permitId:permit.id,rounds:session.snapshot.round,replayedOriginalConfirm:true,source:'simulated-qa',nativeUi:true,nativeUiScope:'Read-only numbering and original-session navigation only; reserve/rounds/confirm remain the original API flow'};
 });
 }finally{if(installed)try{await cleanupDiscovery();}catch{proof.cleanupErrors=[{component:'discoveryHarness',code:'C11_DISCOVERY_CLEANUP_FAILED'}];}}
 proof.passed=proof.cases.length===(mode==='full'?4:3)+(m07BeforeSend?1:0)&&proof.cases.every(x=>x.status==='passed-scoped')&&!proof.cleanupErrors?.length&&proof.cleanup?.discoveryHarness===true;proof.completedAt=new Date().toISOString();save();return proof;
}
