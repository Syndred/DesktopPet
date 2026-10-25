const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { migrations } = require('../../accounts/schema.cjs');
const { BackupManager } = require('../../accounts/backups.cjs');
const { AccountSync } = require('../../accounts/sync.cjs');
const { checksum } = require('../../accounts/util.cjs');
const { GardenService } = require('../../garden/service.cjs');
const { companionAdapter } = require('../../garden/index.cjs');
const { createGardenBackupAdapter } = require('../../garden/backup.cjs');
const { migrateCompanions } = require('../migrations.cjs');
const { CompanionsService } = require('../service.cjs');
const { createCompanionBackupAdapter } = require('../backup.cjs');

// Local real SQLite/Accounts complete-save integration. No Auth/transport is
// simulated here, and this is not evidence of deployed cloud permissions.
const owner='original-runtime-owner', context={ownerAccountId:owner};
function client(folder,name,registerCompanions=true) {
  const db=new DatabaseSync(join(folder,name+'.sqlite'));db.exec('PRAGMA foreign_keys=ON');
  migrations.forEach(m=>db.exec(m.sql));migrateCompanions(db);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'original','original','原账号','2026-10-24','2026-10-24');
  const pets=new CompanionsService({db}), unit=createCompanionBackupAdapter(db);
  const api={listPets:who=>pets.snapshot(who).data.pets,getPet:(who,id)=>pets.requirePet(who,id),applyGrowthInTransaction:(who,input)=>pets.applyGrowthInTransaction(who,input)};
  let now=Date.now();
  const garden=new GardenService({db,companions:companionAdapter({db,get:key=>key==='companions'?api:null}),clock:()=>now});
  const backups=new BackupManager({db,directory:join(folder,name+'-backups'),getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});
  // Explicit host registration keeps this fixture independent of Electron.
  if(registerCompanions)backups.register(unit);backups.register(createGardenBackupAdapter(db));
  return{db,pets,unit,garden,backups,advance:ms=>{now+=ms;}};
}
test('Accounts full-save restore transfers Garden food and exactly one grown companion together; retries and a later adapter failure cannot split them',()=>{
  const folder=mkdtempSync(join(tmpdir(),'companion-complete-save-')),a=client(folder,'a'),b=client(folder,'b');
  try{
    const pets=['原鱼一号','原鱼二号'].map((name,index)=>a.pets.adopt(owner,{actionId:'adopt-'+index,templateId:'big-fish-gentle',name,showOnDesktop:false}).data.pet);
    const request=(actionId,input)=>({actionId,expectedRevision:a.garden.snapshot(context).revision,...input});
    assert.equal(a.garden.plant(context,request('plant',{plotId:'plot-1',cropType:'rice'})).ok,true);a.advance(26*60_000);
    assert.equal(a.garden.harvest(context,request('harvest',{plotIds:['plot-1']})).ok,true);
    assert.equal(a.garden.craft(context,request('craft',{recipeId:'cooked_rice',quantity:1})).ok,true);
    const feed=request('feed-original',{petId:pets[0].petId,expectedPetRevision:pets[0].revision,itemId:'cooked_rice',quantity:1});
    assert.equal(a.garden.feed(context,feed).ok,true);assert.equal(a.garden.itemCount(owner,'cooked_rice'),0);
    const archive=a.backups.save(owner,join(folder,'complete.lingjing.json'));
    const preview=b.backups.preview(owner,archive.filePath);
    const restore={previewId:preview.previewId,actionId:'restore-original',mode:'merge'};
    assert.equal(b.backups.restore(owner,restore).restored,true);
    assert.deepEqual(b.unit.export(owner),a.unit.export(owner));
    assert.equal(b.garden.itemCount(owner,'cooked_rice'),0);
    assert.equal(b.pets.requirePet(owner,pets[0].petId).growth.satiety,80);
    assert.equal(b.pets.requirePet(owner,pets[1].petId).growth.satiety,60);
    assert.equal(b.garden.feed(context,feed).replayed,true);
    assert.equal(b.backups.restore(owner,restore).duplicate,true);
    assert.equal(b.garden.itemCount(owner,'cooked_rice'),0);
    // A failure after both real adapters have restored must roll both back.
    for(const target of[a,b])target.backups.register({id:'restore-fault-probe',version:1,export:()=>null,validate(){},restore(){throw new Error('deliberate later-adapter failure');}});
    b.pets.rename(owner,{petId:pets[1].petId,actionId:'keep-b-name',name:'B端原有进度'});
    const keptPets=b.unit.export(owner),keptGarden=createGardenBackupAdapter(b.db).export(owner);
    const second=a.backups.save(owner,join(folder,'failure-probe.lingjing.json')),secondPreview=b.backups.preview(owner,second.filePath);
    assert.throws(()=>b.backups.restore(owner,{previewId:secondPreview.previewId,actionId:'restore-must-rollback',mode:'replace'}),/deliberate later-adapter failure/);
    assert.deepEqual(b.unit.export(owner),keptPets);assert.deepEqual(createGardenBackupAdapter(b.db).export(owner),keptGarden);
    assert.equal(b.db.prepare('SELECT 1 FROM account_actions WHERE action_id=?').get('restore-must-rollback'),undefined);
  }finally{a.db.close();b.db.close();assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('companion-complete-save-'));rmSync(folder,{recursive:true,force:true});}
});

