const sourceRequire=require('node:module').createRequire(require('node:path').resolve('apps/pc-app/runtime/features/conversations/tests/cloud-records.test.cjs'));
const { test }=sourceRequire('node:test');
const assert=sourceRequire('node:assert/strict');
const {openDatabase,migrate}=sourceRequire('../../../core/database.cjs');
const {ConversationStore}=sourceRequire('../store.cjs');
const {ConversationCloudRecords}=sourceRequire('../cloud-records.cjs');
const {checksum}=sourceRequire('../../accounts/util.cjs');
const owner='record-client-owner',pet='record-pet-1',otherPet='record-pet-2';
const profile=persona=>({persona,replyStyle:'natural',memoryEnabled:true,pauseWhileChatting:true,useOverride:false});
function server(){
  const rows=new Map(),actions=new Map(),calls=[];let sequence=0,loseReply=false;
  return {rows,calls,loseReply:()=>{loseReply=true;},async invoke(_endpoint,body){
    calls.push(structuredClone(body));
    if(body.op==='read'){
      const all=[...rows.values()].filter(row=>row.changeSequence>body.after).sort((a,b)=>a.changeSequence-b.changeSequence),records=all.slice(0,body.limit);
      return {ownerAccountId:owner,records:structuredClone(records),cursor:records.at(-1)?.changeSequence??body.after,hasMore:all.length>records.length};
    }
    const old=actions.get(body.actionId);if(old){assert.equal(old.hash,checksum(body.changes));return {...structuredClone(old.receipt),duplicate:true};}
    for(const change of body.changes){const current=rows.get(JSON.stringify([change.collection,change.id]));if((current?.revision||0)!==change.baseRevision)throw Object.assign(new Error('conflict'),{code:'RECORD_CONFLICT'});}
    const records=body.changes.map(change=>{
      let position;
      if(change.beforeId){const anchor=rows.get(JSON.stringify([change.collection,change.beforeId]));assert.ok(anchor&&!anchor.deleted);position=anchor.position;
        for(const row of rows.values())if(row.collection===change.collection&&row.position>=position){row.position++;row.changeSequence=++sequence;}}
      const key=JSON.stringify([change.collection,change.id]),current=rows.get(key),row={collection:change.collection,id:change.id,revision:(current?.revision||0)+1,
        document:structuredClone(change.document??current.document),deleted:change.document===null,position:current?.position??position??++sequence,changeSequence:++sequence};rows.set(key,row);return row;
    });
    const receipt={ownerAccountId:owner,actionId:body.actionId,records:structuredClone(records),duplicate:false};actions.set(body.actionId,{hash:checksum(body.changes),receipt});
    if(loseReply){loseReply=false;throw Object.assign(new Error('acknowledgement lost'),{code:'RECORD_UNAVAILABLE'});}
    return receipt;
  }};
}
function client(remote){
  const db=openDatabase(':memory:');migrate(db,'conversations',sourceRequire('../schema.cjs').migrations);
  const store=new ConversationStore(db);let current=owner;
  const accounts={epoch:1,privateSession:()=>({authKind:'supabase',ownerAccountId:current,sessionId:'fixture-session',deviceId:'fixture-device'}),cloudInvoke:remote.invoke.bind(remote)};
  const services={db,get:name=>name==='accounts'?accounts:name==='companions'?{listPets:()=>[{petId:pet},{petId:otherPet}]}:null};
  const cloud=new ConversationCloudRecords(services);return {db,store,cloud,switchOwner:()=>{current='other-owner';accounts.epoch++;},close:()=>db.close()};
}


