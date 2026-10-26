const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { join } = require('node:path');
const { openDatabase, migrate } = require('../../apps/pc-app/runtime/core/database.cjs');
const { BackupManager } = require('../../apps/pc-app/runtime/features/accounts/backups.cjs');
const { AccountSync } = require('../../apps/pc-app/runtime/features/accounts/sync.cjs');
const { CloudReadbackCache } = require('../../apps/pc-app/runtime/features/accounts/cloud-cache.cjs');
const { checksum } = require('../../apps/pc-app/runtime/features/accounts/util.cjs');
const { CompanionsService } = require('../../apps/pc-app/runtime/features/companions/service.cjs');
const { createCompanionBackupAdapter } = require('../../apps/pc-app/runtime/features/companions/backup.cjs');
const { GardenService } = require('../../apps/pc-app/runtime/features/garden/service.cjs');
const { createGardenBackupAdapter } = require('../../apps/pc-app/runtime/features/garden/backup.cjs');
const { CloudGardenAuthority } = require('../../apps/pc-app/runtime/features/garden/cloud-authority.cjs');

async function fixture() {
  const db = openDatabase(':memory:'), owner = 'runtime-domain-cache';
  for (const name of ['accounts','companions']) migrate(db,name,require(`../../apps/pc-app/runtime/features/${name}/${name==='accounts'?'schema':'migrations'}.cjs`).migrations);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(owner,'runtime',owner,'domain-cache','domain-cache','缓存回验','2026-10-26','2026-10-26');
  const companions = new CompanionsService({ db });
  companions.adopt(owner,{templateId:'big-fish-gentle',name:'缓存伙伴',showOnDesktop:false,actionId:'initial-adoption'});
  const garden = new GardenService({ db }); garden.snapshot({ownerAccountId:owner});
  db.exec('CREATE TABLE test_notes(owner_account_id TEXT PRIMARY KEY,note TEXT)');
  db.prepare('INSERT INTO test_notes VALUES(?,?)').run(owner,'原笔记');
  const backups = new BackupManager({db,directory:process.cwd(),getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});
  backups.register(createCompanionBackupAdapter(db)); backups.register(createGardenBackupAdapter(db));
  let session = {ownerAccountId:owner,provider:'runtime',authKind:'supabase'};
  const sync = new AccountSync({db,backups,remote:{enabled:true},getSession:()=>session,getSettings:()=>({document:{sync:{enabled:true}}})});
  const cache = new CloudReadbackCache({db,backups,getSession:()=>session,cloudView:(data,who)=>sync.cloudView(data,who)});
  const services = {db,session:{getOwnerAccountId:()=>session.ownerAccountId},get:name=>name==='accounts'?{sync,cloudCache:cache}:null};
  const authority = new CloudGardenAuthority(services,garden), initial=backups.snapshot(owner);
  db.prepare('INSERT INTO account_sync_state VALUES(?,?,?,?,NULL)').run(owner,1,initial.checksum,new Date().toISOString());
  const {applyCloudCommand,cloudSnapshot}=await import(pathToFileURL(join(__dirname,'../../apps/pc-app/runtime/features/garden/cloud-domain.mjs')).href);
  const input={actionId:'server-plant',expectedRevision:0,plotId:'plot-1',cropType:'rice'};
  const result=applyCloudCommand(structuredClone(initial),owner,'plant',input,Date.now(),checksum({kind:'plant',input}));
  const {checksum:ignored,...body}=result.envelope; void ignored; result.envelope.checksum=checksum(body);
  const remote={envelope:result.envelope,accountRevision:2,snapshot:cloudSnapshot(result.envelope,owner,Date.now())};
  return {db,owner,backups,sync,cache,authority,garden,initial,remote,switchOwner:()=>{session={...session,ownerAccountId:'other-owner'};}};
}

test('verified garden and pet caches advance despite unrelated local edits and an old full-save conflict',async()=>{
  const f=await fixture();try{
    f.sync.enqueue(f.owner,'old-full-save');
    f.db.prepare("UPDATE account_sync_outbox SET status='conflict' WHERE owner_account_id=?").run(f.owner);
    const pending={...f.db.prepare('SELECT * FROM account_sync_outbox WHERE owner_account_id=?').get(f.owner)};
    f.db.prepare('UPDATE test_notes SET note=? WHERE owner_account_id=?').run('尚未迁移的本机笔记',f.owner);
    f.authority.applyReadback({ownerAccountId:f.owner},f.remote);
    assert.equal(f.garden.snapshot({ownerAccountId:f.owner}).data.plots[0].cropType,'rice');
    assert.equal(f.cache.revision(f.owner),2);
    assert.deepEqual(f.cache.status(f.owner).domains.map(row=>row.domain),['companions','garden']);
    assert.equal(f.db.prepare('SELECT note FROM test_notes WHERE owner_account_id=?').get(f.owner).note,'尚未迁移的本机笔记');
    assert.deepEqual({...f.db.prepare('SELECT * FROM account_sync_outbox WHERE owner_account_id=?').get(f.owner)},pending);
    assert.equal(f.sync.status(f.owner).cloudRevision,1,'a cache receipt is not a full-save upload acknowledgement');
  }finally{f.db.close();}
});

test('domain checkpoints reject an un-applied result and accept repeated verified reads without duplicate business writes',async()=>{
  const f=await fixture();try{
    assert.throws(()=>f.cache.accept(f.owner,{envelope:f.remote.envelope,cloudRevision:2,domains:['garden','companions']}),{code:'CLOUD_READBACK_PENDING'});
    assert.equal(f.cache.revision(f.owner),0);
    f.authority.applyReadback({ownerAccountId:f.owner},f.remote);
    const business=f.backups.snapshot(f.owner).data;
    f.authority.applyReadback({ownerAccountId:f.owner},f.remote);
    assert.deepEqual(f.backups.snapshot(f.owner).data,business);
    assert.throws(()=>f.cache.accept(f.owner,{envelope:f.initial,cloudRevision:1,domains:['companions']}),{code:'SYNC_STALE_READBACK'});
    assert.equal(f.cache.revision(f.owner),2);
  }finally{f.db.close();}
});

test('a domain checkpoint binds the exact owner, server envelope and permitted module',async()=>{
  const f=await fixture();try{
    f.authority.applyReadback({ownerAccountId:f.owner},f.remote);
    assert.throws(()=>f.cache.accept(f.owner,{envelope:f.remote.envelope,cloudRevision:2,domains:['conversations']}),{code:'INVALID_CLOUD_DOMAIN'});
    const different=structuredClone(f.remote.envelope); different.createdAt='2026-10-26T00:00:00.000Z';
    const {checksum:ignored,...body}=different; void ignored; different.checksum=checksum(body);
    assert.throws(()=>f.cache.accept(f.owner,{envelope:different,cloudRevision:2,domains:['garden']}),{code:'SYNC_RECEIPT_MISMATCH'});
    f.switchOwner();
    assert.throws(()=>f.cache.accept(f.owner,{envelope:f.remote.envelope,cloudRevision:2,domains:['garden']}),{code:'CLOUD_LOGIN_REQUIRED'});
  }finally{f.db.close();}
});
