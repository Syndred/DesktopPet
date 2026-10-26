// Legacy full-save compatibility only. Production refresh uses domain caches and personal records.
const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve,dirname,basename}=require('node:path');
const {randomUUID}=require('node:crypto');
const {AccountsService}=require('../service.cjs');
const {SupabaseRemote}=require('../supabase-remote.cjs');
const {migrations}=require('../schema.cjs');
const {checksum}=require('../util.cjs');
const {createServices}=require('../../../core/services.cjs');
const {migrateCompanions}=require('../../companions/migrations.cjs');
const {CompanionsService}=require('../../companions/service.cjs');
const {createCompanionBackupAdapter}=require('../../companions/backup.cjs');
const {CloudCompanionAuthority}=require('../../companions/cloud-authority.cjs');
const {applyCompanionCommand,companionUnit}=require('../../companions/cloud-domain.mjs');
const {ConversationStore}=require('../../conversations/store.cjs');
const owner='authority-race-original-owner',fixtures=[];
const seal=envelope=>{const {checksum:old,...body}=envelope;void old;return{...body,checksum:checksum(body)};};
const ok=data=>({ok:true,status:200,json:async()=>({ok:true,data:structuredClone(data)})});
const failure=code=>({ok:false,status:409,json:async()=>({ok:false,code,message:'Controlled protocol rejection'})});
function gate(){let entered,release;return{entered:new Promise(r=>{entered=r;}),released:new Promise(r=>{release=r;}),enter:()=>entered(),release:()=>release()};}
async function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'lingjing-authority-personal-')),file=join(directory,'state.sqlite'),db=new DatabaseSync(file);
 db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON');migrations.forEach(m=>db.exec(m.sql));migrateCompanions(db);
 require('../../conversations/schema.cjs').migrations.forEach(m=>db.exec(m.sql));
 db.exec('CREATE TABLE race_inventory(owner_account_id TEXT PRIMARY KEY,amount INTEGER NOT NULL)');
 const f={directory,file,db,head:null,actions:new Map(),pushes:[],commands:[],originalReads:[],events:[]};fixtures.push(f);
 const provider=async(input,options={})=>{
  const url=new URL(String(input));
  if(url.pathname.endsWith('/rest/v1/lingjing_save_actions')){
   f.originalReads.push(url);await f.beforeOriginalRead?.();
   const rows=[...f.actions.values()].filter(row=>url.searchParams.get('owner_id')===`eq.${owner}`&&url.searchParams.get('revision')===`eq.${row.revision}`&&url.searchParams.get('checksum')===`eq.${row.checksum}`);
   return new Response(JSON.stringify(f.missingOriginal?[]:rows),{headers:{'content-type':'application/json'}});
  }
  const body=JSON.parse(options.body),name=url.pathname.split('/').pop();
  if(name==='lingjing-auth'){
   if(body.op==='login'){
    const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:f.loginOwner||owner,authUserId:f.loginOwner?'20000000-0000-4000-8000-000000000002':'10000000-0000-4000-8000-000000000001',deviceId:options.headers['X-Lingjing-Device-Id'],sessionId:randomUUID(),account:body.account,username:'竞态验证'};
    f.bundle={actor,currentUser:{id:actor.ownerAccountId,authKind:'supabase',authUserId:actor.authUserId,account:actor.account,username:actor.username},tokens:{accessToken:'protocol-unit-only',refreshToken:'twelve_chars',expiresAt:Date.now()/1000+3600,deviceId:actor.deviceId,sessionId:actor.sessionId}};
   }
   if(body.op==='refresh')f.bundle={...f.bundle,tokens:{...f.bundle.tokens,accessToken:'refreshed-protocol-unit-only'}};
   return ok(['login','refresh'].includes(body.op)?f.bundle:{actor:f.bundle.actor});
  }
  if(name==='lingjing-save'){
   if(body.op==='read'){const value=structuredClone(body.actionId?f.actions.get(body.actionId)||null:f.head);if(!body.actionId)await f.beforeHeadRead?.();return ok(value);}
   if(body.op==='archive')return ok({id:randomUUID(),promoted:false,checksum:body.envelope.checksum});
   if(body.op==='push'){
    f.pushes.push(structuredClone(body));if(f.failPush){f.failPush=false;throw Object.assign(new Error('Controlled offline wire'),{code:'CLOUD_UNAVAILABLE'});}
    if(f.actions.has(body.actionId))return ok(f.actions.get(body.actionId));
    if(body.baseRevision!==f.head.revision)return failure('SYNC_CONFLICT');
    f.commit(body.envelope,body.actionId);return ok(f.head);
   }
  }
  if(name==='companions-sync'){
   if(body.op==='snapshot')return ok({authority:'live',ownerAccountId:owner,...f.head,module:{version:1,data:companionUnit(f.head.envelope,owner,Date.now())}});
   if(body.baseRevision!==f.head.revision)return failure('SYNC_CONFLICT');
   f.commands.push(structuredClone(body));const prepared=await applyCompanionCommand(f.head.envelope,owner,body.command,body.input,Date.now()),next=structuredClone(f.head.envelope);
   next.data.modules.companions=prepared.module;next.createdAt=new Date().toISOString();
   f.commit(seal(next),'companions:'+body.input.actionId,{kind:'authority',result:prepared.result});await f.beforeCommandReply?.();return ok(f.head);
  }
  throw Error('Unexpected simulated protocol operation');
 };
 f.commit=(envelope,actionId,extra={})=>{f.head={revision:(f.head?.revision||0)+1,actionId,checksum:envelope.checksum,envelope:structuredClone(envelope),...extra};f.actions.set(actionId,structuredClone(f.head));};
 const remote=new SupabaseRemote({userData:directory,config:{url:'https://protocol.example.invalid',key:'sb_publishable_protocol_unit_only'},fetcher:provider});
 const services=createServices({db,legacy:{},paths:{userData:directory,legacyDataExisted:false},windows:{},safeStorage:{isEncryptionAvailable:()=>false}});
 const accounts=new AccountsService({services,remote,host:{async apply(){},clear(){},dispose(){}}});
 accounts.cloudCache=null; // This suite deliberately exercises the retained old full-save adapter.
 Object.assign(f,{accounts,remote,services});services.provide('accounts',accounts);services.session.setAdapter(accounts);services.events.on('accounts:sync-changed',value=>f.events.push(value));
 const companions=new CompanionsService({db}),backup=createCompanionBackupAdapter(db),store=new ConversationStore(db);
 accounts.backups.register(backup);accounts.backups.register(require('../../conversations/backup.cjs').createConversationBackupAdapter({db}));
 const authority=new CloudCompanionAuthority(services,companions,backup,()=>{});Object.assign(f,{companions,backup,authority,store});
 f.login=()=>accounts.authenticate({provider:'runtime',account:'alice',password:'secret123'});await f.login();
 f.edit=async value=>{const settings=accounts.settings();settings.document.sync.enabled=true;settings.document.desktop.volume=value;await accounts.saveSettings({...settings,actionId:randomUUID()});};
 db.prepare('INSERT INTO race_inventory VALUES(?,100)').run(owner);companions.snapshot(owner);await f.edit(10);f.commit(accounts.backups.snapshot(owner),'original-baseline');accounts.sync.acceptAuthoritativeReadback(owner,{envelope:f.head.envelope,cloudRevision:1});
 const adopt=()=>authority.execute(owner,'adopt',{actionId:randomUUID(),templateId:'big-fish-gentle',name:'独立云伙伴',showOnDesktop:false});
 await adopt();f.petId=(await adopt()).data.pet.petId;f.baseRevision=f.head.revision;f.base=structuredClone(f.head);
 f.select=()=>authority.execute(owner,'select',{actionId:randomUUID(),petId:f.petId,slot:'chatPetId'});
 f.applyWithoutCheckpoint=async()=>{const reply=gate();f.beforeCommandReply=async()=>{reply.enter();await reply.released;};const command=f.select();await reply.entered;accounts.sync.running.add(owner);reply.release();try{await command;}finally{accounts.sync.running.delete(owner);f.beforeCommandReply=null;}assert.equal(state(f).cloud_revision,f.baseRevision);};
 return f;
}
afterEach(()=>{for(const f of fixtures.splice(0)){f.accounts?.dispose();f.db.close();const target=resolve(f.directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('lingjing-authority-personal-'));rmSync(target,{recursive:true,force:true});}});
const state=f=>f.db.prepare('SELECT * FROM account_sync_state WHERE owner_account_id=?').get(owner);
const outbox=f=>f.db.prepare('SELECT * FROM account_sync_outbox WHERE owner_account_id=?').all(owner);
const personal=f=>f.accounts.sync.fingerprints(f.accounts.backups.snapshot(owner).data,owner).personal;
const baseline=f=>f.db.prepare('SELECT * FROM account_sync_baselines WHERE owner_account_id=?').get(owner);

