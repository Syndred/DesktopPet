import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {captureIdentityTuple,assertCapturedIdentity,automaticCaptureCheckpoint,readC11UiSample,validateC11UiSample,
 observeC11PublicUi,observeC11AutomaticCapture,readC11HeldIdentity,wildSessionCheckpoint,relaunchC11OriginalProfile,runCloudLiveQaDiscoveryCases} from './cloud-live-qa-discovery-cases.mjs';

const owner='account:owner-a',tuple={ownerAccountId:owner,petId:'pet-captured',templateId:'animal-wood-deer',globalSerial:'7'};
const actor={ownerAccountId:owner,authUserId:'auth-a',deviceId:'device-a'};
const time=Date.parse('2026-11-05T06:00:00Z');
const status=(at=time)=>({mode:'cloud-authority',running:false,pending:0,lastCloudCheckedAt:at===null?null:new Date(at).toISOString(),
 domainStates:[{domain:'companions',checkedAt:at===null?null:new Date(at).toISOString(),status:'ready',pending:0,error:null,metadataWarning:false}]});
const sample=(patch={})=>({routeMatches:true,currentRouteCount:1,currentRouteMatches:true,visibleAlertCount:0,openingCount:0,surfaceReady:true,
 roster:[{petId:tuple.petId,numbers:['编号 0007']}],detailCount:0,detailNumbers:[],battleCount:0,battleMatches:false,enemyPetIds:[],enemyNumbers:[],...patch});
const immediateUntil=async(read,accept)=>{for(let i=0;i<5;i++){const value=await read();if(accept(value))return value;}throw Object.assign(Error('Synthetic read timeout'),{code:'C11_READBACK_TIMEOUT'});};

test('captured tuple retains owner, exact instance, template and canonical arbitrary-width decimal',()=>{
 assert.deepEqual(captureIdentityTuple(tuple,owner),tuple);assert.equal(assertCapturedIdentity(tuple,{...tuple,name:'unrelated display name'}),true);
 for(const key of Object.keys(tuple))assert.throws(()=>assertCapturedIdentity(tuple,{...tuple,[key]:'other'}));
 for(const globalSerial of [7,7n,'07','0','-1','1.0','1e3','',undefined])assert.throws(()=>captureIdentityTuple({...tuple,globalSerial},owner));
 const large={...tuple,globalSerial:'90071992547409931234567890'};assert.deepEqual(captureIdentityTuple(large,owner),large);
 assert.throws(()=>captureIdentityTuple({...tuple,petId:'../other'},owner));
});

test('automatic checkpoint requires a new completed post-capture product sync, not a ready old cache',()=>{
 assert.equal(automaticCaptureCheckpoint(status(time),status(time+20),time+10,time+30),true);
 assert.equal(automaticCaptureCheckpoint(status(null),status(time+20),time+10,time+30),true);
 for(const at of [null,time,time+9,time+10,time+31])assert.equal(automaticCaptureCheckpoint(status(time),status(at),time+10,time+30),false);
 for(const patch of [{running:true},{pending:1},{domainStates:[{...status().domainStates[0],checkedAt:new Date(time+20).toISOString(),status:'partial'}]},
  {domainStates:[{...status(time+20).domainStates[0],checkedAt:new Date(time).toISOString()}]},
  {domainStates:[{...status(time+20).domainStates[0],pending:1}]},
  {domainStates:[{...status(time+20).domainStates[0],error:'CLOUD_UNAVAILABLE'}]},
  {domainStates:[{...status(time+20).domainStates[0],metadataWarning:true}]}])assert.equal(automaticCaptureCheckpoint(status(),{...status(time+20),...patch},time+10,time+30),false);
 for(const patch of [{mode:'simulated'},{running:undefined},{pending:NaN},{lastCloudCheckedAt:'invalid'},{domainStates:[]},{domainStates:[...status().domainStates,...status().domainStates]}])
  assert.throws(()=>automaticCaptureCheckpoint(status(),{...status(time+20),...patch},time+10,time+30));
});

