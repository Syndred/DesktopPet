const { test }=require('node:test');
const assert=require('node:assert/strict');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {ConversationStore}=require('../store.cjs');
const {ConversationCloudRecords}=require('../cloud-records.cjs');
const {checksum}=require('../../accounts/util.cjs');
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
  const db=openDatabase(':memory:');migrate(db,'conversations',require('../schema.cjs').migrations);
  const store=new ConversationStore(db);let current=owner;
  const accounts={epoch:1,privateSession:()=>({authKind:'supabase',ownerAccountId:current,sessionId:'fixture-session',deviceId:'fixture-device'}),cloudInvoke:remote.invoke.bind(remote)};
  const services={db,get:name=>name==='accounts'?accounts:name==='companions'?{listPets:()=>[{petId:pet},{petId:otherPet}]}:null};
  const cloud=new ConversationCloudRecords(services);return {db,store,cloud,switchOwner:()=>{current='other-owner';accounts.epoch++;},close:()=>db.close()};
}

test('LOCAL SQLite and protocol double: imported prefixes and existing tails have the same original order on both devices',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    const config={provider:'openai-compatible',model:'fixture'};
    const middle=a.store.createTurn(owner,pet,'middle-turn','中间的问题',config).messages;
    a.store.updateReply(owner,pet,'middle-turn','中间的回复','complete');await a.cloud.refresh(owner);
    const stale=structuredClone([...remote.rows.values()]);
    const prefix=b.store.createTurn(owner,pet,'prefix-turn','原来的开头',config).messages;
    b.store.updateReply(owner,pet,'prefix-turn','开头的回复','complete');
    const fields=(await b.cloud.contract).fields.conversation_messages;
    const insert=b.db.prepare(`INSERT INTO conversation_messages(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`);
    for(const source of a.db.prepare('SELECT * FROM conversation_messages ORDER BY sequence').all())insert.run(...fields.map(name=>source[name]));
    const tail=b.store.createTurn(owner,pet,'tail-turn','后续的问题',config).messages;
    b.store.updateReply(owner,pet,'tail-turn','后续的回复','complete');await b.cloud.refresh(owner);await a.cloud.refresh(owner);
    const expected=[...prefix,...middle,...tail].map(row=>row.id);
    assert.deepEqual(a.store.history(owner,pet).messages.map(row=>row.id),expected);
    assert.deepEqual(b.store.history(owner,pet).messages.map(row=>row.id),expected);
    assert.equal(b.cloud.status(owner).preservedLocalRecords,0);
    const orderedIntent=remote.calls.find(call=>call.op==='write'&&call.changes.some(change=>change.beforeId));
    assert.ok(orderedIntent);
    const key=JSON.stringify(['conversation_messages',stale[0].id]),position=b.cloud.cached(owner).get(key).position;
    await b.cloud.accept(owner,stale);assert.equal(b.cloud.cached(owner).get(key).position,position,'an older acknowledgement cannot undo a later order readback');
  }finally{a.close();b.close();}
});

test('LOCAL SQLite and protocol double: contradictory observed histories are archived instead of silently reordering the cloud',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    const config={provider:'openai-compatible',model:'fixture'};
    a.store.createTurn(owner,pet,'cloud-first','第一轮',config);a.store.updateReply(owner,pet,'cloud-first','第一轮回复','complete');
    a.store.createTurn(owner,pet,'cloud-second','第二轮',config);a.store.updateReply(owner,pet,'cloud-second','第二轮回复','complete');await a.cloud.refresh(owner);
    const fields=(await b.cloud.contract).fields.conversation_messages,rows=a.db.prepare('SELECT * FROM conversation_messages ORDER BY sequence').all();
    const insert=b.db.prepare(`INSERT INTO conversation_messages(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`);
    for(const source of [...rows.slice(2),...rows.slice(0,2)])insert.run(...fields.map(name=>source[name]));
    b.store.createTurn(owner,pet,'preserved-tail','需要保留的原文',config);b.store.updateReply(owner,pet,'preserved-tail','原回复','complete');
    await b.cloud.refresh(owner);
    assert.deepEqual(b.store.history(owner,pet).messages.map(row=>row.id),rows.map(row=>row.id));
    assert.equal(b.cloud.status(owner).preservedLocalRecords,2);assert.match(b.db.prepare('SELECT document_json FROM conversation_cloud_archives').get().document_json,/需要保留的原文/);
    const writes=remote.calls.filter(call=>call.op==='write').length;await b.cloud.persist(owner);
    assert.equal(remote.calls.filter(call=>call.op==='write').length,writes,'preserved rows do not silently return to the upload path');
  }finally{a.close();b.close();}
});

