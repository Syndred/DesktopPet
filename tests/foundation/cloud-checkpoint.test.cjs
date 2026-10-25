const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { openDatabase, migrate } = require('../../apps/pc-app/runtime/core/database.cjs');
const { BackupManager } = require('../../apps/pc-app/runtime/features/accounts/backups.cjs');
const { AccountSync } = require('../../apps/pc-app/runtime/features/accounts/sync.cjs');
const { checksum } = require('../../apps/pc-app/runtime/features/accounts/util.cjs');
const { saveDataChecksum } = require('../../apps/pc-app/runtime/features/accounts/util.cjs');
const { CompanionsService } = require('../../apps/pc-app/runtime/features/companions/service.cjs');
const { GardenService } = require('../../apps/pc-app/runtime/features/garden/service.cjs');
const { createGardenBackupAdapter } = require('../../apps/pc-app/runtime/features/garden/backup.cjs');
const { CloudGardenAuthority } = require('../../apps/pc-app/runtime/features/garden/cloud-authority.cjs');
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-checkpoint-')), db = openDatabase(join(directory, 'save.sqlite'));
  for (const feature of ['accounts','companions']) migrate(db, feature, require(`../../apps/pc-app/runtime/features/${feature}/${feature === 'accounts' ? 'schema' : 'migrations'}.cjs`).migrations);
  const owner = 'runtime-checkpoint';
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'checkpoint','checkpoint','版本验收','2026-10-24','2026-10-24');
  db.exec('CREATE TABLE test_notes(owner_account_id TEXT PRIMARY KEY, note TEXT)');
  db.prepare('INSERT INTO test_notes VALUES(?,?)').run(owner,'已有回忆');
  const companions = new CompanionsService({ db });
  companions.adopt(owner, { templateId:'big-fish-gentle',name:'读回伙伴',showOnDesktop:false,actionId:'adopt-first' });
  const garden = new GardenService({ db }); garden.snapshot({ ownerAccountId: owner });
  const backups = new BackupManager({ db,directory,getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who) });
  backups.register(createGardenBackupAdapter(db));
  const sync = new AccountSync({ db,backups,remote:{enabled:true},getSession:()=>({ownerAccountId:owner,provider:'runtime'}),getSettings:()=>({document:{sync:{enabled:true}}}) });
  const authority = new CloudGardenAuthority({db,session:{getOwnerAccountId:()=>owner},get:name=>name==='accounts'?{sync}:null},garden);
  const initial = backups.snapshot(owner);
  db.prepare('INSERT INTO account_sync_state VALUES(?,?,?,?,NULL)').run(owner,1,initial.checksum,new Date().toISOString());
  return {db,owner,garden,backups,sync,authority,initial};
}
async function remotePlant(f) {
  const { applyCloudCommand, cloudSnapshot } = await import(pathToFileURL(join(__dirname,'../../apps/pc-app/runtime/features/garden/cloud-domain.mjs')).href);
  const input={actionId:'server-plant',expectedRevision:0,plotId:'plot-1',cropType:'rice'};
  const result = applyCloudCommand(structuredClone(f.initial),f.owner,'plant',input,Date.now(),checksum({kind:'plant',input}));
  const { checksum: oldChecksum, ...body } = result.envelope; void oldChecksum;
  result.envelope.checksum = checksum(body);
  return {envelope:result.envelope,accountRevision:2,snapshot:cloudSnapshot(result.envelope,f.owner,Date.now())};
}
test('real shared SQLite garden readback advances the account CAS base without reporting a local edit', async () => {
  const f=fixture();try {
    const remote=await remotePlant(f);f.authority.applyReadback({ownerAccountId:f.owner},remote);
    assert.equal(f.garden.snapshot({ownerAccountId:f.owner}).data.plots[0].cropType,'rice');
    assert.equal(f.sync.status(f.owner).cloudRevision,2);assert.equal(f.sync.status(f.owner).localChanged,false);
    f.sync.enqueue(f.owner,'next-full-save');
    assert.equal(f.db.prepare('SELECT base_revision FROM account_sync_outbox WHERE owner_account_id=?').get(f.owner).base_revision,2);
    const pending={...f.db.prepare('SELECT * FROM account_sync_outbox WHERE owner_account_id=?').get(f.owner)};
    assert.throws(()=>f.sync.acceptAuthoritativeReadback(f.owner,{envelope:remote.envelope,cloudRevision:remote.accountRevision}),{code:'SYNC_PENDING'});
    f.authority.applyReadback({ownerAccountId:f.owner},remote);
    assert.deepEqual({...f.db.prepare('SELECT * FROM account_sync_outbox WHERE owner_account_id=?').get(f.owner)},pending);
    assert.equal(f.db.prepare('SELECT status FROM account_sync_outbox WHERE owner_account_id=?').get(f.owner).status,'pending');
  } finally {f.db.close();}
});
test('local SQLite fixture: verified domain readbacks retain unrelated local work while blocked complete-save checkpoints stay unchanged', async () => {
  const f=fixture();try {
    const remote=await remotePlant(f), backup=createGardenBackupAdapter(f.db);
    f.db.prepare('UPDATE test_notes SET note=? WHERE owner_account_id=?').run('离线新回忆',f.owner);
    assert.throws(()=>f.sync.acceptAuthoritativeReadback(f.owner,{envelope:remote.envelope,cloudRevision:remote.accountRevision}),{code:'CLOUD_LOCAL_CONFLICT'});
    f.authority.applyReadback({ownerAccountId:f.owner},remote);
    assert.equal(f.garden.snapshot({ownerAccountId:f.owner}).data.plots[0].cropType,'rice');
    const applied=backup.export(f.owner);
    assert.throws(()=>f.sync.acceptAuthoritativeReadback(f.owner,{envelope:remote.envelope,cloudRevision:remote.accountRevision}),{code:'CLOUD_LOCAL_CONFLICT'});
    assert.deepEqual(backup.export(f.owner),applied);
    assert.equal(f.db.prepare('SELECT note FROM test_notes WHERE owner_account_id=?').get(f.owner).note,'离线新回忆');
    assert.equal(f.sync.status(f.owner).cloudRevision,1);
    assert.equal(f.sync.status(f.owner).localChanged,true);
    f.db.prepare('UPDATE test_notes SET note=? WHERE owner_account_id=?').run('已有回忆',f.owner);
    f.sync.running.add(f.owner);
    const before=backup.export(f.owner);
    assert.throws(()=>f.sync.acceptAuthoritativeReadback(f.owner,{envelope:remote.envelope,cloudRevision:remote.accountRevision}),{code:'SYNC_BUSY'});
    f.authority.applyReadback({ownerAccountId:f.owner},remote);
    assert.deepEqual(backup.export(f.owner),before);
    assert.equal(f.sync.status(f.owner).cloudRevision,1);
    f.sync.running.delete(f.owner);
    f.authority.applyReadback({ownerAccountId:f.owner},remote);
    assert.throws(()=>f.sync.acceptAuthoritativeReadback(f.owner,{envelope:f.initial,cloudRevision:1}),{code:'SYNC_STALE_READBACK'});
    assert.equal(f.sync.status(f.owner).cloudRevision,2);
  } finally {f.db.close();}
});

test('SQL row ordering does not change a save fingerprint while message order remains significant',()=>{
  const data={tables:{pets:{rows:[{id:'b'},{id:'a'}]}},modules:{conversations:{data:{messages:[{id:'first'},{id:'second'}]}}}};
  const reordered=structuredClone(data);reordered.tables.pets.rows.reverse();assert.equal(saveDataChecksum(data),saveDataChecksum(reordered));
  reordered.modules.conversations.data.messages.reverse();assert.notEqual(saveDataChecksum(data),saveDataChecksum(reordered));
});