test('public-number readiness rejects hidden/stale/loading/duplicate/mismatched identity surfaces',()=>{
 assert.equal(validateC11UiSample(sample(),{view:'roster',...tuple}),true);
 for(const patch of [{routeMatches:false},{currentRouteCount:0},{currentRouteCount:2},{currentRouteMatches:false},{surfaceReady:false},{openingCount:1},
  {roster:[]},{roster:[{petId:'other',numbers:['编号 0007']}]},{roster:[{petId:tuple.petId,numbers:['编号 7']}]},
  {roster:[{petId:tuple.petId,numbers:['编号 待同步']}]},{roster:[{petId:tuple.petId,numbers:['编号 0007','编号 0007']}]}])
  assert.equal(validateC11UiSample(sample(patch),{view:'roster',...tuple}),false);
 for(const patch of [{visibleAlertCount:1},{roster:[...sample().roster,...sample().roster]},{surfaceReady:undefined},{currentRouteCount:NaN}])
  assert.throws(()=>validateC11UiSample(sample(patch),{view:'roster',...tuple}));
 assert.equal(validateC11UiSample(sample({detailCount:1,detailNumbers:['编号 0007']}),{view:'detail',...tuple}),true);
 assert.equal(validateC11UiSample(sample({battleCount:1,battleMatches:true,enemyPetIds:['spawn-1'],enemyNumbers:['编号 0007']}),{view:'battle',enemyPetId:'spawn-1',...tuple}),true);
 for(const patch of [{battleMatches:false},{enemyPetIds:['wrong']},{enemyNumbers:['编号 0008']},{battleCount:2}])assert.equal(validateC11UiSample(sample({battleCount:1,battleMatches:true,enemyPetIds:['spawn-1'],enemyNumbers:['编号 0007'],...patch}),{view:'battle',enemyPetId:'spawn-1',...tuple}),false);
});

test('public UI observer only changes route and requires two consecutive ready DOM samples',async()=>{
 const calls=[];let reads=0;const page={async evaluate(fn,input){calls.push(input);if(typeof input==='string'){assert.match(fn.toString(),/location\.hash/);return;}assert.equal(fn,readC11UiSample);reads++;return sample({surfaceReady:reads>1});}};
 const result=await observeC11PublicUi({page,active:async()=>{},until:immediateUntil,checkpoint:()=>{},route:'/companions',view:'roster',...tuple});
 assert.equal(result.samples,3);assert.equal(result.readySamples,2);assert.equal(calls.filter(x=>typeof x==='string').length,1);
 await assert.rejects(observeC11PublicUi({page,active:async()=>{},until:immediateUntil,checkpoint:()=>{},route:'/companions/adopt',view:'roster',...tuple}));
 const never={async evaluate(fn,input){if(typeof input==='string')return;return sample({surfaceReady:false});}};
 await assert.rejects(observeC11PublicUi({page:never,active:async()=>{},until:immediateUntil,checkpoint:()=>{},route:'/companions',view:'roster',...tuple}),{code:'C11_READBACK_TIMEOUT'});
});

