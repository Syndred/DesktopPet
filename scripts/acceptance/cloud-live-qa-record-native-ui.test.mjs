import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readS05PrivateUiSample,validateS05PrivateUiSample,observeS05NativePrivateUi,runCloudLiveQaRecordCases} from './cloud-live-qa-record-cases.mjs';

const clean=()=>({routeMatches:true,currentRouteCount:1,currentRouteMatches:true,surfaceReady:true,openingCount:0,visibleAlertCount:0,foreignPetVisibleCount:0,foreignPrivateTextVisible:false});
function fakePage(change=()=>({})){
 const calls=[];let route='',samples=0;
 const page={
  async evaluate(fn,arg){
   if(typeof arg==='string'){assert.match(fn.toString(),/location\.hash/);route=arg;calls.push({kind:'navigate',route});return;}
   assert.equal(fn,readS05PrivateUiSample);assert.equal(arg.route,route);samples++;calls.push({kind:'read',route});
   return {...clean(),...change({route,samples,arg})};
  },
  locator(selector){assert.equal(selector,'.app-page-motion[data-current-route="true"]');return {getByRole(role,options){assert.equal(role,'button');assert.deepEqual(options,{name:'回到我的灵宠',exact:true});return {async click(){assert.equal(route,'/companions/pet-a');calls.push({kind:'native-return',route});route='/companions';}};}};}
 };
 return {page,calls};
}
function uiHarness(change,guard=async()=>{}){
 const {page,calls}=fakePage(change),checkpoints=[];
 return {calls,checkpoints,context:{page,active:guard,checkpoint:(stage,value)=>checkpoints.push({stage,value}),foreignPetId:'pet-a',memoryId:'memory-a',ownPetId:'pet-b',privateContents:['QA-original-private-memory','QA-edited-private-memory'],
  until:async(read,accept)=>{for(let i=0;i<6;i++){const value=await read();if(accept(value))return value;}throw Object.assign(Error('Pure fixture timeout'),{code:'READBACK_TIMEOUT'});}}};
}

test('UI readiness fails closed on stale, blank, loading, duplicate-root and failed surfaces',()=>{
 assert.equal(validateS05PrivateUiSample(clean()),true);
 for(const patch of [{routeMatches:false},{currentRouteMatches:false},{currentRouteCount:0},{currentRouteCount:2},{surfaceReady:false},{openingCount:1}])assert.equal(validateS05PrivateUiSample({...clean(),...patch}),false);
 for(const patch of [{foreignPetVisibleCount:1},{foreignPrivateTextVisible:true},{visibleAlertCount:1},{currentRouteCount:-1},{openingCount:NaN},{surfaceReady:undefined},{foreignPrivateTextVisible:0}])assert.throws(()=>validateS05PrivateUiSample({...clean(),...patch}));
 assert.throws(()=>validateS05PrivateUiSample(null));
});

test('native journey only navigates, reads and uses the shipped denied-detail return button',async()=>{
 const h=uiHarness();const proof=await observeS05NativePrivateUi(h.context);
 assert.deepEqual(proof.observations.map(x=>x.route),['/chat','/settings/ai','/companions/pet-a','/companions','/chat']);
 assert.ok(proof.observations.every(x=>x.readySamples===2&&x.samples===2));
 assert.equal(h.calls.filter(x=>x.kind==='native-return').length,1);
 assert.equal(h.calls.filter(x=>x.kind==='navigate').length,4);
 assert.equal(proof.readOnly,true);assert.equal(proof.fullCasePassed,false);
 assert.equal(proof.knownOriginalPetIdDenied,true);assert.equal(proof.privatePageReopened,true);
 assert.ok(!JSON.stringify(proof).includes('QA-original-private-memory'));
});

test('every native stage rejects visible old/new private content or foreign pet and stops traversal',async()=>{
 for(const route of ['/chat','/settings/ai','/companions/pet-a','/companions'])for(const leak of [{foreignPrivateTextVisible:true},{foreignPetVisibleCount:1},{visibleAlertCount:1}]){
  const h=uiHarness(current=>current.route===route?leak:{});
  await assert.rejects(observeS05NativePrivateUi(h.context),{code:'ERR_ASSERTION'});
  assert.equal(h.calls.at(-1).route,route);assert.equal(h.calls.at(-1).kind,'read');
 }
 const h=uiHarness(({route,samples})=>route==='/chat'&&samples>8?{foreignPrivateTextVisible:true}:{});
 await assert.rejects(observeS05NativePrivateUi(h.context),{code:'ERR_ASSERTION'});
 assert.equal(h.checkpoints.at(-1).stage,'b-native-chat-after-return');
});

