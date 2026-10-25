const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
const {DatabaseSync}=require('node:sqlite');
const {createBattleBackupAdapter}=require('../backup.cjs');
const {BattleStore}=require('../store.cjs');
const {BattleFeatureService}=require('../service.cjs');
const {upgradeTransportJournal,rowBytes,transportRow}=require('../transport-journal.cjs');
const {BackupManager}=require('../../accounts/backups.cjs');
const {AccountSync}=require('../../accounts/sync.cjs');
const {checksum}=require('../../accounts/util.cjs');

const owner='journal-owner',id='battle-journal-fixture',petId='journal-pet';
const plain=value=>JSON.parse(JSON.stringify(value));
function fixture(){
  const db=new DatabaseSync(':memory:');require('../../accounts/schema.cjs').migrations.forEach(m=>db.exec(m.sql));require('../migrations.cjs').forEach(m=>db.exec(m.sql));
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'journal','journal','journal','2026-10-25','2026-10-25');
  const adapter=createBattleBackupAdapter(db),backups=new BackupManager({db,directory:mkdtempSync(join(tmpdir(),'battle-journal-')),getIdentity:value=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(value)});backups.register(adapter);
  const store=new BattleStore(db),session={id,mode:'training',status:'finished',startedAt:'2026-10-25',endedAt:'2026-10-25',context:{authority:'supabase',cloudUserId:owner},player:{petId},snapshot:{round:2},rounds:[{round:1},{round:2}],pendingAction:null,winner:'enemy',historyComplete:true,revision:3};
  const reward={actionId:`battle:${id}:${owner}`,petId,experience:5,applied:true};session.reward=reward;session.reportId=id;
  const report={...session,sessionId:id};
  const data={sessions:[{id,room_id:null,status:'finished',data_json:JSON.stringify(session),revision:3,updated_at:'2026-10-25'}],actions:[],reports:[{id,session_id:id,data_json:JSON.stringify(report),ended_at:'2026-10-25'}],rewards:[{session_id:id,action_id:reward.actionId,pet_id:petId,data_json:JSON.stringify(reward)}]};
  const cloud=(battle,revision)=>{const {checksum:discard,...body}=backups.snapshot(owner);void discard;body.data.modules.battle={version:1,data:battle};const envelope={...body,checksum:checksum(body)};return{revision,checksum:envelope.checksum,envelope};};
  const initial=cloud({sessions:[],actions:[],reports:[],rewards:[]},67),current=cloud(data,68),sessionProof={ownerAccountId:owner,provider:'runtime',authKind:'supabase',sessionId:'scripted-sid',deviceId:'scripted-device'};
  const sync=new AccountSync({db,backups,remote:{enabled:true,authKind:'supabase',cloudSave:async()=>current},getSession:()=>sessionProof,getSettings:()=>({document:{sync:{enabled:true}}})});sync.acceptAuthoritativeReadback(owner,{envelope:initial.envelope,cloudRevision:67});
  return{db,adapter,backups,store,session,data,cloud:current,sync,close:()=>db.close()};
}
function legacy(f){
  f.adapter.restore(owner,f.data,'replace');
  f.store.reserve(owner,'start-original','start-original',{type:'cloud:training-start',input:{petId,enemyElement:'fire'}});f.store.resolve(owner,'start-original',{session:{...f.session,status:'active',snapshot:{round:0}}});
  for(let n=1;n<=2;n++){f.store.reserve(owner,'round-'+n,id,{action:'element_attack',roundNo:n});f.store.resolve(owner,'round-'+n,{id,revision:n*2+1,snapshot:{round:n}});}
  const original=f.db.prepare('SELECT action_id,session_id,command_json,result_json FROM battle_action_receipts').all();upgradeTransportJournal(f.db,owner);return original;
}