function autoHarness({ui=sample(),state=status(Date.now()-10),before=status(time),guard=async()=>{}}={}){
 const calls=[];return {calls,context:{model:{page:{async evaluate(fn,arg){assert.equal(fn,readC11UiSample);calls.push(['dom',arg]);return ui;}},async call(feature,command){calls.push([feature,command]);assert.equal(feature,'accounts');assert.equal(command,'syncStatus');return state;}},
  baseline:{route:'/companions',petIds:['pet-existing'],status:before},tuple,confirmedAt:time+10,active:guard,until:immediateUntil,checkpoint:()=>{}}};
}
test('A2 automatic observation invokes only DOM and syncStatus, never list/get/manual sync/navigation',async()=>{
 const h=autoHarness(),result=await observeC11AutomaticCapture(h.context);assert.equal(result.readySamples,2);assert.equal(result.originalPageRetained,true);assert.equal(result.manualRefreshUsed,false);assert.equal(result.realtimeOnly,false);
 assert.deepEqual(h.calls.map(x=>x[0]),['dom','accounts','dom','accounts']);
 for(const context of [{baseline:{...h.context.baseline,petIds:[tuple.petId]}},{baseline:{...h.context.baseline,route:'/other'}}])await assert.rejects(observeC11AutomaticCapture({...h.context,...context}));
});
test('A2 stale checkpoint, changed route, wrong number, missing card or revoked grant cannot become automatic success',async()=>{
 for(const patch of [{state:status(time)},{ui:sample({roster:[]})},{ui:sample({roster:[{petId:tuple.petId,numbers:['编号 0008']}]})}]){
  const h=autoHarness(patch);await assert.rejects(observeC11AutomaticCapture(h.context),{code:'C11_READBACK_TIMEOUT'});assert.ok(h.calls.every(x=>x[0]==='dom'||x[1]==='syncStatus'));
 }
 const changed=autoHarness({ui:sample({routeMatches:false})});await assert.rejects(observeC11AutomaticCapture(changed.context),/C11_AUTOMATIC_ROUTE_CHANGED/);assert.equal(changed.calls.length,1);
 const revoked=autoHarness({guard:async()=>{throw Object.assign(Error(),{code:'QA_GRANT_EXPIRED'});}});await assert.rejects(observeC11AutomaticCapture(revoked.context),{code:'QA_GRANT_EXPIRED'});assert.equal(revoked.calls.length,0);
});

const battleBinding={permitId:'permit-1',spawnId:'spawn-1',templateId:tuple.templateId,globalSerial:'7',playerPetId:'pet-player',ownerAccountId:owner,scenario:'fixture-scenario'};
const wild=()=>({id:'battle-cloud-permit-1',mode:'wild',status:'active',revision:1,winner:null,pendingAction:null,
 player:{petId:'pet-player',ownerAccountId:owner},enemy:{petId:'spawn-1',templateId:tuple.templateId,globalSerial:'7'},snapshot:{round:0,player:{anger:0}},rounds:[],
 context:{permitId:'permit-1',cloudAuthority:'discovery',authority:'simulated',inputSource:'simulated',scenarioId:'fixture-scenario'}});
test('original wild checkpoint binds exact session, original owner/player and allocated enemy serial',()=>{
 const original=wildSessionCheckpoint(wild(),battleBinding);assert.deepEqual(wildSessionCheckpoint(wild(),battleBinding),original);
 for(const patch of [{id:'battle-cloud-other'},{mode:'training'},{status:'abandoned'},{pendingAction:{actionId:'unknown'}},{revision:0},
  {player:{...wild().player,ownerAccountId:'other'}},{player:{...wild().player,petId:'other'}},{enemy:{...wild().enemy,globalSerial:'8'}},
  {enemy:{...wild().enemy,petId:'other'}},{enemy:{...wild().enemy,templateId:'other'}},
  {context:{...wild().context,permitId:'other'}},{context:{...wild().context,scenarioId:'other'}},{context:{...wild().context,authority:'supabase'}},
  {context:{...wild().context,cloudAuthority:'other'}},{context:{...wild().context,inputSource:'os'}}])assert.throws(()=>wildSessionCheckpoint({...wild(),...patch},battleBinding));
 assert.notDeepEqual(wildSessionCheckpoint({...wild(),snapshot:{round:1}},battleBinding),original);
});

