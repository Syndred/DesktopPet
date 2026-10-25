const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,readFileSync,writeFileSync,readdirSync}=require('node:fs');
const {tmpdir}=require('node:os');const {join}=require('node:path');const {randomUUID}=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {AccountsService}=require('../service.cjs');const {SupabaseRemote}=require('../supabase-remote.cjs');
const {migrations}=require('../schema.cjs');const {checksum}=require('../util.cjs');
const fixtures=[];
const ok=data=>({ok:true,status:200,json:async()=>({ok:true,data})});
const failure=code=>({ok:false,status:409,json:async()=>({ok:false,code,message:'Simulated CAS conflict'})});
async function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'lingjing-auto-sync-')),dbFile=join(directory,'state.sqlite'),db=new DatabaseSync(dbFile);
 migrations.forEach(m=>db.exec(m.sql));db.exec('CREATE TABLE automatic_inventory(owner_account_id TEXT PRIMARY KEY,amount INTEGER NOT NULL)');
 const f={directory,dbFile,db,events:[],reads:0,pushes:[],actions:new Map(),offline:false};
 const remote=new SupabaseRemote({userData:directory,config:{url:'https://example.supabase.co',key:'sb_publishable_protocol_unit_only'},fetcher:async(url,options)=>{
  const body=JSON.parse(options.body);
  if(url.endsWith('lingjing-auth')){
   if(body.op==='login'){
    const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:'old-text-owner',authUserId:'10000000-0000-4000-8000-000000000001',
     deviceId:options.headers['X-Lingjing-Device-Id'],sessionId:randomUUID(),account:'alice',username:'原昵称'};
    f.bundle={actor,currentUser:{id:actor.ownerAccountId,authUserId:actor.authUserId,authKind:'supabase',account:actor.account,username:actor.username},
     tokens:{accessToken:`protocol.${randomUUID()}`,refreshToken:'twelve_chars',expiresAt:Date.now()/1000+3600,deviceId:actor.deviceId,sessionId:actor.sessionId}};
   }
   if(body.op==='refresh')f.bundle={...f.bundle,tokens:{...f.bundle.tokens,accessToken:`refreshed.${randomUUID()}`}};
   return ok(['login','refresh'].includes(body.op)?f.bundle:{actor:f.bundle.actor});
  }
  if(f.offline){assert.ok(db.prepare("SELECT 1 FROM account_sync_outbox WHERE status='pending'").get(),'Automatic original action must be durable before offline I/O');throw Object.assign(new Error('Simulated offline transport'),{code:'CLOUD_UNAVAILABLE'});}
  if(body.op==='read'){f.reads++;await f.beforeRead?.();return ok(body.actionId?f.actions.get(body.actionId):f.cloud);}
  if(body.op==='archive')return ok({id:randomUUID(),checksum:body.envelope.checksum,promoted:false});
  if(body.op==='push'){
   f.pushes.push(body);
   if(f.actions.has(body.actionId))return ok(f.actions.get(body.actionId));
   if(body.baseRevision!==f.cloud.revision)return failure('SYNC_CONFLICT');
   f.cloud={actionId:body.actionId,revision:f.cloud.revision+1,checksum:body.envelope.checksum,envelope:body.envelope};f.actions.set(body.actionId,f.cloud);return ok(f.cloud);
  }
  throw new Error('Unexpected simulated operation');
 }});
 const services={db,paths:{userData:directory,legacyDataExisted:false},safeStorage:{isEncryptionAvailable:()=>false},events:{emit:(name,data)=>f.events.push({name,data})}};
 const accounts=new AccountsService({services,remote,host:{async apply(){},clear(){},dispose(){}}});
 Object.assign(f,{accounts,remote});fixtures.push(f);
 f.login=()=>accounts.authenticate({provider:'runtime',account:'alice',password:'secret123'});
 f.edit=async volume=>{const settings=accounts.settings();settings.document.sync.enabled=true;settings.document.desktop.volume=volume;return accounts.saveSettings({...settings,actionId:randomUUID()});};
 await f.login();f.owner=accounts.requireOwner();db.prepare('INSERT INTO automatic_inventory VALUES(?,100)').run(f.owner);await f.edit(10);
 f.head=(volume,revision=2,amount=100)=>{
  const {checksum:old,...body}=accounts.backups.snapshot(f.owner);body.data.modules.settings.data.desktop.volume=volume;body.data.tables.automatic_inventory.rows[0].amount=amount;
  const envelope={...body,checksum:checksum(body)};f.cloud={revision,envelope,checksum:envelope.checksum};return f.cloud;
 };
 f.head(10,1);accounts.sync.acceptAuthoritativeReadback(f.owner,{envelope:f.cloud.envelope,cloudRevision:1});
 return f;
}
afterEach(()=>{for(const f of fixtures.splice(0)){f.accounts.dispose();f.db.close();rmSync(f.directory,{recursive:true,force:true});}});
const state=f=>f.db.prepare('SELECT * FROM account_sync_state WHERE owner_account_id=?').get(f.owner);
const volume=f=>f.accounts.settings().document.desktop.volume;
const pending=f=>f.db.prepare("SELECT * FROM account_sync_outbox WHERE status IN ('pending','retry','conflict')").all();

