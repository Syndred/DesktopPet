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

test('PROTOCOL SIMULATION: unchanged failures stop the change/read feedback loop while recovery still publishes',async()=>{
  const path=folder(),remote=server(),f=client(path,remote);let changes=0,attempts=0,stopping=false;
  try{
    remote.offline=true;const input=adopt('feedback-original');
    await assert.rejects(f.authority.execute(owner,'adopt',input));
    const original={...f.authority.row(owner,'companions:'+input.actionId)};
    const invoke=remote.invoke;remote.invoke=async(...args)=>{attempts++;return invoke(...args);};
    f.authority.changed=()=>{changes++;if(changes<10)setImmediate(()=>{if(!stopping)void f.authority.refresh(owner).catch(()=>{});});};
    f.authority.notifications.clear();await assert.rejects(f.authority.refresh(owner));
    await new Promise(resolve=>setTimeout(resolve,50));stopping=true;
    assert.ok(attempts<=2,`read feedback must stabilize; got ${attempts} network attempts`);
    assert.equal(changes,1);assert.equal(f.authority.row(owner,'companions:'+input.actionId).input_hash,original.input_hash);
    assert.deepEqual(JSON.parse(f.authority.row(owner,'companions:'+input.actionId).result).input,input);
    remote.offline=false;await f.authority.refresh(owner);assert.ok(changes>1,'a real recovery publishes the new state');
    assert.equal(remote.calls.length,1);assert.equal(f.authority.pending(owner).length,0);
  }finally{stopping=true;f.close();cleanup(path);}
});

test('PROTOCOL SIMULATION: read-only refresh does not replay an unrelated immutable pending command',async()=>{
  const path=folder(),remote=server(),f=client(path,remote);try{
    remote.offline=true;const input=adopt('read-independent-original');await assert.rejects(f.authority.execute(owner,'adopt',input));
    const original={...f.authority.row(owner,'companions:'+input.actionId)};
    remote.offline=false;await f.authority.refresh(owner,{resume:false});
    assert.equal(remote.calls.length,0);assert.deepEqual({...f.authority.row(owner,'companions:'+input.actionId)},original);
    assert.deepEqual(await f.authority.readOwnedPetIds(owner),[]);assert.deepEqual({...f.authority.row(owner,'companions:'+input.actionId)},original);
    await f.authority.refresh(owner);assert.equal(remote.calls.length,1);
    assert.deepEqual(await f.authority.readOwnedPetIds(owner),[f.service.snapshot(owner).data.pets[0].petId]);assert.equal(remote.calls.length,1);
  }finally{f.close();cleanup(path);}
});