function mainIdentityFixture(change=()=>{}){
 const reads=[];const accounts={epoch:2,remote:{deviceId:'device-a'},session:()=>({currentUser:{id:owner,authUserId:'auth-a',authKind:'supabase'},dataMode:'live'}),
  services:{get(name){assert.equal(name,'companions');return {readIdentityPet(who,id){reads.push([who,id]);return {...tuple};},refreshCloud(){throw Error('Must not refresh');}};}}};
 const holder={accounts,released:true,epoch:2,expiresAt:Date.now()+100000,binding:{role:'a',owner,deviceId:'device-a',profile:'/original/a'}};
 const args={expected:actor,role:'a',profile:'/original/a',petId:tuple.petId};change({holder,accounts,args});
 const context={__qaUiCaseContext:holder,args,electron:{app:{getPath:()=>'/original/a'}},process:{getBuiltinModule(name){assert.equal(name,'node:fs');return {realpathSync:{native:x=>x}};}}};
 return {reads,run:()=>vm.runInNewContext(`(${readC11HeldIdentity.toString()})(electron,args)`,context)};
}
test('actual main collector reads only current held local identity and never refreshes/imports/returns credentials',()=>{
 const h=mainIdentityFixture();assert.equal(JSON.stringify(h.run()),JSON.stringify(tuple));assert.deepEqual(h.reads,[[owner,tuple.petId]]);
 const guardOnly=mainIdentityFixture(({args})=>{args.petId=null;});assert.equal(JSON.stringify(guardOnly.run()),JSON.stringify(actor));assert.equal(guardOnly.reads.length,0);
 for(const change of [({holder})=>{holder.released=false;},({holder})=>{holder.epoch=3;},({holder})=>{holder.expiresAt=0;},({holder})=>{delete holder.expiresAt;},
  ({holder})=>{holder.binding.role='b';},({holder})=>{holder.binding.owner='other';},({holder})=>{holder.binding.profile='/replacement';},({holder})=>{holder.binding.deviceId='other';},
  ({accounts})=>{accounts.remote.deviceId='other';},({accounts})=>{accounts.session=()=>({currentUser:null});},({args})=>{args.expected={...actor,authUserId:'other'};}]){
  const f=mainIdentityFixture(change);assert.throws(f.run,{code:'SESSION_CHANGED'});assert.equal(f.reads.length,0);
 }
});

async function restartFixture({cleanup=true,change=()=>{},registry=true,guard=async()=>{}}={}){
 const events=[],old={profile:'/original/a',epoch:4,actor},models={a:old};
 const result=await relaunchC11OriginalProfile({models,expectedActor:actor,active:guard,cleanup:async()=>{events.push('cleanup');return cleanup;},
  relaunch:async role=>{events.push('relaunch:'+role);const next={profile:old.profile,epoch:5,actor:{...actor}};change(next);if(registry)models.a=next;return next;}});
 return {result,events};
}
test('A relaunch cleans original hook before existing holder call and does not claim graceful-only shutdown',async()=>{
 const {result,events}=await restartFixture();assert.deepEqual(events,['cleanup','relaunch:a']);assert.equal(result.sameOriginalProfile,true);assert.equal(result.cleanExitWithoutForceVerified,false);
 for(const change of [m=>{m.profile='/replacement';},m=>{m.epoch=4;},m=>{m.actor.deviceId='replacement';},m=>{m.actor.ownerAccountId='other';},m=>{m.actor.authUserId='other';}])await assert.rejects(restartFixture({change}));
 await assert.rejects(restartFixture({registry:false}));
 let launched=false;await assert.rejects(relaunchC11OriginalProfile({models:{a:{profile:'/original/a',epoch:1}},expectedActor:actor,active:async()=>{},cleanup:async()=>false,relaunch:async()=>{launched=true;}}));assert.equal(launched,false);
 await assert.rejects(restartFixture({guard:async()=>{throw Object.assign(Error(),{code:'QA_GRANT_EXPIRED'});}}),{code:'QA_GRANT_EXPIRED'});
});