test('real SQLite / simulated provider: clean automatic pull atomically applies full state and preserves original backup',async()=>{
 const f=await fixture();f.head(32,2,44);const result=await f.accounts.runAutomaticSync();assert.equal(result.applied,true);
 assert.equal(volume(f),32);assert.equal(f.db.prepare('SELECT amount FROM automatic_inventory').get().amount,44);
 assert.equal(state(f).cloud_revision,2);assert.equal(state(f).last_checksum,f.cloud.checksum);assert.equal(f.accounts.sync.status(f.owner).localChanged,false);
 const original=JSON.parse(readFileSync(result.preservedBackup.filePath));assert.equal(original.data.modules.settings.data.desktop.volume,10);assert.equal(original.data.tables.automatic_inventory.rows[0].amount,100);
 const reopened=new DatabaseSync(f.dbFile,{readOnly:true});assert.equal(reopened.prepare('SELECT last_checksum FROM account_sync_state').get().last_checksum,f.cloud.checksum);assert.equal(reopened.prepare('PRAGMA quick_check').get().quick_check,'ok');reopened.close();
 assert.ok(f.events.some(event=>event.name==='accounts:save-restored'&&event.data.automatic));assert.equal(f.pushes.length,0);
});
test('real SQLite / simulated provider: offline personal edits enqueue one original action before I/O and retry its original base',async()=>{
 const f=await fixture();await f.edit(20);f.offline=true;await assert.rejects(f.accounts.runAutomaticSync(),{code:'CLOUD_UNAVAILABLE'});
 const original=pending(f)[0],source=f.db.prepare('SELECT * FROM account_sync_sources').get();assert.match(original.action_id,/^auto:/);assert.equal(original.base_revision,1);assert.equal(volume(f),20);
 f.offline=false;f.db.exec('UPDATE account_sync_outbox SET next_attempt_at=0');await f.accounts.runAutomaticSync();
 assert.equal(pending(f).length,0);assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].actionId,original.action_id);assert.equal(f.pushes[0].baseRevision,1);
 assert.equal(f.db.prepare('SELECT original_document FROM account_sync_sources').get().original_document,source.original_document);assert.equal(state(f).cloud_revision,2);assert.equal(volume(f),20);
});
test('real SQLite / simulated provider: newer cloud plus dirty personal state retains original queue as conflict',async()=>{
 const f=await fixture();await f.edit(20);f.head(30,2);await assert.rejects(f.accounts.runAutomaticSync(),{code:'SYNC_CONFLICT'});
 assert.equal(volume(f),20);assert.equal(pending(f)[0].status,'conflict');assert.equal(pending(f)[0].base_revision,1);assert.equal(state(f).cloud_revision,1);
 assert.equal(f.db.prepare('SELECT count(*) n FROM account_backup_receipts').get().n,0);
});
test('real SQLite / simulated provider: unknown protected changes are never auto-uploaded or overwritten',async()=>{
 const f=await fixture();f.head(30,2,150);f.db.exec('UPDATE automatic_inventory SET amount=999');await assert.rejects(f.accounts.runAutomaticSync(),{code:'SYNC_REMOTE_CONFLICT'});
 assert.equal(f.db.prepare('SELECT amount FROM automatic_inventory').get().amount,999);assert.equal(pending(f).length,0);assert.equal(f.pushes.length,0);assert.equal(f.accounts.sync.status(f.owner).remoteChanged,true);
});
test('real SQLite / simulated provider: local edits while cloud read is pending abort automatic adoption',async()=>{
 const f=await fixture();f.head(30);let entered,release;const started=new Promise(resolve=>{entered=resolve;}),gate=new Promise(resolve=>{release=resolve;});f.beforeRead=async()=>{entered();await gate;};
 const task=f.accounts.runAutomaticSync();await started;assert.equal((await f.accounts.runAutomaticSync()).skipped,true);assert.throws(()=>f.accounts.sync.enqueue(f.owner,randomUUID()),{code:'SYNC_BUSY'});
 await f.edit(55);release();await assert.rejects(task,{code:'SAVE_CHANGED'});assert.equal(volume(f),55);assert.equal(state(f).cloud_revision,1);assert.equal(f.db.prepare('SELECT count(*) n FROM account_backup_receipts').get().n,0);
});
test('real SQLite / simulated provider: changes during hydration preserve cache and reject local edits, logout or same-owner new SID',async t=>{
 for(const change of ['local-edit','logout','same-owner-new-SID'])await t.test(change,async()=>{
  const f=await fixture();f.head(30);const cached=join(f.directory,'retained-hydration-cache.bin');
  f.accounts.backups.prepareCloud=async()=>{writeFileSync(cached,'verified additive cache');if(change==='local-edit')await f.edit(55);else if(change==='logout')await f.accounts.logout();else await f.login();};
  await assert.rejects(f.accounts.runAutomaticSync(),{code:change==='local-edit'?'SAVE_CHANGED':'SESSION_CHANGED'});
  assert.equal(readFileSync(cached,'utf8'),'verified additive cache');assert.equal(state(f).cloud_revision,1);assert.equal(pending(f).length,0);
  if(change==='local-edit')assert.equal(volume(f),55);
 });
});
test('real SQLite / simulated provider: same-SID token refresh during hydration still permits safe atomic pull',async()=>{
 const f=await fixture();f.head(30);const sid=f.accounts.privateSession().sessionId;f.accounts.backups.prepareCloud=()=>f.remote.refresh(f.remote.active);
 assert.equal((await f.accounts.runAutomaticSync()).applied,true);assert.equal(f.accounts.privateSession().sessionId,sid);assert.equal(volume(f),30);
});
test('real SQLite / simulated provider: unverified original, missing baseline, disabled sync and existing conflicts block automatic overwrite',async t=>{
 for(const reason of ['unverified','redacted','unknown-baseline','disabled','conflict'])await t.test(reason,async()=>{
  const f=await fixture();f.head(30);
  if(['unverified','redacted','conflict'].includes(reason)){
   const id=randomUUID();f.accounts.sync.enqueue(f.owner,id);
   if(reason==='conflict')f.db.exec("UPDATE account_sync_outbox SET status='conflict'");
   else{f.db.exec("UPDATE account_sync_outbox SET status='superseded'");f.db.exec(reason==='unverified'?"UPDATE account_sync_sources SET authority_pending=1":"UPDATE account_sync_sources SET cloud_excluded='[\"legacy\"]'");}
  }
  if(reason==='unknown-baseline')f.db.exec('DELETE FROM account_sync_state');
  if(reason==='disabled'){const settings=f.accounts.settings();settings.document.sync.enabled=false;await f.accounts.saveSettings({...settings,actionId:randomUUID()});}
  const result=await f.accounts.runAutomaticSync();assert.ok(result.blocked||result.skipped);assert.equal(volume(f),10);assert.equal(f.pushes.length,0);
 });
});
test('real SQLite / simulated provider: failed restore rolls back all domains and checkpoint while retaining original backup file',async()=>{
 const f=await fixture();f.accounts.backups.register({id:'fail-restore',version:1,export:()=>({}),validate(){},restore(){f.db.exec('UPDATE automatic_inventory SET amount=0');throw Object.assign(new Error('Intentional adapter rejection'),{code:'RESTORE_BLOCKED'});}});
 f.head(10,2);f.accounts.sync.acceptAuthoritativeReadback(f.owner,{envelope:f.cloud.envelope,cloudRevision:2});f.head(30,3,150);
 await assert.rejects(f.accounts.runAutomaticSync(),{code:'RESTORE_BLOCKED'});assert.equal(volume(f),10);assert.equal(f.db.prepare('SELECT amount FROM automatic_inventory').get().amount,100);assert.equal(state(f).cloud_revision,2);
 assert.ok(readdirSync(join(f.directory,'accounts','backups')).some(name=>name.startsWith('before-restore-')));
});
test('real SQLite / simulated provider: exact already-applied domain readback advances baseline without overwriting and allows later personal upload',async()=>{
 const f=await fixture();f.head(10,2,150);f.db.exec('UPDATE automatic_inventory SET amount=150');
 const result=await f.accounts.runAutomaticSync();assert.equal(result.readbackOnly,true);assert.equal(state(f).cloud_revision,2);assert.equal(f.db.prepare('SELECT count(*) n FROM account_backup_receipts').get().n,0);
 await f.edit(21);await f.accounts.runAutomaticSync();assert.equal(f.pushes.length,1);assert.equal(f.pushes[0].baseRevision,2);assert.equal(state(f).cloud_revision,3);assert.equal(volume(f),21);
});

