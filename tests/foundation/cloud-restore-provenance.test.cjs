const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,writeFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join,resolve,dirname,basename}=require('node:path');
const {randomUUID}=require('node:crypto');
const {BackupManager}=require('../../apps/pc-app/runtime/features/accounts/backups.cjs');
const {checksum}=require('../../apps/pc-app/runtime/features/accounts/util.cjs');

function fixture(t,provider='local'){
  const directory=mkdtempSync(join(tmpdir(),'lingjing-restore-provenance-')),db=new DatabaseSync(':memory:'),owner='provenance-owner',calls=[];
  for(const migration of require('../../apps/pc-app/runtime/features/accounts/schema.cjs').migrations)db.exec(migration.sql);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,provider,owner,'owner','owner','原账号','2026-10-25','2026-10-25');
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
  return{db,owner,backups,calls,envelope,file,preview:()=>backups.preview(owner,file),restore(preview,extra={}){return backups.restore(owner,{previewId:preview.previewId,actionId:randomUUID(),mode:'replace',...extra});}};
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

test('actual SQLite and production adapters: an old finished v1 file reaches a clean AccountSync checkpoint only through the private cloud-preview route',t=>{
  const f=fixture(t,'runtime'),{createBattleBackupAdapter}=require('../../apps/pc-app/runtime/features/battle/backup.cjs'),{AccountSync}=require('../../apps/pc-app/runtime/features/accounts/sync.cjs');
  for(const migration of require('../../apps/pc-app/runtime/features/battle/migrations.cjs'))f.db.exec(migration.sql);
  const adapter=createBattleBackupAdapter(f.db);f.backups.register(adapter);
  const seal=battle=>{const {checksum:discard,...body}=f.backups.snapshot(f.owner);void discard;body.data.modules.battle={version:1,data:battle};return{...body,checksum:checksum(body)};};
  const empty={sessions:[],actions:[],reports:[],rewards:[]},initial=seal(empty);
  const sync=new AccountSync({db:f.db,backups:f.backups,remote:{enabled:true,authKind:'supabase'},getSession:()=>({provider:'runtime',ownerAccountId:f.owner,authKind:'supabase',sessionId:'scripted-session',deviceId:'scripted-device'}),getSettings:()=>({document:{sync:{enabled:true}}})});
  sync.acceptAuthoritativeReadback(f.owner,{envelope:initial,cloudRevision:67});
  const id='battle-provenance',reward={actionId:'battle-provenance-reward',petId:'owned-pet',experience:5,applied:true},session={id,mode:'training',status:'finished',context:{authority:'supabase',cloudUserId:f.owner},snapshot:{round:1},rounds:[{round:1}],player:{petId:reward.petId},reward,reportId:id};
  const canonical={sessions:[{id,room_id:null,status:'finished',data_json:JSON.stringify(session),revision:1,updated_at:'2026-10-25'}],actions:[],reports:[{id,session_id:id,data_json:JSON.stringify({...session,sessionId:id}),ended_at:'2026-10-25'}],rewards:[{session_id:id,action_id:reward.actionId,pet_id:reward.petId,data_json:JSON.stringify(reward)}]};
  const cloud=seal(canonical),original={action_id:'old-local-intent',session_id:id,command_json:'{ "action": "normal_attack", "roundNo": 1 }',result_json:'{ "sessionId": "battle-provenance", "revision": 99, "resolvedRound": 1 }'},old=seal({...canonical,actions:[original]});
  writeFileSync(f.file,JSON.stringify(old));f.restore(f.preview());assert.equal(sync.status(f.owner).localChanged,true);
  // The identical canonical payload in a local file still cannot acquire a seal.
  writeFileSync(f.file,JSON.stringify(cloud));f.restore(f.preview(),{cloudRevision:68});assert.equal(sync.status(f.owner).localChanged,true);
  const preview=f.preview(),retained=f.backups.previews.get(preview.previewId);retained.cloudRevision=68;
  require('../../apps/pc-app/runtime/features/accounts/util.cjs').transaction(f.db,()=>{f.restore(preview);sync.acceptCloudRestore(f.owner,retained);});
  assert.equal(sync.status(f.owner).cloudRevision,68);assert.equal(sync.status(f.owner).localChanged,false);
  assert.deepEqual({...f.db.prepare('SELECT action_id,session_id,command_json,result_json FROM battle_action_receipts WHERE owner_account_id=?').get(f.owner)},original);
  assert.equal(adapter.cloudModule(f.owner,{version:2,data:adapter.export(f.owner)}).data.actions.length,0);
});