// Real client SQLite/record logic with an in-memory CAS protocol double only.
// Independent native/Postgres reproduction is recorded as 4E6-003; no real data is accessed here.
const importOne={actionId:'11111111-1111-4111-8111-111111111111'},importTwo={actionId:'22222222-2222-4222-8222-222222222222'};
const choiceOne='33333333-3333-4333-8333-333333333333',choiceTwo='44444444-4444-4444-8444-444444444444';
function memoryKey(who,id){return JSON.stringify(['conversation_memories',JSON.stringify([who,id])]);}
function choose(a,entry,decision,id){return a.cloud.resolve(owner,{collection:entry.collection,id:entry.id,reason:entry.reason,revision:entry.revision,decision,actionId:id});}
function rawConflict(a,reason){return {...a.db.prepare('SELECT * FROM conversation_cloud_conflicts WHERE owner_account_id=? AND reason=?').get(owner,reason)};}
async function memoryFixture(){const remote=server(),a=client(remote);a.store.saveMemory(owner,pet,{content:'original fixture memory'});a.store.saveMemory(owner,otherPet,{content:'other pet remains unchanged'});await a.cloud.refresh(owner);const original=a.store.listMemories(owner,pet)[0],other=a.store.listMemories(owner,otherPet)[0],backup=sourceRequire('../backup.cjs').createConversationBackupAdapter({db:a.db}).export(owner);a.store.saveMemory(owner,pet,{id:original.id,revision:original.revision,content:'edited fixture memory'});await a.cloud.persist(owner);return{remote,a,original,other,backup};}

test('a fresh import of the same backup can restore the same memory after an earlier restore and later deletion',async()=>{
  const {remote,a,original,other,backup}=await memoryFixture();try{
    const otherBefore=structuredClone(remote.rows.get(memoryKey(otherPet,other.id)));
    await a.cloud.importData(owner,backup,importOne);const first=a.cloud.listPreserved(owner).find(x=>x.collection==='conversation_memories');assert.ok(first);
    await choose(a,first,'local',choiceOne);const priorResolution=rawConflict(a,first.reason),restored=a.store.listMemories(owner,pet)[0];
    assert.equal(restored.id,original.id);assert.equal(restored.content,original.content);
    a.store.deleteMemory(owner,pet,restored.id,restored.revision);await a.cloud.persist(owner);
    assert.equal(remote.rows.get(memoryKey(pet,original.id)).deleted,true);
    await a.cloud.importData(owner,backup,importTwo);const reopened=a.cloud.listPreserved(owner).filter(x=>x.collection==='conversation_memories'&&x.id===first.id);
    assert.equal(reopened.length,1,'a new confirmed import must expose the deleted original as a new reviewable choice');
    assert.notEqual(reopened[0].reason,first.reason,'keep the earlier resolution history intact');
    assert.deepEqual(rawConflict(a,first.reason),priorResolution);
    assert.equal(remote.rows.get(memoryKey(pet,original.id)).deleted,true,'import must not overwrite a tombstone without the explicit choice');
    await a.cloud.importData(owner,backup,importTwo);
    assert.equal(a.cloud.listPreserved(owner).filter(x=>x.collection==='conversation_memories').length,1,'retrying one import must not duplicate review records');
    await choose(a,a.cloud.listPreserved(owner).find(x=>x.collection==='conversation_memories'),'local',choiceTwo);
    const final=a.store.listMemories(owner,pet)[0];assert.equal(final.id,original.id);assert.equal(final.content,original.content);
    assert.equal(remote.rows.get(memoryKey(pet,original.id)).deleted,false);assert.deepEqual(remote.rows.get(memoryKey(otherPet,other.id)),otherBefore);
    assert.equal(remote.rows.size,2,'restoring a known memory must not invent another memory ID');
  }finally{a.close();}
});