test('PROTOCOL SIMULATION: an old desktop intent reads its exact receipt and migrates locally without a cloud command',async()=>{
  const path=folder(),remote=server(),f=client(path,remote);try{
    const result=await f.authority.execute(owner,'adopt',adopt('legacy-desktop-pet')),petId=result.data.pet.petId;
    const input={actionId:'legacy-desktop-unchanged',petId,position:{x:220,y:110}};
    const id='companions:'+input.actionId;remote.dropAfterCommit=true;
    await assert.rejects(f.authority.execute(owner,'desktop',input),{code:'CLOUD_UNAVAILABLE'});
    const original={...f.authority.row(owner,id)},intent=JSON.parse(original.result);
    const {DeviceDesktop}=require('../device-desktop.cjs');
    f.authority.deviceDesktop=new DeviceDesktop({db:f.db,getPet:(who,key)=>f.service.requirePet(who,key),listPets:who=>f.service.snapshot(who).data.pets,enabled:()=>true});
    const writes=remote.calls.length,seen=[],invoke=remote.invoke;
    remote.invoke=async(name,body)=>{seen.push([name,structuredClone(body)]);return invoke(name,body);};
    remote.offline=true;await assert.rejects(f.authority.refresh(owner));
    assert.equal(JSON.parse(f.authority.row(owner,id).result).status,'retry','an unknown receipt is never retired while offline');
    remote.offline=false;
    await f.authority.refresh(owner);
    const migrated=JSON.parse(f.authority.row(owner,id).result);
    assert.equal(migrated.status,'device-local');assert.deepEqual(migrated.input,input);assert.equal(migrated.baseRevision,1);
    assert.equal(migrated.deviceMigration.receipt.actionId,id);assert.equal(f.authority.row(owner,id).input_hash,original.input_hash);
    assert.equal(remote.calls.length,writes);assert.deepEqual(seen[0],['lingjing-save',{op:'read',actionId:id}]);
    assert.equal(f.authority.deviceDesktop.project(f.service.requirePet(owner,petId)).desktop.position.x,220);
    assert.equal(f.authority.pending(owner).length,0);
    const later={...input,actionId:'later-unconfirmed-legacy-position',position:{x:330,y:110}},laterId='companions:'+later.actionId;
    f.db.prepare('INSERT INTO account_actions VALUES(?,?,?,?,?,?)').run(owner,laterId,'companions-cloud-command',checksum({command:'desktop',input:later}),JSON.stringify({...intent,input:later}),new Date().toISOString());
    await f.authority.refresh(owner);
    assert.equal(f.authority.deviceDesktop.project(f.service.requirePet(owner,petId)).desktop.position.x,330,'later preserved legacy intents retain their original order');
    f.authority.deviceDesktop.update(owner,{actionId:'newer-local-device-position',petId,position:{x:450,y:110}});
    const stale={...input,actionId:'older-desktop-must-not-overwrite',position:{x:999,y:999}},staleId='companions:'+stale.actionId;
    f.db.prepare('INSERT INTO account_actions VALUES(?,?,?,?,?,?)').run(owner,staleId,'companions-cloud-command',checksum({command:'desktop',input:stale}),JSON.stringify({...intent,input:stale}),new Date().toISOString());
    await f.authority.refresh(owner);
    assert.equal(f.authority.deviceDesktop.project(f.service.requirePet(owner,petId)).desktop.position.x,450,'a newer device preference wins over the preserved old intent');
    assert.equal(JSON.parse(f.authority.row(owner,staleId).result).deviceMigration.reason,'newer-device-settings');
    assert.equal(remote.calls.length,writes);
  }finally{f.close();cleanup(path);}
});

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