// All reducers, adapters, actor/session checks and SQLite below are production.
// Only the remote wire is simulated; these tests do not claim live cloud/SFX QA.
test('shared SQLite / simulated wire: an actual companion selection overlapping automatic read preserves subsequent persona, memory and failed-message edits',async()=>{
 const f=await fixture(),commandGate=gate(),readGate=gate();
 f.beforeCommandReply=async()=>{commandGate.enter();await commandGate.released;};
 const command=f.select();await commandGate.entered;
 f.beforeHeadRead=async()=>{readGate.enter();await readGate.released;};
 const automatic=f.accounts.sync.reconcile(f.accounts.requireOwner());const interrupted=assert.rejects(automatic,{code:'SAVE_CHANGED'});await readGate.entered;
 assert.equal(f.accounts.sync.running.has(owner),true);commandGate.release();const receipt=await command;
 assert.equal(receipt.cloud.sharedSavePending,true);assert.equal(f.authority.pending(owner).length,0);assert.equal(state(f).cloud_revision,f.baseRevision);
 const intent=f.db.prepare("SELECT result FROM account_actions WHERE action_id=?").get(receipt.cloud.actionId);assert.equal(JSON.parse(intent.result).status,'verified');
 f.store.saveProfile(owner,f.petId,{persona:'保留这条人设',replyStyle:'natural',memoryEnabled:true,pauseWhileChatting:true,useOverride:false},0);
 f.store.saveMemory(owner,f.petId,{content:'保留这条记忆'});
 const turn=randomUUID();f.store.createTurn(owner,f.petId,turn,'真实用户原消息',{provider:'openai_compatible',baseUrl:'http://127.0.0.1:1/v1',model:'configured-model',contextChars:24000,maxOutputTokens:512});
 f.store.updateReply(owner,f.petId,turn,'','failed','NETWORK_ERROR');await f.edit(21);
 const beforePersonal=personal(f),beforeProtected=f.accounts.sync.fingerprints(f.accounts.backups.snapshot(owner).data,owner).protected;
 readGate.release();await interrupted;f.beforeHeadRead=null;
 const adoption=await f.accounts.sync.reconcile(f.accounts.requireOwner());assert.equal(adoption.readbackOnly,true);assert.equal(adoption.personalPending,true);assert.equal(state(f).cloud_revision,f.baseRevision+1);
 assert.equal(personal(f),beforePersonal);assert.equal(f.accounts.sync.fingerprints(f.accounts.backups.snapshot(owner).data,owner).protected,beforeProtected);
 assert.equal(baseline(f).cloud_document,JSON.stringify(f.head.envelope));assert.notEqual(baseline(f).personal_checksum,beforePersonal);assert.equal(outbox(f).length,0);
 await f.accounts.sync.reconcile(f.accounts.requireOwner());assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].baseRevision,f.baseRevision+1);assert.equal(outbox(f)[0].status,'verified');
 const uploaded=f.head.envelope.data.modules.conversations.data.tables;
 assert.equal(uploaded.conversation_profiles[0].persona,'保留这条人设');assert.equal(uploaded.conversation_memories[0].content,'保留这条记忆');
 assert.equal(uploaded.conversation_messages.find(row=>row.role==='user').content,'真实用户原消息');assert.equal(uploaded.conversation_messages.find(row=>row.role==='assistant').error_code,'NETWORK_ERROR');
 assert.equal(f.accounts.sync.status(owner).localChanged,false);assert.equal(f.db.prepare('SELECT count(*) n FROM account_backup_receipts').get().n,0);
 const observer=new DatabaseSync(f.file,{readOnly:true});observer.exec('PRAGMA query_only=ON');assert.equal(observer.prepare('SELECT cloud_revision FROM account_sync_state WHERE owner_account_id=?').get(owner).cloud_revision,f.baseRevision+2);assert.equal(observer.prepare('PRAGMA quick_check').get().quick_check,'ok');observer.close();
});

