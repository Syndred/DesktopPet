const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');const {join}=require('node:path');const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {SupabaseRemote,publicConfig,stableDevice,decodeProof}=require('../supabase-remote.cjs');
const {AccountsService}=require('../service.cjs');const {migrations}=require('../schema.cjs');
const directories=[],services=[];
const dir=()=>{const p=mkdtempSync(join(tmpdir(),'lingjing-v2-main-'));directories.push(p);return p;};
const config={url:'https://example.supabase.co',key:'sb_publishable_protocol_unit_only'};
function bundle(device,owner='original-text-owner',sid=randomUUID(),expires=Date.now()/1000+3600){
 const uid=owner==='original-text-owner'?'10000000-0000-4000-8000-000000000001':'10000000-0000-4000-8000-000000000002';
 const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:owner,authUserId:uid,deviceId:device,sessionId:sid,account:owner==='original-text-owner'?'alice':'bobby',username:'昵称'};
 return{currentUser:{id:owner,authUserId:uid,authKind:'supabase',account:actor.account,username:actor.username},actor,
 tokens:{accessToken:`protocol.unit.${randomUUID()}`,refreshToken:'twelve_chars',expiresAt:expires,deviceId:device,sessionId:sid}};
}
function fixture(fetcher){
 const directory=dir(),remote=new SupabaseRemote({userData:directory,config,fetcher});const db=new DatabaseSync(join(directory,'state.sqlite'));migrations.forEach(m=>db.exec(m.sql));
 const accountService=new AccountsService({services:{db,paths:{userData:directory,legacyDataExisted:false},safeStorage:{isEncryptionAvailable:()=>false},events:{emit(){}}},remote,host:{async apply(){},clear(){},dispose(){}}});
 services.push({accounts:accountService,db});return{accounts:accountService,db,remote,directory};
}
const response=data=>({ok:true,status:200,async json(){return{ok:true,data};}});
afterEach(()=>{for(const x of services.splice(0)){x.accounts.dispose();x.db.close();}for(const p of directories.splice(0))rmSync(p,{recursive:true,force:true});});