// Execute the real DOM collector against an isolated DOM-shaped VM. It has no
// browser, preload bridge, network, credential, cloud or external profile.
function collectDom({route='/companions',view='roster',hidden=false,rootCount=1,rootRoute=route,number='编号 0007',pet=tuple.petId,battleId='battle-cloud-permit-1',alert=false}={}){
 const el=(attrs={},text='',shown=true)=>({textContent:text,getClientRects:()=>shown?[{}]:[],checkVisibility:()=>shown,getAttribute:key=>attrs[key]??null,querySelectorAll:()=>[]});
 const root=el({'data-route-key':rootRoute},'',!hidden),card=el({'data-pet-id':pet}),detail=el({'data-pet-id':pet}),battle=el({'data-session-id':battleId,'data-battle-mode':'wild'}),enemy=el(),num=el({},number);
 card.querySelectorAll=s=>s==='.cp-instance-identity code'?[num]:[];detail.querySelectorAll=s=>s==='.cp-detail-copy .cp-instance-identity code'?[num]:[];
 battle.querySelectorAll=s=>s==='.combatant-status.enemy'?[enemy]:[];enemy.querySelectorAll=s=>s==='.battle-portrait[data-pet-id]'?[el({'data-pet-id':'spawn-1'})]:s==='.battle-identity-number'?[num]:[];
 const local=new Map([['.cp-pet-card',view==='roster'?[card]:[]],['.cp-roster',view==='roster'?[el()]:[]],['.cp-detail-layout',view==='detail'?[detail]:[]],['.battle-screen',view==='battle'?[battle]:[]],['[role="alert"]',alert?[el()]:[]]]);
 root.querySelectorAll=s=>local.get(s)||[];const document={querySelectorAll:s=>s==='.app-page-motion[data-current-route="true"]'?Array.from({length:rootCount},()=>root):[]};
 return JSON.parse(JSON.stringify(vm.runInNewContext(`(${readC11UiSample.toString()})(args)`,{document,location:{hash:'#'+route},args:{route,view,petId:tuple.petId,sessionId:'battle-cloud-permit-1'}})));
}
test('real DOM collector binds visible current route and shipped list/detail/enemy-number surfaces',()=>{
 for(const view of ['roster','detail','battle'])assert.equal(validateC11UiSample(collectDom({view}),{view,...tuple,enemyPetId:'spawn-1'}),true);
 for(const patch of [{hidden:true},{rootCount:0},{rootCount:2},{rootRoute:'/old'},{number:'编号 0008'},{pet:'other'}])assert.equal(validateC11UiSample(collectDom(patch),{view:'roster',...tuple}),false);
 assert.throws(()=>validateC11UiSample(collectDom({alert:true}),{view:'roster',...tuple}));
 assert.equal(validateC11UiSample(collectDom({view:'battle',battleId:'replacement'}),{view:'battle',...tuple,enemyPetId:'spawn-1'}),false);
});

