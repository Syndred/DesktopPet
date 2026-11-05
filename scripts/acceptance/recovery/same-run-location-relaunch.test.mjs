import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as crypto from 'node:crypto';
import * as path from 'node:path';

// Execute the actual private factory functions and location-fixture controller
// in isolated VMs. All accounts, processes, profiles, grants and clocks are
// synthetic. No admission, credential reader, network or process API is loaded.
const source=readFileSync(new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url),'utf8');
const fixturePath=path.resolve('scripts/acceptance/cloud-qa-ui-location-fixture.cjs');
const fixtureBytes=readFileSync(new URL('../cloud-qa-ui-location-fixture.cjs',import.meta.url));
const origin='https://jbvrdmrkwpznbrvteive.supabase.co';
const scenario='cloud-acceptance-20261027-8be246d1';
const roles=['a','a2','a3','b','c'];
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const marker=/^ \/\/ BEGIN A_UI_BINDING_RELAUNCH_INVALIDATION\n[\s\S]*?^ \/\/ END A_UI_BINDING_RELAUNCH_INVALIDATION\n/gm;
function withoutInvalidation(text){assert.equal([...text.matchAll(marker)].length,1);return text.replace(marker,'');}
function section(text,start,end){const i=text.indexOf(start),j=text.indexOf(end,i+start.length);assert.ok(i>=0&&j>i);return text.slice(i,j).replaceAll('export async function','async function');}