test('real SQLite / scripted wire: a new invitation click preserves the unresolved original action and nullable-deadline transport through backup restore',async()=>{
  const f=fixture(),restored=fixture();try{
    const calls=[],oldId='invite-uncertain-original',newId='invite-new-business-click';
    const request={id:'50000000-0000-4000-8000-000000000022',fromUserId:owner,fromAccount:'journal',toUserId:'other-owner',toAccount:'other',status:'pending',roomId:null,roomCode:null,roomStatus:null,createdAt:'2031-01-02T03:04:05Z',updatedAt:'2031-01-02T03:04:05Z',expiresAt:'2031-01-02T03:09:05Z'};
    const service=Object.assign(Object.create(BattleFeatureService.prototype),{store:f.store,locks:new Map(),owner:()=>owner,verifiedOwner:()=>owner,user:()=>({id:owner}),ownedPet:()=>({petId}),isCloud:()=>true,online:{sendDuelRequest:async input=>{calls.push(input);if(input.actionId===oldId)throw new Error('SCRIPTED_RESPONSE_LOST');return{ok:true,request};}}});
    await assert.rejects(service.invite({targetAccount:'other',petId,actionId:oldId},{}),/SCRIPTED_RESPONSE_LOST/);
    const original=plain(f.db.prepare('SELECT * FROM battle_transport_journal WHERE action_id=?').get(oldId));
    assert.equal(original.result_json,null);
    assert.deepEqual(service.pendingInvitations({},{}),[{actionId:oldId,targetAccount:'other',allowResend:false}]);
    assert.deepEqual(f.store.unconfirmedInvites('foreign-owner'),[]);assert.equal(calls.length,1,'Reading pending requests never sends them');
    await assert.rejects(service.invite({targetAccount:'other',petId,actionId:oldId},{}),/SCRIPTED_RESPONSE_LOST/);
    await assert.rejects(service.invite({targetAccount:'other',petId},{}),/SCRIPTED_RESPONSE_LOST/);
    assert.deepEqual(await service.invite({targetAccount:'other',petId,actionId:newId},{}),request);
    assert.deepEqual(calls.map(input=>input.actionId),[oldId,oldId,oldId,newId]);
    assert.deepEqual(await service.invite({targetAccount:'other',petId,actionId:newId},{}),request);
    assert.equal(calls.length,4,'Replaying a committed original id returns its result without creating another action');
    assert.deepEqual(plain(f.db.prepare('SELECT * FROM battle_transport_journal WHERE action_id=?').get(oldId)),original);
    const row=f.db.prepare('SELECT * FROM battle_transport_journal WHERE action_id=?').get(newId);
    assert.equal(JSON.parse(row.result_json).request.expiresAt,request.expiresAt);
    assert.equal(transportRow(row,new Map(),owner),true);
    for(const variant of ['legacy','null','invalid','unknown','foreign']){
      const result=JSON.parse(row.result_json);
      if(variant==='legacy')delete result.request.expiresAt;
      if(variant==='null')result.request.expiresAt=null;
      if(variant==='invalid')result.request.expiresAt=123;
      if(variant==='unknown')result.request.experience=999;
      if(variant==='foreign')result.request.fromUserId='foreign-owner';
      assert.equal(transportRow({...row,result_json:JSON.stringify(result)},new Map(),owner),['legacy','null'].includes(variant),variant);
    }
    const local={version:2,data:f.adapter.export(owner)};restored.adapter.validateModule(local,owner);restored.adapter.restore(owner,local.data,'replace');
    assert.deepEqual(restored.adapter.export(owner),local.data);
    assert.equal(restored.adapter.cloudModule(owner,local).data.actions.length,0);
    assert.equal(restored.store.action(owner,oldId).result,null);
  }finally{f.close();restored.close();}
});

test('real SQLite / scripted provider: strict account checkpoint remains clean after post-authority journal resolution; original action bytes survive',async()=>{
  const f=fixture();try{const original=legacy(f);assert.equal(f.adapter.export(owner).transportJournal.length,3);assert.deepEqual(plain(f.adapter.cloudModule(owner,{version:2,data:f.adapter.export(owner)})),f.cloud.envelope.data.modules.battle);
    const result=await f.sync.reconcile(owner);assert.equal(result.readbackOnly,true);assert.equal(f.sync.status(owner).cloudRevision,68);assert.equal(f.sync.status(owner).localChanged,false);
    f.store.resolve(owner,'round-2',{...f.session,revision:999});assert.equal(f.sync.status(owner).localChanged,false);assert.deepEqual(f.db.prepare('SELECT action_id,session_id,command_json,result_json FROM battle_action_receipts').all(),original);
    assert.equal(f.store.action(owner,'round-2').result.revision,999);assert.equal(f.adapter.cloudModule(owner,{version:2,data:f.adapter.export(owner)}).data.actions.length,0);
  }finally{f.close();}
});

