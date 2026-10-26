/* eslint-disable @typescript-eslint/no-require-imports -- Electron runtime uses CommonJS. */
const { randomUUID } = require('node:crypto');
const { checksum, transaction } = require('../accounts/util.cjs');
const fail = (code,message) => { throw Object.assign(new Error(message),{code}); };
const keyOf = (collection,id) => JSON.stringify([collection,id]);
const cloudTables = ['conversation_cloud_state','conversation_cloud_records','conversation_cloud_outbox','conversation_cloud_archives','conversation_cloud_conflicts'];

/** Personal content is addressed by record. Local tables are its display cache;
 * the outbox contains immutable in-flight commands, never a whole account save. */
class ConversationCloudRecords {
  constructor(services,{hasActive=()=>false,publish=()=>{}}={}) {
    this.services=services;this.db=services.db;this.hasActive=hasActive;this.publish=publish;
    this.contract=import('./cloud-record-contract.mjs');this.locks=new Map();
  }
  accounts(){return this.services.get('accounts');}
  enabled(owner){const session=this.accounts()?.privateSession?.();return session?.authKind==='supabase'&&session.ownerAccountId===owner;}
  identity(owner){const accounts=this.accounts(),session=accounts?.privateSession?.();if(!this.enabled(owner))fail('SESSION_CHANGED','账号已切换。');return JSON.stringify([owner,session.sessionId,session.deviceId,accounts.epoch]);}
  current(owner,identity){if(this.identity(owner)!==identity)fail('SESSION_CHANGED','账号已切换，原记录已保留。');}
  serial(owner,work){const previous=this.locks.get(owner)||Promise.resolve(),next=previous.catch(()=>{}).then(work);this.locks.set(owner,next);return next.finally(()=>{if(this.locks.get(owner)===next)this.locks.delete(owner);});}
  async request(owner,identity,body){this.current(owner,identity);const reply=await this.accounts().cloudInvoke('lingjing-records',body);this.current(owner,identity);if(reply?.ownerAccountId!==owner)fail('RECORD_RECEIPT_MISMATCH','云端聊天记录归属不一致。');return reply;}
  state(owner){return this.db.prepare('SELECT * FROM conversation_cloud_state WHERE owner_account_id=?').get(owner);}
  status(owner){return {mode:'cloud-records',initialized:Boolean(this.state(owner)?.initialized),pending:this.db.prepare("SELECT count(*) n FROM conversation_cloud_outbox WHERE owner_account_id=? AND status='pending'").get(owner).n,
    conflicts:this.db.prepare("SELECT count(*) n FROM conversation_cloud_outbox WHERE owner_account_id=? AND status='conflict'").get(owner).n,
    preservedLocalRecords:this.db.prepare('SELECT count(*) n FROM conversation_cloud_conflicts WHERE owner_account_id=? AND resolved_at IS NULL').get(owner).n,
    error:this.state(owner)?.last_error||null};}
  async local(owner){const {fields,recordId}=await this.contract,rows=new Map();for(const [collection,names]of Object.entries(fields)){
    const order=collection==='conversation_messages'?'sequence':names.filter(name=>name!=='owner_account_id')[0];
    for(const row of this.db.prepare(`SELECT ${names.join(',')} FROM ${collection} WHERE owner_account_id=? ORDER BY ${order}`).all(owner)){
      const document={...row},id=recordId(collection,document);rows.set(keyOf(collection,id),{collection,id,document});
    }
  }return rows;}
  cached(owner){return new Map(this.db.prepare('SELECT * FROM conversation_cloud_records WHERE owner_account_id=? ORDER BY position').all(owner)
    .map(row=>[keyOf(row.collection,row.record_id),{...row,id:row.record_id,document:JSON.parse(row.document_json)}]));}
  async accept(owner,records){const {validateRecord}=await this.contract;if(!Array.isArray(records))fail('RECORD_RECEIPT_MISMATCH','云端聊天记录无效。');
    transaction(this.db,()=>{for(const row of records){
      if(!Number.isSafeInteger(row.revision)||row.revision<1||!Number.isSafeInteger(row.position)||!Number.isSafeInteger(row.changeSequence)||typeof row.deleted!=='boolean')fail('RECORD_RECEIPT_MISMATCH','云端记录版本无效。');
      validateRecord(owner,row.collection,row.id,row.document);
      const old=this.db.prepare('SELECT * FROM conversation_cloud_records WHERE owner_account_id=? AND collection=? AND record_id=?').get(owner,row.collection,row.id);
      if(old&&old.revision>row.revision)continue;
      if(old&&old.revision===row.revision&&(checksum(JSON.parse(old.document_json))!==checksum(row.document)||Boolean(old.deleted)!==row.deleted))fail('RECORD_RECEIPT_MISMATCH','同一记录版本返回了不同内容。');
      this.db.prepare(`INSERT INTO conversation_cloud_records VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner_account_id,collection,record_id)
        DO UPDATE SET revision=excluded.revision,position=excluded.position,change_sequence=excluded.change_sequence,document_json=excluded.document_json,deleted=excluded.deleted`)
        .run(owner,row.collection,row.id,row.revision,row.position,row.changeSequence,JSON.stringify(row.document),+row.deleted);
    }});
  }
  async pull(owner,identity){let cursor=this.state(owner)?.cursor||0;for(let page=0;page<1000;page++){
    const reply=await this.request(owner,identity,{op:'read',after:cursor,limit:500});
    if(!Number.isSafeInteger(reply.cursor)||reply.cursor<cursor||typeof reply.hasMore!=='boolean'||reply.hasMore&&reply.cursor===cursor)fail('RECORD_RECEIPT_MISMATCH','云端记录游标无效。');
    await this.accept(owner,reply.records);this.current(owner,identity);cursor=reply.cursor;
    this.db.prepare('INSERT INTO conversation_cloud_state(owner_account_id,cursor) VALUES(?,?) ON CONFLICT(owner_account_id) DO UPDATE SET cursor=excluded.cursor,last_error=NULL').run(owner,cursor);
    if(!reply.hasMore)return;
  }fail('RECORD_LIMIT','聊天记录较多，请继续读取。');}
  preserve(owner,record,remote,reason){this.db.prepare(`INSERT OR IGNORE INTO conversation_cloud_conflicts(owner_account_id,collection,record_id,local_document,cloud_document,reason,created_at) VALUES(?,?,?,?,?,?,?)`)
    .run(owner,record.collection,record.id,JSON.stringify(record.document),remote?JSON.stringify(remote.document):null,reason,Date.now());}
  async enqueue(owner,changes){const {validateChanges}=await this.contract;validateChanges(owner,changes);const id=`record:${randomUUID()}`;
    this.db.prepare("INSERT INTO conversation_cloud_outbox VALUES(?,?,?,'pending',NULL,?)").run(owner,id,JSON.stringify(changes),Date.now());return id;}
  async flushInside(owner,identity){const conflicts=[],jobs=this.db.prepare("SELECT * FROM conversation_cloud_outbox WHERE owner_account_id=? AND status='pending' ORDER BY created_at,rowid").all(owner);
    for(const job of jobs){let reply;try{reply=await this.request(owner,identity,{op:'write',actionId:job.action_id,changes:JSON.parse(job.changes_json)});}
      catch(error){this.current(owner,identity);const conflict=['RECORD_CONFLICT','RECORD_ID_REUSED','PET_OWNER_MISMATCH','ACTION_ID_REUSED'].includes(error.code);
        this.db.prepare('UPDATE conversation_cloud_outbox SET status=?,last_error=? WHERE owner_account_id=? AND action_id=?').run(conflict?'conflict':'pending',error.code||'RECORD_UNAVAILABLE',owner,job.action_id);
        if(conflict){for(const change of JSON.parse(job.changes_json))this.preserve(owner,change,this.cached(owner).get(keyOf(change.collection,change.id)),`record-conflict:${job.action_id}`);conflicts.push(job.action_id);continue;}throw error;
      }
      if(reply.actionId!==job.action_id)fail('RECORD_RECEIPT_MISMATCH','聊天操作回执不一致。');
      await this.accept(owner,reply.records);this.current(owner,identity);
      this.db.prepare("UPDATE conversation_cloud_outbox SET status='verified',last_error=NULL WHERE owner_account_id=? AND action_id=?").run(owner,job.action_id);
    }
    return {conflicts};
  }
  async initialize(owner,identity){if(this.state(owner)?.initialized)return;
    const rows=await this.local(owner),document=Object.fromEntries(rows),digest=checksum(document);
    this.db.prepare('INSERT OR IGNORE INTO conversation_cloud_archives VALUES(?,?,?,?)').run(owner,digest,JSON.stringify(document),Date.now());
    await this.pull(owner,identity);const remote=this.cached(owner),owned=new Set(this.services.get('companions')?.listPets(owner)?.map(pet=>pet.petId??pet.id)||[]);
    const additions=[];
    for(const [key,record]of rows){const cloud=remote.get(key),row=record.document,pet=row.pet_id??row.selected_pet_id??(row.scope==='pet'?row.scope_id:null);
      if(cloud){if(cloud.deleted||checksum(cloud.document)!==checksum(row))this.preserve(owner,record,cloud,'legacy-local-difference');continue;}
      if(pet&&!owned.has(pet)){this.preserve(owner,record,null,'legacy-pet-not-in-cloud');continue;}
      additions.push({collection:record.collection,id:record.id,baseRevision:0,document:row});
    }
    // Small immutable batches preserve original message order while importing.
    for(let index=0;index<additions.length;index+=100)await this.enqueue(owner,additions.slice(index,index+100));
    await this.flushInside(owner,identity);await this.pull(owner,identity);
    this.db.prepare('UPDATE conversation_cloud_state SET initialized=1 WHERE owner_account_id=?').run(owner);
  }
  async materialize(owner){if(this.hasActive(owner))return 0;const identity=this.identity(owner),{fields,primary}=await this.contract,remote=this.cached(owner);this.current(owner,identity);let applied=0;
    transaction(this.db,()=>{for(const row of remote.values()){
      const collection=row.collection,where=['owner_account_id',...primary[collection].filter(name=>name!=='owner_account_id')];
      const document=row.document;
      if(row.deleted){applied+=this.db.prepare(`DELETE FROM ${collection} WHERE ${where.map(name=>`${name}=?`).join(' AND ')}`).run(...where.map(name=>document[name])).changes;continue;}
      const prior=this.db.prepare(`SELECT ${fields[collection].join(',')} FROM ${collection} WHERE ${where.map(name=>`${name}=?`).join(' AND ')}`).get(...where.map(name=>document[name]));
      if(prior&&checksum({...prior})===checksum(document))continue;
      const names=[...fields[collection]],values=names.map(name=>document[name]);
      if(collection==='conversation_messages'&&this.db.prepare('SELECT 1 FROM conversation_messages WHERE id=? AND owner_account_id<>?').get(document.id,owner))fail('RECORD_ID_CONFLICT','这条消息编号属于另一账号，原消息已保留。');
      if(collection==='conversation_connections'){
        const old=this.db.prepare('SELECT * FROM conversation_connections WHERE owner_account_id=? AND scope=? AND scope_id=?').get(owner,document.scope,document.scope_id);
        const matching=old?.provider===document.provider&&old?.base_url===document.base_url;
        const key=matching?old.encrypted_key:this.db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE owner_account_id=? AND scope=? AND scope_id=? AND provider=? AND base_url=?')
          .get(owner,document.scope,document.scope_id,document.provider,document.base_url)?.encrypted_key??null;
        names.push('encrypted_key');values.push(key);
      }
      const update=names.filter(name=>!where.includes(name)&&name!=='id').map(name=>`${name}=excluded.${name}`).join(',');
      this.db.prepare(`INSERT INTO ${collection}(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')}) ON CONFLICT DO UPDATE SET ${update}`).run(...values);
      applied++;
    }});
    return applied;
  }
  async refresh(owner){if(!this.enabled(owner)||this.hasActive(owner))return this.status(owner);
    return this.serial(owner,async()=>{const identity=this.identity(owner);try{
      await this.initialize(owner,identity);await this.flushInside(owner,identity);await this.recoverInterrupted(owner,identity);await this.pull(owner,identity);const applied=await this.materialize(owner);return {...this.status(owner),changed:applied>0};
    }catch(error){if(this.enabled(owner))this.db.prepare('INSERT INTO conversation_cloud_state(owner_account_id,last_error) VALUES(?,?) ON CONFLICT(owner_account_id) DO UPDATE SET last_error=excluded.last_error').run(owner,error.code||'RECORD_UNAVAILABLE');throw error;}});
  }
  async recoverInterrupted(owner,identity){
    const {fields,recordId}=await this.contract;
    const interrupted=this.db.prepare(`SELECT ${fields.conversation_messages.join(',')} FROM conversation_messages WHERE owner_account_id=? AND role='assistant' AND status IN ('failed','cancelled') AND error_code='INTERRUPTED'`).all(owner);
    if(!interrupted.length)return;
    // Only the device that actually persisted this message intent may mark its
    // crashed stream interrupted. Another device's displayed pending reply is
    // refreshed from the server instead of being cancelled on local startup.
    const authored=new Set(this.db.prepare("SELECT DISTINCT json_extract(c.value,'$.document.id') id FROM conversation_cloud_outbox o,json_each(o.changes_json) c WHERE o.owner_account_id=? AND o.status='verified' AND json_extract(c.value,'$.collection')='conversation_messages' AND json_extract(c.value,'$.document.role')='assistant'").all(owner).map(row=>row.id));
    const cached=this.cached(owner),changes=[];
    for(const source of interrupted){const document={...source},id=recordId('conversation_messages',document),prior=cached.get(keyOf('conversation_messages',id));
      if(authored.has(document.id)&&prior&&!prior.deleted&&['pending','streaming'].includes(prior.document.status))changes.push({collection:'conversation_messages',id,baseRevision:prior.revision,document});
    }
    for(let index=0;index<changes.length;index+=100)await this.enqueue(owner,changes.slice(index,index+100));
    if(changes.length)await this.flushInside(owner,identity);
  }
  listPreserved(owner){const remote=this.cached(owner);return this.db.prepare('SELECT * FROM conversation_cloud_conflicts WHERE owner_account_id=? AND resolved_at IS NULL ORDER BY created_at,collection,record_id LIMIT 100').all(owner)
    .map(row=>{const current=remote.get(keyOf(row.collection,row.record_id));return {collection:row.collection,id:row.record_id,reason:row.reason,
      local:JSON.parse(row.local_document),cloud:current&&!current.deleted?current.document:null,revision:current?.revision||0};});}
  async resolve(owner,input){return this.serial(owner,async()=>{
    const identity=this.identity(owner),row=this.db.prepare('SELECT * FROM conversation_cloud_conflicts WHERE owner_account_id=? AND collection=? AND record_id=? AND reason=?')
      .get(owner,input.collection,input.id,input.reason);
    if(!row||!['local','cloud'].includes(input.decision)||typeof input.actionId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.actionId))fail('RECORD_INVALID','请选择需要保留的记录版本。');
    if(row.resolved_at){if(row.resolution!==input.decision)fail('RECORD_CONFLICT','这条记录已处理，请重新读取。');return {...this.status(owner),duplicate:true};}
    const actionId=`record:${input.actionId}`,previous=input.decision==='local'?this.db.prepare('SELECT * FROM conversation_cloud_outbox WHERE owner_account_id=? AND action_id=?').get(owner,actionId):null;
    if(previous){const original=JSON.parse(previous.changes_json);if(original.length!==1||original[0].collection!==input.collection||original[0].id!==input.id||original[0].baseRevision!==input.revision)fail('ACTION_ID_REUSED','操作编号已用于其他内容。');await this.flushInside(owner,identity);}
    await this.pull(owner,identity);const current=this.cached(owner).get(keyOf(input.collection,input.id));
    const alreadyVerified=previous&&this.db.prepare('SELECT status FROM conversation_cloud_outbox WHERE owner_account_id=? AND action_id=?').get(owner,actionId)?.status==='verified';
    if(!alreadyVerified&&(current?.revision||0)!==input.revision)fail('RECORD_CONFLICT','云端记录又有更新，请重新查看后选择。');
    if(input.decision==='local'&&!alreadyVerified){
      const document=JSON.parse(row.local_document);
      if(document&&'revision' in document)document.revision=(current?.document?.revision||document.revision||0)+1;
      if(document&&'updated_at' in document)document.updated_at=Date.now();
      const changes=[{collection:input.collection,id:input.id,baseRevision:current?.revision||0,document}];
      const {validateChanges}=await this.contract;validateChanges(owner,changes);
      if(!previous)this.db.prepare("INSERT INTO conversation_cloud_outbox VALUES(?,?,?,'pending',NULL,?)").run(owner,actionId,JSON.stringify(changes),Date.now());
      await this.flushInside(owner,identity);
      const result=this.db.prepare('SELECT status FROM conversation_cloud_outbox WHERE owner_account_id=? AND action_id=?').get(owner,actionId);
      if(result?.status!=='verified')fail('RECORD_CONFLICT','这条记录尚未确认，原内容已保留。');
    }
    this.db.prepare('UPDATE conversation_cloud_conflicts SET resolved_at=?,resolution=? WHERE owner_account_id=? AND collection=? AND record_id=? AND reason=?')
      .run(Date.now(),input.decision,owner,input.collection,input.id,input.reason);
    if(input.reason.startsWith('record-conflict:')&&!this.db.prepare('SELECT 1 FROM conversation_cloud_conflicts WHERE owner_account_id=? AND reason=? AND resolved_at IS NULL LIMIT 1').get(owner,input.reason))
      this.db.prepare("UPDATE conversation_cloud_outbox SET status='superseded' WHERE owner_account_id=? AND action_id=? AND status='conflict'").run(owner,input.reason.slice('record-conflict:'.length));
    await this.pull(owner,identity);await this.materialize(owner);return this.status(owner);
  });}
  async importData(owner,data){const {createConversationBackupAdapter}=require('./backup.cjs');createConversationBackupAdapter(this.services).validate(data,owner);
    return this.serial(owner,async()=>{
      const identity=this.identity(owner);await this.initialize(owner,identity);await this.pull(owner,identity);
      const {recordId}=await this.contract,remote=this.cached(owner),reason=`backup-import:${checksum(data)}`,additions=[];
      this.db.prepare('INSERT OR IGNORE INTO conversation_cloud_archives VALUES(?,?,?,?)').run(owner,checksum(data),JSON.stringify(data),Date.now());
      for(const [collection,rows]of Object.entries(data.tables))for(const document of rows){const id=recordId(collection,document),prior=remote.get(keyOf(collection,id));
        if(prior){if(prior.deleted||checksum(prior.document)!==checksum(document))this.preserve(owner,{collection,id,document},prior,reason);}
        else additions.push({collection,id,baseRevision:0,document});
      }
      for(let index=0;index<additions.length;index+=100)await this.enqueue(owner,additions.slice(index,index+100));
      await this.flushInside(owner,identity);await this.pull(owner,identity);await this.materialize(owner);
      return this.status(owner);
    });
  }
  async persist(owner){if(!this.enabled(owner))return;return this.serial(owner,async()=>{
    const identity=this.identity(owner);if(!this.state(owner)?.initialized)await this.initialize(owner,identity);
    const current=await this.local(owner),cached=this.cached(owner),changes=[];
    const pending=this.db.prepare("SELECT changes_json FROM conversation_cloud_outbox WHERE owner_account_id=? AND status='pending'").all(owner);
    const pendingKeys=new Set(pending.flatMap(job=>JSON.parse(job.changes_json).map(change=>keyOf(change.collection,change.id))));
    const conflicts=this.db.prepare("SELECT changes_json FROM conversation_cloud_outbox WHERE owner_account_id=? AND status='conflict'").all(owner);
    const conflictDocuments=new Map(conflicts.flatMap(job=>JSON.parse(job.changes_json).map(change=>[keyOf(change.collection,change.id),checksum(change.document)])));
    for(const [key,record]of current){const prior=cached.get(key);if(pendingKeys.has(key)||conflictDocuments.get(key)===checksum(record.document))continue;if(!prior||prior.deleted||checksum(prior.document)!==checksum(record.document))changes.push({...record,baseRevision:prior?.revision||0});}
    for(const [key,row]of cached)if(!row.deleted&&!current.has(key)&&!pendingKeys.has(key)&&conflictDocuments.get(key)!==checksum(null))changes.push({collection:row.collection,id:row.id,baseRevision:row.revision,document:null});
    const actions=[];for(let index=0;index<changes.length;index+=100)actions.push(await this.enqueue(owner,changes.slice(index,index+100)));
    const result=await this.flushInside(owner,identity);
    if(result.conflicts.some(id=>actions.includes(id)))fail('RECORD_CONFLICT','这条聊天记录已在另一端更新，本机修改已保留。其他功能可继续使用。');
  });}
}
module.exports={ConversationCloudRecords,cloudTables};
