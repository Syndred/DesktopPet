import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createRequire} from 'node:module';
import {companionIdentity} from '../../apps/pc-app/runtime/features/companions/display-identity.mjs';
import {requireUiBinding,installUiFaultProbe,assertNearbyFailureBinding,assertNearbyFailureUi,readNearbyFailureUi} from './cloud-live-qa-discovery-ui-cases.mjs';
const binding={bindingDigest:'a'.repeat(64),sourceCommit:'b'.repeat(40),profilePath:tmpdir(),ownerAccountId:'test-owner',authUserId:'test-auth',deviceId:'test-device',sessionId:'test-session'};
let fixtureDirectory=null;
function fixture(){assert.equal(fixtureDirectory,null);fixtureDirectory=realpathSync(mkdtempSync(join(tmpdir(),'lingjing-discovery-ui-contract-')));binding.profilePath=fixtureDirectory;const actor={...binding,authKind:'supabase',authority:'live'},context={actor,invoke:async()=>({original:true})};const adapter={getPosition:async()=>({ok:true})};const authority={requireActor:async()=>context};const location={adapter,snapshot:()=>({status:'ready',fix:null})};const d={location,authority,cloudRuntime:{},nearby:()=>({spawns:[]})};const services={get:k=>k==='discovery'?d:null,session:{getOwnerAccountId:()=>binding.ownerAccountId},paths:{userData:fixtureDirectory}};const accounts={services,epoch:1};globalThis.__qaUiCaseContext={accounts,bindingDigest:binding.bindingDigest,locationFixture:{status:()=>({active:true,bindingDigest:binding.bindingDigest,normalCloudAuthority:true})}};return{adapter,authority,accounts,context,location,d,services};}
function clean(){delete globalThis.__qaUiCaseContext;delete globalThis.__qaDiscoveryUiFault;if(fixtureDirectory!==null){rmSync(fixtureDirectory,{recursive:true});fixtureDirectory=null;binding.profilePath=tmpdir();}}
test('binding is exact and complete',()=>{assert.equal(requireUiBinding(binding),binding);for(const key of Object.keys(binding))assert.throws(()=>requireUiBinding({...binding,[key]:null}));});
test('missing installed holder is hard not-ready',async()=>{clean();await assert.rejects(installUiFaultProbe(null,binding),{code:'UI_FIXTURE_NOT_READY'});});
test('source single fault then original recovery, exact cleanup',async()=>{const f=fixture(),original=f.adapter.getPosition;try{await installUiFaultProbe(null,binding);globalThis.__qaDiscoveryUiFault.arm('source');await assert.rejects(f.adapter.getPosition(),{code:'LOCATION_UNAVAILABLE'});assert.deepEqual(await f.adapter.getPosition(),{ok:true});assert.equal(globalThis.__qaDiscoveryUiFault.read().sourceFailures,1);globalThis.__qaDiscoveryUiFault.restore();assert.equal(f.adapter.getPosition,original);}finally{clean();}});
test('nearby single before-send does not fabricate or alter other responses',async()=>{const f=fixture();try{await installUiFaultProbe(null,binding);globalThis.__qaDiscoveryUiFault.arm('nearby');const c=await f.authority.requireActor();assert.deepEqual(await c.invoke('discovery',{op:'protocol'}),{original:true});await assert.rejects(c.invoke('discovery',{op:'nearby'}),{code:'CLOUD_UNAVAILABLE'});assert.deepEqual(await c.invoke('discovery',{op:'nearby'}),{original:true});assert.equal(globalThis.__qaDiscoveryUiFault.read().nearbySuccesses,1);globalThis.__qaDiscoveryUiFault.restore();}finally{clean();}});
test('install await external method replacement is never overwritten',async()=>{const f=fixture(),foreign=async()=>({foreign:true});f.authority.requireActor=async()=>{f.adapter.getPosition=foreign;return f.context;};try{await assert.rejects(installUiFaultProbe(null,binding),{code:'PROBE_INSTALL_CHANGED'});assert.equal(f.adapter.getPosition,foreign);}finally{clean();}});
test('teardown does not overwrite foreign methods',async()=>{const f=fixture(),foreign=async()=>{};try{await installUiFaultProbe(null,binding);f.adapter.getPosition=foreign;assert.throws(()=>globalThis.__qaDiscoveryUiFault.restore(),{code:'PROBE_REPLACED'});assert.equal(f.adapter.getPosition,foreign);}finally{clean();}});