function lifecycle(text=source){
 let now=1000,failure=null,generation=0;
 const cap=Object.freeze({}),events=[],models={},grants=new Map(),allModels=[];
 const identities={A:{accountKey:'synthetic-a',owner:'owner-a',authUid:'auth-a'},B:{accountKey:'synthetic-b',owner:'owner-b',authUid:'auth-b'},C:{accountKey:'synthetic-c',owner:'owner-c',authUid:'auth-c'}};
 const slotFor=role=>role.startsWith('a')?'A':role.toUpperCase();
 const s={authorization:{},authorized:true,binding:{source:'github-environment-v1',run:'synthetic-run',nonce:'synthetic-nonce',packageSource:'a'.repeat(40),expiresAt:100000},completionOptions:{runId:'synthetic-case-run',packageBinding:{executable:'synthetic-only.exe'}},models,profiles:{},identities:{},scopeGrants:grants,supervisor:{ready:true,closed:false},grantsReleased:true,revoked:new Set()};
 const fail=stage=>{if(failure===stage)throw Error('SYNTHETIC_'+stage.toUpperCase());};
 const clock={now:()=>now};
 const own=value=>{assert.equal(value,cap);assert.equal(s.authorized,true);return s;};
 s.vault={async registerOwnedModel(value){events.push('register:'+value.role);fail('register');}};

 function makeModel(role,epoch,{signedIn=true,restored=false}={}){
  const id=identities[slotFor(role)],number=++generation;
  const actor={ownerAccountId:id.owner,authUserId:id.authUid,deviceId:'device-'+role,sessionId:'session-'+role+'-'+number,authKind:'supabase',authority:'live'};
  const profile='/synthetic/lingjing-live-holder-'+role;
  const location={adapter:{source:'synthetic-os'},reset(){events.push('location-reset:'+role+':'+number);}};
  const discovery={location,authority:{},cloudRuntime:{}};
  const handlers=new Map();
  const accounts={current:signedIn?{}:null,epoch:6+epoch,remote:{active:{actor},deviceId:actor.deviceId},services:{paths:{userData:profile},get:name=>name==='discovery'?discovery:null,session:{getOwnerAccountId:()=>actor.ownerAccountId},events:{on(name,fn){handlers.set(name,fn);return ()=>handlers.delete(name);}}},async requireCloudActor(){
   if(!this.current)throw Error('SYNTHETIC_SIGNED_OUT');
   return {actor:this.remote.active.actor,url:origin,invoke:async(name,body)=>{assert.equal(name,'discovery');assert.deepEqual(Object.keys(body),['op']);assert.equal(body.op,'protocol');events.push('protocol:'+role+':'+number);return {simulatedLocationAllowed:accounts.allowed!==false,scenarioId:accounts.protocolScenario||scenario};}};
  }};
  const held={accounts,binding:{role,profile},released:signedIn,epoch:accounts.epoch,expiresAt:100000,async release(grant){
   events.push('release:'+role+':'+number);fail('release');assert.ok(grant.expiresAtMs>now);
   for(const key of ['ownerAccountId','authUserId','deviceId'])assert.equal(accounts.remote.active.actor[key],grant[key]);
   assert.equal(accounts.allowed!==false,true);this.epoch=accounts.epoch;this.released=true;this.expiresAt=grant.expiresAtMs;
  }};
  let fixtureModule;
  const fakeFs={realpathSync:value=>value,readFileSync(value){assert.equal(value,fixturePath);return fixtureBytes;}};
  const model={role,number,profile,epoch,actor:signedIn?Object.fromEntries(['ownerAccountId','authUserId','deviceId'].map(k=>[k,actor[k]])):undefined,expectedDeviceId:actor.deviceId,launcherPid:number*2,runtime:{pid:number*2+1},closed:false,held,accounts,location,handlers,restored,
   async call(domain,method){assert.equal(domain,'accounts');assert.equal(method,'session');return {currentUser:accounts.current?{id:actor.ownerAccountId,authUserId:actor.authUserId}:null};},
   async main(fn,input){assert.equal(this.closed,false,'SYNTHETIC_PROCESS_STOPPED');context.__input=input;try{return await vm.runInContext('('+fn.toString()+')(null,__input)',context);}finally{delete context.__input;}}
  };
  const context=vm.createContext({Date:clock,Error,Map,WeakMap,Object,JSON,Number,Math,Promise,__qaUiCaseContext:held,module:{exports:{}},setInterval:()=>({unref(){}}),clearInterval(){},
   require(name){if(name==='node:fs')return fakeFs;if(name==='node:path')return path;if(name==='node:crypto')return crypto;throw Error('UNEXPECTED_SYNTHETIC_REQUIRE');},
   process:{env:{GITHUB_ACTIONS:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:s.binding.run},platform:'linux',resourcesPath:'/synthetic',getBuiltinModule(name){if(name==='node:fs')return fakeFs;if(name==='node:crypto')return crypto;if(name==='node:module')return {createRequire:()=>value=>{assert.equal(value,fixturePath);return fixtureModule;}};throw Error('UNEXPECTED_SYNTHETIC_BUILTIN');}}
  });
  vm.runInContext(fixtureBytes.toString('utf8'),context);fixtureModule=context.module.exports;model.context=context;allModels.push(model);return model;
 }
 for(const role of roles){const model=makeModel(role,1);models[role]=model;s.profiles[role]=model.profile;grants.set(role,{...model.accounts.remote.active.actor,role,scenario,expiresAtMs:100000});}
 const ctx=vm.createContext({assert,Date:clock,Error,Object,Map,Set,Promise,roles,scenario,origin,own,slotFor,FIXED_IDENTITIES:identities,sha,resolve:path.resolve,readFileSync:value=>{assert.equal(value,fixturePath);return fixtureBytes;},
  async stopModel(model){events.push('stop:'+model.role+':'+model.number);fail('stop');assert.equal(model.closed,false);model.held.locationFixture?.dispose();model.closed=true;},
  async startModel(value,role,epoch){own(value);events.push('start:'+role);fail('start');const model=makeModel(role,failure==='epoch'?epoch+1:epoch,{signedIn:false});models[role]=model;return model;},
  async normalLogin(value,role){own(value);events.push('login:'+role);fail('login');const model=models[role],actor=model.accounts.remote.active.actor;model.accounts.current={};model.actor=Object.fromEntries(['ownerAccountId','authUserId','deviceId'].map(k=>[k,actor[k]]));model.sessionEpoch=model.accounts.epoch;},
  async persistSafeIdentityManifest(value){own(value);events.push('manifest');fail('manifest');},
  createPlatformCellRequest({admission,model,actor,position,runId}){assert.equal(admission,s.authorization);assert.equal(model,models.a);assert.equal(actor.sessionId,model.accounts.remote.active.actor.sessionId);assert.equal(runId,s.completionOptions.runId);assert.equal(position.lat,45.3001);return Object.freeze({synthetic:true,model});},
  async launchPortableSession(options){assert.equal(options.profile,s.profiles.c);events.push('restore:c');fail('start');return makeModel('c',2,{restored:true});},appEnvironment:()=>({}),processIdentity:pid=>({pid}),captureAccountsForLifecycle:()=>{},installRestoredCAuthGuard:()=>{}
 });
 const executable=[
  section(text,'async function safeActor(','async function normalLogin('),
  section(text,'export async function launchNormalModel(','async function releaseAllKnownGrants('),
  section(text,'export async function assertSameRunGrant(','// BEGIN C_AUTHENTICATION_TRANSITION DEFINITIONS'),
  section(text,'async function installLocationBridge(','export async function registerCThroughNormalUi('),
  section(text,'export async function prepareDiscoveryUiBinding(','export async function getCompletionContext(')
 ].join('\n');
 const api=vm.runInContext(executable+'\n({launchNormalModel,awaitFreshS02TerritoryBinding,prepareDiscoveryUiBinding})',ctx);
 return {s,models,events,allModels,setFailure:value=>{failure=value;},setNow:value=>{now=value;},
  s02:()=>api.awaitFreshS02TerritoryBinding(cap,{runId:s.completionOptions.runId,scenario,ownerAccountId:identities.A.owner,petId:'synthetic-pet'}),
  m07:()=>api.prepareDiscoveryUiBinding(cap),
  relaunch:(role='a',overrides={})=>api.launchNormalModel(cap,{role,prior:models[role],identity:identities[slotFor(role)],vault:s.vault,expectedEpoch:models[role].epoch+1,...overrides})
 };
}