test('an empty/errorless page cannot pass, and one ready frame is insufficient',async()=>{
 const h=uiHarness(()=>({surfaceReady:false}));await assert.rejects(observeS05NativePrivateUi(h.context),{code:'READBACK_TIMEOUT'});assert.equal(h.calls.filter(x=>x.kind==='navigate').length,1);
 const alternating=uiHarness(({samples})=>({surfaceReady:samples%2===1}));await assert.rejects(observeS05NativePrivateUi(alternating.context),{code:'READBACK_TIMEOUT'});
 const wrongRoute=uiHarness(()=>({currentRouteMatches:false}));await assert.rejects(observeS05NativePrivateUi(wrongRoute.context),{code:'READBACK_TIMEOUT'});
});

test('active session checks guard navigation, observation and native return with no fallback mutation',async()=>{
 let checks=0;const h=uiHarness(undefined,async()=>{checks++;if(checks===10)throw Object.assign(Error(),{code:'SESSION_CHANGED'});});
 await assert.rejects(observeS05NativePrivateUi(h.context),{code:'SESSION_CHANGED'});
 assert.equal(h.calls.some(x=>x.kind==='native-return'),false);
 const denied=uiHarness(undefined,async()=>{throw Object.assign(Error(),{code:'QA_GRANT_EXPIRED'});});await assert.rejects(observeS05NativePrivateUi(denied.context),{code:'QA_GRANT_EXPIRED'});assert.equal(denied.calls.length,0);
});

test('missing sentinel, own/foreign alias or nonexistent ID route is rejected before navigation',async()=>{
 for(const patch of [{foreignPetId:''},{memoryId:''},{ownPetId:'pet-a'},{ownPetId:undefined},{privateContents:[]},{privateContents:[' ']},{foreignPetId:'adopt'},{foreignPetId:'a/b'},{foreignPetId:'a?query'}]){
  const h=uiHarness();await assert.rejects(observeS05NativePrivateUi({...h.context,...patch}),{code:'ERR_ASSERTION'});assert.equal(h.calls.length,0);
 }
});

// Exercise the actual browser evaluator in an isolated DOM-shaped VM, not a
// replacement collector. No browser, network, account, token or live profile.
function domSample({view='chat',route='/chat',ownPetId='pet-b',text=[],textarea=[],foreignPet=false,rootCount=1,rootVisible=true,denied=true,detail=false,loading=false,alert=false,wrongRoot=false}={}){
 function element({value='',id=null,visible=true,attrs={}}={}){return {textContent:value,getClientRects:()=>visible?[{}]:[],checkVisibility:()=>visible,getAttribute:key=>key==='data-pet-id'?id:attrs[key]??null};}
 const root=element({visible:rootVisible,attrs:{'data-route-key':wrongRoot?'/old':route}}),local=new Map();
 const put=(selector,values)=>local.set(selector,values);
 if(view==='chat'){put('.cv-thread',ownPetId?[element({id:ownPetId})]:[]);put('.cv-memories',ownPetId?[element()]:[]);put('.cv-empty h1',ownPetId?[]:[element({value:'暂无伙伴'})]);}
 if(view==='settings'){for(const selector of ['.cv-ai-settings','.cv-partners'])put(selector,[element()]);put('.cv-persona .cv-pet-scene',ownPetId?[element({id:ownPetId})]:[]);put('.cv-memories',ownPetId?[element()]:[]);put('.cv-empty h2',ownPetId?[]:[element({value:'还没有伙伴'})]);}
 if(view==='known-id'){put('.cp-detail-page',[element()]);put('h2',denied?[element({value:'这只伙伴不在当前账号的灵境里'})]:[]);put('button',denied?[element({value:'回到我的灵宠'})]:[]);put('.cp-detail-layout',detail?[element()]:[]);}
 if(view==='roster')put('.cp-roster',[element()]);
 put('.opening-state',loading?[element()]:[]);root.querySelectorAll=selector=>local.get(selector)??[];
 const nodes=text.map(x=>({textContent:x.value,parentElement:element(x)}));let index=-1;
 const global=new Map([
  ['.app-page-motion[data-current-route="true"]',Array.from({length:rootCount},()=>root)],
  ['[data-pet-id]',foreignPet?[element({id:'pet-a'})]:[]],
  ['[role="alert"]',alert?[element()]:[]],
  ['textarea',textarea.map(x=>({...element(x),value:x.value}))]
 ]);
 const document={body:{},querySelectorAll:selector=>{assert.ok(!selector.includes('input'),'Must never inspect credential inputs');return global.get(selector)??[];},createTreeWalker:()=>({nextNode(){index++;this.currentNode=nodes[index];return index<nodes.length;}})};
 return vm.runInNewContext(`(${readS05PrivateUiSample.toString()})(args)`,{document,location:{hash:`#${route}`},NodeFilter:{SHOW_TEXT:4},args:{route,view,ownPetId,foreignPetId:'pet-a',forbiddenText:['pet-a','memory-a','QA original private','QA updated private']}});
}