test('legacy v1 restore retains raw rows and retries the original pending ID; imported records stay protected without authority proof',async()=>{
  const f=fixture();try{const data=structuredClone(f.data);const session=JSON.parse(data.sessions[0].data_json);session.status='active';session.snapshot.round=0;session.rounds=[];session.pendingAction={actionId:'pending-original',action:'element_attack',roundNo:1,uncertain:true};data.sessions[0].status='active';data.sessions[0].data_json=JSON.stringify(session);data.reports=[];data.rewards=[];data.actions=[{action_id:'pending-original',session_id:id,command_json:'{ "action": "element_attack", "roundNo": 1 }',result_json:null}];
    f.adapter.validateModule({version:1,data},owner);f.adapter.restore(owner,data,'replace');new BattleStore(f.db);assert.deepEqual(plain(f.adapter.export(owner).actions),data.actions);assert.equal(f.adapter.cloudModule(owner,{version:2,data:f.adapter.export(owner)}).data.actions.length,1,'A generic v1 file is not silently promoted to a verified journal-free cloud snapshot');
    const calls=[],service=Object.assign(Object.create(BattleFeatureService.prototype),{store:f.store,locks:new Map(),owner:()=>owner,verifiedOwner:()=>owner,user:()=>({id:owner}),syncInternal:async()=>f.store.session(owner,id),online:{invoke:async(op,input)=>{calls.push({op,input});return{session:{...session,pendingAction:null,snapshot:{round:1}}};}}});
    await service.retryAction({sessionId:id},{});assert.deepEqual(calls,[{op:'training_action',input:{sessionId:id,actionId:'pending-original',action:'element_attack',roundNo:1}}]);assert.deepEqual(plain(f.adapter.export(owner).actions),data.actions);assert.equal(f.store.action(owner,'pending-original').result.resolvedRound,1);
    // Complete the same sequence through the main-only verified-readback hook
    // and formal AccountSync. The generic v1 import itself never seals a row.
    f.adapter.restore(owner,f.data,'replace');f.adapter.acceptAuthorityProjection(owner,f.data,{sessionId:id,actionId:'scripted-authority-readback',revision:68,checksum:f.cloud.checksum});f.sync.acceptAuthoritativeReadback(owner,{envelope:f.cloud.envelope,cloudRevision:68});
    f.store.resolve(owner,'pending-original',f.store.session(owner,id));assert.equal(f.sync.status(owner).localChanged,false);assert.equal(f.sync.status(owner).cloudRevision,68);assert.equal(f.store.action(owner,'pending-original').result.resolvedRound,2);assert.deepEqual(plain(f.adapter.export(owner).actions),data.actions);
  }finally{f.close();}
});

test('local v2 backup round trip keeps durable start/round requests and immutable origin bytes; new transport is absent from strict four-array cloud projection',()=>{
  const f=fixture(),other=fixture();try{legacy(f);const start=f.store.pendingCommand(owner,'training-start',{petId:'other-pet',enemyElement:'water'});const local={version:2,data:f.adapter.export(owner)};f.adapter.validateModule(local,owner);other.adapter.restore(owner,local.data,'replace');
    assert.equal(other.store.pendingCommand(owner,'training-start',{petId:'other-pet',enemyElement:'water'}),start);assert.deepEqual(other.adapter.export(owner),local.data);assert.deepEqual(Object.keys(other.adapter.cloudModule(owner,local).data).sort(),['actions','reports','rewards','sessions']);assert.equal(other.adapter.cloudModule(owner,local).data.actions.length,3,'An imported v2 marker cannot grant its own main-only projection seal');
    assert.throws(()=>other.db.prepare('UPDATE battle_transport_journal SET legacy_row_json=? WHERE owner_account_id=? AND action_id=?').run('{}',owner,'round-1'),/BATTLE_JOURNAL_HISTORY_IMMUTABLE/);
  }finally{f.close();other.close();}
});

