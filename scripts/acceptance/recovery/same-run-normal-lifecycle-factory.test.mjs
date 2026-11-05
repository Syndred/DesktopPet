import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {installNormalPreloginHold,installRestoredCAuthGuard,appEnvironment,parentProofUrl,validateParentProofClaims,getCompletionContext} from './same-run-normal-lifecycle-factory.mjs';
const origin='https://jbvrdmrkwpznbrvteive.supabase.co';
const differentInode=value=>value===0?1:0;
function held(role='a'){
 const binding={role,accountKey:'synthetic-fixed',owner:role==='c'?null:'owner-a',origin,profile:'/synthetic-owned',deviceId:'device-a',scenario:'synthetic-scope',expiresAt:Date.now()+60000};
 const actor={authKind:'supabase',authority:'live',ownerAccountId:'owner-a',authUserId:'auth-a',deviceId:'device-a',sessionId:'session-a'};
 const calls=[];const remote={authKind:'supabase',config:{url:origin},deviceId:actor.deviceId,active:{actor,refreshToken:'FAKE-NOT-A-REAL-TOKEN'},fetcher:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true};},async request(name,body){return this.fetcher(origin+'/functions/v1/'+name,{body:JSON.stringify(body)});}};
 let allowed=false;const a={current:null,qaScenario:null,remote,epoch:1,services:{paths:{userData:binding.profile}},async requireCloudActor(){return {actor,url:origin,invoke:async(name,body)=>{await remote.request(name,body,{actor});return {simulatedLocationAllowed:allowed,scenarioId:binding.scenario};}};}};
 const original=()=>{};const context=vm.createContext({process:{getBuiltinModule:()=>({realpathSync:x=>x})},__sameRunAccountCapture:{accounts:a,p:{session:original},original},Date,Map,Error,Object,JSON,String});
 vm.runInContext('('+installNormalPreloginHold.toString()+')(null,'+JSON.stringify(binding)+')',context);
 return {context,binding,actor,a,remote,calls,allow:()=>{allowed=true;}};
}
test('prelogin hold admits one exact auth and denies business/SDK bypass',async()=>{
 const h=held();await assert.rejects(h.remote.request('lingjing-auth',{op:'login',account:'another'}));
 await h.remote.request('lingjing-auth',{op:'login',account:h.binding.accountKey,password:'FAKE'});
 await assert.rejects(h.remote.request('lingjing-auth',{op:'login',account:h.binding.accountKey}));
 await assert.rejects(h.remote.request('companions',{op:'snapshot'},{actor:h.actor}));
 await assert.rejects(h.remote.fetcher(origin+'/rest/v1/lingjing_saves',{body:'{}'}));assert.equal(h.calls.length,1);
});
test('C registration exact single intent, never other role',async()=>{
 const a=held();await assert.rejects(a.remote.request('lingjing-auth',{op:'register',account:a.binding.accountKey}));
 const c=held('c');await c.remote.request('lingjing-auth',{op:'register',account:c.binding.accountKey});await assert.rejects(c.remote.request('lingjing-auth',{op:'register',account:c.binding.accountKey}));assert.equal(c.calls.length,1);
});
test('grant release requires normal protocol plus exact owner and expiry',async()=>{
 const h=held(),gate=h.context.__qaUiCaseContext,g={ownerAccountId:'owner-a',authUserId:'auth-a',deviceId:'device-a',expiresAtMs:Date.now()+30000};
 await assert.rejects(gate.release(g));h.allow();await assert.rejects(gate.release({...g,ownerAccountId:'other'}));await assert.rejects(gate.release({...g,expiresAtMs:Date.now()-1}));await gate.release(g);assert.equal(gate.released,true);
 await h.remote.request('companions',{op:'snapshot'},{actor:h.actor});gate.loginFrozen=true;await assert.rejects(h.remote.request('lingjing-auth',{op:'refresh'}));
});
test('restored C freeze is an actual exact-instance auth guard',async()=>{
 const calls=[];const a={current:{authKind:'supabase'},epoch:1,remote:{async request(...args){calls.push(args);return 'normal';}}};
 const ctx=vm.createContext({__sameRunAccountCapture:{accounts:a},Date,Error});vm.runInContext('('+installRestoredCAuthGuard.toString()+')(null,'+JSON.stringify({expiresAt:Date.now()+30000})+')',ctx);
 await a.remote.request('lingjing-auth',{op:'login'});a.epoch=2;await a.remote.request('lingjing-auth',{op:'actor'});const h=ctx.__qaUiCaseContext;h.loginFrozen=true;
 for(const op of ['login','register','refresh'])await assert.rejects(a.remote.request('lingjing-auth',{op}));
 await a.remote.request('discovery',{op:'protocol'});a.epoch++;await assert.rejects(a.remote.request('discovery',{op:'protocol'}));assert.equal(calls.length,3);
});
test('launch overlay never erases dedicated profile and removes unrelated values',()=>{
 const old=process.env.PET_USER_DATA_DIR,oldSecret=process.env.SYNTHETIC_SECRET;try{process.env.PET_USER_DATA_DIR='not-the-new-profile';process.env.SYNTHETIC_SECRET='FAKE';const env=appEnvironment();assert.equal(Object.hasOwn(env,'PET_USER_DATA_DIR'),false);assert.equal(env.SYNTHETIC_SECRET,undefined);}finally{if(old===undefined)delete process.env.PET_USER_DATA_DIR;else process.env.PET_USER_DATA_DIR=old;if(oldSecret===undefined)delete process.env.SYNTHETIC_SECRET;else process.env.SYNTHETIC_SECRET=oldSecret;}
});
test('parent proof binds fixed route schema time and batch, not caller authority',async()=>{
 const now=Date.now(),a={nonce:'11111111-1111-1111-1111-111111111111',run:'123',commit:'a'.repeat(40),requestDigest:'b'.repeat(64),expiresAt:now+500000};
 const p={version:1,purpose:'grant-manifest',...a,sequence:1,issuedAt:now,expiresAt:now+10000,payload:{}};
 assert.equal(validateParentProofClaims(p,a,p.purpose,now),p);assert.throws(()=>validateParentProofClaims({...p,run:'other'},a,p.purpose,now));assert.throws(()=>validateParentProofClaims({...p,expiresAt:now},a,p.purpose,now));assert.throws(()=>validateParentProofClaims({...p,extra:true},a,p.purpose,now));assert.throws(()=>parentProofUrl(a.nonce,'arbitrary-command'));assert.match(parentProofUrl(a.nonce,'grant-manifest'),/Syndred\/DesktopPet\/refs\/heads\/codex\/cloud-authority-convergence\/scripts\/acceptance\/requests\//);await assert.rejects(getCompletionContext({}));
});
test('cleanup root requires minted canonical identity, not a path self-comparison',async()=>{
 const fs=await import('node:fs'),{join}=await import('node:path'),{tmpdir}=await import('node:os');const {assertOwnedProfileRoot}=await import('./same-run-normal-lifecycle-factory.mjs');
 const p=fs.realpathSync.native(fs.mkdtempSync(join(tmpdir(),'lingjing-live-holder-contract-'))),st=fs.lstatSync(p),ticket={canonical:p,dev:st.dev,ino:st.ino};
 try{assert.equal(assertOwnedProfileRoot(p,ticket),p);assert.throws(()=>assertOwnedProfileRoot(p,{...ticket,canonical:p+'-other'}));const wrongInode=differentInode(st.ino);assert.notEqual(wrongInode,st.ino);assert.throws(()=>assertOwnedProfileRoot(p,{...ticket,ino:wrongInode}));}finally{fs.rmSync(p,{recursive:true});}
});
test('original remote invoke receives real synthetic 401 and invalidates despite C freeze',async()=>{
 const {createRequire}=await import('node:module'),{randomUUID}=await import('node:crypto');const require=createRequire(import.meta.url),{SupabaseRemote,normalized,decodeProof}=require('../../../apps/pc-app/runtime/features/accounts/supabase-remote.cjs');
 const device=randomUUID(),sid=randomUUID(),uid=randomUUID(),actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:'synthetic-c',authUserId:uid,deviceId:device,sessionId:sid,account:'synthetic-c',username:'Synthetic'};
 const bundle={currentUser:{id:actor.ownerAccountId,authUserId:uid,authKind:'supabase',account:actor.account,username:actor.username},actor,tokens:{accessToken:'FAKE-ACCESS-ONLY',refreshToken:'FAKE-REFRESH-ONLY',expiresAt:Date.now()/1000+3600,deviceId:device,sessionId:sid}};
 const calls=[];let rejectRefresh=true;
 const remote=new SupabaseRemote({deviceId:device,config:{url:origin,key:'sb_publishable_synthetic'},fetcher:async(_url,opt)=>{const body=JSON.parse(opt.body);calls.push(body.op);if(body.op==='refresh'&&!rejectRefresh)return {ok:true,status:200,json:async()=>({ok:true,data:bundle})};return {ok:false,status:401,json:async()=>({ok:false,code:'SESSION_INVALIDATED'})};}});
 remote.active=decodeProof(normalized(bundle).proof);const a={current:{authKind:'supabase'},remote,epoch:1};const ctx=vm.createContext({__sameRunAccountCapture:{accounts:a},Date,Error});vm.runInContext('('+installRestoredCAuthGuard.toString()+')(null,'+JSON.stringify({expiresAt:Date.now()+30000})+')',ctx);
 const h=ctx.__qaUiCaseContext;h.loginFrozen=true;h.frozenActor={...actor};let invalid=0;remote.onInvalidated(()=>{invalid++;});
 await assert.rejects(remote.invoke({ownerAccountId:actor.ownerAccountId,proof:JSON.stringify(remote.active)},'accounts',{op:'snapshot'}),{code:'SESSION_INVALIDATED'});assert.deepEqual(calls,['snapshot','refresh']);assert.equal(invalid,1);
 rejectRefresh=false;await remote.refresh(remote.active);assert.equal(remote.active.actor.sessionId,sid);
 await assert.rejects(remote.request('lingjing-auth',{op:'refresh',refreshToken:'OTHER'}),/C_REFRESH_BINDING_CHANGED/);
 await assert.rejects(remote.request('lingjing-auth',{op:'login',account:actor.account}),/C_AUTH_FROZEN/);
 bundle.actor={...actor,sessionId:randomUUID()};await assert.rejects(remote.refresh(remote.active),/C_REFRESH_BINDING_CHANGED/);
});