test('removing only the marked A invalidation restores the exact original factory including C guards',()=>{
 assert.equal(sha(withoutInvalidation(source)),'4cb797cbcab474631f8e848111037a036d976825f5a0f1c7682a7431b61abb2f');
 assert.match(source,/\/\/ BEGIN A_UI_BINDING_RELAUNCH_INVALIDATION\n if\(prior&&role==='a'\)\{\n  await persistSafeIdentityManifest\(cap\);\n  delete s\.uiBinding;\n  return model;\n \}\n \/\/ END A_UI_BINDING_RELAUNCH_INVALIDATION/);
});

test('S02 original binding, fixed A restart and M07 use the new actual model/session/epoch',async()=>{
 const f=lifecycle(),registry=f.models,old=f.models.a;await f.s02();
 const oldBinding=f.s.uiBinding,oldController=old.held.locationFixture;
 assert.equal((await f.m07()).model,old);assert.equal(oldController.status().active,true);
 const replacement=await f.relaunch();
 assert.equal(f.models,registry);assert.equal(f.models.a,replacement);assert.notEqual(replacement,old);assert.equal(old.closed,true);
 assert.equal(replacement.profile,old.profile);assert.equal(replacement.epoch,old.epoch+1);assert.equal(replacement.held.epoch,replacement.accounts.epoch);assert.equal(replacement.held.released,true);
 assert.equal(Object.hasOwn(f.s,'uiBinding'),false);assert.equal(replacement.held.locationFixture,undefined);assert.throws(()=>oldController.status(),{code:'QA_CAPABILITY_CHANGED'});
 const m07=await f.m07(),nextBinding=m07.binding,nextController=replacement.held.locationFixture;
 assert.equal(m07.model,replacement);assert.equal(nextBinding,f.s.uiBinding);assert.notEqual(nextBinding,oldBinding);assert.notEqual(nextController,oldController);
 assert.equal(nextBinding.sessionId,replacement.accounts.remote.active.actor.sessionId);assert.notEqual(nextBinding.sessionId,oldBinding.sessionId);assert.notEqual(nextBinding.bindingDigest,oldBinding.bindingDigest);
 for(const key of ['ownerAccountId','authUserId','deviceId','profilePath','scenarioId','sourceCommit','ciRunId','runId','nonce'])assert.equal(nextBinding[key],oldBinding[key]);
 assert.equal(nextController.status().bindingDigest,nextBinding.bindingDigest);const fix=await replacement.location.adapter.getPosition();assert.equal(fix.provider,'controlled-test-fixture');assert.equal(fix.scenarioId,scenario);
 assert.equal(f.events.filter(x=>x==='manifest').length,1);assert.ok(f.events.indexOf('stop:a:'+old.number)<f.events.indexOf('start:a'));assert.ok(f.events.indexOf('login:a')<f.events.indexOf('release:a:'+replacement.number));assert.ok(f.events.indexOf('release:a:'+replacement.number)<f.events.indexOf('manifest'));
});

test('the original unpatched path reproduces the stale-session M07 rejection',async()=>{
 const f=lifecycle(withoutInvalidation(source));await f.s02();const old=f.s.uiBinding;await f.relaunch();assert.equal(f.s.uiBinding,old);await assert.rejects(f.m07(),{code:'ERR_ASSERTION'});assert.equal(f.models.a.held.locationFixture,undefined);
});

test('a2, b and restored c restarts never clear or replace A location binding',async()=>{
 for(const role of ['a2','b','c']){const f=lifecycle();await f.s02();const binding=f.s.uiBinding,model=f.models.a,controller=model.held.locationFixture;await f.relaunch(role);assert.equal(f.s.uiBinding,binding);assert.equal(f.models.a,model);assert.equal(model.held.locationFixture,controller);assert.equal((await f.m07()).binding,binding);assert.equal(controller.status().active,true);}
});

test('initial A fast return preserves its binding and never performs restart work',async()=>{
 const f=lifecycle();await f.s02();const binding=f.s.uiBinding,model=f.models.a,n=f.events.length;
 assert.equal(await f.relaunch('a',{prior:undefined,expectedEpoch:model.epoch}),model);assert.equal(f.s.uiBinding,binding);assert.equal(f.events.length,n);
});

