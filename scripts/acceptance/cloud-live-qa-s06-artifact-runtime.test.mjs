// Runs the actual factory, transition and gate functions in an isolated VM.
// The account/protocol boundary is synthetic and has no network, process or
// credential APIs. No production admission/capability is minted by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import * as bindings from './cloud-live-qa-s06-actor-binding.mjs';
import {FIXED_IDENTITIES} from './dpapi/authorized-vault-client.mjs';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const source=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const moduleBody=text=>text.replace(/^import .*\n/gm,'').replace(/^export /gm,'');
function section(text,start,end){const a=text.indexOf(start),b=end?text.indexOf(end,a):text.length;assert.ok(a>=0&&b>a);return text.slice(a,b).replace(/^export /gm,'');}
function fixture(options={}){
 let now=1800000000000,monotonic=0,baseline=false,formalA3=false,snapshotCount=0,actorReads=0;
 const admission=Object.freeze({}),cap=Object.freeze({}),vault={async assertCustodyCapability(credential,input){assert.equal(credential,cCredential);assert.equal(input.registrationConfirmed,true);assert.equal(input.owner,cIdentity.owner);assert.equal(input.authUid,cIdentity.authUid);}},cCredential=Object.freeze({});
 const binding={source:'github-environment-v1',run:'123',attempt:1,commit:'a'.repeat(40),requestDigest:'b'.repeat(64),nonce:uuid(30),scenario:'cloud-acceptance-20261027-8be246d1',businessDeadline:now+120000,expiresAt:now+180000,absoluteCleanupDeadlineMs:now+200000};
 const cIdentity={accountKey:FIXED_IDENTITIES.C.accountKey,owner:'account:'+uuid(1),authUid:uuid(2)},actors={},models={},files=new Map(),events=[];
 const roles=bindings.S06_ACTOR_ROLES;
 function assertAdmission(value){assert.equal(value,admission,'ISOLATED_ADMISSION_REQUIRED');assert.ok(now<binding.expiresAt);return binding;}
 const authorization={...binding};
 for(const [i,role] of roles.entries()){
  const id=role.startsWith('a')?FIXED_IDENTITIES.A:role==='b'?FIXED_IDENTITIES.B:cIdentity;
  actors[role]={ownerAccountId:id.owner,authUserId:id.authUid,deviceId:uuid(i+10),sessionId:uuid(i+20),epoch:i+1};
  class Remote{
   constructor(){this.deviceId=actors[role].deviceId;this.config={url:'https://jbvrdmrkwpznbrvteive.supabase.co'};this.active=null;this.fetcher=async(_url,input)=>{const body=JSON.parse(input.body);if(body.op==='protocol'){const allowed=role==='a3'?formalA3:baseline;return {protocol:'lingjing-discovery-v2',serverTime:now,...(allowed?{simulatedLocationAllowed:true,scenarioId:binding.scenario}:{})};}if(body.op==='snapshot'){snapshotCount++;events.push('original-snapshot');if(options.snapshotFails)throw Error('SYNTHETIC_SNAPSHOT_FAILED');if(options.changePeerDuringSnapshot)actors.b.sessionId=uuid(999);return {ownerAccountId:actors.a3.ownerAccountId,authority:'live',serialRegistryError:options.wrongWarning?'OTHER':'GLOBAL_SERIAL_SCOPE_REVOKED',module:{}};}return {};};}
   async request(name,body){const result=await this.fetcher(this.config.url+'/functions/v1/'+name,{body:JSON.stringify(body)});if(body.op==='login')this.active={actor:actors[role]};return result;}
  }
  const remote=new Remote();
  class Accounts{constructor(){this.epoch=actors[role].epoch;this.remote=remote;}privateSession(){return remote.active?.actor;}async requireCloudActor(){actorReads++;assert.ok(remote.active);const actor={...actors[role],authKind:'supabase',authority:'live'};return {actor,invoke:(name,body)=>remote.request(name,body,{actor})};}}
  const accounts=new Accounts(),h={accounts,released:false,async release(grant){for(const k of ['ownerAccountId','authUserId','deviceId'])assert.equal(grant[k],actors[role][k]);assert.ok(grant.expiresAtMs>now);this.released=true;return {released:true};}};
  const DateClock=class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  const ctx=vm.createContext({Date:DateClock,Error,Map,process:{resourcesPath:'/synthetic',getBuiltinModule(name){assert.equal(name,'node:module');return {createRequire:()=>()=>({SupabaseRemote:Remote,AccountsService:Accounts})};}},__qaUiCaseContext:h});
  models[role]={role,accounts,remote,context:ctx,actor:Object.fromEntries(['ownerAccountId','authUserId','deviceId'].map(k=>[k,actors[role][k]])),expectedDeviceId:actors[role].deviceId,
   async main(fn,input){now++;monotonic++;ctx.input=input;return vm.runInContext('('+fn.toString()+')(null,input)',ctx);},
   async call(domain,method){if(domain==='accounts'){assert.equal(method,'session');return {currentUser:remote.active?{id:actors[role].ownerAccountId,authUserId:actors[role].authUserId}:null};}assert.equal(domain,'companions');assert.equal(method,'list');const c=await accounts.requireCloudActor(),result=await c.invoke('companions-sync',{op:'snapshot'});return {sync:{metadataError:result.serialRegistryError}};}
  };
  if(role!=='a3')remote.active={actor:actors[role]};
 }
 const clock={now:()=>now},output=resolve('artifacts/qa/same-run-'+binding.run);
 function write(file,text,opts){if(opts?.flag==='wx')assert.equal(files.has(file),false);files.set(file,JSON.parse(text));if(file.endsWith('awaiting-platform-grant-transition.json')){baseline=true;events.push('baseline');}}
 const realmAssert={...assert,deepEqual:(a,b,message)=>assert.deepEqual(structuredClone(a),structuredClone(b),message)};
 const shared={assert:realmAssert,...bindings,FIXED_IDENTITIES,Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}},Object,Map,Set,WeakMap,Promise,Error,structuredClone,resolve,join,setTimeout(){throw Error('Unexpected wait in immediate synthetic flow');},performance:{now:()=>monotonic},assertPlatformAdmission:assertAdmission,assertAuthorizedVault:value=>assert.equal(value,vault),lstatSync:()=>({isDirectory:()=>true,isSymbolicLink:()=>false}),realpathSync:{native:value=>value},writeFileSync:write};
 // The exact real transition implementation uses the actual shared validators.
 Object.defineProperty(vault,'authorization',{value:authorization});
 const transition=vm.runInNewContext(moduleBody(source('./cloud-live-qa-s06-platform-transition.mjs'))+'\n({observePlatformFourGrantTransition,consumePlatformGrantTransition})',shared);
 const gate=vm.runInNewContext(moduleBody(source('./cloud-live-qa-s06-prelogin-gate.mjs'))+'\n({installPlatformS06BeforeLogin,s06GateSafeManifest,admitPlatformS06SingleSnapshot,releasePlatformS06AfterFormalGrant})',{...shared,...transition,process:{platform:'win32',env:{GITHUB_ACTIONS:'true',GITHUB_RUN_ATTEMPT:'1'}},validateS06PregrantSnapshot(){throw Error('Legacy path forbidden');}});
 const state={authorization:admission,binding,models,identities:{C:cIdentity},output,vault,scopeGrants:new Map(),supervisor:{ready:true,closed:false},revoked:new Set()};
 const factorySource=source('./recovery/same-run-normal-lifecycle-factory.mjs');
 const factory=vm.runInNewContext([
  section(factorySource,'async function safeActor(','async function normalLogin('),
  section(factorySource,'// BEGIN S06_ORIGINAL_ACTOR_ARTIFACT','// END S06_ORIGINAL_ACTOR_ARTIFACT'),
  section(factorySource,'export async function assertSameRunGrant(','// BEGIN C_AUTHENTICATION_TRANSITION DEFINITIONS'),
  section(factorySource,'async function releasePlatformGrants('),
  '\n({persistSafeIdentityManifest,releasePlatformGrants,safeWriteOriginalIdentity})'
 ].join('\n'),{...shared,...transition,...gate,roles,scenario:binding.scenario,own:value=>{assert.equal(value,cap);assertAdmission(admission);return state;},existsSync:file=>file.endsWith('identity-upload-complete.json'),readFileSync:()=>JSON.stringify({version:1,run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest,purpose:'identity-upload-complete-no-authority'}),linkSync:(from,to)=>{assert.equal(files.has(to),false,'CREATE_ONCE_REQUIRED');assert.ok(files.has(from));files.set(to,files.get(from));events.push('identity');},rmSync:file=>{assert.equal(files.delete(file),true);},safeWrite:(_s,file,value)=>{assert.equal(file,'s06-platform-warning.json');events.push('warning');files.set(join(output,file),value);formalA3=true;},pause:()=>{throw Error('Unexpected barrier wait');}});
 return {state,actors,models,binding,cIdentity,events,files,output,cap,admission,vault,cCredential,transition,gate,actorReads:()=>actorReads,snapshotCount:()=>snapshotCount,setNow:value=>{now=value;},
  async ready(){const m=models.a3;m.s06Ticket=await gate.installPlatformS06BeforeLogin({admission,model:m,binding:{role:'a3',...m.actor,ciRunId:binding.run,runId:uuid(40),nonce:binding.nonce,accountKey:FIXED_IDENTITIES.A.accountKey,scenario:binding.scenario,origin:'https://jbvrdmrkwpznbrvteive.supabase.co'}});await m.remote.request('lingjing-auth',{op:'login',account:FIXED_IDENTITIES.A.accountKey});await m.accounts.requireCloudActor();await gate.s06GateSafeManifest(m.s06Ticket);},
  persist:()=>factory.persistSafeIdentityManifest(cap),release:()=>factory.releasePlatformGrants(cap,cCredential),publishAgain:()=>factory.safeWriteOriginalIdentity(state,{not:'replacement'})};
}