test('shared SQLite / simulated wire: unknown protected edits and genuine two-device personal edits remain conflicts',async t=>{
 for(const reason of ['unknown-protected','remote-personal'])await t.test(reason,async()=>{
  const f=await fixture();await f.applyWithoutCheckpoint();await f.edit(21);
  if(reason==='unknown-protected')f.db.exec('UPDATE race_inventory SET amount=999');
  else{const next=structuredClone(f.head.envelope);next.data.modules.settings.data.desktop.volume=91;f.commit(seal(next),'other-device-personal');}
  const original=personal(f);await assert.rejects(f.accounts.sync.reconcile(f.accounts.requireOwner()),{code:'SYNC_REMOTE_CONFLICT'});
  assert.equal(state(f).cloud_revision,f.baseRevision);assert.equal(personal(f),original);assert.equal(f.accounts.settings().document.desktop.volume,21);assert.equal(outbox(f).length,0);assert.equal(f.pushes.length,0);
  assert.equal(f.db.prepare('SELECT amount FROM race_inventory').get().amount,reason==='unknown-protected'?999:100);
 });
});

test('shared SQLite / simulated wire: an uncertain sent outbox retries its original action/base/document and is never rebased onto a later authority',async()=>{
 const f=await fixture();await f.edit(21);const id=randomUUID();f.accounts.sync.enqueue(owner,id);f.failPush=true;await assert.rejects(f.accounts.sync.flush(owner),{code:'CLOUD_UNAVAILABLE'});
 const original=outbox(f)[0],source=f.db.prepare('SELECT * FROM account_sync_sources WHERE action_id=?').get(id);assert.ok(source.prepared_at);assert.equal(original.status,'retry');
 await f.select();f.db.exec('UPDATE account_sync_outbox SET next_attempt_at=0');await assert.rejects(f.accounts.sync.reconcile(f.accounts.requireOwner()),{code:'SYNC_CONFLICT'});
 const next=outbox(f)[0];for(const field of ['action_id','base_revision','document','checksum'])assert.equal(next[field],original[field]);assert.equal(next.status,'conflict');assert.equal(state(f).cloud_revision,f.baseRevision);
 assert.equal(f.db.prepare('SELECT original_document FROM account_sync_sources WHERE action_id=?').get(id).original_document,source.original_document);assert.equal(f.pushes.length,2);assert.deepEqual(f.pushes[1],f.pushes[0]);
});

