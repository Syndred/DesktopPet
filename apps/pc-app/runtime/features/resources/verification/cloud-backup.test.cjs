const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {randomUUID}=require('node:crypto');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {migrations,ResourcesService}=require('../index.cjs');
const {migrations:accountMigrations}=require('../../accounts/schema.cjs');
const {BackupManager}=require('../../accounts/backups.cjs');
const {createResourceBackupAdapter}=require('../../../core/resource-backup.cjs');
const {validateReferences}=require('../cloud-backup.cjs');
const owner='resource-backup-local-owner',uid='10000000-0000-4000-8000-000000000001';
function reference(resourceId=randomUUID()){
  const digest='a'.repeat(64);return {authUserId:uid,resourceId,manifestSha256:digest,contentHash:'b'.repeat(64),manifestPath:`${uid}/${resourceId}/${digest}/manifest.json`,manifestBytes:100,totalBytes:1000,kind:'spritesheet'};
}
function resourceModule(refs=[]){return {version:2,data:{format:'lingjing-resource-references',ownerAccountId:owner,references:refs}};}
async function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lingjing-resource-cloud-backup-'));
  const db=openDatabase(path.join(root,'save.sqlite'));migrate(db,'accounts',accountMigrations);migrate(db,'resources',migrations);t.after(()=>db.close());
  const resources=new ResourcesService({db,storageRoot:path.join(root,'managed'),seedBuiltin:false});await resources.seed();
  const map=new Map([['resources',resources]]),services={db,get:name=>map.get(name)};
  const adapter=createResourceBackupAdapter(services);
  const manager=new BackupManager({db,directory:path.join(root,'backups'),getIdentity:()=>({provider:'runtime',subject_id:owner})});manager.register(adapter);
  return {db,resources,map,adapter,manager};
}
test('LOCAL cloud-v2 adapter rejects wrong owner, arbitrary schema/path, repeated refs and version/content mismatch',async t=>{
  const f=await fixture(t),valid=resourceModule([reference()]);f.adapter.validateModule(valid,owner);
  assert.throws(()=>validateReferences(valid.data,'other-owner'),/归属/);
  const extra=structuredClone(valid);extra.data.references[0].schema={forged:true};assert.throws(()=>f.adapter.validateModule(extra,owner),/字段/);
  const escaped=structuredClone(valid);escaped.data.references[0].manifestPath='../foreign';assert.throws(()=>f.adapter.validateModule(escaped,owner),/路径/);
  assert.throws(()=>f.adapter.validateModule(resourceModule([valid.data.references[0],valid.data.references[0]]),owner),/重复/);
  assert.throws(()=>f.adapter.validateModule({...valid,version:1},owner),/版本/);
});
test('LOCAL v2 validation confers no authority: restore refuses a client-only reference without a live server receipt',async t=>{
  const f=await fixture(t);const imported=await f.resources.importFile(owner,path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json'));
  const ref={...reference(imported.resource.id),contentHash:imported.resource.contentHash};
  f.adapter.validateModule(resourceModule([ref]),owner);
  assert.throws(()=>f.adapter.restore(owner,resourceModule([ref]).data,'replace'),/真实云端核验/);
  assert.equal((await f.resources.list(owner)).filter(row=>row.origin==='import').length,1);
});
test('LOCAL backup manager dispatches cloud v2 hydration before a retained preview while preserving the original v1 file',async t=>{
  const f=await fixture(t),before=f.manager.snapshot(owner);assert.equal(before.data.modules['character-resources'].version,1);
  assert(!Object.keys(before.data.tables).some(name=>name.startsWith('lingjing_resource_cloud_')));
  const envelope=structuredClone(before);envelope.data.modules['character-resources']=resourceModule();
  const {checksum}=require('../../accounts/util.cjs');delete envelope.checksum;envelope.checksum=checksum(envelope);
  const events=[];f.map.set('resourceCloud',{async hydrateReferences(inputOwner,snapshot){assert.equal(inputOwner,owner);assert.equal(snapshot.version,2);events.push('explicit-local-hydration-hook');return {restored:[]};}});
  await f.manager.prepareCloud(envelope,owner);assert.deepEqual(events,['explicit-local-hydration-hook']);
  f.manager.validate(envelope,owner);assert.equal(before.data.modules['character-resources'].version,1);assert.equal(envelope.data.modules['character-resources'].version,2);
  assert.deepEqual(f.manager.snapshot(owner).data,before.data);
});