test('wrong prior, wrong vault/identity, a3 and lost grants reject before stopping or clearing',async()=>{
 const cases=[
  f=>({prior:{...f.models.a}}),f=>({vault:{}}),()=>({identity:{accountKey:'other'}}),
  f=>{f.s.authorized=false;return {};},f=>{f.s.grantsReleased=false;return {};},f=>{f.s.supervisor.closed=true;return {};},
  f=>{f.s.scopeGrants.delete('a');return {};},f=>{f.s.scopeGrants.get('a').expiresAtMs=1000;return {};},
  f=>{f.s.scopeGrants.get('a').deviceId='other';return {};},f=>{f.models.b.accounts.allowed=false;return {};},f=>{f.setNow(100000);return {};}
 ];
 for(const mutate of cases){const f=lifecycle();await f.s02();const binding=f.s.uiBinding,model=f.models.a;await assert.rejects(f.relaunch('a',mutate(f)));assert.equal(f.s.uiBinding,binding);assert.equal(f.models.a,model);assert.equal(f.events.some(x=>x.startsWith('stop:')),false);}
 const f=lifecycle();await f.s02();const binding=f.s.uiBinding;await assert.rejects(f.relaunch('a3'));assert.equal(f.s.uiBinding,binding);assert.equal(f.events.some(x=>x.startsWith('stop:')),false);
});

test('stop, start, login, epoch, release and manifest failures never clear the cached binding',async()=>{
 for(const stage of ['stop','start','login','epoch','release','manifest']){
  const f=lifecycle();await f.s02();const binding=f.s.uiBinding,original=f.models.a;f.setFailure(stage);
  await assert.rejects(f.relaunch());assert.equal(f.s.uiBinding,binding);assert.equal(f.events.filter(x=>x==='start:a').length,stage==='stop'?0:1);
  if(stage==='stop'){assert.equal(original.closed,false);assert.equal((await f.m07()).binding,binding);}
  else{assert.equal(original.closed,true);await assert.rejects(f.m07());}
  assert.equal(f.allModels.filter(m=>m.held.locationFixture).length,1);
 }
});

test('uncontrolled session changes cannot replace or relax the original strict M07 binding',async()=>{
 for(const key of ['sessionId','ownerAccountId','authUserId','deviceId']){
  const f=lifecycle();await f.s02();const binding=f.s.uiBinding,model=f.models.a,controller=model.held.locationFixture;
  model.accounts.remote.active.actor[key]='uncontrolled-'+key;
  await assert.rejects(f.m07(),{code:'ERR_ASSERTION'});assert.equal(f.s.uiBinding,binding);assert.equal(model.held.locationFixture,controller);assert.equal(f.events.some(x=>x.startsWith('stop:')),false);
 }
});

test('reinjecting the old binding after a controlled restart still fails rather than reusing its closure',async()=>{
 const f=lifecycle();await f.s02();const binding=f.s.uiBinding,old=f.models.a.held.locationFixture;await f.relaunch();f.s.uiBinding=binding;
 await assert.rejects(f.m07(),{code:'ERR_ASSERTION'});assert.equal(f.models.a.held.locationFixture,undefined);assert.throws(()=>old.status(),{code:'QA_CAPABILITY_CHANGED'});
});

test('fresh M07 installation rechecks original grants, deadline and released epoch after restart',async()=>{
 for(const mutate of [f=>{f.s.scopeGrants.delete('a');},f=>{f.s.scopeGrants.get('a').expiresAtMs=1000;},f=>{f.setNow(100000);},f=>{f.models.b.accounts.allowed=false;},f=>{f.models.a.held.released=false;},f=>{f.models.a.accounts.epoch++;}]){
  const f=lifecycle();await f.s02();await f.relaunch();mutate(f);await assert.rejects(f.m07());assert.equal(f.s.uiBinding,undefined);assert.equal(f.models.a.held.locationFixture,undefined);
 }
});

test('new controller is bound to its new held context and epoch, never the disposed old closure',async()=>{
 for(const change of ['context','epoch','expiry']){
  const f=lifecycle();await f.s02();const old=f.models.a;await f.relaunch();await f.m07();const model=f.models.a,controller=model.held.locationFixture;
  old.accounts.epoch++;assert.equal(controller.status().active,true);
  if(change==='context')model.context.__qaUiCaseContext={...model.held};else if(change==='epoch')model.accounts.epoch++;else f.setNow(100000);
  assert.throws(()=>controller.status(),/LIVE_CAPABILITY_EXPIRED|QA_SESSION_CHANGED/);
 }
});
