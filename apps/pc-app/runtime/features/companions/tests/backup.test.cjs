const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { migrateCompanions } = require('../migrations.cjs');
const { CompanionsService, atomic } = require('../service.cjs');
const { createCompanionBackupAdapter, TABLES } = require('../backup.cjs');
const { createCompanionOwnerMigration } = require('../identity.cjs');

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

test('archives from before companion tables clear only on explicit replace and can re-import their original raw pet IDs',()=>{
  const folder=mkdtempSync(join(tmpdir(),'companion-cloud-pre-feature-')),a=client(folder,'a');
  try{
    seed(a);const kept=a.adapter.export(owner),empty=a.adapter.fromLegacyTables({},owner);
    assert.throws(()=>a.adapter.restore(owner,empty,'merge'),error=>error.code==='COMPANION_BACKUP_CONFLICT');assert.deepEqual(a.adapter.export(owner),kept);
    a.adapter.restore(owner,empty,'replace');
    assert.equal(a.adapter.export(owner).tables.companion_accounts.length,0);
    a.service.importLegacyInventory(owner,{pets:[{id:'original-pre-module-id',name:{zh:'更早的原宠物'},model:'old-model.glb',level:7,exp:23,chats:[{id:'original-pre-module-chat'}]}]});
    assert.equal(a.service.requirePet(owner,'original-pre-module-id').name,'更早的原宠物');
    assert.equal(a.service.requirePet(owner,'original-pre-module-id').growth.level,7);
    assert.equal(JSON.parse(a.adapter.export(owner).tables.companion_legacy_archive[0].source_json).chats[0].id,'original-pre-module-chat');
  }finally{a.db.close();cleanup(folder);}
});

test('verified alias migration retains source and target-before history, stable IDs and replay receipts through another client',()=>{
  const folder=mkdtempSync(join(tmpdir(),'companion-cloud-alias-')),a=client(folder,'a'),b=client(folder,'b');
  try{
    a.db.exec('CREATE TABLE account_identities(owner_account_id TEXT,provider TEXT,subject_id TEXT);CREATE TABLE account_aliases(provider TEXT,subject_id TEXT,owner_account_id TEXT,evidence TEXT)');
    const source=owner,target='local:'+source;seed(a);const original=a.adapter.export(source);
    a.service.importLegacyInventory(target,{pets:[{id:'pristine-target-original',name:{zh:'初始旧记录'},model:'old.glb',chats:[{id:'target-history',text:'迁移前历史也保留'}]}]});
    const targetBefore=a.adapter.export(target);
    a.db.prepare('INSERT INTO account_identities VALUES(?,?,?)').run(target,'local',source);
    a.db.prepare('INSERT INTO account_aliases VALUES(?,?,?,?)').run('local',source,target,'legacy-id');
    const migration=createCompanionOwnerMigration({db:a.db,session:{getOwnerAccountId:()=>target},get:()=>({identity:who=>a.db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)})},()=>{});
    migration.ensure(target);migration.ensure(target);
    const migrated=a.adapter.export(target);assert.equal(migrated.identityImports.length,1);
    assert.deepEqual(a.adapter.export(source),original);
    assert.deepEqual(JSON.parse(migrated.identityImports[0].archive_json).targetBefore,targetBefore.tables);
    assert.deepEqual(migrated.tables.companion_pets.map(row=>row.pet_id),original.tables.companion_pets.map(row=>row.pet_id));
    assert.equal(b.adapter.restore(target,migrated,'merge').restored,true);assert.deepEqual(b.adapter.export(target),migrated);
    const first=original.tables.companion_pets.map(row=>JSON.parse(row.data_json)).find(pet=>pet.source==='adoption');
    const restored=b.service.requirePet(target,first.petId);assert.deepEqual(restored.growth,first.growth);assert.deepEqual(restored.desktop,first.desktop);
    assert.equal(b.service.adopt(target,{actionId:'adopt-0',templateId:'big-fish-gentle',name:'旧鱼一号',showOnDesktop:true}).duplicate,true);
    const foreign=structuredClone(migrated);foreign.identityImports[0].target_owner_account_id='other-owner';
    assert.throws(()=>b.adapter.restore(target,foreign,'replace'),error=>error.code==='COMPANION_BACKUP_INVALID');
    assert.deepEqual(b.adapter.export(target),migrated);
  }finally{a.db.close();b.db.close();cleanup(folder);}
});

test('two old accounts can restore the same original pet ID without renaming, collision or cross-account receipts',()=>{
  const folder=mkdtempSync(join(tmpdir(),'companion-cloud-owner-pair-')),a=client(folder,'a'),b=client(folder,'b');
  try{
    const first='original-owner-a',second='original-owner-b';
    for(const[who,name,level]of[[first,'A账号原宠物',8],[second,'B账号原宠物',4]])a.service.importLegacyInventory(who,{pets:[{id:'pet-001',name:{zh:name},model:'retained-old-model.glb',level,experience:31,chats:[{id:'same-old-message-id',content:name+'的历史'}]}]});
    for(const who of[first,second])b.adapter.restore(who,a.adapter.export(who),'merge');
    assert.equal(b.service.requirePet(first,'pet-001').growth.level,8);assert.equal(b.service.requirePet(second,'pet-001').growth.level,4);
    for(const[who,name]of[[first,'A单独的新名字'],[second,'B单独的新名字']]){
      const input={actionId:'same-action-different-owner',petId:'pet-001',name};
      assert.equal(b.service.rename(who,input).data.pet.ownerAccountId,who);
      assert.equal(b.service.rename(who,input).duplicate,true);
    }
    assert.equal(b.service.requirePet(first,'pet-001').name,'A单独的新名字');assert.equal(b.service.requirePet(second,'pet-001').name,'B单独的新名字');
    assert.equal(b.db.prepare('SELECT COUNT(*) n FROM companion_pets WHERE pet_id=?').get('pet-001').n,2);
    const kept=b.adapter.export(second);assert.throws(()=>b.adapter.restore(second,a.adapter.export(first),'replace'),error=>error.code==='COMPANION_BACKUP_INVALID');assert.deepEqual(b.adapter.export(second),kept);
  }finally{a.db.close();b.db.close();cleanup(folder);}
});