test('forged local-v2 markers cannot hide unknown/offline/foreign-owner business rows or altered original requests',()=>{
  const f=fixture();try{legacy(f);for(const kind of ['unknown-command','offline-session','foreign-owner','raw-command-mismatch','unknown-start-input','unknown-result','marker-action-id','marker-session-id','canonical-marker']){
    const data=structuredClone(f.adapter.export(owner)),action=data.actions.find(row=>row.action_id==='round-1'),journal=data.transportJournal.find(row=>row.action_id==='round-1');
    if(kind==='unknown-command')action.command_json=JSON.stringify({type:'grant-growth',experience:999});
    if(kind==='offline-session'||kind==='foreign-owner'){const session=JSON.parse(data.sessions[0].data_json);session.context=kind==='offline-session'?{}:{authority:'supabase',cloudUserId:'other-owner'};data.sessions[0].data_json=JSON.stringify(session);}
    if(kind==='raw-command-mismatch')journal.command_json=JSON.stringify({action:'ultimate',roundNo:1});
    if(kind==='unknown-result')action.result_json=JSON.stringify({...JSON.parse(action.result_json),unconfirmedBusinessEdit:true});
    if(kind==='unknown-start-input'){const start=data.transportJournal.find(row=>row.action_id==='start-original');start.command_json=JSON.stringify({type:'cloud:training-start',input:{petId,enemyElement:'fire',reward:999}});start.legacy_row_json=rowBytes({...start,result_json:start.result_json});}
    else{journal.legacy_row_json=rowBytes(action);if(kind==='unknown-command')journal.command_json=action.command_json;}
    if(kind==='marker-action-id'||kind==='marker-session-id'){const raw=JSON.parse(journal.legacy_row_json);raw[kind==='marker-action-id'?'action_id':'session_id']='foreign-id';journal.legacy_row_json=JSON.stringify(raw);}
    if(kind==='canonical-marker')journal.canonical_row_json=rowBytes(action);
    assert.throws(()=>f.adapter.cloudModule(owner,{version:2,data}),{code:'INVALID_BATTLE_BACKUP'},kind);
  }}finally{f.close();}
});

test('generic v1 restore never overwrites an existing raw business/action slot or treats a file as verified authority',()=>{
  const f=fixture();try{const original=legacy(f),changed=plain(f.data);changed.actions=[{...original[1],command_json:JSON.stringify({action:'ultimate',roundNo:1}),result_json:JSON.stringify({sessionId:id,revision:999,resolvedRound:1})}];f.adapter.restore(owner,changed,'replace');
    assert.deepEqual(f.db.prepare('SELECT action_id,session_id,command_json,result_json FROM battle_action_receipts').all(),original);assert.notDeepEqual(plain(f.adapter.cloudModule(owner,{version:2,data:f.adapter.export(owner)}).data),changed);assert.equal(f.store.action(owner,'round-1').command.action,'element_attack');
  }finally{f.close();}
});

test('a recognized-looking but rewritten v2 marker cannot hide a changed row without the byte-matching main-only seal',()=>{
  const f=fixture();try{legacy(f);const data=plain(f.adapter.export(owner)),row=data.actions.find(value=>value.action_id==='round-1'),journal=data.transportJournal.find(value=>value.action_id==='round-1');row.result_json=JSON.stringify({sessionId:id,revision:999,resolvedRound:1});journal.legacy_row_json=rowBytes(row);const projected=f.adapter.cloudModule(owner,{version:2,data});assert.ok(projected.data.actions.some(value=>value.action_id==='round-1'&&value.result_json===row.result_json));journal.projection_origin='upgrade';assert.throws(()=>f.adapter.cloudModule(owner,{version:2,data}),{code:'INVALID_BATTLE_BACKUP'});
  }finally{f.close();}
});

test('modified protected action/session/report/reward rows remain dirty and cannot be auto-overwritten or omitted',async()=>{
  for(const table of ['actions','sessions','reports','rewards']){const f=fixture();try{legacy(f);await f.sync.reconcile(owner);const mapping={actions:['battle_action_receipts','result_json'],sessions:['battle_sessions','data_json'],reports:['battle_reports_v2','data_json'],rewards:['battle_reward_receipts','data_json']},[name,column]=mapping[table];const row=f.db.prepare(`SELECT rowid,${column} value FROM ${name} WHERE owner_account_id=? LIMIT 1`).get(owner),changed=JSON.stringify({...JSON.parse(row.value),unconfirmedEdit:'must-stay'});f.db.prepare(`UPDATE ${name} SET ${column}=? WHERE rowid=?`).run(changed,row.rowid);
      assert.equal(f.sync.status(owner).localChanged,true,table);const result=await f.sync.reconcile(owner);assert.equal(result.blocked,true,table);assert.equal(f.db.prepare(`SELECT ${column} value FROM ${name} WHERE rowid=?`).get(row.rowid).value,changed);
    }finally{f.close();}}
});

