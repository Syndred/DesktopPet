const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {migrations,ResourcesService}=require('../index.cjs');
const {ResourceCloudPreferences}=require('../cloud-preferences.cjs');
const {ResourceError}=require('../parser.cjs');
const owner='local-preference-outbox-only';
async function fixture(t){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'lingjing-local-pref-')),file=path.join(directory,'save.sqlite');
  const clients=[];t.after(()=>clients.forEach(client=>{if(client.db.open)client.db.close();}));
  async function open(){
    const db=openDatabase(file);migrate(db,'resources',migrations);const service=new ResourcesService({db,storageRoot:path.join(directory,'managed'),seedBuiltin:false});await service.seed();
    const cloud={db,service,protocolFixture:false,now:Date.now,actor:async()=>{throw new ResourceError('RESOURCE_CLOUD_AUTH_REQUIRED','Explicit local Auth-unavailable test');}};
    const client={db,service,cloud,preferences:new ResourceCloudPreferences(cloud)};clients.push(client);return client;
  }
  const client=await open(),imported=await client.service.importFile(owner,path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json'));
  const calibration=structuredClone(imported.resource.calibration);calibration.desktop.scale=1.45;
  await client.service.save(owner,{resourceId:imported.resource.id,expectedRevision:0,calibration,actions:imported.resource.actions});
  return {client,open,id:imported.resource.id};
}
test('LOCAL preference outbox persists exact intent before Auth and retries the same action after actual SQLite reopen',async t=>{
  const f=await fixture(t);f.client.preferences.enqueue(owner);const before=f.client.db.prepare('select * from lingjing_resource_preference_outbox').get();
  assert.equal(before.auth_user_id,null);assert.equal(before.base_revision,null);assert.equal(JSON.parse(before.document_json).calibration.desktop.scale,1.45);
  f.client.db.close();const reopened=await f.open();const failed=await reopened.preferences.flush(owner,{force:true});assert.equal(failed.verified.length,0);
  assert.equal(failed.errors[0].code,'RESOURCE_CLOUD_AUTH_REQUIRED');const after=reopened.db.prepare('select * from lingjing_resource_preference_outbox').get();
  assert.equal(after.action_id,before.action_id);assert.equal(after.document_json,before.document_json);assert.equal(after.status,'retry');assert.equal(reopened.preferences.snapshot(owner).length,0);
});
test('LOCAL preference hydration preserves a dirty local edit and refuses to call it verified',async t=>{
  const f=await fixture(t),resource=f.client.service.getRecord(owner,f.id),original=structuredClone(resource.calibration);original.desktop.scale=1;
  const applied=f.client.preferences.apply(owner,{resourceId:f.id,revision:99,calibration:original,actions:resource.actions,authority:{actionId:'explicit-local-placeholder',revision:99,checksum:'a'.repeat(64)}});
  assert.equal(applied.conflict,true);assert.equal(f.client.service.getRecord(owner,f.id).calibration.desktop.scale,1.45);assert.equal(f.client.preferences.snapshot(owner).length,0);
});

// Local readback fixtures exercise the real preference reader, authority checks,
// outbox and file SQLite. They are not a live Supabase or native UI acceptance.
async function convergedFixture(t){
  const f=await fixture(t),client=f.client;
  const state={generation:1,authUserId:randomUUID(),deviceId:randomUUID(),sessionId:randomUUID(),invocations:[],beforeRead:async()=>{}};
  state.remote={owner_account_id:owner,auth_user_id:state.authUserId,resource_id:f.id,revision:1,document:structuredClone(client.preferences.local(owner,f.id)),authority_action_id:'resource-pref:'+randomUUID()};
  state.proof={action_id:state.remote.authority_action_id,revision:16,checksum:'a'.repeat(64),kind:'authority'};
  state.client={from(table){return{
    select(){return this;},eq(){return this;},order(){return this;},
    async limit(){return{data:[{resource_id:f.id}]};},
    async maybeSingle(){await state.beforeRead(table);return{data:structuredClone(table==='lingjing_save_actions'?state.proof:state.remote)};}
  };}};
  client.cloud.getActorGeneration=()=>state.generation;
  client.cloud.actor=async(who,expectedUid)=>{
    if(who!==owner||(expectedUid&&expectedUid!==state.authUserId))throw new ResourceError('SESSION_CHANGED','Local fixture actor changed');
    return{ownerAccountId:owner,authUserId:state.authUserId,deviceId:state.deviceId,sessionId:state.sessionId,client:state.client,
      invoke:async(_name,body)=>{
        state.invocations.push(body);
        assert.equal(body.baseRevision,state.remote.revision);
        state.remote={...state.remote,revision:state.remote.revision+1,document:structuredClone(body.document),authority_action_id:'resource-pref:'+body.actionId};
        state.proof={action_id:state.remote.authority_action_id,revision:state.proof.revision+1,checksum:'b'.repeat(64),kind:'authority'};
        return{preferenceRevision:state.remote.revision,actionId:state.proof.action_id,checksum:state.proof.checksum};
      }};
  };
  client.cloud.onChanged=()=>{};
  client.preferences.enqueue(owner);
  client.db.prepare("UPDATE lingjing_resource_preference_outbox SET status='conflict',auth_user_id=?,base_revision=0,attempts=1,last_error='RESOURCE_PREFERENCE_CONFLICT',next_attempt_at=12345").run(state.authUserId);
  const before=client.db.prepare('SELECT * FROM lingjing_resource_preference_outbox').get();
  const row=()=>client.db.prepare('SELECT * FROM lingjing_resource_preference_outbox WHERE action_id=?').get(before.action_id);
  const unchanged=()=>assert.deepEqual(row(),before);
  return{...f,state,before,row,unchanged};
}

