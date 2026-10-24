const {randomUUID,createHash}=require('node:crypto');
function atomic(db,fn) {
  const savepoint=`discovery_${randomUUID().replaceAll('-','')}`; db.exec(`SAVEPOINT ${savepoint}`);
  try {const result=fn(); if(result?.then) throw new Error('Async work cannot run inside a SQLite transaction'); db.exec(`RELEASE SAVEPOINT ${savepoint}`); return result;}
  catch(error) {db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`); db.exec(`RELEASE SAVEPOINT ${savepoint}`); throw error;}
}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
class DiscoveryRepository {
  constructor(db) {if(!db?.prepare || !db?.exec) throw new Error('Discovery requires the shared SQLite connection'); this.db=db;}
  replay(owner,actionId,request) {
    if(typeof actionId!=='string'||!actionId.trim()||actionId.length>180) throw Object.assign(new Error('需要有效操作编号'),{code:'ACTION_ID_REQUIRED'});
    const row=this.db.prepare('SELECT * FROM discovery_actions WHERE owner_account_id=? AND action_id=?').get(owner,actionId);
    if(!row) return null;
    if(row.request_hash!==digest(request)) throw Object.assign(new Error('操作编号已用于其他请求'),{code:'ACTION_ID_CONFLICT'});
    return {...JSON.parse(row.result_json),duplicate:true};
  }
  get(owner,id) {const row=this.db.prepare('SELECT data_json FROM discovery_encounters WHERE owner_account_id=? AND encounter_id=?').get(owner,id); return row ? JSON.parse(row.data_json) : null;}
  list(owner) {return this.db.prepare('SELECT data_json FROM discovery_encounters WHERE owner_account_id=? ORDER BY updated_at DESC').all(owner).map(row=>JSON.parse(row.data_json));}
  put(encounter,expectedRevision) {
    if(expectedRevision===undefined) {
      this.db.prepare('INSERT INTO discovery_encounters(owner_account_id,encounter_id,status,revision,data_json,updated_at) VALUES(?,?,?,?,?,?)').run(encounter.ownerAccountId,encounter.encounterId,encounter.status,encounter.revision,JSON.stringify(encounter),encounter.updatedAt);
    } else {
      const result=this.db.prepare('UPDATE discovery_encounters SET status=?, revision=?, data_json=?, updated_at=? WHERE owner_account_id=? AND encounter_id=? AND revision=?').run(encounter.status,encounter.revision,JSON.stringify(encounter),encounter.updatedAt,encounter.ownerAccountId,encounter.encounterId,expectedRevision);
      if(Number(result.changes)!==1) throw Object.assign(new Error('遭遇进度已更新，请刷新后重试'),{code:'REVISION_CONFLICT'});
    }
  }
  action(owner,actionId,request,fn) {
    const previous=this.replay(owner,actionId,request); if(previous) return previous;
    const hash=digest(request);
    return atomic(this.db,()=>{
      const row=this.replay(owner,actionId,request); if(row) return row;
      const result=fn();
      if(result?.then) throw new Error('Async action cannot be recorded in a SQLite transaction');
      if(result.ok) this.db.prepare('INSERT INTO discovery_actions(owner_account_id,action_id,request_hash,result_json) VALUES(?,?,?,?)').run(owner,actionId,hash,JSON.stringify(result));
      return result;
    });
  }
  capture(owner,encounterId) {const row=this.db.prepare('SELECT data_json FROM discovery_captures WHERE owner_account_id=? AND encounter_id=?').get(owner,encounterId); return row?JSON.parse(row.data_json):null;}
  captures(owner) {return this.db.prepare('SELECT data_json FROM discovery_captures WHERE owner_account_id=? ORDER BY captured_at DESC').all(owner).map(row=>JSON.parse(row.data_json));}
  putCapture(capture) {this.db.prepare('INSERT INTO discovery_captures(owner_account_id,encounter_id,pet_id,action_id,data_json,captured_at) VALUES(?,?,?,?,?,?)').run(capture.ownerAccountId,capture.encounterId,capture.petId,capture.actionId,JSON.stringify(capture),capture.capturedAtMs);}
  putMemory(owner,petId,tag) {this.db.prepare('INSERT INTO discovery_memory_tags(owner_account_id,pet_id,tag_id,data_json) VALUES(?,?,?,?)').run(owner,petId,tag.id,JSON.stringify(tag));}
  memories(owner,petId) {return this.db.prepare('SELECT data_json FROM discovery_memory_tags WHERE owner_account_id=? AND pet_id=?').all(owner,petId).map(row=>JSON.parse(row.data_json));}
}
module.exports={DiscoveryRepository,atomic,digest};