test('LOCAL SQLite and protocol double: two independent caches read the same server record and preserve original IDs',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    a.store.saveProfile(owner,pet,profile('原人设'),0);await a.cloud.refresh(owner);await b.cloud.refresh(owner);
    assert.equal(b.store.getProfile(owner,pet).persona,'原人设');
    a.store.saveProfile(owner,pet,profile('云端新内容'),1);await a.cloud.persist(owner);await b.cloud.refresh(owner);
    assert.equal(b.store.getProfile(owner,pet).persona,'云端新内容');
    assert.equal(b.store.getProfile(owner,pet).revision,2);
    assert.equal(a.db.prepare('SELECT count(*) n FROM conversation_cloud_archives').get().n,1);
    assert.equal((await b.cloud.refresh(owner)).changed,false,'unchanged polls do not trigger UI reload loops');
  }finally{a.close();b.close();}
});
test('LOCAL SQLite and protocol double: lost write acknowledgement retries the original immutable action exactly once at the server',async()=>{
  const remote=server(),a=client(remote);try{
    await a.cloud.refresh(owner);a.store.saveProfile(owner,pet,profile('只保存一次'),0);remote.loseReply();
    await assert.rejects(a.cloud.persist(owner),{code:'RECORD_UNAVAILABLE'});
    const pending={...a.db.prepare("SELECT * FROM conversation_cloud_outbox WHERE status='pending'").get()};
    await a.cloud.refresh(owner);
    const attempts=remote.calls.filter(call=>call.op==='write');assert.equal(attempts.length,2);assert.equal(attempts[0].actionId,attempts[1].actionId);assert.deepEqual(attempts[0].changes,attempts[1].changes);
    assert.equal([...remote.rows.values()][0].revision,1);
    assert.equal(a.db.prepare('SELECT status FROM conversation_cloud_outbox WHERE action_id=?').get(pending.action_id).status,'verified');
    assert.equal(a.store.getProfile(owner,pet).persona,'只保存一次');
  }finally{a.close();}
});
test('LOCAL SQLite and protocol double: one record conflict does not block another pet or automatically reissue the conflicting edit',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    a.store.saveProfile(owner,pet,profile('初始'),0);a.store.saveProfile(owner,otherPet,profile('另一只初始'),0);await a.cloud.refresh(owner);await b.cloud.refresh(owner);
    a.store.saveProfile(owner,pet,profile('甲修改'),1);await a.cloud.persist(owner);
    b.store.saveProfile(owner,pet,profile('乙旧基线修改'),1);await assert.rejects(b.cloud.persist(owner),{code:'RECORD_CONFLICT'});
    const failedCalls=remote.calls.filter(call=>call.op==='write').length;
    b.store.saveProfile(owner,otherPet,profile('另一只仍可保存'),1);await b.cloud.persist(owner);
    assert.equal(remote.calls.filter(call=>call.op==='write').length,failedCalls+1);
    assert.equal(b.cloud.status(owner).conflicts,1);
    await a.cloud.refresh(owner);assert.equal(a.store.getProfile(owner,otherPet).persona,'另一只仍可保存');
    assert.equal(a.store.getProfile(owner,pet).persona,'甲修改');
  }finally{a.close();b.close();}
});
test('LOCAL SQLite and protocol double: connection metadata travels while each device key stays local and bound to its endpoint',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    const connection={provider:'openai-compatible',baseUrl:'https://model.example/v1',model:'fixture',contextChars:24000,maxOutputTokens:512};
    a.store.saveConnection(owner,null,{...connection,encryptedKey:'DEVICE_A_PRIVATE_KEY'},0);await a.cloud.refresh(owner);
    b.store.saveConnection(owner,null,{...connection,encryptedKey:'DEVICE_B_PRIVATE_KEY'},0);await b.cloud.refresh(owner);
    assert.equal(b.store.getConnection(owner,null,true).encryptedKey,'DEVICE_B_PRIVATE_KEY');
    assert.equal(JSON.stringify(remote.calls).includes('PRIVATE_KEY'),false);
    a.store.saveConnection(owner,null,{...connection,baseUrl:'https://different.example/v1',encryptedKey:null},1);await a.cloud.persist(owner);await b.cloud.refresh(owner);
    assert.equal(b.store.getConnection(owner,null,true).encryptedKey,null);
    assert.equal(b.db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE base_url=?').get(connection.baseUrl).encrypted_key,'DEVICE_B_PRIVATE_KEY');
  }finally{a.close();b.close();}
});
test('LOCAL SQLite and protocol double: divergent legacy content is archived per record without blocking the adopted cloud version',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    a.store.saveProfile(owner,pet,profile('云端版本'),0);await a.cloud.refresh(owner);
    b.store.saveProfile(owner,pet,profile('本机旧分支'),0);await b.cloud.refresh(owner);
    assert.equal(b.store.getProfile(owner,pet).persona,'云端版本');assert.equal(b.cloud.status(owner).preservedLocalRecords,1);
    assert.match(b.db.prepare('SELECT document_json FROM conversation_cloud_archives').get().document_json,/本机旧分支/);
    b.store.saveProfile(owner,otherPet,profile('继续使用'),0);await b.cloud.persist(owner);
    assert.equal(b.cloud.status(owner).pending,0);
  }finally{a.close();b.close();}
});
test('LOCAL SQLite and protocol double: a late response after account switching is rejected before materializing another owner',async()=>{
  const remote=server(),a=client(remote);try{
    const original=remote.invoke.bind(remote);remote.invoke=async(...args)=>{const reply=await original(...args);a.switchOwner();return reply;};
    // The accounts capability resolves this dynamic transport on every call.
    a.cloud.accounts().cloudInvoke=(...args)=>remote.invoke(...args);
    await assert.rejects(a.cloud.refresh(owner),{code:'SESSION_CHANGED'});
    assert.equal(a.db.prepare('SELECT count(*) n FROM conversation_profiles').get().n,0);
  }finally{a.close();}
});
test('LOCAL SQLite and protocol double: an explicit choice restores one archived record and keeps its original archive',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    a.store.saveProfile(owner,pet,profile('云端版本'),0);await a.cloud.refresh(owner);
    b.store.saveProfile(owner,pet,profile('需要找回的人设'),0);await b.cloud.refresh(owner);
    const row=b.cloud.listPreserved(owner)[0];assert.equal(row.local.persona,'需要找回的人设');
    await b.cloud.resolve(owner,{collection:row.collection,id:row.id,reason:row.reason,revision:row.revision,decision:'local',actionId:require('node:crypto').randomUUID()});
    assert.equal(b.store.getProfile(owner,pet).persona,'需要找回的人设');assert.equal(b.cloud.listPreserved(owner).length,0);
    assert.equal(b.db.prepare('SELECT count(*) n FROM conversation_cloud_archives').get().n,1);
    assert.equal(b.db.prepare('SELECT resolution FROM conversation_cloud_conflicts').get().resolution,'local');
    await a.cloud.refresh(owner);assert.equal(a.store.getProfile(owner,pet).persona,'需要找回的人设');
  }finally{a.close();b.close();}
});
test('LOCAL SQLite and protocol double: a lost acknowledgement while resolving a preserved record reuses its frozen body',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    a.store.saveProfile(owner,pet,profile('云端版本'),0);await a.cloud.refresh(owner);
    b.store.saveProfile(owner,pet,profile('本机版本'),0);await b.cloud.refresh(owner);
    const row=b.cloud.listPreserved(owner)[0],input={collection:row.collection,id:row.id,reason:row.reason,revision:row.revision,decision:'local',actionId:require('node:crypto').randomUUID()};
    remote.loseReply();await assert.rejects(b.cloud.resolve(owner,input),{code:'RECORD_UNAVAILABLE'});await b.cloud.resolve(owner,input);
    const writes=remote.calls.filter(call=>call.actionId===`record:${input.actionId}`);assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
    assert.equal(b.cloud.status(owner).pending,0);assert.equal(b.store.getProfile(owner,pet).persona,'本机版本');
  }finally{a.close();b.close();}
});
test('LOCAL SQLite and protocol double: restarting the author retains a partial reply and confirms interruption under its original message IDs',async()=>{
  const remote=server(),a=client(remote);try{
    await a.cloud.refresh(owner);a.store.createTurn(owner,pet,'original-stream-action','原问题',{provider:'openai_compatible',model:'fixture'});await a.cloud.persist(owner);
    const original=a.store.getTurn(owner,pet,'original-stream-action').map(row=>row.id);
    a.store.updateReply(owner,pet,'original-stream-action','已收到的一部分','streaming');a.store.recoverInterrupted();await a.cloud.refresh(owner);
    const rows=a.store.getTurn(owner,pet,'original-stream-action');assert.deepEqual(rows.map(row=>row.id),original);assert.equal(rows[1].content,'已收到的一部分');assert.equal(rows[1].status,'cancelled');assert.equal(rows[1].errorCode,'INTERRUPTED');
    const cloud=[...remote.rows.values()].find(row=>row.document.id===original[1]);assert.equal(cloud.document.status,'cancelled');assert.equal(cloud.document.content,'已收到的一部分');
  }finally{a.close();}
});
test('LOCAL SQLite and protocol double: restarting a viewer never cancels another device active message',async()=>{
  const remote=server(),a=client(remote),b=client(remote);try{
    await a.cloud.refresh(owner);a.store.createTurn(owner,pet,'other-device-active','问题',{provider:'openai_compatible',model:'fixture'});await a.cloud.persist(owner);await b.cloud.refresh(owner);
    b.store.recoverInterrupted();await b.cloud.refresh(owner);
    assert.equal(b.store.getTurn(owner,pet,'other-device-active')[1].status,'pending');
    a.store.updateReply(owner,pet,'other-device-active','完整回复','complete');await a.cloud.persist(owner);await b.cloud.refresh(owner);
    assert.equal(b.store.getTurn(owner,pet,'other-device-active')[1].content,'完整回复');
  }finally{a.close();b.close();}
});