test('registered Accounts hook validates and restores original generic archives as one companion unit without rewriting the file or cloud receipt',()=>{
  const folder=mkdtempSync(join(tmpdir(),'companion-complete-save-')),a=client(folder,'old',false),b=client(folder,'new');
  try{
    const pet=a.pets.adopt(owner,{actionId:'old-original-adopt',templateId:'big-fish-gentle',name:'原编号原成长',showOnDesktop:false}).data.pet;
    a.pets.applyGrowthInTransaction(owner,{actionId:'old-original-growth',petId:pet.petId,effect:{experience:117}});
    const file=join(folder,'original-generic.lingjing.json'),saved=a.backups.save(owner,file),raw=readFileSync(file,'utf8'),original=JSON.parse(raw),expected=a.unit.export(owner);
    assert.equal(original.data.modules.companions,undefined);assert.ok(original.data.tables.companion_pets);
    const preview=b.backups.preview(owner,file);b.backups.restore(owner,{previewId:preview.previewId,actionId:'restore-original-generic',mode:'merge'});
    assert.deepEqual(b.unit.export(owner),expected);assert.equal(readFileSync(file,'utf8'),raw);assert.equal(saved.checksum,original.checksum);
    const sync=new AccountSync({db:b.db,backups:b.backups,remote:{enabled:true},getSession:()=>({ownerAccountId:owner,provider:'runtime'}),getSettings:()=>({document:{sync:{enabled:true}}})});
    assert.equal(sync.acceptAuthoritativeReadback(owner,{envelope:original,cloudRevision:7}).verified,true);assert.equal(sync.status(owner).localChanged,false);
    const foreign=structuredClone(original);foreign.data.tables.companion_pets.rows[0].owner_account_id='other-owner';const{checksum:ignored,...foreignBody}=foreign;void ignored;foreign.checksum=checksum(foreignBody);
    assert.throws(()=>b.backups.validate(foreign,owner),error=>error.code==='BACKUP_OWNER_MISMATCH');assert.deepEqual(b.unit.export(owner),expected);
    const mixed=b.backups.snapshot(owner);mixed.data.tables.companion_pets=original.data.tables.companion_pets;const{checksum:old,...mixedBody}=mixed;void old;mixed.checksum=checksum(mixedBody);
    assert.throws(()=>b.backups.validate(mixed,owner),error=>error.code==='BACKUP_MODULE_UNSUPPORTED');assert.deepEqual(b.unit.export(owner),expected);
  }finally{a.db.close();b.db.close();assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('companion-complete-save-'));rmSync(folder,{recursive:true,force:true});}
});
