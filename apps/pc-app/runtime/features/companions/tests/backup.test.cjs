const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { migrateCompanions } = require('../migrations.cjs');
const { CompanionsService, atomic } = require('../service.cjs');
const { createCompanionBackupAdapter, TABLES } = require('../backup.cjs');

const owner = 'legacy-runtime-text-owner';
function cleanup(folder) { assert.equal(dirname(resolve(folder)),resolve(tmpdir())); assert.ok(basename(folder).startsWith('companion-cloud-')); rmSync(folder,{recursive:true,force:true}); }
function client(folder, name) {
  const file = join(folder, name+'.sqlite'), db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;'); migrateCompanions(db);
  return { file, db, service: new CompanionsService({ db }), adapter: createCompanionBackupAdapter(db) };
}
function seed(a) {
  const pets = ['旧鱼一号','旧鱼二号'].map((name,index) => a.service.adopt(owner,{ actionId:'adopt-'+index,templateId:'big-fish-gentle',name,showOnDesktop:true }).data.pet);
  a.service.updateDesktop(owner,{ actionId:'original-monitor-position',petId:pets[0].petId,position:{x:-720,y:130,displayId:'old-external-monitor'},behavior:'quiet',scale:1.2 });
  a.service.applyGrowthInTransaction(owner,{ actionId:'garden:original-feed',petId:pets[0].petId,effect:{satiety:12,mood:3,affinity:4,experience:110} });
  a.service.select(owner,{ actionId:'select-chat',petId:pets[0].petId,slot:'chatPetId' });
  a.service.select(owner,{ actionId:'select-battle',petId:pets[1].petId,slot:'battlePetId' });
  a.service.select(owner,{ actionId:'select-guard',petId:pets[0].petId,slot:'guardPetId' });
  a.service.createCapturedInstance(owner,{ actionId:'capture-old',templateId:'animal-shiba',name:'旧捕捉伙伴',showOnDesktop:false,origin:{wildPetId:'old-wild',wildSerial:'wild-serial',battleId:'old-battle'} });
  return pets;
}
test('two independent SQLite clients preserve exact instances, growth, positions, selections and retry receipts across restore/restart', () => {
  const folder = mkdtempSync(join(tmpdir(),'companion-cloud-unit-')), a=client(folder,'client-a'), b=client(folder,'client-b');
  let reopened;
  try {
    const pets=seed(a), snapshot=a.adapter.export(owner); a.adapter.validate(snapshot,owner);
    assert.equal(b.adapter.restore(owner,snapshot,'merge').restored,true);
    assert.deepEqual(b.adapter.export(owner),snapshot);
    assert.notEqual(pets[0].petId,pets[1].petId); assert.equal(pets[0].templateId,pets[1].templateId);
    const before=b.service.snapshot(owner);
    assert.equal(b.service.applyGrowthInTransaction(owner,{actionId:'garden:original-feed',petId:pets[0].petId,effect:{satiety:12,mood:3,affinity:4,experience:110}}).duplicate,true);
    assert.deepEqual(b.service.snapshot(owner),before);
    assert.equal(b.service.createCapturedInstance(owner,{ actionId:'capture-old',templateId:'animal-shiba',name:'旧捕捉伙伴',showOnDesktop:false,origin:{wildPetId:'old-wild',wildSerial:'wild-serial',battleId:'old-battle'} }).duplicate,true);
    assert.deepEqual(b.adapter.restore(owner,snapshot,'merge'),{duplicate:true});
    b.db.close(); reopened=client(folder,'client-b');
    assert.deepEqual(reopened.adapter.export(owner),snapshot);
    assert.equal(reopened.service.requirePet(owner,pets[1].petId).growth.satiety,60);
  } finally { a.db.close(); if(reopened)reopened.db.close();else b.db.close(); cleanup(folder); }
});
test('divergent client progress cannot merge receipts or union pets, and outer rollback includes the whole companion unit', () => {
  const folder=mkdtempSync(join(tmpdir(),'companion-cloud-conflict-')),a=client(folder,'a'),b=client(folder,'b');
  try {
    const pets=seed(a), baseline=a.adapter.export(owner);b.adapter.restore(owner,baseline,'merge');
    b.service.rename(owner,{actionId:'client-b-name',petId:pets[1].petId,name:'B端独立修改'});
    const kept=b.adapter.export(owner);
    assert.throws(()=>b.adapter.restore(owner,baseline,'merge'),e=>e.code==='COMPANION_BACKUP_CONFLICT');
    assert.deepEqual(b.adapter.export(owner),kept);
    assert.throws(()=>atomic(b.db,()=>{b.adapter.restore(owner,baseline,'replace');throw new Error('inventory restore failed');}),/inventory restore failed/);
    assert.deepEqual(b.adapter.export(owner),kept);
    assert.equal(b.adapter.restore(owner,baseline,'replace').restored,true);assert.deepEqual(b.adapter.export(owner),baseline);
  } finally{a.db.close();b.db.close();cleanup(folder);}
});
test('old generic-table archives convert without changing any saved row; partial, foreign, misbound or duplicate records are rejected', () => {
  const folder=mkdtempSync(join(tmpdir(),'companion-cloud-old-save-')),a=client(folder,'a');
  try{
    seed(a);const original=a.adapter.export(owner),tables=Object.fromEntries(TABLES.map(name=>[name,{rows:structuredClone(original.tables[name])}]));
    assert.deepEqual(a.adapter.fromLegacyTables(tables,owner),original);
    const partial=structuredClone(tables);delete partial.companion_capture_receipts;assert.throws(()=>a.adapter.fromLegacyTables(partial,owner),e=>e.code==='COMPANION_BACKUP_INVALID');
    for(const mutate of [data=>data.tables.companion_pets[0].owner_account_id='foreign',data=>{const p=JSON.parse(data.tables.companion_pets[0].data_json);p.petId='other-pet';data.tables.companion_pets[0].data_json=JSON.stringify(p)},data=>data.tables.companion_accounts[0].selections_json=JSON.stringify({chatPetId:'foreign-pet',battlePetId:null,guardPetId:null}),data=>data.tables.companion_actions.push(data.tables.companion_actions[0])]){
      const bad=structuredClone(original);mutate(bad);assert.throws(()=>a.adapter.restore(owner,bad,'replace'),e=>e.code==='COMPANION_BACKUP_INVALID');assert.deepEqual(a.adapter.export(owner),original);
    }
  }finally{a.db.close();cleanup(folder);}
});
test('archived 3D animals and original raw history survive a new-client restore without becoming active 3D resources',()=>{
  const folder=mkdtempSync(join(tmpdir(),'companion-cloud-archive-')),a=client(folder,'a'),b=client(folder,'b');
  try{
    const legacy={pets:[{id:'old-animal-id',name:{zh:'旧白狐'},model:'../kept-original.glb',element:'water',stats:'HP150 / ATK28 / DEF24 / SPD20',chats:[{id:'old-message',content:'原来的历史'}]}],activePetId:'old-animal-id'};
    a.service.importLegacyInventory(owner,legacy);const original=a.adapter.export(owner);a.adapter.validate(original,owner);b.adapter.restore(owner,JSON.parse(JSON.stringify(original)),'merge');
    assert.deepEqual(b.adapter.export(owner),original);assert.equal(JSON.parse(original.tables.companion_legacy_archive[0].source_json).chats[0].id,'old-message');
    assert.equal(b.service.requirePet(owner,'old-animal-id').resource.kind,'3d');
  }finally{a.db.close();b.db.close();cleanup(folder);}
});
