const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
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
    const client={db,service,preferences:new ResourceCloudPreferences(cloud)};clients.push(client);return client;
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
