// OFFLINE ONLY. Execute actual observation/preparation functions against synthetic
// in-memory boundaries. These tests never mint authority or constitute native QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {plannedCAccount} from './cloud-new-c-lifecycle-preconditions.mjs';
import {assertCDesktopPositive,assertCDesktopRemoved,readCDesktopHost,readCDesktopRenderer,readCSignedoutDesktop,assertCSignedoutPrivacy} from './cloud-new-c-ui-lifecycle.mjs';
const source=readFileSync(new URL('./cloud-new-c-ui-lifecycle.mjs',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
function binding(){return {runId:'synthetic-run',stageIntentId:'synthetic-stage',ownerAccountId:'synthetic-owner',authUserId:'synthetic-auth',deviceId:'synthetic-device',sessionId:'synthetic-session',petId:'synthetic-pet',resourceId:'synthetic-resource'};}
function observation(b=binding()){
 const url='file:///synthetic/resources/app.asar/apps/pc-app/dist/ui/desktop.html#/desktop/'+encodeURIComponent(b.petId);
 return {actor:{ownerAccountId:b.ownerAccountId,authUserId:b.authUserId,deviceId:b.deviceId,sessionId:b.sessionId},session:{currentUser:{id:b.ownerAccountId,authUserId:b.authUserId,account:plannedCAccount,authKind:'supabase'},dataMode:'live'},
  host:{currentOwnerAccountId:b.ownerAccountId,pet:{ownerAccountId:b.ownerAccountId,petId:b.petId,resourceId:b.resourceId,desktopVisible:true},windows:[{ownerAccountId:b.ownerAccountId,petId:b.petId,windowId:17,visible:true}],nativeWindows:[{id:17,url,visible:true,destroyed:false,minimized:false,onDisplay:true}]},
  renderer:{pageCount:1,url,surfaceCount:1,petId:b.petId,resourceId:b.resourceId,visible:true,stageCount:1,stagePetId:b.petId,stageResourceId:b.resourceId,status:'ready',canvasCount:1,canvasVisible:true}};
}
test('positive evidence binds the exact run, stage, C actor, original pet and real-window observations',()=>{
 const b=binding(),p=assertCDesktopPositive(b,observation(b));for(const [key,value]of Object.entries(b))assert.equal(p[key],value);assert.equal(p.windowId,17);assert.equal(p.nativeVisible,true);assert.equal(p.rendererReady,true);
 assert.deepEqual(assertCDesktopRemoved(b,p,{windowId:17,oldWindowDestroyed:true,visibleDesktopCount:0}),{priorVisibleDesktopEstablished:true,oldDesktopWindowDestroyed:true,priorDesktopWindowId:17});
});
test('persisted positive evidence never copies native installation URLs or unrelated observation fields',()=>{
 const b={...binding(),privatePath:'SYNTHETIC_PRIVATE_BINDING_PATH'},o=observation();o.host.nativeWindows[0].url='file:///C:/Users/SYNTHETIC_PRIVATE_USER/AppData/Local/Temp/app/resources/app.asar/apps/pc-app/dist/ui/desktop.html#/desktop/'+b.petId;o.renderer.url=o.host.nativeWindows[0].url;o.renderer.privateValue='SYNTHETIC_PRIVATE_OBSERVATION';
 const positive=assertCDesktopPositive(b,o),encoded=JSON.stringify(positive);assert.equal(positive.packagedDesktopVerified,true);assert.equal(positive.url,undefined);assert.doesNotMatch(encoded,/file:|SYNTHETIC_PRIVATE|AppData|resources\/app\.asar/);
 assert.deepEqual(Object.keys(positive).sort(),[...Object.keys(binding()),'windowId','packagedDesktopVerified','nativeVisible','rendererReady','observedAt'].sort());
});
for(const [name,change]of[
 ['wrong actor owner',o=>o.actor.ownerAccountId='other'],['wrong auth user',o=>o.actor.authUserId='other'],['wrong device',o=>o.actor.deviceId='other'],['changed session',o=>o.actor.sessionId='other'],['signed out',o=>o.session.currentUser=null],['wrong account',o=>o.session.currentUser.account='other'],['nonlive session',o=>o.session.dataMode='fixture'],
 ['wrong host owner',o=>o.host.currentOwnerAccountId='other'],['wrong pet owner',o=>o.host.pet.ownerAccountId='other'],['wrong pet',o=>o.host.pet.petId='other'],['wrong resource',o=>o.host.pet.resourceId='other'],['preference still off',o=>o.host.pet.desktopVisible=false],
 ['unowned window',o=>o.host.windows[0].ownerAccountId='other'],['other-pet window',o=>o.host.windows[0].petId='other'],['wrong window id',o=>o.host.nativeWindows[0].id=18],['hidden host window',o=>o.host.windows[0].visible=false],['missing owned window',o=>o.host.windows=[]],['missing native window',o=>o.host.nativeWindows=[]],['duplicate native window',o=>o.host.nativeWindows.push({...o.host.nativeWindows[0]})],
 ['hidden native window',o=>o.host.nativeWindows[0].visible=false],['destroyed window',o=>o.host.nativeWindows[0].destroyed=true],['minimized window',o=>o.host.nativeWindows[0].minimized=true],['offscreen window',o=>o.host.nativeWindows[0].onDisplay=false],['other desktop route',o=>o.host.nativeWindows[0].url+='/other'],['nonpackaged window',o=>o.host.nativeWindows[0].url='https://example.invalid/ui/desktop.html#/desktop/synthetic-pet'],
 ['missing renderer',o=>o.renderer.pageCount=0],['duplicate renderer',o=>o.renderer.pageCount=2],['different renderer url',o=>o.renderer.url+='/other'],['missing surface',o=>o.renderer.surfaceCount=0],['wrong surface pet',o=>o.renderer.petId='other'],['hidden surface',o=>o.renderer.visible=false],['wrong stage pet',o=>o.renderer.stagePetId='other'],['wrong stage resource',o=>o.renderer.stageResourceId='other'],['loading renderer',o=>o.renderer.status='loading'],['failed renderer',o=>o.renderer.status='error'],['missing canvas',o=>o.renderer.canvasCount=0],['hidden canvas',o=>o.renderer.canvasVisible=false]
])test('positive observation rejects '+name,()=>{const o=observation();change(o);assert.throws(()=>assertCDesktopPositive(binding(),o));});
for(const [name,change]of[
 ['missing positive',f=>f.positive=null],['different run',f=>f.positive.runId='different-run'],['different stage',f=>f.positive.stageIntentId='other-stage'],['different owner',f=>f.positive.ownerAccountId='other'],['different original pet',f=>f.positive.petId='other'],['unverified packaged route',f=>f.positive.packagedDesktopVerified=false],['unproven visibility',f=>f.positive.nativeVisible=false],['unready renderer',f=>f.positive.rendererReady=false],['missing observation time',f=>delete f.positive.observedAt],['missing old-window check',f=>delete f.after.oldWindowDestroyed],['old window only hidden',f=>f.after.oldWindowDestroyed=false],['wrong old window',f=>f.after.windowId=18],['remaining visible desktop',f=>f.after.visibleDesktopCount=1]
])test('cleanup rejects '+name,()=>{const f={positive:assertCDesktopPositive(binding(),observation()),after:{windowId:17,oldWindowDestroyed:true,visibleDesktopCount:0}};change(f);assert.throws(()=>assertCDesktopRemoved(binding(),f.positive,f.after));});
function nativeWindow({id=17,url=observation().renderer.url,visible=true,destroyed=false,bounds={x:10,y:20,width:230,height:280}}={}){return {id,webContents:{getURL:()=>url},isVisible:()=>visible,isDestroyed:()=>destroyed,isMinimized:()=>false,getBounds:()=>bounds};}
test('actual main observation reads owner-scoped APIs and never creates, shows or modifies a window',()=>{
 const b=binding(),o=observation(),calls=[],companions={readIdentityPet(owner,petId){calls.push(['pet',owner,petId]);return {ownerAccountId:owner,petId,resource:{resourceId:b.resourceId},desktop:{visible:true}};},getDesktopWindows(){calls.push(['windows']);return o.host.windows;}};
 const h={binding:{role:'c'},accounts:{services:{session:{getOwnerAccountId:()=>b.ownerAccountId},get(name){assert.equal(name,'companions');return companions;}}}},context={__qaUiCaseContext:h};
 const read=vm.runInNewContext('('+readCDesktopHost.toString()+')',context),e={BrowserWindow:{getAllWindows:()=>[nativeWindow(),nativeWindow({id:18,url:''})]},screen:{getAllDisplays:()=>[{workArea:{x:0,y:0,width:1280,height:720}}]}};
 const result=read(e,b);assert.equal(result.nativeWindows.length,1);assert.equal(result.nativeWindows[0].onDisplay,true);assert.deepEqual(calls,[['pet',b.ownerAccountId,b.petId],['windows']]);
 e.BrowserWindow.getAllWindows=()=>[nativeWindow({bounds:{x:2000,y:2000,width:230,height:280}})];assert.equal(read(e,b).nativeWindows[0].onDisplay,false);
 h.binding.role='a';assert.throws(()=>read(e,b),/C_DESKTOP_OWNER_CHANGED/);h.binding.role='c';assert.throws(()=>read(e,{...b,ownerAccountId:'other'}),/C_DESKTOP_OWNER_CHANGED/);
});
test('actual signed-out window read distinguishes hidden from destroyed and counts every visible desktop',()=>{
 for(const old of [null,nativeWindow({destroyed:true}),nativeWindow({visible:false}),nativeWindow()]){
  const result=readCSignedoutDesktop({BrowserWindow:{fromId:id=>{assert.equal(id,17);return old;},getAllWindows:()=>old&&!old.isDestroyed()?[old]:[]}},17);
  assert.equal(result.oldWindowDestroyed,!old||old.isDestroyed());assert.equal(result.visibleDesktopCount,old&&!old.isDestroyed()&&old.isVisible()?1:0);
 }
 const result=readCSignedoutDesktop({BrowserWindow:{fromId:()=>{throw Error('Not requested');},getAllWindows:()=>[]}},null);assert.equal(result.oldWindowDestroyed,false);
});
test('actual renderer observation requires a ready stage and visible canvas and checks hidden ancestors',()=>{
 const b=binding();let hidden=false;
 const node=attrs=>({parentElement:null,getAttribute:key=>attrs[key],getClientRects:()=>[{}],getBoundingClientRect:()=>({width:100,height:100})});
 const canvas=node({}),stage=node({'data-pet-id':b.petId,'data-resource-id':b.resourceId,'data-status':'ready'}),surface=node({'data-pet-id':b.petId,'data-resource-id':b.resourceId});stage.querySelectorAll=()=>[canvas];surface.querySelectorAll=()=>[stage];canvas.parentElement=stage;stage.parentElement=surface;
 const read=vm.runInNewContext('('+readCDesktopRenderer.toString()+')',{document:{querySelectorAll:()=>[surface]},getComputedStyle:n=>({display:hidden&&n===surface?'none':'block',visibility:'visible',opacity:'1'})});
 let r=read();assert.equal(r.visible,true);assert.equal(r.canvasVisible,true);assertCDesktopPositive(b,{...observation(),renderer:{...observation().renderer,...r}});
 hidden=true;r=read();assert.equal(r.visible,false);assert.equal(r.canvasVisible,false);assert.throws(()=>assertCDesktopPositive(b,{...observation(),renderer:{...observation().renderer,...r}}));
});

function prepareFixture(options={}){
 const b=binding(),row={name:'A12-own-current-session-revoke',intentId:b.stageIntentId,state:'prepared'},events=[],checkpoints=[],baseline={immutable:'original-business'},actor=observation().actor;
 const adoption={name:'A13-first-adoption-guidance',state:'confirmed',petId:b.petId,durableIntent:{found:true,sameOriginalIntent:true,commandIsAdopt:true,status:'verified'}};
 const pet={ownerAccountId:b.ownerAccountId,petId:b.petId,globalSerial:'1',resource:{kind:'2d',resourceId:b.resourceId},desktop:{visible:options.preexisting===true}};
 const location={hash:'#/account'},button={count:async()=>1,isEnabled:async()=>true},page={evaluate:async(fn,id)=>vm.runInNewContext('('+fn.toString()+')',{location})(id),locator:selector=>({waitFor:async()=>events.push(selector)}),getByRole(role,opts){assert.equal(role,'button');assert.equal(opts.name,'开启桌面陪伴');return button;}};
 let clicks=0,observations=0,businessReads=0;
 const ctx={assert,authenticationTransition:null,proof:{stages:[adoption,row]},runId:b.runId,businessBaseline:baseline,page:()=>page,readCDesktopHost,assertCDesktopPositive,
  authorized:async label=>{events.push(label);if(options.authorizationFails&&label==='a12-normal-desktop-click')throw Error('SYNTHETIC_AUTH_STOP');},exact:async()=>actor,
  business:async()=>{businessReads++;return options.businessChanged&&businessReads>1?{changed:true}:baseline;},
  models:{c:{call:async(feature,command)=>{assert.equal(feature,'companions');assert.equal(command,'list');return {ownerAccountId:b.ownerAccountId,pets:[pet],sync:{status:'ready',pending:0}};},main:async(fn,input)=>{assert.equal(fn,readCDesktopHost);assert.equal(input.petId,b.petId);return {windows:[],nativeWindows:[]};}}},
  save:()=>checkpoints.push(plain(row)),click:async target=>{assert.equal(target,button);clicks++;events.push('ui-click');assert.equal(row.desktopPreparation.state,'submitted-outcome-unknown');assert.equal(row.state,'prepared');if(options.clickFails)throw Error('SYNTHETIC_CLICK_UNCERTAIN');},
  until:async(fn,accept)=>{const value=await fn();if(!accept(value))throw Error('SYNTHETIC_POSITIVE_TIMEOUT');return value;},
  observeA12Desktop:async expected=>{observations++;const value=observation(expected);if(options.notReady)value.renderer.status='loading';if(options.replaced&&observations>1){value.host.windows[0].windowId=18;value.host.nativeWindows[0].id=18;}return value;},
  routeAccount:async()=>{events.push('route-account');location.hash='#/account';}
 };
 const start=source.indexOf(' async function prepareA12Desktop('),end=source.indexOf(' async function signedoutPrivacy(',start);assert.ok(start>0&&end>start);
 const prepare=vm.runInNewContext(source.slice(start,end)+'\nprepareA12Desktop',ctx);
 return {b,row,adoption,events,checkpoints,location,prepare:()=>prepare(row),clicks:()=>clicks,businessReads:()=>businessReads};
}
test('actual A12 preparation uses the original pet UI exactly once and separately checkpoints the local intent',async()=>{
 const f=prepareFixture(),result=await f.prepare();assert.equal(f.clicks(),1);assert.equal(f.businessReads(),2);assert.equal(f.location.hash,'#/account');assert.equal(result.positive.windowId,17);assert.equal(result.binding.petId,f.adoption.petId);assert.equal(f.row.state,'prepared');
 assert.deepEqual(f.checkpoints.map(r=>r.desktopPreparation.state),['prepared','submitted-outcome-unknown','confirmed']);assert.ok(f.checkpoints.every(r=>r.state==='prepared'));assert.equal(f.row.desktopPreparation.positive.runId,f.b.runId);
 await assert.rejects(f.prepare(),/C_DESKTOP_PREPARATION_NO_REPLAY/);assert.equal(f.clicks(),1);
});
for(const [name,options,clicks,state]of[
 ['authorization removed',{authorizationFails:true},0,'failed-before-click'],['uncertain UI click',{clickFails:true},1,'unknown-do-not-retry'],['unready renderer',{notReady:true},1,'unknown-do-not-retry'],['replaced window',{replaced:true},1,'unknown-do-not-retry'],['business changed',{businessChanged:true},1,'unknown-do-not-retry']
])test('actual preparation fails closed without replay for '+name,async()=>{
 const f=prepareFixture(options);await assert.rejects(f.prepare());assert.equal(f.clicks(),clicks);assert.equal(f.row.state,'prepared');assert.equal(f.row.desktopPreparation.state,state);await assert.rejects(f.prepare(),/C_DESKTOP_PREPARATION_NO_REPLAY/);assert.equal(f.clicks(),clicks);
});
test('preparation does not adopt, toggle an unexpectedly visible pet, or accept unverified adoption history',async()=>{
 const visible=prepareFixture({preexisting:true});await assert.rejects(visible.prepare(),/C_DESKTOP_UNEXPECTED_PREEXISTING_PREFERENCE/);assert.equal(visible.clicks(),0);
 const unverified=prepareFixture();unverified.adoption.durableIntent.status='pending';await assert.rejects(unverified.prepare());assert.equal(unverified.clicks(),0);
});

function privacyFixture({leftover=false,otherRun=false,noPositive=false}={}){
 const b=binding(),positive=assertCDesktopPositive(b,observation()),evidence={binding:b,positive},routes=[],checks=[];let tick=0;
 if(otherRun)evidence.binding={...b,runId:'other-run'};if(noPositive)evidence.positive=null;
 const location={hash:'#/account'},history={back:()=>{location.hash='#/chat';},forward:()=>{location.hash='#/account';}},browserContext={location,history};
 const page={locator:()=>({waitFor:async()=>{}}),evaluate:async(fn,value)=>{if(fn.toString().includes('document.querySelector'))return {authVisible:true,sidebarCount:0,privateContentCount:0};const result=vm.runInNewContext('('+fn.toString()+')',browserContext)(value);routes.push(location.hash);return result;},waitForFunction:async fn=>assert.equal(vm.runInNewContext('('+fn.toString()+')',browserContext)(),true)};
 const ctx={assert,proof:{stages:[{name:'A13-first-adoption-guidance',petId:b.petId},{name:'A12-own-current-session-revoke',intentId:b.stageIntentId}]},runId:b.runId,identity:observation().actor,page:()=>page,session:async()=>({currentUser:null}),Date:{now:()=>tick},setTimeout:resolve=>{tick+=16000;resolve();},readCSignedoutDesktop,assertCSignedoutPrivacy,assertCDesktopRemoved,
  models:{c:{main:async(fn,id)=>{assert.equal(fn,readCSignedoutDesktop);checks.push(id);return readCSignedoutDesktop({BrowserWindow:{fromId:()=>leftover?nativeWindow({visible:false}):null,getAllWindows:()=>leftover?[nativeWindow({visible:false})]:[]}},id);}}}};
 const start=source.indexOf(' async function signedoutPrivacy('),end=source.indexOf(' async function login(',start),run=vm.runInNewContext(source.slice(start,end)+'\nsignedoutPrivacy',ctx);
 return {routes,checks,run:()=>run(async()=>{},evidence),runA15:()=>run(async()=>{})};
}
test('actual A12 cleanup checks original-window destruction through all four routes and both history directions',async()=>{
 const f=privacyFixture(),result=await f.run();assert.deepEqual(f.routes,['#/companions','#/companions/synthetic-pet','#/chat','#/account','#/chat','#/account']);assert.deepEqual(f.checks,[17,17,17,17,17,17]);assert.equal(result.routeObservations,6);assert.equal(result.priorVisibleDesktopNotEstablished,false);assert.equal(result.oldDesktopWindowDestroyed,true);
});
for(const [name,options]of[['hidden old window',{leftover:true}],['different run',{otherRun:true}],['missing positive',{noPositive:true}]])test('actual cleanup cannot claim pass with '+name,async()=>{const f=privacyFixture(options);await assert.rejects(f.run());});
test('A15 remains observation-only and truthfully reports no prior visible desktop',async()=>{
 const f=privacyFixture(),result=await f.runA15();assert.equal(result.priorVisibleDesktopNotEstablished,true);assert.equal(result.priorVisibleDesktopEstablished,undefined);assert.deepEqual(f.checks,[null,null,null,null,null,null]);
 const prior=source.slice(source.indexOf('  async verifyOldRejectedNewAccepted(){'),source.indexOf('  async revokeCurrentSession(){'));assert.equal(prior.includes('prepareA12Desktop'),false);assert.equal(prior.includes('desktopEvidence'),false);
});

function revokeFixture({prepareFails=false,targetChanged=false,windowLost=false}={}){
 const b=binding(),positive=assertCDesktopPositive(b,observation()),events=[],row={name:'A12-own-current-session-revoke',intentId:b.stageIntentId,state:'prepared'};let signedout=false,frozen=false,rpcs=0;
 const actor=observation().actor,target={...actor,bindingDigest:'synthetic-binding'},owned=observation().host.windows;
 const h={bindingDigest:target.bindingDigest,accounts:{services:{get:()=>({getDesktopWindows:()=>owned})},requireCloudActor:async()=>({actor,client:{rpc:async(name,payload)=>{assert.equal(name,'lingjing_revoke_device');assert.equal(payload.p_device_id,b.deviceId);rpcs++;events.push('rpc');return {data:{revoked:true}};}}})}};
 const ctx={assert,changed:true,revoked:false,__qaUiCaseContext:h,exact:async()=>events.push('exact'),prepareA12Desktop:async()=>{events.push('prepare');if(prepareFails)throw Error('SYNTHETIC_PREPARE_FAILED');return {binding:b,positive};},
  deps:{freezeCLogin:async()=>{events.push('freeze');frozen=true;},assertExactRevokeTarget:async()=>{events.push('target');assert.equal(frozen,true);return targetChanged?{...target,deviceId:'other'}:target;},assertAuthorization:async()=>events.push('readonly-authorization'),assertPersistentProfile:async()=>events.push('profile')},
  custodyModule:{assertCompletionAuthorization:()=>events.push('custody'),assertAuthorizedVault:()=>events.push('vault')},vault:{},session:async()=>({currentUser:signedout?null:{id:b.ownerAccountId}}),
  page:()=>({getByRole:(_role,{name})=>{assert.equal(name,'刷新云端数据');return {click:async()=>{events.push('refresh');signedout=true;}};},locator:()=>({waitFor:async()=>{}})}),
  models:{c:{main:async(fn,input)=>{events.push('main');return fn({BrowserWindow:{fromId:()=>windowLost?null:nativeWindow()}},input);}}},
  signedoutPrivacy:async(check,evidence)=>{events.push('privacy');await check();assert.equal(evidence.positive,positive);return {oldDesktopWindowDestroyed:true};},
  stage:async(name,fn)=>{assert.equal(name,row.name);return fn(row,()=>{row.state='submitted-outcome-unknown';events.push('submitted');});}
 };
 const start=source.indexOf('  async revokeCurrentSession(){'),end=source.indexOf('  async close(){',start),api=vm.runInNewContext('({'+source.slice(start,end)+'})',ctx);
 return {events,row,rpcs:()=>rpcs,run:()=>api.revokeCurrentSession()};
}
test('actual A12 method preserves one revoke, freeze/target guards and the original UI refresh',async()=>{
 const f=revokeFixture(),result=await f.run();assert.equal(f.rpcs(),1);assert.deepEqual(f.events.slice(0,9),['exact','prepare','freeze','target','submitted','main','rpc','refresh','privacy']);assert.equal(result.normalOwnSdk,true);assert.equal(result.privateUi.oldDesktopWindowDestroyed,true);
});
for(const [name,options,submitted]of[['preparation fails',{prepareFails:true},false],['target identity changes',{targetChanged:true},false],['positive window lost at dispatch',{windowLost:true},true]])test('actual A12 never sends revoke when '+name,async()=>{
 const f=revokeFixture(options);await assert.rejects(f.run());assert.equal(f.rpcs(),0);assert.equal(f.events.includes('submitted'),submitted);assert.equal(f.events.includes('refresh'),false);if(options.prepareFails)assert.equal(f.events.includes('freeze'),false);
});
