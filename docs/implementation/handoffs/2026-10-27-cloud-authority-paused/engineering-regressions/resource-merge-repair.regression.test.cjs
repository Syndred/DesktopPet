
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const source=file=>require(path.resolve(process.cwd(),file));
const {openDatabase,migrate}=source('apps/pc-app/runtime/core/database.cjs');
const {migrations,ResourcesService}=source('apps/pc-app/runtime/features/resources/index.cjs');
const {createResourceBackupAdapter}=source('apps/pc-app/runtime/core/resource-backup.cjs');
// Isolated disposable SQLite/files only. No actual app profile, cloud or listener.
// Existing native cloud-account import uses merge, unlike the older replace-only regression.
test('merge restore repairs a missing imported asset from backup while retaining its original ID, metadata and preserved file',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lingjing-backup-merge-repair-')),db=openDatabase(path.join(root,'fixture.sqlite'));
  try{
    migrate(db,'resources',migrations);
    const resources=new ResourcesService({db,storageRoot:path.join(root,'managed')});await resources.seed();
    const owner='isolated-resource-restore-owner',imported=await resources.importFile(owner,path.resolve('apps/pc-app/runtime/assets/illustrations/yuwan-character-v1.json'));
    const originalPath=await resources.assetFile(owner,imported.resource.id,imported.resource.entryAsset),bytes=fs.readFileSync(originalPath),adapter=createResourceBackupAdapter({db,get:()=>resources}),backup=adapter.export(owner);
    adapter.validate(backup,owner);const rowBefore={...db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(imported.resource.id)},importsBefore=db.prepare('SELECT * FROM lingjing_resource_imports WHERE owner_account_id=? ORDER BY import_id').all(owner);
    const realRoot=fs.realpathSync.native(root),realFile=fs.realpathSync.native(originalPath),relative=path.relative(realRoot,realFile);assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),'fixture asset must remain inside disposable root');
    const preserved=originalPath+'.preserved';assert.equal(fs.existsSync(preserved),false);fs.renameSync(originalPath,preserved);
    db.transaction(()=>adapter.restore(owner,backup,'merge'))();
    const restored=await resources.assetFile(owner,imported.resource.id,imported.resource.entryAsset);
    assert.equal(fs.existsSync(restored),true,'a normal merge must restore the missing physical asset');
    assert.deepEqual(fs.readFileSync(restored),bytes);assert.deepEqual(fs.readFileSync(preserved),bytes,'the original preserved bytes must remain');
    assert.deepEqual({...db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(imported.resource.id)},rowBefore,'repairing a cache file must not replace the authored resource or revision');
    assert.deepEqual(db.prepare('SELECT * FROM lingjing_resource_imports WHERE owner_account_id=? ORDER BY import_id').all(owner),importsBefore);
    assert.equal((await resources.list(owner)).filter(x=>x.origin==='import').length,1,'no replacement resource identity');
  }finally{db.close();}
});