test('LOCAL same-document verified pull supersedes only the rejected intent, preserves history on reopen and admits a later genuine edit',async t=>{
  const f=await convergedFixture(t),p=f.client.preferences;
  await p.pull(owner);
  assert.equal(f.row().status,'superseded');
  for(const key of Object.keys(f.before))if(key!=='status')assert.deepEqual(f.row()[key],f.before[key],key+' must retain rejected CAS history');
  assert.equal(f.row().verified_at,null);
  assert.equal(p.snapshot(owner)[0].revision,1);
  const idle=await p.flush(owner);assert.equal(idle.pending,0);assert.deepEqual(idle.verified,[]);assert.deepEqual(f.state.invocations,[]);
  assert.equal(f.client.db.prepare('SELECT count(*) n FROM lingjing_resource_preference_outbox').get().n,1,'no automatic new actionId');
  const resource=f.client.service.getRecord(owner,f.id),calibration=structuredClone(resource.calibration);calibration.desktop.scale=1.55;
  await f.client.service.save(owner,{resourceId:f.id,expectedRevision:resource.revision,calibration,actions:resource.actions});
  const next=await p.flush(owner);assert.equal(next.verified.length,1);assert.equal(next.pending,0);
  assert.equal(f.state.invocations.length,1);assert.notEqual(f.state.invocations[0].actionId,f.before.action_id);assert.equal(f.state.invocations[0].baseRevision,1);
  assert.equal(f.row().status,'superseded');assert.equal(f.row().last_error,'RESOURCE_PREFERENCE_CONFLICT');assert.equal(f.row().attempts,1);assert.equal(f.row().verified_at,null);
  f.client.db.close();const reopened=await f.open();
  const retained=reopened.db.prepare('SELECT * FROM lingjing_resource_preference_outbox WHERE action_id=?').get(f.before.action_id);
  assert.equal(retained.status,'superseded');for(const key of Object.keys(f.before))if(key!=='status')assert.deepEqual(retained[key],f.before[key]);
  assert.equal(reopened.db.prepare("SELECT count(*) n FROM lingjing_resource_preference_outbox WHERE status='verified'").get().n,1,'only the later successful CAS is verified');
});

test('LOCAL differing cloud document retains the conflict and dirty local preference',async t=>{
  const f=await convergedFixture(t);f.state.remote.document.calibration.desktop.scale=1.2;
  await f.client.preferences.pull(owner);f.unchanged();assert.equal(f.client.service.getRecord(owner,f.id).calibration.desktop.scale,1.45);assert.equal(f.client.preferences.snapshot(owner).length,0);
});

test('LOCAL same document with a newer local revision does not resolve an older rejected version',async t=>{
  const f=await convergedFixture(t);
  f.state.beforeRead=async table=>{if(table==='lingjing_save_actions'){
    f.state.beforeRead=async()=>{};const resource=f.client.service.getRecord(owner,f.id);
    await f.client.service.save(owner,{resourceId:f.id,expectedRevision:resource.revision,calibration:resource.calibration,actions:resource.actions});
  }};
  await f.client.preferences.pull(owner);f.unchanged();assert.equal(f.client.service.getRecord(owner,f.id).revision,2);
});

test('LOCAL ordinary unverified apply cannot claim current authoritative convergence',async t=>{
  const f=await convergedFixture(t),resource=f.client.service.getRecord(owner,f.id);
  assert.throws(()=>f.client.preferences.apply(owner,{resourceId:f.id,revision:1,calibration:resource.calibration,actions:resource.actions,authority:{actionId:f.state.proof.action_id,revision:16,checksum:'a'.repeat(64)}},{resolveConverged:true}),{code:'RESOURCE_AUTHORITY_REQUIRED'});
  f.unchanged();
});