test('real SQLite / simulated provider: production conversation adapter automatically queues messages, memory and persona while retaining local credentials',async()=>{
 const f=await fixture(),conversation=require('../../conversations/schema.cjs'),{ConversationStore}=require('../../conversations/store.cjs');
 conversation.migrations.forEach(m=>f.db.exec(m.sql));
 f.accounts.backups.register(require('../../conversations/backup.cjs').createConversationBackupAdapter({db:f.db}));
 f.head(10,2);f.accounts.sync.acceptAuthoritativeReadback(f.owner,{envelope:f.cloud.envelope,cloudRevision:2});
 const store=new ConversationStore(f.db),pet='original-owned-pet',action=randomUUID(),config={provider:'openai_compatible',baseUrl:'https://model.example.invalid/v1',model:'configured-model',contextChars:24000,maxOutputTokens:512};
 const content='{"password":"EXAMPLE_PLACEHOLDER","enabled":true}';
 store.saveConnection(f.owner,null,{...config,encryptedKey:'DEVICE-ONLY-CREDENTIAL-CIPHERTEXT'},0);
 store.createTurn(f.owner,pet,action,content,config);store.updateReply(f.owner,pet,action,'明确模拟的既有完整回复','complete');
 store.saveMemory(f.owner,pet,{content});store.saveProfile(f.owner,pet,{persona:content,replyStyle:'natural',memoryEnabled:true,pauseWhileChatting:true,useOverride:false},0);
 await f.accounts.runAutomaticSync();assert.equal(f.pushes.length,1);assert.match(f.pushes[0].actionId,/^auto:/);
 const data=f.cloud.envelope.data.modules.conversations.data;
 assert.equal(data.tables.conversation_messages.find(row=>row.role==='user').content,content);
 assert.equal(data.tables.conversation_memories[0].content,content);assert.equal(data.tables.conversation_profiles[0].persona,content);
 assert.equal(JSON.stringify(f.cloud.envelope).includes('DEVICE-ONLY-CREDENTIAL-CIPHERTEXT'),false);
 assert.equal(store.getConnection(f.owner,null,true).encryptedKey,'DEVICE-ONLY-CREDENTIAL-CIPHERTEXT');assert.equal(f.accounts.sync.status(f.owner).localChanged,false);
});