// These fixtures execute the real refresh/nearby methods with stubbed reads,
// proofs and transport. No application, SQLite, browser, credentials or network.
const require=createRequire(import.meta.url);
const {DiscoveryService}=require('../../apps/pc-app/runtime/features/discovery/service.cjs');
const {CloudDiscoveryRuntime}=require('../../apps/pc-app/runtime/features/discovery/cloud-runtime.cjs');
const {distanceMeters,geofence}=require('../../apps/pc-app/runtime/features/discovery/coordinates.cjs');
function runtimeFixture(){
 const f=fixture(),clock=1792895000000;
 const state={status:'ready',mode:'real',watching:false,fix:{source:'simulated',scenarioId:'isolated-test',provider:'controlled-test-fixture',coordinateSystem:'wgs84',accuracyMeters:5,timestampMs:clock,lat:42.3,lng:-71.1}};
 f.location.snapshot=()=>structuredClone(state);f.location.policyAllowed=()=>true;f.location.metricFix=fix=>({...fix,source:'os'});
 const spawns=[0,1,2].map(index=>({id:`test-point-${index}`,templateId:'animal-wood-deer',name:`synthetic ${index}`,resourceId:`test-resource-${index}`,position:{lat:state.fix.lat+index*.0006,lng:state.fix.lng},expiresAt:clock+600000,globalSerial:String(index+1)}));
 const payload={source:'simulated',scenarioId:state.fix.scenarioId,spawns,serverTime:clock};
 let response=structuredClone(payload);const calls=[];
 f.context.invoke=async(feature,body)=>{assert.equal(feature,'discovery');calls.push(body.op);if(body.op==='permits')return[];assert.equal(body.op,'nearby');return structuredClone(response);};
 f.authority.invoke=async(op,body={})=>(await f.authority.requireActor()).invoke('discovery',{op,...body});
 f.services.session.requireOwner=()=>binding.ownerAccountId;
 f.d.getOwner=()=>binding.ownerAccountId;f.d.repo={list:()=>[]};f.d.now=()=>state.fix.timestampMs;
 f.d.nearby=()=>DiscoveryService.prototype.nearby.call(f.d);
 const runtime=new CloudDiscoveryRuntime(f.services,f.d,{prove:async()=>({id:'isolated-proof',fix:structuredClone(state.fix)})});
 f.d.cloudRuntime=runtime;runtime.nearbyState={...structuredClone(payload),timestampMs:clock};
 return {...f,state,runtime,calls,setResponse:value=>{response=value;},payload};
}
async function failureFixture(){
 const f=runtimeFixture();await installUiFaultProbe(null,binding);const probe=globalThis.__qaDiscoveryUiFault,before=probe.read();
 probe.arm('nearby');f.state.fix.timestampMs+=1000;f.state.fix.lat+=.0004;
 await assert.rejects(f.runtime.refresh(),{code:'CLOUD_UNAVAILABLE'});
 return {...f,probe,before,failed:probe.read()};
}
function visible(state,index=0,radius=450){
 const spawns=state.view.spawns.filter(spawn=>spawn.distanceMeters<=radius),selected=spawns[index],identity=selected&&companionIdentity(selected);
 return {error:'受控附近请求暂时不可用，请重试',retryEnabled:true,radius,countText:`${spawns.length} 位伙伴`,
  selected:selected?{name:identity.roleName,number:`编号 ${identity.instanceNumber}`,resourceId:selected.resourceId,distance:`${selected.distanceMeters} m · ${selected.inRange?'可挑战':'前往附近'}`}:null,
  rows:spawns.filter(spawn=>spawn.id!==selected?.id).slice(0,3).map(spawn=>({name:spawn.name,resourceId:spawn.resourceId,distance:`${spawn.distanceMeters} m`})),
  markers:spawns.slice(0,8).map(spawn=>({id:spawn.id,label:`${spawn.name}，距离 ${spawn.distanceMeters} 米`,selected:spawn.id===selected?.id}))};
}
test('real runtime failure retains old payload and position bindings while recomputing current geometry',async()=>{
 try{
  const f=await failureFixture();assert.deepEqual(f.calls,['permits']);assert.equal(f.runtime.pendingRefresh,null);assert.equal(f.failed.nearbyFailureStage,'refresh-rejected');
  assert.equal(assertNearbyFailureBinding(f.before,f.failed).backgroundRecoveryApplied,false);
  assert.deepEqual(f.runtime.nearbyState,{...f.payload,timestampMs:f.before.remoteTimestamp});
  const preview=f.d.nearby().spawns,metric=f.location.metricFix(f.state.fix);
  for(const [index,spawn] of preview.entries()){
   assert.deepEqual(spawn.position,f.payload.spawns[index].position);
   assert.equal(spawn.distanceMeters,Math.round(distanceMeters(metric,spawn.position)));
   assert.equal(spawn.inRange,geofence(metric,spawn.position,100,f.state.fix.timestampMs).ok);
  }
  assert.notEqual(f.failed.view.spawns[0].distanceMeters,f.before.view.spawns[0].distanceMeters);
  assert.equal(assertNearbyFailureUi(visible(f.before),[{origin:'prior',state:f.before}]).origin,'prior');
  assert.equal(assertNearbyFailureUi(visible(f.failed),[{origin:'retained',state:f.failed}]).origin,'retained');
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('later actual refresh success is distinguished from the immutable failed attempt',async()=>{
 try{
  const f=await failureFixture(),atFault=structuredClone(f.failed.nearbyFailure);
  f.setResponse({...f.payload,serverTime:f.state.fix.timestampMs,spawns:f.payload.spawns.map(spawn=>({...spawn,id:'new-'+spawn.id,position:{...spawn.position,lng:spawn.position.lng+.0001}}))});
  await f.runtime.refresh();const recovered=f.probe.read();
  assert.equal(assertNearbyFailureBinding(f.before,recovered).backgroundRecoveryApplied,true);
  assert.deepEqual(recovered.nearbyFailure,atFault);assert.equal(recovered.remoteTimestamp,f.state.fix.timestampMs);
  assert.deepEqual(f.calls,['permits','permits','nearby']);
  assert.equal(assertNearbyFailureUi(visible(recovered),[{origin:'old',state:f.before},{origin:'recovered',state:recovered}]).origin,'recovered');
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('a completed transport response not yet applied does not claim background recovery',async()=>{
 try{
  const f=await failureFixture(),context=await f.authority.requireActor();await context.invoke('discovery',{op:'nearby'});
  const observed=f.probe.read();assert.equal(observed.nearbySuccesses,1);assert.equal(assertNearbyFailureBinding(f.before,observed).backgroundRecoveryApplied,false);
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
for(const [name,mutate] of [
 ['new timestamp on old payload',f=>{f.runtime.nearbyState.timestampMs=f.state.fix.timestampMs;}],
 ['relocated original point',f=>{f.runtime.nearbyState.spawns[0].position.lat+=.01;}],
 ['replaced original point',f=>{f.runtime.nearbyState.spawns[0].id='invented';}],
 ['cleared old results',f=>{f.runtime.nearbyState.spawns=[];}],
 ['changed original source',f=>{f.runtime.nearbyState.source='os';}],
 ['changed original scenario',f=>{f.runtime.nearbyState.scenarioId='other';}]
])test(`rejects ${name} without a matching successful response`,async()=>{
 try{const f=await failureFixture();mutate(f);assert.throws(()=>assertNearbyFailureBinding(f.before,f.probe.read()));}
 finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('a success counter or unrelated successful payload cannot excuse relabelled results',async()=>{
 try{
  const f=await failureFixture();f.setResponse({...f.payload,serverTime:f.payload.serverTime+1});
  await(await f.authority.requireActor()).invoke('discovery',{op:'nearby'});
  f.runtime.nearbyState.timestampMs=f.state.fix.timestampMs;
  assert.throws(()=>assertNearbyFailureBinding(f.before,f.probe.read()),/matching authenticated successful nearby response/);
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('read observations cannot mutate the product, frozen failure or response ledger',async()=>{
 try{
  const f=await failureFixture();const a=f.probe.read();a.nearbyFailure.remote.timestampMs=-1;a.location.fix.lat=0;a.view.spawns[0].id='tampered';a.nearbyResponses.push({sequence:99});
  assert.deepEqual(f.probe.read(),f.failed);assert.equal(f.d.nearby().spawns[0].id,f.payload.spawns[0].id);
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
for(const [name,mutate] of [
 ['failure-time rebind',value=>{value.nearbyFailure.remote.timestampMs=value.nearbyFailure.location.fix.timestampMs;}],
 ['failure-time payload mutation',value=>{value.nearbyFailure.remote.payloadSha256='changed';}],
 ['projected point rebind',value=>{value.view.bindingsSha256='changed';}],
 ['failure projected point rebind',value=>{value.nearbyFailure.view.bindingsSha256='changed';}],
 ['later unobserved fix',value=>{value.location.fix.timestampMs++;}],
 ['missing exact failure',value=>{value.nearbyFailure=null;}]
])test(`binding assertion rejects ${name}`,async()=>{
 try{const f=await failureFixture(),bad=structuredClone(f.failed);mutate(bad);assert.throws(()=>assertNearbyFailureBinding(f.before,bad));}
 finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
for(const [name,mutate] of [
 ['hidden error',ui=>{ui.error=null;}],['disabled retry',ui=>{ui.retryEnabled=false;}],
 ['invented pin identity',ui=>{ui.markers[0].id='invented';}],['incorrect pin distance',ui=>{ui.markers[0].label='synthetic 0，距离 0 米';}],
 ['incorrect selected distance',ui=>{ui.selected.distance='0 m · 可挑战';}],['incorrect selected number',ui=>{ui.selected.number='编号 9999';}],
 ['incorrect result count',ui=>{ui.countText='999 位伙伴';}],['mixed old/new row',ui=>{ui.rows[0].name='invented';}],
 ['silently missing old points',ui=>{ui.countText='0 位伙伴';ui.selected=null;ui.rows=[];ui.markers=[];}]
])test(`visible failure assertion rejects ${name}`,async()=>{
 try{const f=await failureFixture(),ui=visible(f.failed);mutate(ui);assert.throws(()=>assertNearbyFailureUi(ui,[{origin:'error',state:f.failed}]));}
 finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('UI accepts display-only radius, selected point and unavailable tiles without inventing points',async()=>{
 try{
  const f=await failureFixture(),ui=visible(f.failed,1,100);ui.markers=[];
  const result=assertNearbyFailureUi(ui,[{origin:'retained',state:f.failed}]);assert.equal(result.origin,'retained');assert.equal(result.markerCount,0);
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('UI may show a truthful empty radius after movement; it is not required to clear stored remote results',async()=>{
 try{
  const f=await failureFixture();const far=structuredClone(f.failed);far.view.spawns=far.view.spawns.map(spawn=>({...spawn,distanceMeters:500,inRange:false}));
  const result=assertNearbyFailureUi(visible(far),[{origin:'far',state:far}]);assert.equal(result.count,0);assert.ok(f.failed.remoteCount>0);
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('authority guards remain active for read and fault dispatch, and restore clears the private observer',async()=>{
 for(const change of [f=>{f.accounts.epoch++;},f=>{f.services.session.getOwnerAccountId=()=> 'other';},f=>{globalThis.__qaUiCaseContext.locationFixture.status=()=>({active:false});}]){
  const f=fixture();try{await installUiFaultProbe(null,binding);change(f);assert.throws(()=>globalThis.__qaDiscoveryUiFault.read());await assert.rejects(f.adapter.getPosition());globalThis.__qaDiscoveryUiFault.restore();assert.equal(globalThis.__qaDiscoveryUiFault,undefined);}finally{clean();}
 }
});
test('actor mismatch and foreign authority are rejected without invoking transport',async()=>{
 for(const mutate of [actor=>{actor.sessionId='other';},actor=>{actor.deviceId='other';},actor=>{actor.authUserId='other';},actor=>{actor.authority='simulated';}]){
  const f=fixture();try{await installUiFaultProbe(null,binding);mutate(f.context.actor);await assert.rejects(f.authority.requireActor());globalThis.__qaDiscoveryUiFault.restore();}finally{clean();}
 }
});
test('DOM reader is serialization-safe and never requests data or changes state',()=>{
 const source=readNearbyFailureUi.toString();assert.match(source,/data-current-route/);assert.match(source,/data-spawn-id/);assert.doesNotMatch(source,/lingjing|invoke|click|dispatch|setAttribute|localStorage|__react/);
 assert.equal(typeof(new Function(`return (${source})`))(),'function');
});

test('an authentic success may return the same points, without requiring fabricated new identities',async()=>{
 try{const f=await failureFixture();await f.runtime.refresh();const observed=f.probe.read();assert.equal(observed.remote.payloadSha256,f.before.remote.payloadSha256);assert.equal(assertNearbyFailureBinding(f.before,observed).backgroundRecoveryApplied,true);}
 finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('active location watch invalidates the supposedly manual-only observation',async()=>{
 try{const f=await failureFixture();f.state.watching=true;assert.throws(()=>assertNearbyFailureBinding(f.before,f.probe.read()),/must not race location watch/);}
 finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('identity guards reject a late successful transport response after an epoch change',async()=>{
 const f=fixture();let finish;
 try{
  await installUiFaultProbe(null,binding);f.context.invoke=()=>new Promise(resolve=>{finish=resolve;});
  const original=await f.authority.requireActor(),pending=original.invoke('discovery',{op:'nearby'});f.accounts.epoch++;finish({spawns:[]});
  await assert.rejects(pending,{code:'UI_FIXTURE_CHANGED'});globalThis.__qaDiscoveryUiFault.restore();assert.equal(globalThis.__qaDiscoveryUiFault,undefined);
 }finally{clean();}
});
test('duplicate visible pins are not accepted as retained original points',async()=>{
 try{const f=await failureFixture(),ui=visible(f.failed);ui.markers.push({...ui.markers[0]});assert.throws(()=>assertNearbyFailureUi(ui,[{origin:'retained',state:f.failed}]),/must not duplicate/);}
 finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});

test('a before-send sample alone cannot claim the post-rejection retention assertion',async()=>{
 try{const f=await failureFixture(),observed=structuredClone(f.failed);observed.nearbyFailureStage='before-send';assert.throws(()=>assertNearbyFailureBinding(f.before,observed),/Observe rejected refresh/);}
 finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('the rejection observation precedes an immediate caller-triggered background recovery',async()=>{
 try{
  const f=runtimeFixture();await installUiFaultProbe(null,binding);const probe=globalThis.__qaDiscoveryUiFault,before=probe.read();
  probe.arm('nearby');f.state.fix.timestampMs+=1000;
  await f.runtime.refresh().catch(async error=>{assert.equal(error.code,'CLOUD_UNAVAILABLE');assert.equal(probe.read().nearbyFailureStage,'refresh-rejected');await f.runtime.refresh();});
  const observed=probe.read();assert.equal(observed.nearbyFailure.nearbySuccesses,before.nearbySuccesses);assert.deepEqual(observed.nearbyFailure.remote,before.remote);assert.equal(assertNearbyFailureBinding(before,observed).backgroundRecoveryApplied,true);
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});
test('post-rejection rebinding is caught even when the before-send state was correct',async()=>{
 try{
  const f=runtimeFixture();await installUiFaultProbe(null,binding);const probe=globalThis.__qaDiscoveryUiFault,before=probe.read();probe.arm('nearby');f.state.fix.timestampMs+=1000;
  const pending=f.runtime.refresh();
  // A deliberately bad rejection reaction in this isolated fixture runs before
  // the observer attached at the fault. A before-send-only check would miss it.
  void f.runtime.pendingRefresh.catch(()=>{f.runtime.nearbyState.timestampMs=f.state.fix.timestampMs;});
  await assert.rejects(pending,{code:'CLOUD_UNAVAILABLE'});const observed=probe.read();
  assert.equal(observed.nearbyFailureStage,'refresh-rejected');assert.equal(observed.nearbyFailure.remote.timestampMs,f.state.fix.timestampMs);
  assert.throws(()=>assertNearbyFailureBinding(before,observed),/retain the original timestamp/);
 }finally{globalThis.__qaDiscoveryUiFault?.restore();clean();}
});

// DOM-shaped isolated reader fixture. checkVisibility models the browser's
// ancestor-aware result and requires both native checks to be requested.
function domVisibilityFixture(style={}){
 const wrapper={parentElement:null,style},root={parentElement:wrapper,style:{}};
 const node=(textContent='',attrs={})=>({parentElement:root,style:{},textContent,
  getClientRects:()=>[{}],getAttribute:key=>attrs[key]??null,
  checkVisibility(options){
   assert.deepEqual(options,{checkOpacity:true,checkVisibilityCSS:true});
   for(let current=this;current;current=current.parentElement){
    const css=current.style;
    if(css.opacity==='0'||css.display==='none'||['hidden','collapse'].includes(css.visibility))return false;
   }
   return true;
  },querySelector:()=>null});
 const alert=node('受控附近请求暂时不可用，请重试'),retry=node(),hero=node(),row=node(),marker=node('',{'data-spawn-id':'test-point','aria-label':'synthetic，距离 20 米','aria-pressed':'true'});
 retry.disabled=false;
 const heroParts={'h2':node('鹿'),'.discovery-instance-number':node('编号 0001'),'[data-resource-id]':node('',{'data-resource-id':'test-resource'}),'.discovery-distance':node('20 m · 可挑战')};
 const rowParts={'strong':node('synthetic row'),'[data-resource-id]':node('',{'data-resource-id':'test-row-resource'}),':scope > span:last-of-type':node('30 m')};
 hero.querySelector=selector=>heroParts[selector]??null;row.querySelector=selector=>rowParts[selector]??null;
 const entries={'.discovery-selected-hero':hero,'.discovery-alert[role="alert"]':alert,'button[aria-label="更新场景位置"]':retry,'select[aria-label="附近显示范围"]':{value:'450'},'.discovery-nearby-heading span':node('2 位伙伴')};
 root.querySelector=selector=>entries[selector]??null;root.querySelectorAll=selector=>selector==='.discovery-nearby-row'?[row]:selector==='.discovery-pin-button'?[marker]:[];
 const read=()=>new Function('document',`return (${readNearbyFailureUi.toString()})()` )({querySelector:()=>root});
 return{read,root,wrapper,alert,retry,hero,row,marker};
}
test('serialized DOM reader includes opaque visible children through visible ancestors',()=>{
 const f=domVisibilityFixture({opacity:'1',visibility:'visible',display:'block'}),sample=f.read();
 assert.equal(sample.error,'受控附近请求暂时不可用，请重试');assert.equal(sample.retryEnabled,true);assert.equal(sample.selected.name,'鹿');assert.equal(sample.rows.length,1);assert.equal(sample.markers.length,1);
});
for(const [name,style] of [['transparent',{opacity:'0'}],['hidden',{visibility:'hidden'}],['collapsed',{visibility:'collapse'}],['display-none',{display:'none'}]])test(`serialized DOM reader excludes children of a ${name} ancestor`,()=>{
 const sample=domVisibilityFixture(style).read();
 assert.equal(sample.error,null);assert.equal(sample.retryEnabled,false);assert.equal(sample.selected,null);assert.deepEqual(sample.rows,[]);assert.deepEqual(sample.markers,[]);
 assert.throws(()=>assertNearbyFailureUi(sample,[]),/visibly reported/);
});
test('serialized DOM reader excludes individually transparent error, retry, hero, row and marker',()=>{
 const f=domVisibilityFixture();for(const key of ['alert','retry','hero','row','marker'])f[key].style.opacity='0';const sample=f.read();
 assert.equal(sample.error,null);assert.equal(sample.retryEnabled,false);assert.equal(sample.selected,null);assert.deepEqual(sample.rows,[]);assert.deepEqual(sample.markers,[]);
});