test('LOCAL normal pull without a main actor-generation capability conservatively retains the conflict',async t=>{
  const f=await convergedFixture(t);delete f.client.cloud.getActorGeneration;
  await f.client.preferences.pull(owner);f.unchanged();
});

test('LOCAL older authority read cannot downgrade a newer state or resolve its retained conflict',async t=>{
  const f=await convergedFixture(t),resource=f.client.service.getRecord(owner,f.id);
  f.client.preferences.apply(owner,{resourceId:f.id,revision:2,calibration:resource.calibration,actions:resource.actions,authority:{actionId:'resource-pref:'+randomUUID(),revision:17,checksum:'c'.repeat(64)}});
  const before=f.client.db.prepare('SELECT * FROM lingjing_resource_preference_state').get();
  await f.client.preferences.pull(owner);f.unchanged();assert.deepEqual(f.client.db.prepare('SELECT * FROM lingjing_resource_preference_state').get(),before);
});

test('LOCAL failed convergence transaction retains the original preference, conflict and history',async t=>{
  const f=await convergedFixture(t),before=f.client.db.prepare('SELECT * FROM lingjing_resource_preferences').get();
  f.client.db.exec("CREATE TRIGGER reject_convergence BEFORE UPDATE OF status ON lingjing_resource_preference_outbox WHEN NEW.status='superseded' BEGIN SELECT RAISE(ABORT,'injected convergence failure'); END");
  await assert.rejects(f.client.preferences.pull(owner),/injected convergence failure/);f.unchanged();
  assert.deepEqual(f.client.db.prepare('SELECT * FROM lingjing_resource_preferences').get(),before);assert.equal(f.client.preferences.snapshot(owner).length,0);
});

for(const boundary of ['owner','resource','auth-user','missing-authority','wrong-authority-action'])test('LOCAL verified convergence rejects '+boundary+' readback without changing history',async t=>{
  const f=await convergedFixture(t);
  if(boundary==='owner')f.state.remote.owner_account_id='another-owner';
  if(boundary==='resource')f.state.remote.resource_id=randomUUID();
  if(boundary==='auth-user')f.state.remote.auth_user_id=randomUUID();
  if(boundary==='missing-authority')f.state.proof=null;
  if(boundary==='wrong-authority-action')f.state.proof.action_id='resource-pref:'+randomUUID();
  await assert.rejects(f.client.preferences.pull(owner),{code:'RESOURCE_AUTHORITY_REQUIRED'});f.unchanged();
  assert.equal(f.client.preferences.snapshot(owner).length,0);assert.equal(f.client.db.prepare('SELECT count(*) n FROM lingjing_resource_preference_cache').get().n,0);
});

for(const boundary of ['epoch','session','device','sdk-client'])test('LOCAL '+boundary+' change during authority read cannot resolve the old conflict',async t=>{
  const f=await convergedFixture(t);f.state.beforeRead=async table=>{if(table==='lingjing_save_actions'){
    if(boundary==='epoch')f.state.generation++;
    if(boundary==='session')f.state.sessionId=randomUUID();
    if(boundary==='device')f.state.deviceId=randomUUID();
    if(boundary==='sdk-client')f.state.client={...f.state.client};
  }};
  await assert.rejects(f.client.preferences.pull(owner),{code:'SESSION_CHANGED'});f.unchanged();assert.equal(f.client.preferences.snapshot(owner).length,0);
});

test('LOCAL generation change after verified read but before apply cannot resolve or apply the old record',async t=>{
  const f=await convergedFixture(t),read=f.client.preferences.read.bind(f.client.preferences);
  f.client.preferences.read=async(...args)=>{const record=await read(...args);f.state.generation++;return record;};
  await assert.rejects(f.client.preferences.pull(owner),{code:'SESSION_CHANGED'});f.unchanged();assert.equal(f.client.preferences.snapshot(owner).length,0);
});

test('LOCAL a different old auth identity or different CAS error remains a conflict',async t=>{
  for(const boundary of ['auth','error']){
    const f=await convergedFixture(t);
    if(boundary==='auth')f.client.db.prepare('UPDATE lingjing_resource_preference_outbox SET auth_user_id=?').run(randomUUID());
    else f.client.db.prepare("UPDATE lingjing_resource_preference_outbox SET last_error='ACTION_ID_REUSED'").run();
    const before=f.row();await f.client.preferences.pull(owner);assert.deepEqual(f.row(),before);
  }
});