test('PROTOCOL UNIT simulated: modern HTTPS config and stable distinct per-profile device IDs',()=>{
 assert.equal(publicConfig({env:{},resourcesPath:null}),null);
 assert.throws(()=>publicConfig({env:{SUPABASE_URL:'http://example.com',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_x'},resourcesPath:null}),{code:'CLOUD_CONFIG_INVALID'});
 assert.throws(()=>publicConfig({env:{SUPABASE_URL:config.url,SUPABASE_PUBLISHABLE_KEY:'sb_secret_x'},resourcesPath:null}),{code:'CLOUD_CONFIG_INVALID'});
 const one=dir(),two=dir();assert.equal(stableDevice(one),stableDevice(one));assert.notEqual(stableDevice(one),stableDevice(two));
});
test('PROTOCOL UNIT simulated: Auth UID links additively to old text owner without tokens in SQLite/public session',async()=>{
 let current;const f=fixture(async(url,options)=>{assert.ok(url.startsWith(config.url));const body=JSON.parse(options.body);if(body.op==='login'){current=bundle(options.headers['X-Lingjing-Device-Id']);return response(current);}return response({actor:current.actor});});
 f.db.prepare("insert into account_identities values(?,'runtime',?,'alice','alice','原昵称',null,0,null,'2020','2020')").run('original-text-owner','original-text-owner');
 f.db.prepare('insert into account_legacy_data values(?,?,?,?)').run('original-text-owner','source-hash',JSON.stringify({pets:[{id:'original-pet',level:12}],coins:42}),'2020');
 await f.accounts.authenticate({provider:'runtime',account:'alice',password:'secret123'});
 assert.equal(f.accounts.requireOwner(),'original-text-owner');assert.equal(f.accounts.getLegacyInventory().pets[0].id,'original-pet');
 assert.equal(f.db.prepare('select count(*) n from account_identities').get().n,1);assert.equal(f.db.prepare('select auth_user_id from account_cloud_links').get().auth_user_id,current.actor.authUserId);
 const publicJson=JSON.stringify(f.accounts.session());assert.ok(!publicJson.includes(current.tokens.accessToken));assert.ok(!publicJson.includes(current.tokens.refreshToken));
 assert.equal(f.accounts.privateSession().sessionToken,null);assert.throws(()=>f.accounts.requireRuntimeUser(),{code:'CLOUD_PROTOCOL_UPGRADE_REQUIRED'});
 const actor=await f.accounts.requireCloudActor();assert.equal(actor.ownerAccountId,'original-text-owner');assert.ok(!JSON.stringify(actor).includes(current.tokens.accessToken));assert.equal(typeof actor.invoke,'function');
});
test('PROTOCOL UNIT simulated: concurrent refresh is single-flight and adopts a 12-character opaque token',async()=>{
 const device=randomUUID();let current=bundle(device,'original-text-owner',randomUUID(),Date.now()/1000-1),refreshes=0;
 const remote=new SupabaseRemote({deviceId:device,config,fetcher:async(url,options)=>{const op=JSON.parse(options.body).op;
  if(op==='refresh'){refreshes++;await new Promise(r=>setTimeout(r,20));assert.equal(JSON.parse(options.body).refreshToken,'twelve_chars');current={...current,tokens:{...current.tokens,expiresAt:Date.now()/1000+3600,accessToken:'new.jwt.token'}};return response(current);}return response({actor:current.actor});}});
 const normalized=require('../supabase-remote.cjs').normalized(current);const session={id:current.currentUser.id,cloudProof:normalized.proof};remote.setCurrentUser(session);
 let changed;remote.onProofChanged(e=>{changed=e;});await Promise.all([remote.invoke(session,'lingjing-save',{op:'read'}),remote.invoke(session,'lingjing-save',{op:'read'})]);
 assert.equal(refreshes,1);assert.equal(decodeProof(changed.proof).accessToken,'new.jwt.token');assert.equal(changed.previousProof,normalized.proof);
});
test('PROTOCOL UNIT simulated: a refresh finishing after logout cannot restore main-process login',async()=>{
 let release,refreshing,current;const gate=new Promise(r=>{release=r;}),started=new Promise(r=>{refreshing=r;});
 const f=fixture(async(url,options)=>{const body=JSON.parse(options.body);
  if(body.op==='login'){current=bundle(options.headers['X-Lingjing-Device-Id'],'original-text-owner',randomUUID(),Date.now()/1000-1);return response(current);}
  if(body.op==='refresh'){refreshing();await gate;current.tokens.expiresAt=Date.now()/1000+3600;return response(current);}return response({actor:current.actor});});
 await f.accounts.authenticate({provider:'runtime',account:'alice',password:'secret123'});
 const pending=f.accounts.cloudInvoke('lingjing-save',{op:'read'});await started;await f.accounts.logout();release();
 await assert.rejects(pending,{code:'SESSION_CHANGED'});assert.equal(f.accounts.getCurrentUser(),null);assert.equal(f.remote.active,null);
 assert.equal(f.db.prepare('select blocked from account_session_control').get().blocked,1);
});
test('PROTOCOL UNIT simulated: protected sync archives the original and reports partial synchronization honestly',async()=>{
 let current,cloud,received,archive;
 const f=fixture(async(url,options)=>{const body=JSON.parse(options.body);
  if(url.endsWith('lingjing-auth')){if(body.op==='login'){current=bundle(options.headers['X-Lingjing-Device-Id']);return response(current);}return response({actor:current.actor});}
  if(body.op==='archive'){archive=body.envelope;return response({id:randomUUID(),checksum:archive.checksum,promoted:false});}
  if(body.op==='push'){received=body.envelope;cloud={actionId:body.actionId,revision:2,checksum:received.checksum,envelope:received};return response(cloud);}return response(cloud);
 });
 await f.accounts.authenticate({provider:'runtime',account:'alice',password:'secret123'});
 f.accounts.backups.register({id:'garden',version:1,export:()=>({coins:999}),validate(){},restore(){}});
 const owner=f.accounts.requireOwner(),settings=f.accounts.settings();settings.document.sync.enabled=true;await f.accounts.saveSettings({...settings,actionId:randomUUID()});
 const original=f.accounts.backups.snapshot(owner),{checksum:discarded,...body}=original;body.data.modules.garden.data.coins=7;
 cloud={revision:1,envelope:{...body,checksum:require('../util.cjs').checksum(body)}};
 f.db.prepare('insert into account_sync_state(owner_account_id,cloud_revision) values(?,1)').run(owner);
 const action=randomUUID();f.accounts.sync.enqueue(owner,action);const result=await f.accounts.sync.flush(owner,true);
 assert.equal(archive.data.modules.garden.data.coins,999);assert.equal(received.data.modules.garden.data.coins,7);
 assert.equal(f.accounts.backups.snapshot(owner).data.modules.garden.data.coins,999);
 assert.equal(result.personalVerified,true);assert.equal(result.verified,false);assert.equal(result.requiresAuthority,true);
 assert.equal(f.accounts.sync.status(owner).unverifiedLocal,1);
 const source=f.db.prepare('select * from account_sync_sources').get();assert.equal(JSON.parse(source.original_document).data.modules.garden.data.coins,999);assert.ok(source.cloud_archive_id);
});