test('PROTOCOL SIMULATION: a post-receipt snapshot version race persists retry and restarts from the original action without resending the command',async()=>{
  const path=folder(),remote=server();let f=client(path,remote);
  try{
    const input=adopt('snapshot-race-original'),id='companions:'+input.actionId,originalInvoke=remote.invoke,sequence=[];
    let confirmedReads=0,raced=false;
    remote.invoke=async(name,body)=>{
      const reply=await originalInvoke(name,body);
      if(name==='lingjing-save'&&body.actionId===id){sequence.push(reply?'read:receipt':'read:missing');if(reply)confirmedReads++;}
      if(name==='companions-sync'&&body.op==='command')sequence.push('command:committed');
      if(name==='companions-sync'&&body.op==='snapshot'){
        if(!raced&&confirmedReads===1&&remote.receipts.has(id)){
          raced=true;sequence.push('snapshot:version-race');
          throw Object.assign(new Error('LJ_SYNC_CONFLICT: controlled snapshot head/registry race'),{code:'SYNC_CONFLICT'});
        }
        sequence.push('snapshot:ready');
      }
      return reply;
    };
    await assert.rejects(()=>f.authority.execute(owner,'adopt',input),error=>error.code==='COMPANION_SNAPSHOT_RETRY');
    assert.deepEqual(sequence,['read:missing','snapshot:ready','command:committed','read:receipt','snapshot:version-race']);
    assert.equal(remote.calls.length,1);assert.equal(remote.receipts.size,1);
    const pendingRow=f.authority.row(owner,id),pending=JSON.parse(pendingRow.result),receiptBytes=JSON.stringify(remote.receipts.get(id));
    assert.equal(pending.status,'retry');assert.equal(pending.lastError,'COMPANION_SNAPSHOT_RETRY');
    assert.deepEqual(pending.input,input);assert.equal(pending.baseRevision,0);assert.ok(pending.sentAt);
    assert.equal(f.authority.pending(owner).length,1);
    f.close();f=client(path,remote);
    assert.equal(JSON.parse(f.authority.row(owner,id).result).status,'retry','the retry survives a real SQLite close/reopen');
    const recovered=await f.authority.execute(owner,'adopt',input),verifiedRow=f.authority.row(owner,id),verified=JSON.parse(verifiedRow.result);
    assert.equal(recovered.ok,true);assert.equal(recovered.duplicate,true);assert.equal(verified.status,'verified');
    assert.equal(verifiedRow.input_hash,pendingRow.input_hash);assert.equal(verifiedRow.kind,pendingRow.kind);
    assert.deepEqual(verified.input,pending.input);assert.equal(verified.baseRevision,pending.baseRevision);
    assert.equal(verified.sentAt,pending.sentAt);assert.equal(verified.preparedAt,pending.preparedAt);
    assert.deepEqual(sequence.slice(5),['read:receipt','read:receipt','snapshot:ready']);
    assert.equal(remote.calls.length,1);assert.equal(remote.receipts.size,1);assert.equal(JSON.stringify(remote.receipts.get(id)),receiptBytes);
    assert.deepEqual(remote.calls[0].input,input);assert.equal(remote.calls[0].baseRevision,0);
    assert.equal(f.authority.pending(owner).length,0);
    assert.equal(f.db.prepare('SELECT count(*) n FROM companion_actions WHERE owner_account_id=? AND action_id=?').get(owner,input.actionId).n,1);

    // A genuinely stale prepared command still reaches the server's command CAS
    // and becomes terminal conflict. Only snapshot reads receive the retry code.
    const staleInput=adopt('command-cas-still-terminal'),staleId='companions:'+staleInput.actionId;
    f.db.prepare('INSERT INTO account_actions(owner_account_id,action_id,kind,input_hash,result,created_at) VALUES(?,?,?,?,?,?)').run(owner,staleId,'companions-cloud-command',checksum({command:'adopt',input:staleInput}),JSON.stringify({status:'pending',command:'adopt',input:staleInput,baseRevision:0}),new Date().toISOString());
    await assert.rejects(()=>f.authority.execute(owner,'adopt',staleInput),error=>error.code==='SYNC_CONFLICT');
    const stale=JSON.parse(f.authority.row(owner,staleId).result);
    assert.equal(stale.status,'conflict');assert.equal(stale.lastError,'SYNC_CONFLICT');assert.deepEqual(stale.input,staleInput);assert.equal(stale.baseRevision,0);
    assert.equal(remote.calls.length,1);assert.equal(remote.receipts.size,1);
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

test('PROTOCOL SIMULATION: verified companion readback preserves unrelated offline data and the original common-save request without advancing its base',async()=>{
  const path=folder(),remote=server(),f=client(path,remote);
  try{
    const first=await f.authority.execute(owner,'adopt',adopt('shared-pending-adopt')),petId=first.data.pet.petId;
    const revision=f.sync.status(owner).cloudRevision;
    f.db.exec('CREATE TABLE offline_notes(owner_account_id TEXT PRIMARY KEY,note TEXT NOT NULL)');
    f.db.prepare('INSERT INTO offline_notes VALUES(?,?)').run(owner,'原始回忆');
    f.sync.enqueue(owner,'original-common-save-action');
    const original=f.db.prepare('SELECT * FROM account_sync_outbox WHERE owner_account_id=?').get(owner);
    f.db.prepare('UPDATE offline_notes SET note=? WHERE owner_account_id=?').run('离线新回忆',owner);
    await f.authority.execute(owner,'rename',{actionId:'shared-pending-rename',petId,name:'云端已确认的名字'});
    assert.equal(f.service.requirePet(owner,petId).name,'云端已确认的名字');
    assert.equal(f.db.prepare('SELECT note FROM offline_notes WHERE owner_account_id=?').get(owner).note,'离线新回忆');
    assert.deepEqual(f.db.prepare('SELECT * FROM account_sync_outbox WHERE owner_account_id=?').get(owner),original);
    assert.equal(f.sync.status(owner).cloudRevision,revision);
    assert.equal(f.authority.state(owner).sharedSavePending,true);
    assert.equal(f.authority.pending(owner).length,0);
  }finally{f.close();cleanup(path);}
});

test('PROTOCOL SIMULATION: a cached original-action replay queued behind a network read cannot return an old-owner pet after account switch',async()=>{
  const path=folder(),remote=server(),f=client(path,remote);
  try{
    const input=adopt('queued-original-replay');await f.authority.execute(owner,'adopt',input);
    const before=f.backup.export(owner),original=remote.invoke;let enter,release;
    const entered=new Promise(resolve=>{enter=resolve;}),gate=new Promise(resolve=>{release=resolve;});
    remote.invoke=async(name,body)=>{if(name==='companions-sync'&&body.op==='snapshot'){enter();await gate;}return original(name,body);};
    const waiting=f.authority.refresh(owner),waitingRejected=assert.rejects(waiting,error=>error.code==='SESSION_CHANGED');await entered;
    const replay=f.authority.execute(owner,'adopt',input),replayRejected=assert.rejects(replay,error=>error.code==='SESSION_CHANGED');
    f.switchOwner('another-owner');release();await Promise.all([waitingRejected,replayRejected]);
    assert.deepEqual(f.backup.export(owner),before);assert.equal(remote.calls.length,1);
  }finally{f.close();cleanup(path);}
});

test('PROTOCOL SIMULATION: automatic readback preserves capture bindings, original owner archives and monotonic interaction history',async()=>{
  const path=folder(),remote=server(),f=client(path,remote);
  try{
    const captured=f.service.createCapturedInstance(owner,{actionId:'history-original-capture',templateId:'animal-shiba',name:'原捕捉伙伴',showOnDesktop:false,origin:{wildPetId:'history-original-wild',wildSerial:'original-serial',battleId:'history-original-battle'}}).data.pet;
    const other=f.service.adopt(owner,adopt('history-second-pet')).data.pet;
    f.service.interact(owner,{actionId:'history-original-interact',petId:captured.petId});
    f.db.prepare('INSERT INTO companion_identity_imports VALUES(?,?,?,?)').run('original-legacy-owner',owner,JSON.stringify({originalOwner:'original-legacy-owner',rawHistory:'原始归属档案'}),'2026-10-24T00:00:00.000Z');
    const original=f.sync.backups.snapshot(owner),unit=original.data.modules.companions.data;
    const seal=value=>{const{checksum:prior,...body}=value;void prior;return{...body,checksum:checksum(body)};};
    const packet=(envelope,revision)=>({authority:'live',ownerAccountId:owner,revision,envelope,module:envelope.data.modules.companions});
    f.authority.apply(owner,packet(original,1));const before=f.backup.export(owner),ack={...f.authority.row(owner,'companions:verified-head')};
    const mutations=[
      next=>{next.tables.companion_capture_receipts=[];},
      next=>{next.tables.companion_capture_receipts[0].pet_id=other.petId;},
      next=>{next.identityImports=[];},
      next=>{next.identityImports[0].archive_json=JSON.stringify({changed:'different original history'});},
      next=>{next.tables.companion_interactions=[];},
      next=>{next.tables.companion_interactions[0].last_interacted_at--;}
    ];
    for(const mutate of mutations){
      const incoming=structuredClone(original);mutate(incoming.data.modules.companions.data);const sealed=seal(incoming);
      f.backup.validate(sealed.data.modules.companions.data,owner);
      assert.throws(()=>f.authority.apply(owner,packet(sealed,2)),error=>error.code==='CLOUD_HISTORY_CONFLICT');
      assert.deepEqual(f.backup.export(owner),before);assert.deepEqual({...f.authority.row(owner,'companions:verified-head')},ack);assert.equal(f.sync.status(owner).cloudRevision,1);
    }
    const now=unit.tables.companion_interactions[0].last_interacted_at+10001;
    const forward=await applyCompanionCommand(original,owner,'interact',{actionId:'history-forward-interact',petId:captured.petId},now);
    const advanced=structuredClone(original);advanced.data.modules.companions=forward.module;
    f.authority.apply(owner,packet(seal(advanced),2));
    assert.deepEqual(f.backup.export(owner).tables.companion_capture_receipts,before.tables.companion_capture_receipts);
    assert.deepEqual(f.backup.export(owner).identityImports,before.identityImports);
    assert.equal(f.backup.export(owner).tables.companion_interactions[0].last_interacted_at,now);
  }finally{f.close();cleanup(path);}
});
