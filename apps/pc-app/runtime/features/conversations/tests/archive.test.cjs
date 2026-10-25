/* eslint-disable @typescript-eslint/no-require-imports -- Node SQLite acceptance. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { EventEmitter } = require('node:events');
const { migrations } = require('../schema.cjs');
const { ConversationStore } = require('../store.cjs');
const { createConversationBackupAdapter } = require('../backup.cjs');
const config = { provider:'openai_compatible',baseUrl:'https://model.example.invalid/v1',model:'configured-model',contextChars:24000,maxOutputTokens:512 };
function fixture(t) {
  const db = new DatabaseSync(':memory:'); for (const migration of migrations) db.exec(migration.sql);
  const store = new ConversationStore(db); let busy = false;
  const adapter = createConversationBackupAdapter({db,get:()=>({hasActive:()=>busy})});
  t.after(()=>db.close());
  return {db,store,adapter,setBusy:value=>busy=value};
}
function turn(f, owner, pet, action, content = action) {
  f.store.createTurn(owner,pet,action,content,config);
  f.store.updateReply(owner,pet,action,`原回复：${content}`,'complete');
}

test('complete-save adapter preserves owners, pet/message IDs and local credentials across devices', t => {
  const a=fixture(t), b=fixture(t);
  turn(a,'owner-a','pet-one','turn-one'); turn(a,'owner-a','pet-two','turn-two');
  a.store.saveProfile('owner-a','pet-one',{persona:'旧人设',replyStyle:'warm',memoryEnabled:true,pauseWhileChatting:false,useOverride:false},0);
  a.store.saveMemory('owner-a','pet-one',{content:'旧记忆'});
  a.store.saveConnection('owner-a',null,{...config,encryptedKey:'DEVICE-A-DPAPI-BLOB'},0);
  b.store.saveConnection('owner-a',null,{...config,encryptedKey:'DEVICE-B-DPAPI-BLOB'},0);
  turn(b,'owner-b','pet-other','other-turn','另一账号原文');
  const data=a.adapter.export('owner-a');
  assert.doesNotMatch(JSON.stringify(data),/DEVICE-|encrypted_key|apiKey|access_token|refresh_token|session_token/);
  assert.equal(Object.hasOwn(data.tables.conversation_messages[0],'sequence'),false);
  b.adapter.restore('owner-a',data,'replace');
  assert.deepEqual(b.adapter.export('owner-a'),data);
  assert.deepEqual(b.store.history('owner-a','pet-one').messages.map(m=>m.id),a.store.history('owner-a','pet-one').messages.map(m=>m.id));
  assert.equal(b.store.history('owner-b','pet-other').messages[0].content,'另一账号原文');
  assert.equal(b.store.getConnection('owner-a',null,true).encryptedKey,'DEVICE-B-DPAPI-BLOB');
  const empty=structuredClone(data); empty.tables.conversation_connections=[];
  b.adapter.restore('owner-a',empty,'replace');
  assert.equal(b.store.getConnection('owner-a'),null);
  assert.equal(b.db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE owner_account_id=?').get('owner-a').encrypted_key,'DEVICE-B-DPAPI-BLOB');
  b.adapter.restore('owner-a',data,'replace');
  assert.equal(b.store.getConnection('owner-a',null,true).encryptedKey,'DEVICE-B-DPAPI-BLOB');
  const changed=structuredClone(data); changed.tables.conversation_connections[0].base_url='https://different.example.invalid/v1';
  b.adapter.restore('owner-a',changed,'replace');
  assert.equal(b.store.getConnection('owner-a').hasKey,false);
  assert.deepEqual(b.adapter.export('owner-a'),changed);
});

test('running replies export as interrupted projections without changing the sender or receiver checksum', t => {
  const a=fixture(t),b=fixture(t);
  a.store.createTurn('owner-a','pet-one','stream-one','原问题',config);
  a.store.updateReply('owner-a','pet-one','stream-one','已收到的部分','streaming');
  const data=a.adapter.export('owner-a');
  assert.equal(a.store.history('owner-a','pet-one').messages[1].status,'streaming');
  assert.equal(data.tables.conversation_messages[1].status,'cancelled');
  assert.equal(data.tables.conversation_messages[1].error_code,'INTERRUPTED');
  b.adapter.restore('owner-a',data,'replace');
  assert.deepEqual(b.adapter.export('owner-a'),data);
  assert.equal(b.store.history('owner-a','pet-one').messages[1].content,'已收到的部分');
  a.store.recoverInterrupted();
  assert.equal(a.store.history('owner-a','pet-one').messages[1].status,'cancelled');
});

test('an older client key edit or clear is not resurrected by the local vault during cloud restore', t => {
  const a=fixture(t),b=fixture(t);
  a.store.saveConnection('owner-a',null,{...config,encryptedKey:'SOURCE-DEVICE-KEY'},0);
  const snapshot=a.adapter.export('owner-a');
  b.store.saveConnection('owner-a',null,{...config,encryptedKey:'ORIGINAL-LOCAL-KEY'},0);
  // The pre-vault client still updates only the original connection column.
  b.db.prepare('UPDATE conversation_connections SET encrypted_key=?,revision=revision+1 WHERE owner_account_id=?').run('NEWER-OLD-CLIENT-KEY','owner-a');
  assert.equal(b.store.getConnection('owner-a',null,true).encryptedKey,'NEWER-OLD-CLIENT-KEY');
  b.adapter.restore('owner-a',snapshot,'replace');
  assert.equal(b.store.getConnection('owner-a',null,true).encryptedKey,'NEWER-OLD-CLIENT-KEY');
  b.db.prepare('UPDATE conversation_connections SET encrypted_key=NULL,revision=revision+1 WHERE owner_account_id=?').run('owner-a');
  assert.equal(b.store.getConnection('owner-a').hasKey,false);
  b.adapter.restore('owner-a',snapshot,'replace');assert.equal(b.store.getConnection('owner-a').hasKey,false);
  assert.equal(b.db.prepare('SELECT COUNT(*) AS n FROM conversation_credentials WHERE owner_account_id=?').get('owner-a').n,0);
});

test('old history prefixes merge before existing tails while stable IDs and pagination survive sequence collisions', t => {
  const a=fixture(t),b=fixture(t);
  turn(a,'owner-a','pet-one','old-first');turn(a,'owner-a','pet-one','known-tail');
  const full=a.adapter.export('owner-a'), tail=structuredClone(full);
  tail.tables.conversation_messages=tail.tables.conversation_messages.slice(2);
  b.adapter.restore('owner-a',tail,'replace');
  turn(b,'owner-a','pet-one','local-new');
  const localIds=b.store.history('owner-a','pet-one').messages.slice(2).map(row=>row.id);
  b.adapter.restore('owner-a',full,'merge');
  const history=b.store.history('owner-a','pet-one').messages;
  assert.deepEqual(history.map(row=>row.id),[...full.tables.conversation_messages.map(row=>row.id),...localIds]);
  const page=b.store.history('owner-a','pet-one',Number.MAX_SAFE_INTEGER,2);
  const prior=b.store.history('owner-a','pet-one',page.nextCursor,2);
  assert.deepEqual(prior.messages.map(row=>row.actionId),['known-tail','known-tail']);
  const repeated=b.adapter.export('owner-a');b.adapter.restore('owner-a',full,'merge');
  assert.deepEqual(b.adapter.export('owner-a'),repeated);
});

test('ambiguous message edits and contradictory order reject atomically instead of silently overwriting', t => {
  const a=fixture(t),b=fixture(t);
  turn(a,'owner-a','pet-one','one');turn(a,'owner-a','pet-one','two');
  const original=a.adapter.export('owner-a');b.adapter.restore('owner-a',original,'replace');
  const fork=structuredClone(original);fork.tables.conversation_messages[1].content='另一端不同的完整回复';
  assert.throws(()=>b.adapter.restore('owner-a',fork,'merge'),{code:'CONVERSATION_MERGE_CONFLICT'});
  assert.deepEqual(b.adapter.export('owner-a'),original);
  const reversed=structuredClone(original);reversed.tables.conversation_messages.reverse();
  assert.throws(()=>b.adapter.restore('owner-a',reversed,'merge'),{code:'CONVERSATION_ORDER_CONFLICT'});
  assert.deepEqual(b.adapter.export('owner-a'),original);
});

test('restore refuses active generations; cancel/retry progress merges without duplicating user messages', t => {
  const a=fixture(t),b=fixture(t);
  a.store.createTurn('owner-a','pet-one','one','原问题',config);
  a.store.updateReply('owner-a','pet-one','one','部分','cancelled','CANCELLED');
  const before=a.adapter.export('owner-a');b.adapter.restore('owner-a',before,'replace');
  b.setBusy(true);assert.throws(()=>b.adapter.restore('owner-a',before,'replace'),{code:'CONVERSATION_BUSY'});b.setBusy(false);
  a.store.retryTurn('owner-a','pet-one','one',config);
  a.store.updateReply('owner-a','pet-one','one','真实已完成文本','complete');
  const next=a.adapter.export('owner-a');b.adapter.restore('owner-a',next,'merge');
  assert.equal(b.store.history('owner-a','pet-one').messages.length,2);
  assert.equal(b.store.history('owner-a','pet-one').messages[1].attempt,2);
  assert.deepEqual(b.adapter.export('owner-a'),next);
});

test('memory/profile fork rejects atomically; replace applies explicit deletion while keeping the vault', t => {
  const a=fixture(t),b=fixture(t);
  a.store.saveMemory('owner-a','pet-one',{content:'原记忆'});
  const original=a.adapter.export('owner-a');b.adapter.restore('owner-a',original,'replace');
  const fork=structuredClone(original);fork.tables.conversation_memories[0].content='并发修改';fork.tables.conversation_memories[0].revision++;
  fork.tables.conversation_profiles.push({owner_account_id:'owner-a',pet_id:'pet-two',persona:'不能部分写入',reply_style:'warm',memory_enabled:1,pause_while_chatting:0,use_override:0,revision:1,updated_at:1});
  assert.throws(()=>b.adapter.restore('owner-a',fork,'merge'),{code:'CONVERSATION_MERGE_CONFLICT'});
  assert.deepEqual(b.adapter.export('owner-a'),original);
  const removed=structuredClone(original);removed.tables.conversation_memories=[];
  b.adapter.restore('owner-a',removed,'replace');assert.equal(b.store.listMemories('owner-a','pet-one').length,0);
});

test('credentials, duplicate IDs and cross-pet message rebinding are rejected before mutation', t => {
  const a=fixture(t);turn(a,'owner-a','pet-one','one');
  const original=a.adapter.export('owner-a');
  for(const mutate of [data=>data.tables.conversation_messages.push({...data.tables.conversation_messages[0]}),
    data=>data.tables.conversation_messages[0].pet_id='pet-other',
    data=>data.tables.conversation_messages[0].encrypted_key='FORGED-BLOB',
    data=>data.tables.conversation_messages[0].owner_account_id='owner-b']) {
    const data=structuredClone(original);mutate(data);assert.throws(()=>a.adapter.restore('owner-a',data,'replace'),{code:'CONVERSATION_BACKUP_INVALID'});
  }
  assert.deepEqual(a.adapter.export('owner-a'),original);
});

test('same-owner full-save restoration invalidates stale chat editors and cursors', t => {
  const f=fixture(t),bus=new EventEmitter(),registry=new Map();
  const current={id:'owner-a',lastLoginAt:'unchanged-login'};
  registry.set('companions',{listPets:()=>[{petId:'pet-one',ownerAccountId:'owner-a',name:'原伙伴',growth:{level:1}}]});
  const services={db:f.db,session:{getCurrentUser:()=>current,getOwnerAccountId:()=>current.id},
    events:{on:(name,fn)=>{bus.on(name,fn);return()=>bus.off(name,fn);},emit:(name,value)=>bus.emit(name,value)},
    get:name=>registry.get(name),provide:(name,value)=>registry.set(name,value)};
  const feature=require('../index.cjs').register(services);t.after(()=>feature.dispose());
  return (async()=>{
    const context={ownerAccountId:'owner-a'};
    const before=(await feature.commands.snapshot({},context)).data;
    bus.emit('accounts:save-restored',{ownerAccountId:'owner-a'});
    const after=(await feature.commands.snapshot({},context)).data;
    assert.ok(after.sessionRevision>before.sessionRevision);
    const stale=await feature.commands['memory.save']({petId:'pet-one',memory:{content:'过期界面'},expectedSessionRevision:before.sessionRevision},context);
    assert.equal(stale.code,'SESSION_CHANGED');assert.equal(f.store.listMemories('owner-a','pet-one').length,0);
  })();
});