test('real collector requires the actual chat/settings, denied deep link and roster surfaces',()=>{
 for(const [view,route] of [['chat','/chat'],['settings','/settings/ai'],['known-id','/companions/pet-a'],['roster','/companions']])assert.equal(validateS05PrivateUiSample(domSample({view,route})),true);
 for(const view of ['chat','settings'])assert.equal(validateS05PrivateUiSample(domSample({view,ownPetId:null})),true);
 for(const patch of [{rootCount:0},{rootCount:2},{rootVisible:false},{loading:true},{wrongRoot:true},{view:'unknown'},{view:'known-id',denied:false},{view:'known-id',detail:true}])assert.equal(validateS05PrivateUiSample(domSample(patch)),false);
});

test('collector catches visible foreign IDs and old/new content in text or textarea, including outside current page',()=>{
 for(const patch of [{foreignPet:true},{text:[{value:'memory-a'}]},{text:[{value:'QA original\n private'}]},{text:[{value:'QA updated private'}]},{textarea:[{value:'QA updated private'}]},{alert:true}])assert.throws(()=>validateS05PrivateUiSample(domSample(patch)));
 const hidden=domSample({text:[{value:'QA original private',visible:false}],textarea:[{value:'QA updated private',visible:false}]});assert.equal(validateS05PrivateUiSample(hidden),true);
 const leaked=domSample({text:[{value:'QA updated private'}]});assert.equal(leaked.foreignPrivateTextVisible,true);assert.equal(JSON.stringify(leaked).includes('QA updated private'),false);
});

test('selectors and routes are grounded in the current native UI source',()=>{
 const read=file=>readFileSync(new URL('../../apps/pc-app/ui/src/'+file,import.meta.url),'utf8');
 const routes=read('features/conversations/index.tsx');assert.ok(routes.includes("path: '/chat'"));assert.ok(routes.includes("path: '/settings/ai'"));assert.ok(!routes.includes(':memoryId'));
 const detail=read('features/companions/PetDetailPage.tsx');for(const s of ['这只伙伴不在当前账号的灵境里','回到我的灵宠',"navigate('/companions')",'cp-detail-layout'])assert.ok(detail.includes(s));
 assert.ok(read('features/companions/index.tsx').includes("path: '/companions/:petId'"));
 assert.ok(read('features/conversations/components.tsx').includes('cv-card cv-memories'));assert.ok(read('features/conversations/chat-page.tsx').includes('cv-card cv-thread'));
 assert.ok(read('features/conversations/settings-page.tsx').includes('cv-ai-settings'));assert.ok(read('components/motion.tsx').includes('data-current-route={present}'));
});

