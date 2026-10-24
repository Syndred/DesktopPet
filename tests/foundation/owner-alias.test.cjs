const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { openDatabase, migrate } = require('../../apps/pc-app/runtime/core/database.cjs');
const { migrations } = require('../../apps/pc-app/runtime/features/companions/migrations.cjs');
const { CompanionsService } = require('../../apps/pc-app/runtime/features/companions/service.cjs');
const { createCompanionOwnerMigration } = require('../../apps/pc-app/runtime/features/companions/identity.cjs');

test('verified alias retains independent pet IDs, growth, receipts and original archive without granting another provider', () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'lingjing-owner-')), 'save.sqlite')); migrate(db, 'companions', migrations);
  db.exec('CREATE TABLE account_identities(owner_account_id TEXT,provider TEXT,subject_id TEXT); CREATE TABLE account_aliases(provider TEXT,subject_id TEXT,owner_account_id TEXT,evidence TEXT);');
  db.prepare('INSERT INTO account_identities VALUES(?,?,?)').run('local:old', 'local', 'old');
  db.prepare('INSERT INTO account_aliases VALUES(?,?,?,?)').run('local','old','local:old','legacy-id');
  const service = new CompanionsService({ db });
  const adopted = service.adopt('old', { templateId: 'big-fish-gentle', name: '已有陪伴', showOnDesktop: false, actionId: 'adopt-1' }).data.pet;
  service.applyGrowthInTransaction('old', { petId: adopted.petId, actionId: 'growth-1', effect: { experience: 23, satiety: 11 } });
  const original = service.requirePet('old', adopted.petId);
  assert.equal(original.growth.experience, 23);
  let owner = 'local:old';
  const adapter = createCompanionOwnerMigration({ db, session: { getOwnerAccountId: () => owner }, get: () => ({ identity: id => db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(id) }) }, () => {});
  adapter.ensure('local:old');
  const recovered = service.requirePet('local:old', adopted.petId);
  assert.deepEqual(recovered.growth, original.growth); assert.equal(recovered.ownerAccountId, 'local:old');
  assert.deepEqual(service.requirePet('old', adopted.petId), original);
  assert.equal(JSON.parse(db.prepare('SELECT result_json FROM companion_actions WHERE owner_account_id=? AND action_id=?').get('local:old','adopt-1').result_json).data.pet.ownerAccountId, 'local:old');
  adapter.ensure('local:old'); assert.equal(service.snapshot('local:old').data.pets.length, 1);
  owner = 'runtime-other'; assert.throws(() => adapter.migrate({ sourceOwnerAccountId:'old', targetOwnerAccountId:'local:old', provider:'local', subjectId:'old' }), /已验证身份/);
  db.prepare('INSERT INTO account_identities VALUES(?,?,?)').run('local:old-2', 'local', 'old-2');
  db.prepare('INSERT INTO account_aliases VALUES(?,?,?,?)').run('local','old-2','local:old-2','legacy-id');
  service.adopt('old-2', { templateId:'big-fish-gentle',name:'旧存档进度',showOnDesktop:false,actionId:'old-adopt' });
  service.adopt('local:old-2', { templateId:'big-fish-gentle',name:'新存档进度',showOnDesktop:false,actionId:'new-adopt' });
  owner = 'local:old-2'; assert.throws(()=>adapter.ensure(owner),/独立进度/);
  assert.equal(service.snapshot('old-2').data.pets[0].name,'旧存档进度'); assert.equal(service.snapshot(owner).data.pets[0].name,'新存档进度');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM companion_identity_imports').get().count, 1); db.close();
});

test('registered garden and companions migrate the same verified old save without a second starter or changed pet', async () => {
  const db=openDatabase(join(mkdtempSync(join(tmpdir(),'lingjing-garden-alias-')),'save.sqlite'));
  migrate(db,'accounts',require('../../apps/pc-app/runtime/features/accounts/schema.cjs').migrations);
  migrate(db,'companions',migrations);
  const source='before-accounts',owner=`local:${source}`,service=new CompanionsService({db});
  const pet=service.adopt(source,{templateId:'big-fish-gentle',name:'原有鱼丸',showOnDesktop:false,actionId:'original-adopt'}).data.pet;
  service.applyGrowthInTransaction(source,{petId:pet.petId,actionId:'original-growth',effect:{experience:17}});
  const originalPet=service.requirePet(source,pet.petId);
  const { GardenService }=require('../../apps/pc-app/runtime/features/garden/service.cjs');
  const garden=new GardenService({db});garden.snapshot({ownerAccountId:source});
  assert.equal(garden.plant({ownerAccountId:source},{actionId:'original-plant',expectedRevision:0,plotId:'plot-1',cropType:'rice'}).ok,true);
  const plot=db.prepare('SELECT * FROM garden_plots WHERE owner_account_id=? AND plot_id=?').get(source,'plot-1');
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'local',source,'alias-qa','alias-qa','归属验证','2026-10-24','2026-10-24');
  db.prepare('INSERT INTO account_aliases VALUES(?,?,?,?,?)').run('local',source,owner,'legacy-id','2026-10-24');
  const registry=new Map([['accounts',{identity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)}]]);
  const services={db,legacy:{},paths:{},session:{getOwnerAccountId:()=>owner,getCurrentUser:()=>({id:owner})},events:{emit(){},on(){return()=>{};}},get:name=>registry.get(name),provide:(name,value)=>registry.set(name,value)};
  const companions=require('../../apps/pc-app/runtime/features/companions/index.cjs').register(services);
  const registered=require('../../apps/pc-app/runtime/features/garden/index.cjs').register(services);
  try {
    const state=await registered.commands.snapshot({}, {ownerAccountId:owner});assert.equal(state.ok,true,JSON.stringify(state));
    assert.deepEqual(service.requirePet(owner,pet.petId).growth,originalPet.growth);
    assert.deepEqual(service.requirePet(source,pet.petId),originalPet);
    assert.deepEqual(db.prepare('SELECT * FROM garden_plots WHERE owner_account_id=? AND plot_id=?').get(owner,'plot-1'),{...plot,owner_account_id:owner});
    assert.equal(garden.itemCount(owner,'seed:rice'),1);
    await registered.commands.snapshot({}, {ownerAccountId:owner});
    assert.equal(garden.itemCount(owner,'seed:rice'),1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM garden_identity_imports').get().n,1);
    assert.equal(garden.snapshot({ownerAccountId:source}).code,'OWNER_MIGRATED');
  } finally {registered.dispose?.();companions.dispose();db.close();}
});
