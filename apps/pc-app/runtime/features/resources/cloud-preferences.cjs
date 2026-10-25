const {randomUUID}=require('node:crypto');
const {ResourceError,calibrations,actionMap}=require('./parser.cjs');
const {canonical,SHA,reject}=require('./cloud-contract.cjs');
const TABLE='lingjing_resource_preferences';
const FIELDS='owner_account_id,auth_user_id,resource_id,revision,document,authority_action_id';
const conflict=code=>/CONFLICT|ACTION_ID/.test(code);
function normalized(value,resource){
  const document={calibration:calibrations(value?.calibration),actions:actionMap(value?.actions,resource.clips,true)};
  if(canonical(document)!==canonical(value))reject('RESOURCE_PREFERENCE_INVALID','角色偏好字段或动作无效');return document;
}
class ResourceCloudPreferences {
  constructor(cloud){this.cloud=cloud;this.db=cloud.db;this.service=cloud.service;}
  local(owner,id){const resource=this.service.getRecord(owner,id);return {calibration:resource.calibration,actions:resource.actions};}
  enqueue(owner,ids){
    if(this.cloud.protocolFixture)return {queued:0};
    const keys=this.service.repository.ownerKeys(owner),marks=keys.map(()=>'?').join(',');
    const rows=this.db.prepare(`SELECT * FROM lingjing_resource_preferences WHERE owner_account_id IN (${marks}) ORDER BY resource_id,revision`).all(...keys);let count=0;
    for(const row of rows){
      const resource=this.service.getRecord(owner,row.resource_id);if(resource.kind!=='spritesheet'||(ids&&!ids.includes(resource.id)))continue;
      const document=canonical(normalized({calibration:JSON.parse(row.calibration_json),actions:JSON.parse(row.actions_json)},resource));
      const state=this.db.prepare('SELECT * FROM lingjing_resource_preference_state WHERE owner_account_id=? AND resource_id=?').get(owner,resource.id);
      if(state?.document_json===document){this.db.prepare('UPDATE lingjing_resource_preference_state SET local_revision=? WHERE owner_account_id=? AND resource_id=?').run(row.revision,owner,resource.id);continue;}
      count+=this.db.prepare('INSERT INTO lingjing_resource_preference_outbox(owner_account_id,resource_id,local_revision,action_id,document_json,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(owner,resource.id,row.revision,randomUUID(),document,new Date(this.cloud.now()).toISOString()).changes;
    }
    return {queued:count};
  }
  status(owner){return this.db.prepare('SELECT status,count(*) count FROM lingjing_resource_preference_outbox WHERE owner_account_id=? GROUP BY status').all(owner);}
  snapshot(owner){return this.db.prepare('SELECT resource_id,cloud_revision,document_json FROM lingjing_resource_preference_state WHERE owner_account_id=? ORDER BY resource_id').all(owner).map(row=>({resourceId:row.resource_id,revision:row.cloud_revision,...JSON.parse(row.document_json)}));}
  async invoke(owner,body){
    const actor=await this.cloud.actor(owner);let response;
    try{if(actor.invoke)return await actor.invoke('lingjing-resources',body);response=await actor.client.functions.invoke('lingjing-resources',{body});}
    catch(error){if(error?.code)throw new ResourceError(error.code,'资源偏好同步未完成，原记录已保留');throw error;}
    if(response.error){let code='RESOURCE_CLOUD_UNAVAILABLE';try{const problem=await response.error.context.json();if(/^[A-Z_]+$/.test(problem.code))code=problem.code;}catch{}throw new ResourceError(code,'资源偏好同步未完成，原记录已保留');}
    if(!response.data?.ok)reject(response.data?.code||'RESOURCE_CLOUD_UNAVAILABLE','资源偏好同步未完成');return response.data.data;
  }
  async read(owner,id){
    const actor=await this.cloud.actor(owner),reply=await actor.client.from(TABLE).select(FIELDS).eq('owner_account_id',owner).eq('auth_user_id',actor.authUserId).eq('resource_id',id).maybeSingle();
    if(reply.error)reject('RESOURCE_CLOUD_UNAVAILABLE','角色偏好暂时无法读取');if(!reply.data)return null;
    const row=reply.data,resource=this.service.getRecord(owner,id),document=normalized(row.document,resource);
    if(!Number.isSafeInteger(row.revision)||row.revision<1||!/^resource-pref:[0-9a-f-]{36}$/.test(row.authority_action_id))reject('RESOURCE_AUTHORITY_REQUIRED','角色偏好回执无效');
    const proof=await actor.client.from('lingjing_save_actions').select('action_id,revision,checksum,kind').eq('owner_id',owner).eq('action_id',row.authority_action_id).maybeSingle();
    if(proof.error||proof.data?.kind!=='authority'||!Number.isSafeInteger(proof.data.revision)||!SHA.test(proof.data.checksum))reject('RESOURCE_AUTHORITY_REQUIRED','角色偏好权威回执未核验');
    await this.cloud.actor(owner,actor.authUserId);
    const record={resourceId:id,revision:row.revision,...document,authority:{actionId:proof.data.action_id,revision:proof.data.revision,checksum:proof.data.checksum}};
    this.db.prepare('INSERT INTO lingjing_resource_preference_cache VALUES(?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET document_json=excluded.document_json,authority_action_id=excluded.authority_action_id,authority_revision=excluded.authority_revision,authority_checksum=excluded.authority_checksum').run(owner,id,row.revision,canonical(document),record.authority.actionId,record.authority.revision,record.authority.checksum);
    return record;
  }
  apply(owner,record,{force=false}={}){
    const resource=this.service.getRecord(owner,record.resourceId),document=normalized({calibration:record.calibration,actions:record.actions},resource),text=canonical(document);
    const local=this.db.prepare('SELECT * FROM lingjing_resource_preferences WHERE owner_account_id=? AND resource_id=?').get(owner,record.resourceId);
    const state=this.db.prepare('SELECT * FROM lingjing_resource_preference_state WHERE owner_account_id=? AND resource_id=?').get(owner,record.resourceId);
    const localText=canonical(this.local(owner,record.resourceId));
    if(!force&&local&&localText!==text&&(!state||localText!==state.document_json))return {conflict:true};
    return this.service.repository.transaction(()=>{
      const revision=local&&localText===text?local.revision:(local?.revision||0)+1;
      this.db.prepare('INSERT INTO lingjing_resource_preferences VALUES(?,?,?,?,?) ON CONFLICT DO UPDATE SET calibration_json=excluded.calibration_json,actions_json=excluded.actions_json,revision=excluded.revision').run(record.resourceId,owner,JSON.stringify(document.calibration),JSON.stringify(document.actions),revision);
      this.db.prepare('INSERT INTO lingjing_resource_preference_state VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET cloud_revision=excluded.cloud_revision,local_revision=excluded.local_revision,document_json=excluded.document_json,authority_action_id=excluded.authority_action_id,authority_revision=excluded.authority_revision,authority_checksum=excluded.authority_checksum,verified_at=excluded.verified_at').run(owner,record.resourceId,record.revision,revision,text,record.authority.actionId,record.authority.revision,record.authority.checksum,new Date(this.cloud.now()).toISOString());
      if(force)this.db.prepare("UPDATE lingjing_resource_preference_outbox SET status='superseded',last_error='CLOUD_RESTORE_SUPERSEDED' WHERE owner_account_id=? AND resource_id=? AND status IN ('pending','retry','conflict')").run(owner,record.resourceId);
      return {restored:true};
    });
  }
  async prepare(owner,preferences=[]){
    for(const expected of preferences){const row=await this.read(owner,expected.resourceId);if(!row||canonical({resourceId:row.resourceId,revision:row.revision,calibration:row.calibration,actions:row.actions})!==canonical(expected))reject('RESOURCE_PREFERENCE_CONFLICT','云端角色偏好已更新，请重新预览');}
  }
  async remoteSnapshot(owner){
    const actor=await this.cloud.actor(owner),reply=await actor.client.from(TABLE).select('resource_id').eq('owner_account_id',owner).eq('auth_user_id',actor.authUserId).order('resource_id').limit(1001);
    if(reply.error||!Array.isArray(reply.data)||reply.data.length>1000)reject('RESOURCE_CLOUD_UNAVAILABLE','角色偏好列表暂时不可用');
    const rows=[];for(const id of reply.data){const row=await this.read(owner,id.resource_id);if(row)rows.push({resourceId:row.resourceId,revision:row.revision,calibration:row.calibration,actions:row.actions});}return rows;
  }
  restore(owner,preferences=[],mode){
    for(const expected of preferences){
      const row=this.db.prepare('SELECT * FROM lingjing_resource_preference_cache WHERE owner_account_id=? AND resource_id=? AND cloud_revision=?').get(owner,expected.resourceId,expected.revision);
      if(!row||row.document_json!==canonical({calibration:expected.calibration,actions:expected.actions}))reject('RESOURCE_AUTHORITY_REQUIRED','角色偏好尚未完成真实云端核验');
      const applied=this.apply(owner,{...expected,authority:{actionId:row.authority_action_id,revision:row.authority_revision,checksum:row.authority_checksum}},{force:mode==='replace'});
      if(applied.conflict)reject('RESOURCE_PREFERENCE_CONFLICT','本机角色偏好另有修改，原档已保留，请使用预览选择恢复');
    }
  }
  async pull(owner){
    if(this.cloud.protocolFixture)return;
    const actor=await this.cloud.actor(owner),reply=await actor.client.from(TABLE).select('resource_id').eq('owner_account_id',owner).eq('auth_user_id',actor.authUserId).order('resource_id').limit(1001);
    if(reply.error||!Array.isArray(reply.data)||reply.data.length>1000)reject('RESOURCE_CLOUD_UNAVAILABLE','角色偏好列表暂时不可用');
    for(const row of reply.data){try{this.service.getRecord(owner,row.resource_id);}catch{continue;}const record=await this.read(owner,row.resource_id);if(record){const applied=this.apply(owner,record);if(applied.restored)this.cloud.onChanged(owner,row.resource_id);}}
  }
  async flush(owner,{force=false}={}){
    if(this.cloud.protocolFixture)return {verified:[],errors:[],pending:0};this.enqueue(owner);
    const jobs=this.db.prepare("SELECT * FROM lingjing_resource_preference_outbox o WHERE owner_account_id=? AND status IN ('pending','retry') AND (next_attempt_at<=? OR ?=1) AND NOT EXISTS(SELECT 1 FROM lingjing_resource_preference_outbox p WHERE p.owner_account_id=o.owner_account_id AND p.resource_id=o.resource_id AND p.local_revision<o.local_revision AND p.status IN ('pending','retry','conflict')) ORDER BY resource_id,local_revision").all(owner,this.cloud.now(),force?1:0),verified=[],errors=[];
    for(const job of jobs){
      try{
        const actor=await this.cloud.actor(owner,job.auth_user_id);
        if(job.base_revision===null){job.base_revision=this.db.prepare('SELECT cloud_revision FROM lingjing_resource_preference_state WHERE owner_account_id=? AND resource_id=?').get(owner,job.resource_id)?.cloud_revision||0;job.auth_user_id=actor.authUserId;this.db.prepare('UPDATE lingjing_resource_preference_outbox SET base_revision=?,auth_user_id=? WHERE owner_account_id=? AND action_id=?').run(job.base_revision,job.auth_user_id,owner,job.action_id);}
        const receipt=await this.invoke(owner,{op:'preferences',resourceId:job.resource_id,actionId:job.action_id,baseRevision:job.base_revision,document:JSON.parse(job.document_json)});
        const row=await this.read(owner,job.resource_id);
        if(!row||row.revision!==job.base_revision+1||row.revision!==receipt.preferenceRevision||row.authority.actionId!==receipt.actionId||row.authority.checksum!==receipt.checksum||canonical({calibration:row.calibration,actions:row.actions})!==job.document_json)reject('RESOURCE_PREFERENCE_CONFLICT','角色偏好独立读回发生冲突，原记录已保留');
        this.db.prepare('INSERT INTO lingjing_resource_preference_state VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET cloud_revision=excluded.cloud_revision,local_revision=excluded.local_revision,document_json=excluded.document_json,authority_action_id=excluded.authority_action_id,authority_revision=excluded.authority_revision,authority_checksum=excluded.authority_checksum,verified_at=excluded.verified_at').run(owner,job.resource_id,row.revision,job.local_revision,job.document_json,row.authority.actionId,row.authority.revision,row.authority.checksum,new Date(this.cloud.now()).toISOString());
        this.db.prepare("UPDATE lingjing_resource_preference_outbox SET status='verified',verified_at=?,last_error=NULL WHERE owner_account_id=? AND action_id=?").run(new Date(this.cloud.now()).toISOString(),owner,job.action_id);verified.push({resourceId:job.resource_id,preferenceRevision:row.revision,authority:row.authority});
      }catch(error){const code=error.code||'RESOURCE_CLOUD_UNAVAILABLE';this.db.prepare('UPDATE lingjing_resource_preference_outbox SET status=?,last_error=?,attempts=attempts+1,next_attempt_at=? WHERE owner_account_id=? AND action_id=?').run(conflict(code)?'conflict':'retry',code,this.cloud.now()+Math.min(1800000,2000*2**Math.min(job.attempts+1,10)),owner,job.action_id);errors.push({resourceId:job.resource_id,code});break;}
    }
    return {verified,errors,pending:this.status(owner).filter(row=>['pending','retry','conflict'].includes(row.status)).reduce((n,row)=>n+row.count,0)};
  }
}
module.exports={ResourceCloudPreferences,normalized,TABLE,FIELDS};
