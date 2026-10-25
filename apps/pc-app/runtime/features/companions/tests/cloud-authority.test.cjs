const{test}=require('node:test');
const assert=require('node:assert/strict');
const{DatabaseSync}=require('node:sqlite');
const{mkdtempSync,rmSync}=require('node:fs');
const{tmpdir}=require('node:os');
const{join,resolve,dirname,basename}=require('node:path');
const{createServices}=require('../../../core/services.cjs');
const{migrations}=require('../../accounts/schema.cjs');
const{BackupManager}=require('../../accounts/backups.cjs');
const{AccountSync}=require('../../accounts/sync.cjs');
const{checksum}=require('../../accounts/util.cjs');
const{migrateCompanions}=require('../migrations.cjs');
const{CompanionsService}=require('../service.cjs');
const{createCompanionBackupAdapter}=require('../backup.cjs');
const{CloudCompanionAuthority}=require('../cloud-authority.cjs');
const{applyCompanionCommand,companionUnit}=require('../cloud-domain.mjs');

// PROTOCOL SIMULATION with real SQLite and actual domain reducers. The wire,
// authentication and connection loss below are controlled fixtures, not cloud
// or Electron evidence. Real HTTPS/native acceptance is separate.
const owner='original-cloud-owner';
const failure=()=>Object.assign(new Error('controlled connection interruption'),{code:'CLOUD_UNAVAILABLE'});
function server(){
  let head=null,revision=0;const receipts=new Map(),calls=[];
  const control={offline:false,dropAfterCommit:false,head:()=>head,receipts,calls};
  control.invoke=async(name,body)=>{
    if(control.offline)throw failure();
    if(name==='lingjing-save')return structuredClone(receipts.get(body.actionId)||null);
    if(body.op==='snapshot')return{authority:'live',ownerAccountId:owner,revision,envelope:head&&structuredClone(head),module:{version:1,data:companionUnit(head,owner,Date.now())}};
    if(body.baseRevision!==revision)throw Object.assign(new Error('stale fixture base'),{code:'SYNC_CONFLICT'});
    calls.push(structuredClone(body));const prepared=await applyCompanionCommand(head,owner,body.command,body.input,Date.now());
    const document={format:'lingjing-account-save',version:1,ownerAccountId:owner,identity:{provider:'runtime',subjectId:owner},provenance:{mode:'live'},createdAt:new Date().toISOString(),data:{modules:{legacy:{version:1,data:null},settings:{version:1,data:null},companions:prepared.module},tables:{}}};
    head={...document,checksum:checksum(document)};revision++;
    const receipt={actionId:'companions:'+body.input.actionId,kind:'authority',revision,checksum:head.checksum,envelope:structuredClone(head),result:prepared.result};receipts.set(receipt.actionId,receipt);
    if(control.dropAfterCommit){control.dropAfterCommit=false;throw failure();}return structuredClone(receipt);
  };return control;
}
function client(folder,remote){
  const db=new DatabaseSync(join(folder,'save.sqlite'));db.exec('PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON');
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE name='account_identities'").get())migrations.forEach(m=>db.exec(m.sql));migrateCompanions(db);
  db.prepare('INSERT OR IGNORE INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'original','original','原账号','2026-10-24','2026-10-24');
  let selectedOwner=owner;const services=createServices({db,legacy:{},paths:{userData:folder},windows:{}});services.session.setAdapter({getCurrentUser:()=>({id:selectedOwner})});
  const service=new CompanionsService({db}),backup=createCompanionBackupAdapter(db),backups=new BackupManager({db,directory:join(folder,'backups'),getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});backups.register(backup);
  const sync=new AccountSync({db,backups,remote:{enabled:true,authKind:'supabase'},getSession:()=>({provider:'runtime',ownerAccountId:selectedOwner,authKind:'supabase'}),getSettings:()=>({document:{sync:{enabled:true}}})});
  const accounts={privateSession:()=>({ownerAccountId:selectedOwner,authKind:'supabase'}),sync};services.provide('accounts',accounts);services.provide('cloudActor',{invoke:(name,body)=>remote.invoke(name,body)});
  const authority=new CloudCompanionAuthority(services,service,backup,()=>{});
  return{db,services,service,backup,sync,authority,switchOwner:who=>{selectedOwner=who;},close:()=>db.close()};
}
function folder(){return mkdtempSync(join(tmpdir(),'companion-main-protocol-'));}
function cleanup(path){assert.equal(dirname(resolve(path)),resolve(tmpdir()));assert.ok(basename(path).startsWith('companion-main-protocol-'));rmSync(path,{recursive:true,force:true});}
const adopt=actionId=>({actionId,templateId:'big-fish-gentle',name:'原始云鱼丸',showOnDesktop:false});

test('PROTOCOL SIMULATION: offline-before-send intent is durable and restart sends its original request exactly once',async()=>{
  const path=folder(),remote=server();let f=client(path,remote);
  try{
    remote.offline=true;const input=adopt('offline-original-action');await assert.rejects(()=>f.authority.execute(owner,'adopt',input),error=>error.code==='CLOUD_UNAVAILABLE');
    const pending=f.authority.pending(owner)[0];assert.deepEqual(pending.input,input);assert.equal(pending.baseRevision,null);assert.equal(remote.calls.length,0);f.close();
    remote.offline=false;f=client(path,remote);await f.authority.refresh(owner);assert.equal(remote.calls.length,1);assert.deepEqual(remote.calls[0].input,input);assert.equal(f.service.snapshot(owner).data.pets.length,1);assert.equal(f.authority.pending(owner).length,0);assert.equal(f.sync.status(owner).localChanged,false);
  }finally{f.close();cleanup(path);}
});
test('PROTOCOL SIMULATION: an uncertain committed adoption reads its immutable receipt after restart without creating another same-template pet',async()=>{
  const path=folder(),remote=server();let f=client(path,remote);
  try{
    const input=adopt('lost-response-original');remote.dropAfterCommit=true;await assert.rejects(()=>f.authority.execute(owner,'adopt',input),error=>error.code==='CLOUD_UNAVAILABLE');
    assert.equal(remote.calls.length,1);assert.ok(f.authority.pending(owner)[0].sentAt);f.close();f=client(path,remote);await f.authority.refresh(owner);
    assert.equal(remote.calls.length,1);const pet=f.service.snapshot(owner).data.pets[0];assert.equal(pet.petId,remote.receipts.get('companions:'+input.actionId).result.data.pet.petId);assert.equal(f.authority.pending(owner).length,0);
    assert.equal((await f.authority.execute(owner,'adopt',input)).duplicate,true);assert.equal(remote.calls.length,1);
  }finally{f.close();cleanup(path);}
});
test('PROTOCOL SIMULATION: consecutive offline positions retain immutable unknown requests and coalesce only drafts that were never sent',async()=>{
  const path=folder(),remote=server();let f=client(path,remote);
  try{
    const first=await f.authority.execute(owner,'adopt',adopt('position-adopt-action')),petId=first.data.pet.petId;
    const position=x=>({actionId:'position-action-'+x,petId,position:{x,y:160,displayId:'original-monitor'}});
    remote.dropAfterCommit=true;await assert.rejects(()=>f.authority.execute(owner,'desktop',position(100),{nativePosition:true}),error=>error.code==='CLOUD_UNAVAILABLE');
    const original=f.db.prepare('SELECT input_hash,result FROM account_actions WHERE action_id=?').get('companions:position-action-100');remote.offline=true;
    await assert.rejects(()=>f.authority.execute(owner,'desktop',position(200),{nativePosition:true}));await assert.rejects(()=>f.authority.execute(owner,'desktop',position(300),{nativePosition:true}));
    const pending=f.authority.pending(owner);assert.equal(pending.length,2);assert.equal(pending[0].input.position.x,100);assert.equal(pending[1].input.position.x,300);
    assert.equal(JSON.parse(f.db.prepare('SELECT result FROM account_actions WHERE action_id=?').get('companions:position-action-200').result).status,'superseded');
    assert.equal(f.db.prepare('SELECT input_hash FROM account_actions WHERE action_id=?').get('companions:position-action-100').input_hash,original.input_hash);
    f.close();remote.offline=false;f=client(path,remote);await f.authority.refresh(owner);
    assert.equal(f.service.requirePet(owner,petId).desktop.position.x,300);assert.deepEqual(remote.calls.filter(call=>call.command==='desktop').map(call=>call.input.position.x),[100,300]);assert.equal(f.authority.pending(owner).length,0);
  }finally{f.close();cleanup(path);}
});
test('PROTOCOL SIMULATION: unknown local progress and account switches preserve both owner namespaces instead of overwriting cached pets',async()=>{
  const path=folder(),remote=server(),f=client(path,remote);
  try{
    const existing=f.service.adopt(owner,adopt('existing-local-original')).data.pet,before=f.backup.export(owner);
    await assert.rejects(()=>f.authority.execute(owner,'adopt',adopt('new-cloud-review-action')),error=>error.code==='COMPANION_SOURCE_REVIEW_REQUIRED');assert.deepEqual(f.backup.export(owner),before);assert.equal(remote.calls.length,0);
    f.switchOwner('other-owner');await assert.rejects(()=>f.authority.refresh(owner),error=>error.code==='SESSION_CHANGED');assert.deepEqual(f.service.requirePet(owner,existing.petId),existing);
  }finally{f.close();cleanup(path);}
});