test('inode negative fixture stays different even above Number safe precision',()=>{for(const value of [0,1,Number.MAX_SAFE_INTEGER,2**54])assert.notEqual(differentInode(value),value);assert.equal(2**54+1,2**54);});

test('signedout prelude cannot accept a caller authority or artifact projection',async()=>{const {runSignedoutPrelude}=await import('./same-run-normal-lifecycle-factory.mjs');for(const admission of [{approved:true},{source:'github-environment-v1'}])await assert.rejects(runSignedoutPrelude({admission,artifactHandle:{profiles:5},preparation:{}}));});

test('platform warning receipt timestamps only the successful original snapshot observation',async()=>{
 const {readFileSync}=await import('node:fs');const source=readFileSync(new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url),'utf8');const start=source.indexOf(' await admitPlatformS06SingleSnapshot(s.models.a3.s06Ticket,{transition});'),end=source.indexOf(' await releasePlatformS06AfterFormalGrant',start);assert.ok(start>=0&&end>start);const segment=source.slice(start,end);
 for(const succeeds of [true,false]){let clock=100,written=null,calls=0;const binding={run:'synthetic-run',commit:'synthetic-commit',requestDigest:'synthetic-digest',nonce:'synthetic-nonce',businessDeadline:1000};const context=vm.createContext({s:{models:{a3:{s06Ticket:{}}},binding},transition:{},Date:{now:()=>clock},admitPlatformS06SingleSnapshot:async()=>{calls++;await Promise.resolve();clock=200;if(!succeeds)throw Error('SYNTHETIC_REJECT');},safeWrite:(_s,file,value)=>{assert.equal(file,'s06-platform-warning.json');written=JSON.parse(JSON.stringify(value));}});const p=vm.runInContext('(async()=>{'+segment+'})()',context);if(succeeds){await p;assert.deepEqual(written,{version:1,run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest,nonce:binding.nonce,observedAtMs:200,realOriginalWarningObserved:true,originalSnapshotCount:1,deadline:1000});}else{await assert.rejects(p);assert.equal(written,null);}assert.equal(calls,1);}
});