test('server-locked-original supersession accepts only its explicit shape/reason, distinct original/replacement IDs and same-owner session',()=>{
  const f=fixture();try{legacy(f);f.store.resolve(owner,'round-1',{sessionId:id,supersededBy:'server-original',reason:'server-locked-original'});f.adapter.validateModule({version:2,data:f.adapter.export(owner)},owner);assert.equal(f.store.action(owner,'round-1').result.supersededBy,'server-original');
    for(const mutation of [{supersededBy:'round-1'},{sessionId:'foreign-session'},{reason:'grant-reward'},{experience:999}]){const data=plain(f.adapter.export(owner)),row=data.transportJournal.find(value=>value.action_id==='round-1');row.result_json=JSON.stringify({...JSON.parse(row.result_json),...mutation});assert.throws(()=>f.adapter.validateModule({version:2,data},owner),{code:'INVALID_BATTLE_BACKUP'});}
    const foreign=plain(f.adapter.export(owner)),session=JSON.parse(foreign.sessions[0].data_json);session.context.cloudUserId='other-owner';foreign.sessions[0].data_json=JSON.stringify(session);assert.throws(()=>f.adapter.validateModule({version:2,data:foreign},owner),{code:'INVALID_BATTLE_BACKUP'});
  }finally{f.close();}
});

test('finished v1 import becomes clean only through the main-only verified cloud-preview restore; file/context claims cannot seal it',()=>{
  const f=fixture();try{const old=structuredClone(f.data);old.actions=[{action_id:'finished-import',session_id:id,command_json:JSON.stringify({action:'element_attack',roundNo:1}),result_json:JSON.stringify({sessionId:id,revision:99,resolvedRound:1})}];f.adapter.restore(owner,old,'replace');assert.equal(f.adapter.cloudModule(owner,{version:2,data:f.adapter.export(owner)}).data.actions.length,1);
    for(const context of [{kind:'file',ownerAccountId:owner,revision:68,checksum:f.cloud.checksum},{kind:'verified-cloud-preview',ownerAccountId:'foreign',revision:68,checksum:f.cloud.checksum},{kind:'verified-cloud-preview',ownerAccountId:owner,revision:0,checksum:f.cloud.checksum}])assert.throws(()=>f.adapter.restoreCloud(owner,f.data,'replace',f.db,context),{code:'INVALID_BATTLE_BACKUP'});
    assert.equal(f.adapter.cloudModule(owner,{version:2,data:f.adapter.export(owner)}).data.actions.length,1);
    f.adapter.restoreCloud(owner,f.data,'replace',f.db,{kind:'verified-cloud-preview',ownerAccountId:owner,revision:68,checksum:f.cloud.checksum});f.sync.acceptCloudRestore(owner,{envelope:f.cloud.envelope,cloudRevision:68});assert.equal(f.sync.status(owner).localChanged,false);assert.equal(f.sync.status(owner).cloudRevision,68);assert.deepEqual(plain(f.adapter.export(owner).actions),old.actions);
  }finally{f.close();}
});

test('an already rewarded training does not skip a needed fresh projection-only authority readback',async()=>{
  const f=fixture();try{const old=structuredClone(f.data);old.actions=[{action_id:'already-finished',session_id:id,command_json:JSON.stringify({action:'element_attack',roundNo:1}),result_json:null}];f.adapter.restore(owner,old,'replace');const calls=[],service=Object.assign(Object.create(BattleFeatureService.prototype),{store:f.store,verifiedOwner:()=>owner,services:{get:name=>name==='backups'?f.backups:undefined},cloud:{apply:async(value,proof,options)=>{calls.push({value,proof,options});f.adapter.acceptAuthorityProjection(owner,f.data,{sessionId:id,actionId:'scripted-main-only-readback',revision:68,checksum:f.cloud.checksum});}}});
    const proof={scripted:true};await service.saveCloudTraining(owner,{session:f.session,proof});assert.deepEqual(calls,[{value:owner,proof,options:{projectionOnly:true}}]);assert.equal(f.adapter.needsAuthorityProjection(owner,id),false);assert.deepEqual(plain(f.adapter.export(owner).actions),old.actions);
  }finally{f.close();}
});