test('shared SQLite / simulated wire: exact old-envelope proof is required, and same-SID token refresh remains allowed',async t=>{
 for(const reason of ['exact-ledger','missing-ledger','forged-personal-fingerprint','same-SID-refresh'])await t.test(reason,async()=>{
  const f=await fixture();await f.applyWithoutCheckpoint();await f.edit(21);const originalPersonal=personal(f);
  if(['exact-ledger','missing-ledger'].includes(reason)){f.db.exec('UPDATE account_sync_baselines SET cloud_document=NULL');f.missingOriginal=reason==='missing-ledger';}
  if(reason==='forged-personal-fingerprint'){
   const next=structuredClone(f.head.envelope);next.data.modules.settings.data.desktop.volume=91;f.commit(seal(next),'other-personal');
   f.db.prepare('UPDATE account_sync_baselines SET personal_checksum=?').run(f.accounts.sync.fingerprints(next.data,owner).personal);
  }
  if(reason==='same-SID-refresh')f.beforeHeadRead=()=>f.remote.refresh(f.remote.active);
  if(['missing-ledger','forged-personal-fingerprint'].includes(reason)){
   await assert.rejects(f.accounts.sync.reconcile(f.accounts.requireOwner()),{code:reason==='missing-ledger'?'SYNC_BASELINE_REQUIRED':'SYNC_READBACK_MISMATCH'});assert.equal(state(f).cloud_revision,f.baseRevision);
  }else{assert.equal((await f.accounts.sync.reconcile(f.accounts.requireOwner())).personalPending,true);assert.equal(state(f).cloud_revision,f.baseRevision+1);}
  assert.equal(personal(f),originalPersonal);assert.equal(f.pushes.length,0);assert.equal(outbox(f).length,0);
  if(reason==='exact-ledger'){assert.equal(f.originalReads.length,1);const query=f.originalReads[0].searchParams;assert.equal(query.get('owner_id'),`eq.${owner}`);assert.equal(query.get('revision'),`eq.${f.baseRevision}`);assert.equal(query.get('checksum'),`eq.${f.base.checksum}`);}
 });
});

test('shared SQLite / simulated wire: owner, SID, epoch, sync setting and concurrent local changes invalidate adoption while exact baseline proof is in flight',async t=>{
 for(const reason of ['owner','logout','same-owner-new-SID','epoch','disabled','personal-edit','protected-edit'])await t.test(reason,async()=>{
  const f=await fixture();await f.applyWithoutCheckpoint();await f.edit(21);f.db.exec('UPDATE account_sync_baselines SET cloud_document=NULL');const proofGate=gate();
  f.beforeOriginalRead=async()=>{proofGate.enter();await proofGate.released;};const work=f.accounts.sync.reconcile(f.accounts.requireOwner());
  const rejection=assert.rejects(work,{code:['owner','logout','same-owner-new-SID','epoch'].includes(reason)?'SESSION_CHANGED':'SAVE_CHANGED'});await proofGate.entered;
  if(reason==='owner'){f.loginOwner='other-owner';await f.accounts.authenticate({provider:'runtime',account:'bob',password:'secret123'});}
  if(reason==='logout')await f.accounts.logout();
  if(reason==='same-owner-new-SID')await f.login();
  if(reason==='epoch')f.accounts.epoch++;
  if(reason==='disabled'){const settings=f.accounts.settings();settings.document.sync.enabled=false;await f.accounts.saveSettings({...settings,actionId:randomUUID()});}
  if(reason==='personal-edit')await f.edit(55);
  if(reason==='protected-edit')f.db.exec('UPDATE race_inventory SET amount=999');
  proofGate.release();await rejection;assert.equal(state(f).cloud_revision,f.baseRevision);assert.equal(f.pushes.length,0);assert.equal(outbox(f).length,0);assert.equal(baseline(f).cloud_document,null);
 });
});