async function syntheticBatch({fallback=false,failure=null}={}){
 const output=mkdtempSync(join(tmpdir(),'c11-readback-pure-')),originalNow=Date.now;let tick=time,confirmedAt=null,synced=false,installed=false,reads=0;
 const events=[],writes=[],screenshots=[],actors={a:actor,a2:{...actor,deviceId:'device-a2'},b:{ownerAccountId:'account:owner-b',authUserId:'auth-b',deviceId:'device-b'}};
 const owned={a:[{...tuple,petId:'pet-a-original',globalSerial:'1'}],b:[{...tuple,ownerAccountId:actors.b.ownerAccountId,petId:'pet-b-original',globalSerial:'2'}]};
 const chosen={id:'spawn-1',templateId:fallback?'animal-shiba':'animal-wood-deer',position:{lat:45.3,lng:70.1},expiresAt:time+3600000};
 let battle=null,capture=null;const adoptions=new Map(),models={};
 const serial=()=>String([...owned.a,...owned.b].filter(p=>p.templateId===chosen.templateId).reduce((n,p)=>Math.max(n,Number(p.globalSerial)),0)+1);
 function syncStatus(role){if(role==='a2'&&confirmedAt!==null&&failure!=='stale-auto'){synced=true;return status(tick-1);}return status(time-1000);}
 async function invoke(role,feature,command,payload={}){
  events.push({kind:'ipc',role,feature,command,afterCapture:confirmedAt!==null});
  if(feature==='accounts'&&command==='session')return {currentUser:{id:actors[role].ownerAccountId,authUserId:actors[role].authUserId,authKind:'supabase'},dataMode:'live'};
  if(feature==='accounts'&&command==='syncStatus')return syncStatus(role);
  if(feature==='battle'&&command==='overview')return {session:null};
  if(feature==='companions'&&command==='list'){if(role==='a2'&&confirmedAt!==null)throw Error('A2 manual list would forge automatic sync');return {pets:structuredClone(owned[role==='a2'?'a':role])};}
  if(feature==='companions'&&command==='adopt'){
   writes.push({kind:'adopt',role,payload});if(adoptions.has(payload.actionId))return {pet:adoptions.get(payload.actionId)};
   const highest=Math.max(...[...owned.a,...owned.b].map(p=>Number(p.globalSerial))),pet={...tuple,ownerAccountId:actors[role].ownerAccountId,petId:'pet-'+role+'-concurrent',globalSerial:String(highest+1)};
   owned[role].push(pet);adoptions.set(payload.actionId,pet);return {pet};
  }
  throw Error('Unexpected synthetic IPC '+feature+'/'+command);
 }
 function cloud(op,input){
  events.push({kind:'cloud',op});
  if(op==='territories')return {territories:[]};if(op==='permits')return [];
  if(op==='nearby')return {source:'simulated',scenarioId:'fixture-scenario',serverTime:tick,spawns:[{...chosen,...(battle?{globalSerial:battle.enemy.globalSerial}:{globalSerial:serial()})}]};
  if(op==='position')return {source:'simulated'};
  if(op==='observe')return {ownerAccountId:owner,namespace:'qa:fixture-scenario',source:'simulated',scenarioId:'fixture-scenario',templateId:chosen.templateId,globalSerial:serial()};
  if(op==='reserve'){
   writes.push({kind:op,input});battle={...wild(),enemy:{...wild().enemy,templateId:chosen.templateId,globalSerial:serial()},player:{petId:input.petId,ownerAccountId:owner}};
   return {id:'permit-1',ownerAccountId:owner,authUserId:'auth-a'};
  }
  if(op==='session'){if(failure==='changed-session'&&events.filter(e=>e.kind==='cloud'&&e.op==='session').length>1)return {...battle,id:'battle-cloud-replacement'};return structuredClone(battle);}
  if(op==='act'){writes.push({kind:op,input});battle={...battle,status:'finished',winner:'player',snapshot:{round:1,player:{anger:0}},rounds:[{round:1}],revision:2};return structuredClone(battle);}
  if(op==='confirm'){
   writes.push({kind:op,input});if(!capture){capture={...tuple,templateId:chosen.templateId,globalSerial:battle.enemy.globalSerial};owned.a.push(capture);confirmedAt=tick;}
   return {petId:capture.petId,globalSerial:capture.globalSerial};
  }
  if(op==='captures')return capture?[{petId:capture.petId}]:[];
  throw Error('Unexpected synthetic cloud '+op);
 }
 function makeModel(role,epoch=1){
  let route='/';const model={profile:'/synthetic/'+role,epoch,actor:actors[role],
   async call(feature,command,payload){return invoke(role,feature,command,payload);},
   async main(fn,arg){
    if(fn===readC11HeldIdentity){events.push({kind:'local-identity',role,petId:arg.petId});if(arg.petId){assert.ok(role!=='a2'||synced);return {...capture,...(failure==='wrong-owner'&&role==='a2'?{ownerAccountId:'other'}:{})};}return {...actors[role]};}
    if(arg?.op)return {ok:true,data:cloud(arg.op,arg.input)};
    if(arg?.actor&&arg?.scenario)return {ready:true};
    if(arg?.ownerAccountId){assert.equal(installed,false);installed=true;events.push({kind:'install'});return;}
    assert.equal(arg,undefined);assert.ok(fn.toString().includes('__liveQaDiscovery'));events.push({kind:'cleanup',role});if(failure==='cleanup')throw Error('Synthetic cleanup failure');assert.equal(installed,true);installed=false;return true;
   },
   page:{
    async evaluate(fn,arg){
     if(typeof arg==='string'){route=arg;events.push({kind:'navigate',role,route});return;}
     if(arg?.feature)return {ok:true,data:await invoke(role,arg.feature,arg.command,arg.payload)};
     assert.equal(fn,readC11UiSample);reads++;
     if((failure==='stale-auto'||failure==='bad-ui')&&confirmedAt!==null)tick+=26000;
     if(route.startsWith('/battle/session/'))return sample({roster:[],battleCount:1,battleMatches:true,enemyPetIds:['spawn-1'],enemyNumbers:['编号 '+battle.enemy.globalSerial.padStart(4,'0')]});
     const rows=owned[role==='b'?'b':'a'].filter(p=>p!==capture||role!=='a2'||synced).map(p=>({petId:p.petId,numbers:['编号 '+p.globalSerial.padStart(4,'0')]}));
     if(route.startsWith('/companions/'))return sample({roster:[],detailCount:1,detailNumbers:['编号 '+capture.globalSerial.padStart(4,'0')]});
     return sample({roster:rows,...(failure==='bad-ui'&&confirmedAt!==null?{surfaceReady:false}:{})});
    },
    locator(){return {async scrollIntoViewIfNeeded(){}};},async screenshot({path}){screenshots.push(path.split('/').at(-1));}
   }};return model;
 }
 for(const role of ['a','a2','b'])models[role]=makeModel(role);
 // The whole fake batch runs the production orchestrator, but every effect is
 // an in-memory fixture. A virtual monotonic clock bounds negative tests.
 Date.now=()=>{tick+=10;return tick;};
 try{
  const proof=await runCloudLiveQaDiscoveryCases({models,expectedActors:actors,assertActive:async()=>{events.push({kind:'active'});},
   relaunch:async role=>{assert.equal(role,'a');assert.equal(installed,false);events.push({kind:'relaunch'});models.a=makeModel('a',models.a.epoch+1);if(failure==='replacement-profile')models.a.profile='/replacement';return models.a;},
   scenario:'fixture-scenario',runId:'pure-c11-case',output,businessDeadline:time+600000,mode:'full'});
  assert.ok(existsSync(join(output,'live-discovery-intents.json')),JSON.stringify({proof,events}));
  return {proof,events,writes,screenshots,reads,intents:JSON.parse(readFileSync(join(output,'live-discovery-intents.json'),'utf8'))};
 }finally{Date.now=originalNow;rmSync(output,{recursive:true,force:true});}
}

