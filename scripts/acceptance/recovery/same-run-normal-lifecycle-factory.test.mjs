import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
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
