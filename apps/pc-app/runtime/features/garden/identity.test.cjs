"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {GardenService}=require('./service.cjs');const {createOwnerMigration}=require('./identity.cjs');
const {CompanionsService}=require('../companions/service.cjs');const {migrateCompanions}=require('../companions/migrations.cjs');
const {migrations:accountMigrations}=require('../accounts/schema.cjs');
function setup(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const migration of accountMigrations)db.exec(migration.sql);migrateCompanions(db);
 const source='legacy-garden-owner',target=`local:${source}`,companions=new CompanionsService({db});
 const pet=companions.adopt(source,{actionId:'adopt',templateId:'big-fish-gentle',name:'鱼丸',showOnDesktop:false}).data.pet;
 const garden=new GardenService({db});garden.snapshot({ownerAccountId:source});garden.plant({ownerAccountId:source},{actionId:'old-plant',expectedRevision:0,plotId:'plot-1',cropType:'rice'});
 db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run(target,'local',source,'garden-alias','garden-alias','迁移验证','2026-10-24','2026-10-24');
 db.prepare('INSERT INTO account_aliases VALUES (?,?,?,?,?)').run('local',source,target,'legacy-id','2026-10-24');
 const api={listPets:owner=>companions.snapshot(owner).data.pets};const services={db,get:name=>name==='companions'?api:name==='accounts'?{identity:owner=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(owner)}:null};
 return{db,source,target,pet,companions,garden,migration:createOwnerMigration(services,garden),prepareCompanions(){companions.account(target);companions.storePet({...structuredClone(pet),ownerAccountId:target},true);}};
}
test('verified alias without companion migration preserves old garden and refuses a second starter grant',()=>{
 const f=setup();assert.throws(()=>f.migration.migrate({ownerAccountId:f.target}),{code:'OWNER_MIGRATION_REQUIRED'});
 assert.equal(f.db.prepare('SELECT 1 FROM garden_accounts WHERE owner_account_id=?').get(f.target),undefined);assert.equal(f.garden.itemCount(f.source,'seed:rice'),1);assert.equal(f.garden.snapshot({ownerAccountId:f.source}).data.plots[0].cropType,'rice');f.db.close();
});
test('once real companion rows match the alias, garden rekeys once and archives its exact old graph',()=>{
 const f=setup();f.prepareCompanions();f.migration.migrate({ownerAccountId:f.target});f.migration.migrate({ownerAccountId:f.target});
 const state=f.garden.snapshot({ownerAccountId:f.target});assert.equal(state.ok,true);assert.equal(state.data.plots[0].cropType,'rice');assert.equal(f.garden.itemCount(f.target,'seed:rice'),1);
 const receipt=f.db.prepare('SELECT * FROM garden_identity_imports').get();assert.equal(receipt.target_owner_account_id,f.target);assert.equal(JSON.parse(receipt.archive_json).tables.garden_plots[0].crop_type,'rice');
 assert.equal(f.garden.snapshot({ownerAccountId:f.source}).code,'OWNER_MIGRATED');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_items WHERE owner_account_id=?').get(f.target).n,4);f.db.close();
});
test('two progressed owner graphs cannot be merged by an alias',()=>{
 const f=setup();f.prepareCompanions();f.garden.snapshot({ownerAccountId:f.target});f.garden.plant({ownerAccountId:f.target},{actionId:'new-plant',expectedRevision:0,plotId:'plot-2',cropType:'carrot'});
 assert.throws(()=>f.migration.migrate({ownerAccountId:f.target}),{code:'OWNER_MIGRATION_REQUIRED'});assert.equal(f.garden.itemCount(f.source,'seed:rice'),1);assert.equal(f.garden.itemCount(f.target,'seed:carrot'),1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_identity_imports').get().n,0);f.db.close();
});
