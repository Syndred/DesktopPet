/* eslint-disable @typescript-eslint/no-require-imports -- SQLite and public command acceptance. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createConversationsFeature,migrations } = require('../index.cjs');
const { createConversationBackupAdapter } = require('../backup.cjs');
function fixture(t) {
  const db=new DatabaseSync(':memory:'); for(const migration of migrations)db.exec(migration.sql);
  db.exec('CREATE TABLE account_legacy_data(owner_account_id TEXT PRIMARY KEY,source_hash TEXT,document TEXT,imported_at TEXT)');
  const feature=createConversationsFeature({db,getSession:()=>({ownerAccountId:'owner-a',sessionId:'session-a'}),
    listPets:owner=>[{petId:'pet-one',ownerAccountId:owner,name:'旧伙伴',growth:{level:1}},{petId:'pet-two',ownerAccountId:owner,name:'同模板第二只',growth:{level:1}}]});
  t.after(()=>{feature.dispose();db.close();});
  const save=(owner,value)=>db.prepare('INSERT INTO account_legacy_data VALUES(?,?,?,?) ON CONFLICT(owner_account_id) DO UPDATE SET document=excluded.document').run(owner,'old-source-hash',JSON.stringify(value),'original-time');
  const call=(command,payload={})=>feature.invoke(command,payload);
  return {db,feature,save,call,adapter:createConversationBackupAdapter({db})};
}
function source() {return {apiKey:'LEGACY-KEY-NEVER-IMPORT',sessionToken:'LEGACY-TOKEN-NEVER-IMPORT',messages:[
  {id:'original-user-id',petId:'pet-one',role:'user',content:'旧问题'},
  {id:'original-assistant-id',petId:'pet-one',role:'assistant',content:'原档里的旧文本'},
  {role:'user',content:'没有归属的旧消息'}],memories:[{petId:'pet-one',content:'旧记忆'}],profiles:[{petId:'pet-one',persona:'原人设'}]};}

test('legacy preview/import reads only verified owner archives, preserves originals and original message IDs',async t=>{
  const f=fixture(t),raw=source();f.save('owner-a',raw);f.save('owner-b',{messages:[{petId:'pet-one',role:'user',content:'另一账号私密文本'}]});
  const before=f.db.prepare('SELECT document FROM account_legacy_data WHERE owner_account_id=?').get('owner-a').document;
  const preview=await f.call('legacy.preview',{ownerAccountId:'owner-b'});assert.equal(preview.ok,true);
  assert.equal(preview.data.messages,2);assert.equal(preview.data.unresolved,1);assert.equal(preview.data.unassigned,1);
  assert.doesNotMatch(JSON.stringify(preview),/LEGACY-KEY|LEGACY-TOKEN|另一账号私密/);
  const imported=await f.call('legacy.import',{sourceHash:preview.data.sourceHash});assert.equal(imported.ok,true,imported.message);
  const state=(await f.call('snapshot',{petId:'pet-one'})).data;
  assert.deepEqual(state.messages.map(row=>row.id),['original-user-id','original-assistant-id']);
  assert.equal(state.messages[1].provider,null);assert.equal(state.messages[1].createdAt,0);
  assert.equal(state.profile.persona,'原人设');assert.equal(state.memories[0].content,'旧记忆');
  assert.equal(state.globalConnection,null);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM conversation_credentials').get().n,0);
  assert.equal(f.db.prepare('SELECT document FROM account_legacy_data WHERE owner_account_id=?').get('owner-a').document,before);
  assert.equal((await f.call('snapshot',{petId:'pet-two'})).data.messages.length,0);
  assert.doesNotMatch(JSON.stringify(f.adapter.export('owner-a')),/LEGACY-KEY|LEGACY-TOKEN/);
  const checksumBefore=JSON.stringify(f.adapter.export('owner-a'));
  const repeat=await f.call('legacy.import',{sourceHash:preview.data.sourceHash});assert.equal(repeat.ok,true,repeat.message);
  assert.equal(JSON.stringify(f.adapter.export('owner-a')),checksumBefore);
});

test('unassigned role-known records require an explicit owned pet mapping',async t=>{
  const f=fixture(t);f.save('owner-a',source());
  assert.equal((await f.call('legacy.preview',{unassignedPetId:'someone-elses-pet'})).code,'PET_NOT_FOUND');
  const preview=await f.call('legacy.preview',{unassignedPetId:'pet-two'});assert.equal(preview.data.messages,3);
  const result=await f.call('legacy.import',{sourceHash:preview.data.sourceHash,unassignedPetId:'pet-two',includeSettings:false});
  assert.equal(result.ok,true,result.message);
  assert.equal((await f.call('snapshot',{petId:'pet-two'})).data.messages[0].content,'没有归属的旧消息');
  assert.equal((await f.call('snapshot',{petId:'pet-one'})).data.memories.length,0);
});

test('stale archive hashes, corrupt data and active generation reject without partial import',async t=>{
  const f=fixture(t);f.save('owner-a',source());const preview=await f.call('legacy.preview');
  f.save('owner-a',{...source(),extra:'changed'});
  assert.equal((await f.call('legacy.import',{sourceHash:preview.data.sourceHash})).code,'REVISION_CONFLICT');
  const current=await f.call('legacy.preview');
  f.feature.service.active.set('test-active',{session:{owner:'owner-a'},petId:'pet-one',controller:new AbortController(),kind:'test'});
  assert.equal((await f.call('legacy.import',{sourceHash:current.data.sourceHash})).code,'BUSY');
  f.feature.service.active.clear();
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM conversation_messages').get().n,0);
  f.db.prepare('UPDATE account_legacy_data SET document=? WHERE owner_account_id=?').run('{invalid','owner-a');
  assert.equal((await f.call('legacy.preview')).code,'LEGACY_CORRUPT');
});

test('conflicting current persona remains intact; history-only import is an explicit recovery path',async t=>{
  const f=fixture(t);f.save('owner-a',source());
  await f.call('profile.save',{petId:'pet-one',profile:{persona:'当前人设',replyStyle:'natural',memoryEnabled:true,pauseWhileChatting:true,useOverride:false},revision:0});
  const preview=await f.call('legacy.preview');
  const rejected=await f.call('legacy.import',{sourceHash:preview.data.sourceHash});assert.equal(rejected.code,'LEGACY_CONFLICT');
  assert.equal((await f.call('snapshot',{petId:'pet-one'})).data.messages.length,0);
  const accepted=await f.call('legacy.import',{sourceHash:preview.data.sourceHash,includeSettings:false});assert.equal(accepted.ok,true,accepted.message);
  const state=(await f.call('snapshot',{petId:'pet-one'})).data;assert.equal(state.profile.persona,'当前人设');assert.equal(state.messages.length,2);
});

test('empty and unsupported old records remain archived instead of inventing a sender or pet',async t=>{
  const f=fixture(t);assert.equal((await f.call('legacy.preview')).data.sourceHash,null);
  f.save('owner-a',{chats:[{text:'没有发送者和伙伴'}],messages:[{petId:'missing-pet',role:'assistant',content:'不可归属'}]});
  const preview=await f.call('legacy.preview');assert.equal(preview.data.messages,0);assert.equal(preview.data.unresolved,2);
  assert.equal((await f.call('legacy.import',{sourceHash:preview.data.sourceHash})).code,'LEGACY_EMPTY');
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM account_legacy_data').get().n,1);
});