test('actual offline orchestrator adds navigation/automatic identity/restart checks without replacement business intents',async()=>{
 const {proof,events,writes,screenshots,intents}=await syntheticBatch();assert.equal(proof.passed,true);assert.equal(proof.fullCasePassed,false);assert.equal(proof.cases.length,4);
 const row=proof.cases.find(r=>r.id==='C11-wild-capture');assert.equal(row.status,'passed-scoped');assert.equal(row.fullCasePassed,false);assert.equal(row.automaticSync.sameLocalTuple,true);assert.equal(row.restart.sameLocalTupleAndVisibleNumber,true);
 assert.equal(row.originalBattleNavigation.navigation.length,3);assert.equal(row.originalBattleNavigation.sameRoundAndHistory,true);
 assert.deepEqual(writes.map(x=>x.kind),['adopt','adopt','adopt','adopt','reserve','act','confirm','confirm']);assert.equal(new Set(writes.filter(x=>x.kind==='confirm').map(x=>x.input.actionId)).size,1);
 assert.deepEqual(Object.keys(intents.actions),['concurrent:a','concurrent:b','wild:reserve','wild:round:1','wild:confirm']);
 assert.ok(events.filter(x=>x.kind==='ipc'&&x.role==='a2'&&x.afterCapture).every(x=>x.feature==='accounts'&&x.command==='syncStatus'));
 assert.ok(events.findIndex(x=>x.kind==='cleanup')<events.findIndex(x=>x.kind==='relaunch'));assert.equal(events.filter(x=>x.kind==='cleanup').length,1);
 assert.deepEqual(screenshots,['C11-wild-session.png','C11-wild-session-return.png','C11-a2-auto-sync.png','C11-captured-list.png','C11-captured-detail.png','C11-a-relaunch.png']);
 assert.ok(proof.uncovered.some(x=>x.includes('A to B to A')));assert.ok(proof.uncovered.some(x=>x.includes('other-template')));
});
test('fallback captures retain actual template and explicitly do not claim independent other-type sequence',async()=>{
 const {proof}=await syntheticBatch({fallback:true});assert.equal(proof.passed,true);const observed=proof.cases.find(r=>r.id==='C11-observe-stability');assert.equal(observed.templateId,'animal-shiba');assert.equal(observed.fallbackTemplateUsed,true);assert.equal(observed.independentOtherTemplateSequenceVerified,false);
 assert.equal(proof.cases.find(r=>r.id==='C11-wild-capture').capturedIdentity.templateId,'animal-shiba');assert.equal(proof.fullCasePassed,false);
});
test('actual negative readback paths preserve original intent/evidence, clean hooks and never start replacement operations',async()=>{
 for(const failure of ['changed-session','wrong-owner','stale-auto','bad-ui','replacement-profile','cleanup']){
  const {proof,writes,events}=await syntheticBatch({failure});assert.equal(proof.passed,false,failure);assert.equal(proof.fullCasePassed,false);assert.equal(proof.cases.find(r=>r.id==='C11-wild-capture').status,'failed',failure);
  assert.equal(writes.filter(x=>x.kind==='reserve').length,1);assert.ok(writes.filter(x=>x.kind==='confirm').length<=2);assert.ok(events.some(x=>x.kind==='cleanup'));
  if(failure==='changed-session'){assert.equal(writes.some(x=>x.kind==='act'),false);assert.equal(writes.some(x=>x.kind==='confirm'),false);}
  if(failure==='cleanup'){assert.equal(events.some(x=>x.kind==='relaunch'),false);assert.equal(proof.cleanup.discoveryHarness,false);assert.equal(proof.cleanupErrors.length,1);}
 }
});
test('selectors, automatic checkpoint source and deliberate non-goals remain grounded in shipped product',()=>{
 const read=file=>readFileSync(new URL('../../apps/pc-app/'+file,import.meta.url),'utf8');
 for(const value of ['data-pet-id','cp-pet-card','cp-roster'])assert.ok(read('ui/src/features/companions/CompanionsPage.tsx').includes(value));
 assert.ok(read('ui/src/features/companions/PetDetailPage.tsx').includes('cp-detail-copy'));assert.ok(read('ui/src/features/battle/BattleScreen.tsx').includes('data-session-id={session.id}'));
 assert.ok(read('runtime/features/accounts/service.cjs').includes('lastCloudCheckedAt:observation?.checkedAt||null'));
 assert.ok(read('runtime/features/accounts/service.cjs').includes('30_000'));assert.ok(read('runtime/features/companions/index.cjs').includes('readIdentityPet(ownerAccountId, petId)'));
 const source=readFileSync(new URL('./cloud-live-qa-discovery-cases.mjs',import.meta.url),'utf8');assert.ok(!source.includes('fullCasePassed=true'));assert.ok(!source.includes("'syncNow'"));
 const auto=observeC11AutomaticCapture.toString();assert.ok(!auto.includes("'list'"));assert.ok(!auto.includes('location.hash'));assert.ok(!auto.includes('relaunch('));
});
