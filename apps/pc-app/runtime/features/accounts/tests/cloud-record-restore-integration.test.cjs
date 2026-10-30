// Offline integration only: real AccountsService/BackupManager/conversations feature,
// temporary SQLite and a deterministic in-memory records protocol. No Auth/network.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {mkdtempSync,readFileSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {EventEmitter}=require('node:events');
const {AccountsService}=require('../service.cjs');
const {normalized}=require('../supabase-remote.cjs');
const {checksum}=require('../util.cjs');
const conversationsFeature=require('../../conversations/index.cjs');
const owner='synthetic-restore-owner',pet='synthetic-restore-pet';
function protocol(){
 const rows=new Map(),receipts=new Map(),calls=[];let sequence=0,failRead=false,loseWrite=false;
 return {rows,receipts,calls,failNextRead(){failRead=true;},loseNextWrite(){loseWrite=true;},async invoke(endpoint,body){
  assert.equal(endpoint,'lingjing-records');calls.push(structuredClone(body));
  if(body.op==='read'){
   if(failRead){failRead=false;throw Object.assign(Error('synthetic read interruption'),{code:'RECORD_UNAVAILABLE'});}
   const all=[...rows.values()].filter(r=>r.changeSequence>body.after).sort((a,b)=>a.changeSequence-b.changeSequence),records=all.slice(0,body.limit);
   return {ownerAccountId:owner,records:structuredClone(records),cursor:records.at(-1)?.changeSequence??body.after,hasMore:all.length>records.length};
  }
  assert.equal(body.op,'write');const prior=receipts.get(body.actionId);
  if(prior){assert.equal(prior.hash,checksum(body.changes));return {...structuredClone(prior.value),duplicate:true};}
  for(const c of body.changes)assert.equal(rows.get(JSON.stringify([c.collection,c.id]))?.revision||0,c.baseRevision);
  const records=body.changes.map(c=>{const key=JSON.stringify([c.collection,c.id]),old=rows.get(key);const r={collection:c.collection,id:c.id,document:structuredClone(c.document??old.document),deleted:c.document===null,revision:(old?.revision||0)+1,position:old?.position??++sequence,changeSequence:++sequence};rows.set(key,r);return r;});
  const value={ownerAccountId:owner,actionId:body.actionId,records:structuredClone(records),duplicate:false};receipts.set(body.actionId,{hash:checksum(body.changes),value});
  if(loseWrite){loseWrite=false;throw Object.assign(Error('synthetic acknowledgement lost'),{code:'RECORD_UNAVAILABLE'});}return value;
 }};
}
async function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'lingjing-record-restore-integration-')),db=new DatabaseSync(join(directory,'test.sqlite'));
 for(const m of [...require('../schema.cjs').migrations,...conversationsFeature.migrations]){assert.equal(typeof m.sql,'string');db.exec(m.sql);}
 const remoteRecords=protocol(),events=new EventEmitter(),registry=new Map();let accounts;
 const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:owner,authUserId:'10000000-0000-4000-8000-000000000001',deviceId:randomUUID(),sessionId:randomUUID(),account:'syntheticrestore',username:'Synthetic'};
 const remote={enabled:true,authKind:'supabase',config:{url:'https://example.invalid'},setCurrentUser(){},async clear(){},async login(){return normalized({currentUser:{id:owner,account:actor.account,username:actor.username,authKind:'supabase',authUserId:actor.authUserId},actor,tokens:{accessToken:'synthetic.offline.token',refreshToken:'synthetic-offline-refresh',expiresAt:Date.now()/1000+3600,deviceId:actor.deviceId,sessionId:actor.sessionId}});},async cloudContext(){return {...actor,invoke:remoteRecords.invoke.bind(remoteRecords)};}};
 const services={db,paths:{userData:directory,legacyDataExisted:false},safeStorage:{isEncryptionAvailable:()=>false},events:{emit:events.emit.bind(events),on:(name,fn)=>{events.on(name,fn);return()=>events.off(name,fn);}},get:name=>registry.get(name),provide:(name,value)=>registry.set(name,value),session:{getCurrentUser:()=>accounts.getCurrentUser(),getOwnerAccountId:()=>accounts.getOwnerAccountId()}};
 accounts=new AccountsService({services,remote,host:{async apply(){},clear(){},dispose(){}}});registry.set('accounts',accounts);
 registry.set('companions',{listPets:()=>[{petId:pet,name:'Synthetic pet'}],readCloudOwnedPetIds:async()=>[pet]});
 const feature=conversationsFeature.register(services),conversations=registry.get('conversations');accounts.backups.register(conversations.createBackupAdapter());
 await accounts.authenticate({provider:'runtime',account:actor.account,password:'synthetic-only-password'});
 const command=async(name,input)=>{const result=await feature.commands[name](input,{ownerAccountId:owner});assert.equal(result.ok,true,JSON.stringify(result));return result.data;};
 return {directory,db,accounts,conversations,remoteRecords,command,close(){feature.dispose();accounts.dispose();db.close();rmSync(directory,{recursive:true,force:true});}};
}
test('OFFLINE integration: same backup bytes and memory ID restore with distinct intents, including interrupted replay',async()=>{
 const f=await fixture();try{
  await f.command('memory.save',{petId:pet,memory:{content:'Original synthetic memory'}});
  const original=f.db.prepare('SELECT * FROM conversation_memories').get(),memoryId=original.id;
  const backup=join(f.directory,'same-backup.json');f.accounts.backups.save(owner,backup);
  const bytes=readFileSync(backup),hash=createHash('sha256').update(bytes).digest('hex');
  await f.command('memory.save',{petId:pet,memory:{id:memoryId,revision:original.revision,content:'Different synthetic current memory'}});
  const preview1=f.accounts.backups.preview(owner,backup),intent1={previewId:preview1.previewId,mode:'merge',actionId:randomUUID()};
  const beforeWrite=f.remoteRecords.receipts.size;
  f.remoteRecords.failNextRead();await assert.rejects(f.accounts.restoreBackup(intent1),{code:'RECORD_UNAVAILABLE'});
  const pending=f.db.prepare('SELECT * FROM account_actions WHERE action_id=?').get(intent1.actionId);assert.equal(JSON.parse(pending.result).restored,false);
  assert.equal(f.remoteRecords.receipts.size,beforeWrite,'unknown restore cannot manufacture remote writes');
  const first=await f.accounts.restoreBackup(intent1);assert.equal(first.restored,true);assert.equal(first.mode,'record-import');
  let review=f.conversations.preservedRecords(owner).filter(r=>r.collection==='conversation_memories');assert.equal(review.length,1);
  assert.equal(review[0].local.id,memoryId);assert.equal(review[0].local.content,original.content);assert.ok(review[0].reason.endsWith(':intent:'+intent1.actionId));
  const decision={collection:review[0].collection,id:review[0].id,reason:review[0].reason,revision:review[0].revision,decision:'local',actionId:randomUUID()};
  f.remoteRecords.loseNextWrite();await assert.rejects(f.conversations.resolvePreservedRecord(owner,decision),{code:'RECORD_UNAVAILABLE'});
  const outbox=f.db.prepare('SELECT * FROM conversation_cloud_outbox WHERE action_id=?').get('record:'+decision.actionId),committedCount=f.remoteRecords.receipts.size;
  assert.equal(outbox.status,'pending');await f.conversations.resolvePreservedRecord(owner,decision);
  assert.equal(f.remoteRecords.receipts.size,committedCount,'original unknown adopt replays one remote intent');
  const attempts=f.remoteRecords.calls.filter(c=>c.actionId==='record:'+decision.actionId);assert.equal(attempts.length,2);assert.deepEqual(attempts[0],attempts[1]);
  const adopted=f.db.prepare('SELECT * FROM conversation_memories WHERE id=?').get(memoryId);assert.equal(adopted.content,original.content);
  await f.command('memory.delete',{petId:pet,id:memoryId,revision:adopted.revision});assert.equal(f.db.prepare('SELECT count(*) n FROM conversation_memories WHERE id=?').get(memoryId).n,0);
  const deletedWrites=f.remoteRecords.receipts.size;assert.equal((await f.accounts.restoreBackup(intent1)).duplicate,true);assert.equal(f.remoteRecords.receipts.size,deletedWrites);assert.equal(f.conversations.preservedRecords(owner).filter(r=>r.collection==='conversation_memories').length,0,'old completed restore intent does not re-open review');
  const preview2=f.accounts.backups.preview(owner,backup),intent2={previewId:preview2.previewId,mode:'merge',actionId:randomUUID()};
  const second=await f.accounts.restoreBackup(intent2);assert.equal(second.restored,true);assert.notEqual(second.preservedBackup.filePath,first.preservedBackup.filePath);
  const protection1=JSON.parse(readFileSync(first.preservedBackup.filePath)),protection2=JSON.parse(readFileSync(second.preservedBackup.filePath));
  assert.equal(protection1.data.modules.conversations.data.tables.conversation_memories.find(m=>m.id===memoryId).content,'Different synthetic current memory');
  assert.equal(protection2.data.modules.conversations.data.tables.conversation_memories.some(m=>m.id===memoryId),false);
  review=f.conversations.preservedRecords(owner).filter(r=>r.collection==='conversation_memories');assert.equal(review.length,1);assert.equal(review[0].local.id,memoryId);assert.equal(review[0].local.content,original.content);assert.equal(review[0].cloud,null);assert.ok(review[0].reason.endsWith(':intent:'+intent2.actionId));assert.notEqual(review[0].reason,decision.reason);
  assert.equal(f.remoteRecords.receipts.size,deletedWrites,'review import does not silently resurrect deleted content');
  await f.conversations.resolvePreservedRecord(owner,{collection:review[0].collection,id:review[0].id,reason:review[0].reason,revision:review[0].revision,decision:'local',actionId:randomUUID()});
  assert.equal(f.db.prepare('SELECT content FROM conversation_memories WHERE id=?').get(memoryId).content,original.content);
  assert.deepEqual(readFileSync(backup),bytes);assert.equal(createHash('sha256').update(readFileSync(backup)).digest('hex'),hash);
  assert.equal(f.db.prepare("SELECT count(*) n FROM account_actions WHERE kind='restore-records'").get().n,2);
 }finally{f.close();}
});