// Execute the actual private guard functions with synthetic in-memory models.
// No admission is minted, credentials read, process launched or network used.
function authenticationFixture(){
 const source=readFileSync(new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url),'utf8'),start=source.indexOf('export async function assertSameRunGrant('),end=source.indexOf('async function installLocationBridge(',start);
 const safeStart=source.indexOf('async function safeActor('),safeEnd=source.indexOf('async function normalLogin(',safeStart),cap=Object.freeze({}),roles=['a','a2','a3','b','c'],scenario='synthetic-scope';
 let now=1000,registryChecks=0;const actorReads={},protocolReads={},models={},scopeGrants=new Map(),profiles={},profileRoots={};
 const s={authorization:{},authorized:true,vault:{async verifyRegistry(){registryChecks++;assert.equal(s.registryValid,true);}},registryValid:true,binding:{expiresAt:100000},supervisor:{ready:true,closed:false},grantsReleased:true,cFinished:false,cState:{loginFrozen:false},revoked:new Set(),models,scopeGrants,profiles,profileRoots};
 const ctx=vm.createContext({assert,Date:{now:()=>now},Error,Map,WeakMap,Promise,setTimeout,clearTimeout,roles,scenario,origin,FIXED_IDENTITIES:{C:{accountKey:'synthetic-c'}},authenticationTransitions:new WeakMap(),randomUUID:()=> '11111111-1111-4111-8111-111111111111',own:value=>{assert.equal(value,cap);assert.equal(s.authorized,true);return s;},assertCompletionAuthorization:()=>assert.equal(s.authorized,true),assertAuthorizedVault:value=>assert.equal(value,s.vault),assertOwnedProfileRoot:(profile,ticket)=>{assert.equal(profile,ticket.canonical);return profile;},processIdentity:()=>{throw Error('No process access in isolated fixture');}});
 for(const role of roles){
  const actor={ownerAccountId:'owner-'+role,authUserId:'auth-'+role,deviceId:'device-'+role,sessionId:'session-'+role,authKind:'supabase',authority:'live'},profile='/synthetic/'+role;
  const a={epoch:7,current:{authKind:'supabase'},qaScenario:null,remote:{config:{url:origin},deviceId:actor.deviceId,active:{actor}},session(){const active=this.remote.active?.actor;return {currentUser:this.current?{id:active?.ownerAccountId,authUserId:active?.authUserId,account:role==='c'?'synthetic-c':'synthetic-'+role,authKind:'supabase'}:null,dataMode:'live',persistence:this.current?'secure':'none',secureStorageAvailable:true};},async requireCloudActor(){actorReads[role]=(actorReads[role]||0)+1;if(!this.current||this.rejectActor)throw Object.assign(Error('CLOUD_LOGIN_REQUIRED'),{code:'CLOUD_LOGIN_REQUIRED'});return {actor:this.remote.active.actor,invoke:async(name,body)=>{assert.equal(name,'discovery');assert.equal(body.op,'protocol');protocolReads[role]=(protocolReads[role]||0)+1;return {simulatedLocationAllowed:this.allowed!==false,scenarioId:this.protocolScenario||scenario};}};}};
  const h={accounts:a,binding:{role,profile},released:true,loginFrozen:false};models[role]={profile,expectedDeviceId:actor.deviceId,launcherPid:role.charCodeAt(0),runtime:{pid:role.charCodeAt(0)+10},actor,context:h,async main(fn,input){ctx.__qaUiCaseContext=this.context;return fn(null,input);},async call(){return a.session();}};
  profiles[role]=profile;profileRoots[role]={canonical:profile};scopeGrants.set(role,{...actor,scenario,expiresAtMs:100000});
 }
 const api=vm.runInContext(source.slice(safeStart,safeEnd)+'\n'+source.slice(start,end).replace('export async function','async function')+'\n({begin:beginCAuthenticationTransition,check:assertCAuthenticationTransition,finish:finishCAuthenticationTransition,full:assertSameRunGrant})',ctx);
 const a=models.c.context.accounts,originalActor={...a.remote.active.actor};
 return {cap,s,models,a,actorReads,protocolReads,registryChecks:()=>registryChecks,setNow:value=>{now=value;},
  begin:(input={stage:'A15-old-new-login',intentId:'22222222-2222-4222-8222-222222222222'})=>api.begin(cap,input),
  check:(token,phase)=>api.check(cap,token,{phase}),finish:token=>api.finish(cap,token),full:()=>api.full(cap,{hardDeadline:s.binding.expiresAt}),
  logout:(pending=Promise.resolve({confirmed:true}))=>{a.epoch++;a.current=null;a.remote.active=null;a.signOutPending=pending;},
  login:(changes={})=>{a.epoch++;a.current={authKind:'supabase'};a.remote.active={actor:{...originalActor,sessionId:'new-session-c',...changes}};}};
}
async function afterOldLogin(f){const token=await f.begin();f.logout();await f.check(token,'logout');await f.check(token,'old-login');return token;}