test('retrying a resolved import is idempotent while a separate fresh import offers a new choice even at the same cloud revision',async()=>{
  const {remote,a,original,backup}=await memoryFixture();try{
    await a.cloud.importData(owner,backup,importOne);const first=a.cloud.listPreserved(owner).find(x=>x.collection==='conversation_memories');
    await choose(a,first,'cloud',choiceOne);const priorResolution=rawConflict(a,first.reason),remoteBefore=structuredClone(remote.rows.get(memoryKey(pet,original.id)));
    await a.cloud.importData(owner,backup,importOne);assert.equal(a.cloud.listPreserved(owner).length,0,'retrying the already processed intent must stay processed');
    await a.cloud.importData(owner,backup,importTwo);const reopened=a.cloud.listPreserved(owner).filter(x=>x.collection==='conversation_memories');
    assert.equal(reopened.length,1,'a separate confirmed restore must remain possible after choosing the cloud version');
    assert.notEqual(reopened[0].reason,first.reason);assert.deepEqual(rawConflict(a,first.reason),priorResolution);
    assert.deepEqual(remote.rows.get(memoryKey(pet,original.id)),remoteBefore,'new review must not silently change the cloud');
  }finally{a.close();}
});

test('account restore retry after import acknowledgement loss keeps its durable original action and one protection receipt', async () => {
  const {a,backup}=await memoryFixture();
  try {
    migrate(a.db,'accounts',sourceRequire('../../accounts/schema.cjs').migrations);
    const {AccountsService}=sourceRequire('../../accounts/service.cjs');
    const account=Object.create(AccountsService.prototype), imports=[];
    let protectionCount=0, lose=true;
    const previewId='same-preview', actionId='55555555-5555-4555-8555-555555555555';
    const modules={conversations:{version:1,data:backup}};
    Object.assign(account,{db:a.db,epoch:1,current:{authKind:'supabase',ownerAccountId:owner},requireOwner:()=>owner,
      settings:()=>({document:{}}),host:{apply:async()=>{}},
      services:{events:{emit(){}},get:()=>({cloudStatus:()=>a.cloud.status(owner),importCloudRecords:async(who,data,intent)=>{
        imports.push(intent.actionId);await a.cloud.importData(who,data,intent);
        if(lose){lose=false;throw Object.assign(new Error('lost import acknowledgement'),{code:'RECORD_UNAVAILABLE'});}
      }})},
      backups:{previews:new Map([[previewId,{owner,expiresAt:Date.now()+60000,envelope:{data:{modules}}}]]),
        validate(){},normalizeData:data=>data,prepareCache(){},save(){protectionCount++;return {filePath:'fixture-protection-only'};}}
    });
    const input={previewId,actionId,mode:'merge'};
    await assert.rejects(account.restoreBackup(input),{code:'RECORD_UNAVAILABLE'});
    const before=a.cloud.listPreserved(owner);assert.equal(before.length,1);
    account.backups.previews.clear(); // Durable receipt must allow retry after preview expiry.
    const result=await account.restoreBackup(input);assert.equal(result.restored,true);
    assert.deepEqual(imports,[actionId,actionId]);assert.equal(protectionCount,1);
    assert.deepEqual(a.cloud.listPreserved(owner),before);
    assert.equal((await account.restoreBackup(input)).duplicate,true);
    assert.equal(imports.length,2);
    await assert.rejects(account.restoreBackup({...input,mode:'replace'}),{code:'ACTION_ID_REUSED'});
    await assert.rejects(account.restoreBackup({...input,previewId:'different'}),{code:'ACTION_ID_REUSED'});
  } finally {a.close();}
});

test('explicit restore choice rejects a stale review revision without overwriting a newer memory', async () => {
  const {a,remote,original,backup}=await memoryFixture();
  try {
    await a.cloud.importData(owner,backup,importOne);
    const review=a.cloud.listPreserved(owner).find(x=>x.collection==='conversation_memories');
    const current=a.store.listMemories(owner,pet)[0];
    a.store.saveMemory(owner,pet,{id:current.id,revision:current.revision,content:'newer edit after review'});await a.cloud.persist(owner);
    await assert.rejects(choose(a,review,'local','66666666-6666-4666-8666-666666666666'),{code:'RECORD_CONFLICT'});
    assert.equal(remote.rows.get(memoryKey(pet,original.id)).document.content,'newer edit after review');
    assert.equal(a.store.listMemories(owner,pet)[0].id,original.id);
  } finally {a.close();}
});