test('actual runtime identity → baseline → opaque transition → genuine warning keeps exact public hashes',async()=>{
 const f=fixture();await f.ready();await f.persist();await f.release();const read=name=>f.files.get(join(f.output,name)),identity=read('identity-manifest.json'),baseline=read('awaiting-platform-grant-transition.json'),warning=read('s06-platform-warning.json');
 assert.equal(f.snapshotCount(),1);assert.equal(f.state.grantsReleased,true);assert.deepEqual(f.events,['identity','baseline','original-snapshot','warning']);assert.equal(identity.purpose,'s06-original-issuance-observation-no-authority');
 for(const a of [identity,baseline,warning]){assert.equal(a.actorBindingDigest,identity.actorBindingDigest);for(const key of ['run','attempt','commit','requestDigest','nonce','scenario','businessDeadline','expiresAt','absoluteCleanupDeadlineMs'])assert.equal(a[key],f.binding[key]);for(const raw of Object.values(f.actors))assert.equal(JSON.stringify(a).includes(raw.sessionId),false);}
 assert.equal(warning.baselineDigest,baseline.baselineDigest);const {baselineDigest,...payload}=baseline;assert.equal(baselineDigest,createHash('sha256').update(JSON.stringify(payload)).digest('hex'));assert.deepEqual(Array.from(baseline.baselineObservations,o=>o.role),bindings.S06_ACTOR_ROLES);assert.ok(baseline.baselineObservations.every(o=>o.allowed===false&&o.protocol==='lingjing-discovery-v2'));assert.equal(warning.errorCode,'GLOBAL_SERIAL_SCOPE_REVOKED');assert.equal(warning.realOriginalWarningObserved,true);assert.equal(warning.originalSnapshotCount,1);assert.ok(warning.observedAtMs>=warning.transitionObservedAtMs);assert.equal(warning.windowClosesAt,baseline.windowClosesAt);assert.equal(warning.windowClosesAt-warning.baselineStartedAt,60000);
 const old=JSON.stringify(identity),reads=f.actorReads();f.actors.a.sessionId=uuid(777);f.models.a.accounts.epoch++;f.actors.c.sessionId=uuid(778);f.models.c.accounts.epoch++;await f.persist();assert.equal(JSON.stringify(read('identity-manifest.json')),old);assert.equal(f.actorReads(),reads,'Later normal relaunch does not re-freeze original S06 actors');assert.throws(()=>f.publishAgain(),/CREATE_ONCE_REQUIRED/);assert.equal(JSON.stringify(read('identity-manifest.json')),old);
});
for(const options of [{snapshotFails:true},{wrongWarning:true},{changePeerDuringSnapshot:true}])test('actual failed/wrong/changed-session warning never publishes '+JSON.stringify(options),async()=>{const f=fixture(options);await f.ready();await f.persist();await assert.rejects(f.release());assert.equal(f.snapshotCount(),1);assert.equal(f.files.has(join(f.output,'s06-platform-warning.json')),false);assert.notEqual(f.state.grantsReleased,true);});
test('partial identities never publish, and a changed original session is rejected before any baseline',async()=>{const f=fixture();await f.ready();const model=f.models.c;delete f.models.c;await f.persist();assert.equal(f.files.size,0);f.models.c=model;await f.persist();f.actors.b.sessionId=uuid(777);await assert.rejects(f.release());assert.equal(f.events.includes('baseline'),false);assert.equal(f.snapshotCount(),0);});
for(const failure of ['different-admission','different-model','different-session','different-epoch','late-cap','closed-window','clock-backwards'])test('actual opaque transition rejects '+failure,async()=>{
 const f=fixture();await f.ready();await f.persist();const actors=structuredClone(f.state.s06OriginalActors),transition=await f.transition.observePlatformFourGrantTransition({admission:f.admission,models:f.models,actors,actorBinding:f.state.s06ActorBinding,cIdentity:f.cIdentity,scenario:f.binding.scenario,vault:f.vault,cCredential:f.cCredential});
 const input={admission:f.admission,model:f.models.a3,actor:{...actors.a3},scenario:f.binding.scenario};
 if(failure==='different-admission')input.admission={};if(failure==='different-model')input.model={};if(failure==='different-session')input.actor.sessionId=uuid(999);if(failure==='different-epoch')input.actor.epoch++;
 const baseline=f.files.get(join(f.output,'awaiting-platform-grant-transition.json'));
 if(failure==='late-cap')f.setNow(baseline.baselineStartedAt+10000);if(failure==='closed-window')f.setNow(baseline.windowClosesAt);if(failure==='clock-backwards')f.setNow(baseline.baselineStartedAt-1);
 assert.throws(()=>f.transition.consumePlatformGrantTransition(transition,input));assert.equal(f.snapshotCount(),0);assert.equal(f.files.has(join(f.output,'s06-platform-warning.json')),false);
});
test('actual cap is one-use, requires C custody, and a public binding cannot substitute for it',async()=>{
 const f=fixture();await f.ready();await f.persist();const args={admission:f.admission,models:f.models,actors:f.state.s06OriginalActors,actorBinding:f.state.s06ActorBinding,cIdentity:f.cIdentity,scenario:f.binding.scenario,vault:f.vault,cCredential:f.cCredential};
 await assert.rejects(f.transition.observePlatformFourGrantTransition({...args,cCredential:{}}));assert.equal(f.events.includes('baseline'),false);
 const transition=await f.transition.observePlatformFourGrantTransition(args),input={admission:f.admission,model:f.models.a3,actor:f.state.s06OriginalActors.a3,scenario:f.binding.scenario};assert.throws(()=>f.transition.consumePlatformGrantTransition(f.state.s06ActorBinding,input));const result=f.transition.consumePlatformGrantTransition(transition,input);assert.equal(result.actorBindingDigest,f.state.s06ActorBinding.actorBindingDigest);assert.throws(()=>f.transition.consumePlatformGrantTransition(transition,input));
});
test('actual observation refuses cross-run/cross-nonce artifacts before fresh baseline IO',async()=>{for(const key of ['run','nonce','requestDigest','businessDeadline']){const f=fixture();await f.ready();await f.persist();f.state.s06ActorBinding={...f.state.s06ActorBinding,[key]:key==='businessDeadline'?f.binding[key]-1:key==='run'?'124':key==='nonce'?uuid(999):'c'.repeat(64)};await assert.rejects(f.release());assert.equal(f.events.includes('baseline'),false);assert.equal(f.snapshotCount(),0);}});
test('actual create-once publisher is atomic, private and preserves preexisting bytes on disk',async()=>{
 const fs=await import('node:fs'),os=await import('node:os'),directory=fs.mkdtempSync(join(os.tmpdir(),'s06-observation-'));
 const text=source('./recovery/same-run-normal-lifecycle-factory.mjs'),publish=vm.runInNewContext(section(text,'function safeWriteOriginalIdentity(','async function collectS06OriginalActors(')+'\n safeWriteOriginalIdentity',{join,writeFileSync:fs.writeFileSync,linkSync:fs.linkSync,rmSync:fs.rmSync});
 try{const state={output:directory},first={purpose:'synthetic-observation',value:1};publish(state,first);const path=join(directory,'identity-manifest.json'),bytes=fs.readFileSync(path);assert.deepEqual(JSON.parse(bytes),first);assert.throws(()=>publish(state,{value:2}),{code:'EEXIST'});assert.deepEqual(fs.readFileSync(path),bytes);assert.equal(fs.existsSync(path+'.original.tmp'),false);if(process.platform!=='win32')assert.equal(fs.statSync(path).mode&0o777,0o600);}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