test('C signed-out transition never changes the full five-model business guard',async()=>{
 const f=authenticationFixture(),token=await f.begin();for(const role of ['a','a2','a3','b','c'])assert.ok(f.protocolReads[role]>=1);assert.equal(Object.isFrozen(token),true);assert.deepEqual(Object.keys(token),[]);
 f.logout();await assert.rejects(f.full(),{code:'CLOUD_LOGIN_REQUIRED'});const before={...f.protocolReads};await f.check(token,'logout');
 for(const role of ['a','a2','a3','b'])assert.equal(f.protocolReads[role],before[role]+1);assert.equal(f.protocolReads.c,before.c);await assert.rejects(f.check({},'logout'),/C_AUTH_TRANSITION_REQUIRED/);await assert.rejects(f.check(true,'logout'),/C_AUTH_TRANSITION_REQUIRED/);await assert.rejects(f.full(),{code:'CLOUD_LOGIN_REQUIRED'});
});
test('C relogin waits for original logout, verifies new actor, rechecks all grants and consumes token',async()=>{
 const f=authenticationFixture(),token=await f.begin();let resolveLogout;f.logout(new Promise(resolve=>{resolveLogout=resolve;}));await f.check(token,'logout');let settled=false;const pending=f.check(token,'old-login').then(()=>{settled=true;});await new Promise(setImmediate);assert.equal(settled,false);resolveLogout({confirmed:true});await pending;
 await f.check(token,'old-login');await f.check(token,'new-login');f.login();const reads=f.actorReads.c;await f.check(token,'new-login');assert.ok(f.actorReads.c>reads);const protocols=f.protocolReads.c;assert.equal((await f.finish(token)).confirmed,true);assert.ok(f.protocolReads.c>protocols);assert.ok(f.registryChecks()>0);
 await assert.rejects(f.check(token,'new-login'),/C_AUTH_TRANSITION_REQUIRED/);await assert.rejects(f.finish(token),/C_AUTH_TRANSITION_REQUIRED/);await assert.rejects(f.begin(),/C_AUTH_TRANSITION_REPLAY/);await f.full();
});
test('C transition rejects wrong stage, phase skipping and phase rollback',async()=>{
 const wrong=authenticationFixture();await assert.rejects(wrong.begin({stage:'A12-own-current-session-revoke',intentId:'22222222-2222-4222-8222-222222222222'}));
 for(const phase of ['new-login','business','']){const f=authenticationFixture(),token=await f.begin();await assert.rejects(f.check(token,phase),/C_AUTH_TRANSITION_ORDER/);await assert.rejects(f.check(token,'logout'),/C_AUTH_TRANSITION_REQUIRED/);}
 const f=authenticationFixture(),token=await afterOldLogin(f);await assert.rejects(f.check(token,'logout'),/C_AUTH_TRANSITION_ORDER/);
});
test('C logout failure, missing pending promise or deadline expiry permanently closes transition',async()=>{
 for(const pending of [Promise.resolve({confirmed:false}),undefined]){const f=authenticationFixture(),token=await f.begin();f.logout(pending);if(pending===undefined)delete f.a.signOutPending;await assert.rejects(f.check(token,'old-login'),/C_LOGOUT_UNCONFIRMED|NORMAL_C_LOGOUT_REQUIRED/);await assert.rejects(f.check(token,'old-login'),/C_AUTH_TRANSITION_REQUIRED/);}
 const f=authenticationFixture(),token=await f.begin();let resolveLogout;f.logout(new Promise(resolve=>{resolveLogout=resolve;}));const pending=f.check(token,'old-login');await new Promise(setImmediate);f.setNow(100001);resolveLogout({confirmed:true});await assert.rejects(pending,/C_AUTH_TRANSITION_EXPIRED/);await assert.rejects(f.check(token,'old-login'),/C_AUTH_TRANSITION_REQUIRED/);
});
test('C transition fails closed for ownership, grants, watchdog, profile and context changes',async()=>{
 const changes=[f=>{f.s.authorized=false;},f=>{f.s.supervisor.closed=true;},f=>{f.s.cState.loginFrozen=true;},f=>{f.s.revoked.add('c');},f=>{f.s.scopeGrants.delete('c');},f=>{f.s.scopeGrants.get('c').expiresAtMs=999;},f=>{f.s.scopeGrants.get('c').deviceId='other';},f=>{f.s.scopeGrants.get('c').scenario='other';},f=>{f.s.models.c={...f.s.models.c};},f=>{delete f.s.models.b;},f=>{f.s.registryValid=false;},f=>{f.models.c.profile='/different';},f=>{f.models.c.expectedDeviceId='different';},f=>{f.models.c.context={...f.models.c.context};},f=>{f.models.c.context.binding.role='b';},f=>{f.a.remote.config.url='https://other.invalid';},f=>{f.a.remote.deviceId='different';},f=>{f.a.epoch++;},f=>{f.models.a.context.accounts.allowed=false;},f=>{f.models.b.context.accounts.current=null;},f=>{f.models.a2.context.accounts.protocolScenario='other';}];
 for(const change of changes){const f=authenticationFixture(),token=await f.begin();f.logout();change(f);await assert.rejects(f.check(token,'logout'));await assert.rejects(f.check(token,'logout'),/C_AUTH_TRANSITION_REQUIRED/);}
});
test('old password cannot authenticate; new login must be fresh exact actor and full live C scope',async()=>{
 const old=authenticationFixture(),oldToken=await afterOldLogin(old);old.login();await assert.rejects(old.check(oldToken,'old-login'),/OLD_PASSWORD_MUST_NOT_AUTHENTICATE/);
 for(const change of [{ownerAccountId:'other'},{authUserId:'other'},{deviceId:'other'},{sessionId:'session-c'},{sessionId:''},{authority:'simulated'}]){const f=authenticationFixture(),token=await afterOldLogin(f);await f.check(token,'new-login');f.login(change);await assert.rejects(f.check(token,'new-login'));}
 const reject=authenticationFixture(),rejectToken=await afterOldLogin(reject);await reject.check(rejectToken,'new-login');reject.login();reject.a.rejectActor=true;await assert.rejects(reject.check(rejectToken,'new-login'),{code:'CLOUD_LOGIN_REQUIRED'});
 const missing=authenticationFixture(),missingToken=await afterOldLogin(missing);await missing.check(missingToken,'new-login');await assert.rejects(missing.finish(missingToken),/NEW_C_SESSION_REQUIRED/);
 const scope=authenticationFixture(),scopeToken=await afterOldLogin(scope);await scope.check(scopeToken,'new-login');scope.login();scope.a.allowed=false;await assert.rejects(scope.finish(scopeToken));await assert.rejects(scope.finish(scopeToken),/C_AUTH_TRANSITION_REQUIRED/);
});
test('restored guard preserves normal logout and two login attempts without manual epoch rebinding',async()=>{
 const calls=[],a={current:{authKind:'supabase'},epoch:3,remote:{async request(_name,body){calls.push(body.op);if(body.password==='FAKE-OLD')throw Object.assign(Error('invalid'),{code:'INVALID_CREDENTIALS'});return {ok:true};}}};
 const ctx=vm.createContext({__sameRunAccountCapture:{accounts:a},Date,Error});vm.runInContext('('+installRestoredCAuthGuard.toString()+')(null,'+JSON.stringify({expiresAt:Date.now()+30000})+')',ctx);a.current=null;a.epoch++;await a.remote.request('lingjing-auth',{op:'logout'});await assert.rejects(a.remote.request('lingjing-auth',{op:'login',password:'FAKE-OLD'}),{code:'INVALID_CREDENTIALS'});await a.remote.request('lingjing-auth',{op:'login',password:'FAKE-NEW'});a.current={authKind:'supabase'};a.epoch++;await a.remote.request('lingjing-auth',{op:'actor'});assert.equal(ctx.__qaUiCaseContext.epoch,a.epoch);assert.deepEqual(calls,['logout','login','login','actor']);
});