async function syntheticBatch(change,cleanupFails=false){
 const platform=Object.getOwnPropertyDescriptor(process,'platform'),github=process.env.GITHUB_ACTIONS,now=Date.now;
 const output=mkdtempSync(join(tmpdir(),'s05-native-ui-pure-'));let tick=0,written=false;const writes=[],cleanups=[];
 const expectedActors={a:{ownerAccountId:'owner-a',authUserId:'auth-a',deviceId:'device-a'},a2:{ownerAccountId:'owner-a',authUserId:'auth-a',deviceId:'device-a2'},b:{ownerAccountId:'owner-b',authUserId:'auth-b',deviceId:'device-b'}};
 const memory=()=>({id:'memory-a',content:written?'QA-pure-case-S05-真实私有事件':'QA original private memory',revision:written?2:1});
 const {page,calls}=fakePage(change);
 const models=Object.fromEntries(['a','a2','b'].map(role=>[role,{profile:`/synthetic/${role}`,page,
  async call(feature,command,payload){
   if(feature==='accounts'&&command==='session')return {currentUser:{id:expectedActors[role].ownerAccountId,authUserId:expectedActors[role].authUserId,authKind:'supabase'},dataMode:'live'};
   if(feature==='conversations'&&command==='snapshot')return {accountId:expectedActors[role].ownerAccountId,petId:role==='b'?'pet-b':'pet-a',pets:[{petId:role==='b'?'pet-b':'pet-a'}],memories:role==='b'?[]:[memory()]};
   if(feature==='conversations'&&command==='memory.save'){assert.equal(role,'a');writes.push(structuredClone(payload));written=true;return memory();}
   throw Error(`Unexpected synthetic command ${feature}/${command}`);
  },
  async main(fn,...args){
   if(args[0]==='/synthetic/a')return [];
   if(args[0]==='read')return role==='a'?{count:1,rows:[{owner:'owner-a',id:'["pet-a","memory-a"]',revision:written?2:1,changeSequence:written?2:1,documentSha256:'synthetic'}]}:{count:0,rows:[]};
   if(args[0]==='owner-mismatch')return {rejected:true,code:'OWNER_MISMATCH',httpStatus:403};
   if(args[0]==='subscribe')return {started:true};
   if(args[0]==='state')return {status:'SUBSCRIBED',events:role==='a'&&written?1:0};
   if(args.length===0){assert.match(fn.toString(),/__liveQaPrivateProbe/);cleanups.push(role);if(cleanupFails&&role==='b')throw Error('Synthetic cleanup failure');}
  }
 }]));
 try{
  Object.defineProperty(process,'platform',{...platform,value:'win32'});process.env.GITHUB_ACTIONS='true';Date.now=()=>{tick+=10000;return tick;};
  const proof=await runCloudLiveQaRecordCases({models,expectedActors,relaunch:async()=>{throw Error('No relaunch authorized in synthetic S05');},assertActive:async()=>{},scenario:'pure-isolated-fixture',runId:'pure-case',output,selectedCases:['S05'],existingRecordFixture:{owner:'owner-a',petId:'pet-a',memoryId:'memory-a',sourceRunId:'202611050000'}});
  return {proof,writes,cleanups,calls,intent:JSON.parse(readFileSync(join(output,'live-record-intents.json'),'utf8'))};
 }finally{Object.defineProperty(process,'platform',platform);if(github===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=github;Date.now=now;rmSync(output,{recursive:true,force:true});}
}

test('offline complete S05 retains fullCasePassed false, original single memory write and both probe cleanups',async()=>{
 const {proof,writes,cleanups,intent}=await syntheticBatch();assert.equal(proof.passed,true);assert.equal(proof.cases[0].status,'passed-scoped');assert.equal(proof.cases[0].fullCasePassed,false);
 assert.equal(proof.cases[0].nativePrivateUi.observations.length,5);assert.equal(proof.cases[0].nativePrivateUi.fullCasePassed,false);
 assert.equal(writes.length,1);assert.equal(writes[0].memory.id,'memory-a');assert.equal(writes[0].memory.revision,1);assert.equal(intent.s05MemoryEditSubmitted,true);
 assert.deepEqual(cleanups,['a','b','a','b']);
});

test('native privacy failure stays failed, never resumes P05 or adds a second edit, and always cleans probes',async()=>{
 const {proof,writes,cleanups}=await syntheticBatch(({route})=>route==='/companions/pet-a'?{foreignPetVisibleCount:1}:{});
 assert.equal(proof.passed,false);assert.equal(proof.cases[0].status,'failed');assert.equal(proof.cases[0].fullCasePassed,false);assert.equal(proof.cases[0].substage,'b-native-known-pet-id');
 assert.equal(proof.s05FailureContinuation,undefined);assert.equal(writes.length,1);assert.deepEqual(cleanups,['a','b','a','b']);
});

test('native render timeout is not eligible for old realtime-only failure continuation',async()=>{
 const {proof,writes,cleanups}=await syntheticBatch(()=>({surfaceReady:false}));assert.equal(proof.passed,false);assert.equal(proof.cases[0].status,'failed');assert.equal(proof.cases[0].error.code,'READBACK_TIMEOUT');assert.equal(proof.cases[0].fullCasePassed,false);
 assert.equal(proof.s05FailureContinuation,undefined);assert.equal(writes.length,1);assert.deepEqual(cleanups,['a','b','a','b']);
});

test('probe cleanup failure cannot be hidden by native UI success',async()=>{
 const {proof,writes}=await syntheticBatch(undefined,true);assert.equal(proof.passed,false);assert.equal(proof.cases[0].fullCasePassed,false);assert.ok(proof.cleanupErrors.some(x=>x.component==='b-private-probe'));assert.equal(writes.length,1);
});
