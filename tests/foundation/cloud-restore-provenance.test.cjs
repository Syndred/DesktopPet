const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve,dirname,basename}=require('node:path');
const {randomUUID}=require('node:crypto');
const {BackupManager}=require('../../apps/pc-app/runtime/features/accounts/backups.cjs');
const {checksum}=require('../../apps/pc-app/runtime/features/accounts/util.cjs');

function fixture(t){
  const directory=mkdtempSync(join(tmpdir(),'lingjing-restore-provenance-')),db=new DatabaseSync(':memory:'),owner='provenance-owner',calls=[];
  for(const migration of require('../../apps/pc-app/runtime/features/accounts/schema.cjs').migrations)db.exec(migration.sql);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'local',owner,'owner','owner','原账号','2026-10-25','2026-10-25');
  db.exec('CREATE TABLE restore_proof(owner_account_id TEXT PRIMARY KEY,value TEXT NOT NULL)');db.prepare('INSERT INTO restore_proof VALUES(?,?)').run(owner,'original');
  const backups=new BackupManager({db,directory,getIdentity:id=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(id)});
  const adapter={id:'provenance-test',version:1,tables:['restore_proof'],
    export:id=>({value:db.prepare('SELECT value FROM restore_proof WHERE owner_account_id=?').get(id).value}),
    validate:data=>assert.equal(typeof data.value,'string'),
    restore(id,data){assert.equal(this,adapter);calls.push({route:'file',owner:id});db.prepare('UPDATE restore_proof SET value=? WHERE owner_account_id=?').run(data.value,id);},
    restoreCloud(id,data,mode,connection,context){assert.equal(this,adapter);assert.equal(connection,db);assert.equal(Object.isFrozen(context),true);calls.push({route:'cloud',owner:id,mode,context});db.prepare('UPDATE restore_proof SET value=? WHERE owner_account_id=?').run(data.value,id);}
  };backups.register(adapter);
  const {checksum:discard,...body}=backups.snapshot(owner);void discard;body.data.modules['provenance-test'].data.value='restored';
  // Even a correctly checksummed file may claim live provenance and a revision.
  // Neither field becomes the main process's verified preview metadata.
  body.cloudRevision=123;body.provenance={mode:'live'};const envelope={...body,checksum:checksum(body)},file=join(directory,'source.json');writeFileSync(file,JSON.stringify(envelope));
  t.after(()=>{db.close();const target=resolve(directory);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('lingjing-restore-provenance-'));rmSync(target,{recursive:true,force:true});});
  return{db,owner,backups,calls,envelope,preview:()=>backups.preview(owner,file),restore(preview,extra={}){return backups.restore(owner,{previewId:preview.previewId,actionId:randomUUID(),mode:'replace',...extra});}};
}

test('file provenance and renderer-supplied revision cannot select a cloud restore adapter',t=>{
  const f=fixture(t),preview=f.preview();f.restore(preview,{cloudRevision:999,provenance:{mode:'live'}});
  assert.deepEqual(f.calls,[{route:'file',owner:f.owner}]);assert.equal(f.db.prepare('SELECT value FROM restore_proof').get().value,'restored');
});

test('only verified main preview metadata selects the cloud adapter with the original checksum and owner',t=>{
  const f=fixture(t),preview=f.preview();f.backups.previews.get(preview.previewId).cloudRevision=7;f.restore(preview,{cloudRevision:999});
  assert.deepEqual(f.calls,[{route:'cloud',owner:f.owner,mode:'replace',context:{kind:'verified-cloud-preview',ownerAccountId:f.owner,revision:7,checksum:f.envelope.checksum}}]);
});

test('a different owner or expired preview cannot call the trusted adapter',t=>{
  const f=fixture(t),preview=f.preview();f.backups.previews.get(preview.previewId).cloudRevision=7;
  assert.throws(()=>f.backups.restore('different-owner',{previewId:preview.previewId,actionId:randomUUID(),mode:'replace'}),{code:'BACKUP_PREVIEW_EXPIRED'});
  f.backups.previews.get(preview.previewId).expiresAt=Date.now()-1;assert.throws(()=>f.restore(preview),{code:'BACKUP_PREVIEW_EXPIRED'});assert.deepEqual(f.calls,[]);
});

test('an uncommitted revision-zero preview retains ordinary restore semantics without authority promotion',t=>{
  const f=fixture(t),preview=f.preview();f.backups.previews.get(preview.previewId).cloudRevision=0;f.restore(preview);
  assert.deepEqual(f.calls,[{route:'file',owner:f.owner}]);
});

test('changed data and invalid private cloud metadata fail before any restore adapter runs',t=>{
  const f=fixture(t),preview=f.preview(),retained=f.backups.previews.get(preview.previewId);retained.cloudRevision='7';
  assert.throws(()=>f.restore(preview),{code:'SYNC_RECEIPT_MISMATCH'});retained.cloudRevision=7;
  f.db.prepare('UPDATE restore_proof SET value=?').run('unconfirmed local edit');assert.throws(()=>f.restore(preview),{code:'SAVE_CHANGED'});
  assert.deepEqual(f.calls,[]);assert.equal(f.db.prepare('SELECT value FROM restore_proof').get().value,'unconfirmed local edit');
});
