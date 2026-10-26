const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ResourceError, isWithin, readBounded } = require('./parser.cjs');
const { BUCKET, TABLE, REFERENCES, CHUNK_BYTES, MANIFEST_BYTES, UUID, SHA, hash, canonical, identity, manifestPath, chunkPath, validateManifest, validateIndex, reject } = require('./cloud-contract.cjs');
const { ownedRow, sourceLocations, buildPackage, assertRestoreOwnership, localMatches, hydratePackage } = require('./cloud-packages.cjs');
const INDEX_FIELDS='auth_user_id,owner_account_id,resource_id,manifest_sha256,content_hash,manifest_path,manifest_bytes,total_bytes,resource_kind,created_at';
const REFERENCE_FIELDS=INDEX_FIELDS+',authority_action_id,authority_revision,authority_checksum';

function cloudError(error) {
  if(error instanceof ResourceError)return error;
  const status=String(error?.statusCode??error?.status??'');
  const code=status==='401'?'RESOURCE_CLOUD_AUTH_REQUIRED':status==='403'?'RESOURCE_CLOUD_FORBIDDEN':'RESOURCE_CLOUD_UNAVAILABLE';
  return new ResourceError(code,code==='RESOURCE_CLOUD_AUTH_REQUIRED'?'云端登录已失效，请重新登录':code==='RESOURCE_CLOUD_FORBIDDEN'?'当前账号无权读取此资源':'云端资源暂时不可用，重试记录已保留');
}
function result(response){if(response?.error)throw cloudError(response.error);return response?.data;}
async function download(client,key,max,expectedHash,expectedSize) {
  const blob=result(await client.storage.from(BUCKET).download(key));
  if(!blob || !Number.isSafeInteger(blob.size) || blob.size<1 || blob.size>max || (expectedSize!==undefined&&blob.size!==expectedSize))reject('RESOURCE_CLOUD_HASH_MISMATCH','云端资源大小不一致');
  const bytes=Buffer.from(await blob.arrayBuffer());
  if(bytes.length!==blob.size || (expectedHash&&hash(bytes)!==expectedHash))reject('RESOURCE_CLOUD_HASH_MISMATCH','云端资源哈希不一致');
  return bytes;
}
async function immutablePut(client,key,bytes,type) {
  const response=await client.storage.from(BUCKET).upload(key,bytes,{contentType:type,cacheControl:'0',upsert:false});
  if(response.error && !['409','Duplicate','23505'].includes(String(response.error.statusCode??response.error.code)))throw cloudError(response.error);
  // A duplicate is successful only when independently downloaded bytes match exactly.
  return download(client,key,Math.max(bytes.length,1),hash(bytes),bytes.length);
}
class ResourceCloudSync {
  constructor({service,getActor,getActorGeneration=()=>null,isEnabled=()=>true,onChanged=()=>{},now=()=>Date.now(),protocolFixture=false}) {
    this.service=service;this.db=service.repository.db;this.getActor=getActor;this.getActorGeneration=getActorGeneration;this.isEnabled=isEnabled;this.onChanged=onChanged;this.now=now;
    this.uploading=new Set();this.downloading=new Set();this.protocolFixture=protocolFixture;this.mode=protocolFixture?'simulated':'live';
    this.preferences=new (require('./cloud-preferences.cjs').ResourceCloudPreferences)(this);
  }
  owner(owner){this.service.owner(owner);return this.service.repository.ownerKeys(owner)[0];}
  async actor(owner,uid){const value=identity(await this.getActor(owner),owner,{allowProtocolFixture:this.protocolFixture});if(uid&&value.authUserId!==uid)reject('RESOURCE_CLOUD_IDENTITY_CHANGED','云端账号映射已变化，原重试记录已保留');return value;}
  status(inputOwner) {
    const owner=this.owner(inputOwner),stage="CASE WHEN status='verified' AND data_mode='live' AND authority_registered=0 THEN 'awaiting-authority' ELSE status END";
    const uploads=this.db.prepare(`SELECT ${stage} status,count(*) AS count FROM lingjing_resource_cloud_outbox WHERE owner_account_id=? AND data_mode=? GROUP BY 1`).all(owner,this.mode);
    const downloads=this.db.prepare(`SELECT ${stage} status,count(*) AS count FROM lingjing_resource_cloud_downloads WHERE owner_account_id=? AND data_mode=? GROUP BY 1`).all(owner,this.mode);
    const last=this.db.prepare("SELECT max(verified_at) AS at FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND data_mode=? AND (authority_action_id IS NOT NULL OR data_mode='simulated')").get(owner,this.mode);
    const storage=this.db.prepare('SELECT max(at) AS at FROM (SELECT verified_at at FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND data_mode=? UNION ALL SELECT storage_verified_at at FROM lingjing_resource_cloud_outbox WHERE owner_account_id=? AND data_mode=?)').get(owner,this.mode,owner,this.mode);
    const preferenceAt=this.db.prepare('SELECT max(verified_at) at FROM lingjing_resource_preference_state WHERE owner_account_id=?').get(owner).at;
    return {enabled:Boolean(this.isEnabled(owner)),uploads,downloads,lastVerifiedAt:last.at||null,lastStorageVerifiedAt:storage.at||null,preferenceUploads:this.preferences.status(owner),lastPreferenceVerifiedAt:preferenceAt||null,running:this.uploading.has(owner)||this.downloading.has(owner),dataMode:this.mode,bucket:BUCKET};
  }
  enqueue(inputOwner,actionId=randomUUID(),resourceIds) {
    const owner=this.owner(inputOwner);
    if(!UUID.test(actionId))reject('INVALID_REQUEST','同步操作编号无效');
    const keys=this.service.repository.ownerKeys(owner),marks=keys.map(()=>'?').join(',');
    const ids=resourceIds??this.db.prepare(`SELECT resource_id FROM lingjing_resources WHERE owner_account_id IN (${marks}) ORDER BY resource_id`).all(...keys).map(row=>row.resource_id);
    if(!Array.isArray(ids)||ids.length>1000||ids.some(id=>!UUID.test(id)))reject('INVALID_REQUEST','同步资源列表无效');
    const add=this.db.prepare("INSERT INTO lingjing_resource_cloud_outbox(owner_account_id,action_id,resource_id,created_at,data_mode) VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING");
    let queued=0;
    this.service.repository.transaction(()=>{for(const id of ids){
      const row=ownedRow(this.service,owner,id);
      if(!this.protocolFixture){
        const proofs=this.db.prepare("SELECT resource_id,auth_user_id,manifest_sha256 FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND resource_id=? AND content_hash=? AND data_mode='live' AND authority_action_id IS NOT NULL").all(owner,id,row.content_hash);
        const imports=this.db.prepare(`SELECT import_id FROM lingjing_resource_imports WHERE resource_id=? AND owner_account_id IN (${marks})`).all(id,...keys);
        if(proofs.some(proof=>{try{const manifest=this.referenceManifestLocal(owner,{resourceId:id,authUserId:proof.auth_user_id,manifestSha256:proof.manifest_sha256});return canonical(manifest.document)===canonical(JSON.parse(row.document_json))&&imports.every(item=>manifest.imports.some(original=>original.import_id===item.import_id));}catch{return false;}}))continue;
      }
      queued+=add.run(owner,actionId,id,new Date(this.now()).toISOString(),this.mode).changes;
    }});
    return {queued,actionId};
  }
  receipt(owner,manifest,digest,direction,authority) {
    this.db.prepare('INSERT INTO lingjing_resource_cloud_receipts(owner_account_id,resource_id,auth_user_id,manifest_sha256,content_hash,direction,verified_at,data_mode,authority_action_id,authority_revision,authority_checksum) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT DO UPDATE SET verified_at=excluded.verified_at,data_mode=excluded.data_mode,authority_action_id=excluded.authority_action_id,authority_revision=excluded.authority_revision,authority_checksum=excluded.authority_checksum').run(owner,manifest.resourceId,manifest.authUserId,digest,manifest.contentHash,direction,new Date(this.now()).toISOString(),this.mode,authority?.actionId??null,authority?.revision??null,authority?.checksum??null);
  }
  async verifyAuthority(owner,actor,row) {
    if(this.protocolFixture)return null;
    if(row.authority_action_id!==`resources:${row.resource_id}:${row.manifest_sha256}`||!Number.isSafeInteger(row.authority_revision)||row.authority_revision<1||!SHA.test(row.authority_checksum))reject('RESOURCE_AUTHORITY_REQUIRED','资源引用尚未完成服务端核验');
    const action=result(await actor.client.from('lingjing_save_actions').select('action_id,revision,checksum,kind').eq('owner_id',owner).eq('action_id',row.authority_action_id).maybeSingle());
    if(!action||action.kind!=='authority'||action.revision!==row.authority_revision||action.checksum!==row.authority_checksum)reject('RESOURCE_AUTHORITY_REQUIRED','资源与统一存档权威回执不一致');
    return {actionId:action.action_id,revision:action.revision,checksum:action.checksum};
  }
  async publishReference(owner,uid,id,digest) {
    if(this.protocolFixture)return null;
    const actor=await this.actor(owner,uid),body={op:'publish',resourceId:id,manifestSha256:digest};
    let published;
    if(typeof actor.invoke==='function')published=await actor.invoke('lingjing-resources',body);
    else {const response=result(await actor.client.functions.invoke('lingjing-resources',{body}));if(!response?.ok)reject('RESOURCE_CLOUD_UNAVAILABLE','资源服务端核验尚未完成');published=response.data;}
    if(published?.resourceId!==id||published.manifestSha256!==digest)reject('RESOURCE_AUTHORITY_REQUIRED','资源服务端核验回执无效');
    const current=await this.actor(owner,uid);
    const row=validateIndex(result(await current.client.from(REFERENCES).select(REFERENCE_FIELDS).eq('auth_user_id',uid).eq('resource_id',id).eq('manifest_sha256',digest).maybeSingle()),owner,uid);
    const receipt=await this.verifyAuthority(owner,current,row);
    if(receipt.actionId!==published.authorityActionId||receipt.revision!==published.revision||receipt.checksum!==published.checksum)reject('RESOURCE_AUTHORITY_REQUIRED','资源核验后的独立读回不一致');
    return receipt;
  }
  async uploadJob(owner,job) {
    let actor=await this.actor(owner,job.auth_user_id),manifest,digest,bytes,locations;
    if(!this.protocolFixture&&job.storage_verified&&job.manifest_json&&!job.authority_registered){
      manifest=JSON.parse(job.manifest_json);digest=job.manifest_sha256;validateManifest(manifest,{owner,uid:actor.authUserId,digest});
      const authority=await this.publishReference(owner,actor.authUserId,manifest.resourceId,digest);await this.actor(owner,actor.authUserId);
      this.receipt(owner,manifest,digest,'upload',authority);this.db.prepare("UPDATE lingjing_resource_cloud_outbox SET status='verified',verified_at=?,authority_registered=1,last_error=NULL,data_mode=? WHERE owner_account_id=? AND action_id=? AND resource_id=?").run(new Date(this.now()).toISOString(),this.mode,owner,job.action_id,job.resource_id);
      return {resourceId:manifest.resourceId,manifestSha256:digest,verified:true,authority,storageReused:true};
    }
    if(job.manifest_json) {
      manifest=JSON.parse(job.manifest_json);digest=job.manifest_sha256;
      bytes=validateManifest(manifest,{owner,uid:actor.authUserId,digest});
      const source=await sourceLocations(this.service,owner,job.resource_id);locations=source.locations;
      if(canonical(source.document)!==canonical(manifest.document))reject('RESOURCE_REFERENCE_CONFLICT','待同步资源已变化，原记录已保留');
    } else {
      ({manifest,digest,bytes,locations}=await buildPackage(this.service,owner,actor.authUserId,job.resource_id));
      this.db.prepare('UPDATE lingjing_resource_cloud_outbox SET auth_user_id=?,manifest_json=?,manifest_sha256=? WHERE owner_account_id=? AND action_id=? AND resource_id=?').run(actor.authUserId,bytes.toString('utf8'),digest,owner,job.action_id,job.resource_id);
    }
    for(const file of manifest.files) {
      const content=await readBounded(locations.get(file.key));
      if(content.length!==file.size||hash(content)!==file.sha256)reject('RESOURCE_CLOUD_HASH_MISMATCH','原始资源在重试期间已变化');
      for(const [index,chunk]of file.chunks.entries()) {
        actor=await this.actor(owner,manifest.authUserId);
        const part=content.subarray(index*CHUNK_BYTES,index*CHUNK_BYTES+chunk.size);
        await immutablePut(actor.client,chunkPath(actor.authUserId,manifest.resourceId,digest,file.sha256,index,chunk.sha256),part,'application/octet-stream');
      }
    }
    actor=await this.actor(owner,manifest.authUserId);
    const manifestKey=manifestPath(actor.authUserId,manifest.resourceId,digest);
    await immutablePut(actor.client,manifestKey,bytes,'application/json');
    const entry={auth_user_id:actor.authUserId,owner_account_id:owner,resource_id:manifest.resourceId,manifest_sha256:digest,content_hash:manifest.contentHash,manifest_path:manifestKey,manifest_bytes:bytes.length,total_bytes:manifest.totalBytes,resource_kind:manifest.archiveOnly?'model3d-archive':'spritesheet'};
    const select=()=>actor.client.from(TABLE).select(INDEX_FIELDS).eq('auth_user_id',actor.authUserId).eq('resource_id',manifest.resourceId).eq('manifest_sha256',digest).maybeSingle();
    let found=result(await select());
    if(!found){const written=await actor.client.from(TABLE).insert(entry);if(written.error&&written.error.code!=='23505')throw cloudError(written.error);}
    // Separate read request, not a returned INSERT representation.
    found=validateIndex(result(await select()),owner,actor.authUserId);
    if(Object.keys(entry).some(key=>entry[key]!==found[key]))reject('RESOURCE_CLOUD_HASH_MISMATCH','云端资源回执与本次包不一致');
    this.db.prepare('UPDATE lingjing_resource_cloud_outbox SET storage_verified=1,storage_verified_at=? WHERE owner_account_id=? AND action_id=? AND resource_id=?').run(new Date(this.now()).toISOString(),owner,job.action_id,job.resource_id);
    const authority=await this.publishReference(owner,actor.authUserId,manifest.resourceId,digest);
    await this.actor(owner,actor.authUserId);
    this.receipt(owner,manifest,digest,'upload',authority);
    this.db.prepare("UPDATE lingjing_resource_cloud_outbox SET status='verified',verified_at=?,last_error=NULL,data_mode=?,authority_registered=? WHERE owner_account_id=? AND action_id=? AND resource_id=?").run(new Date(this.now()).toISOString(),this.mode,this.protocolFixture?0:1,owner,job.action_id,job.resource_id);
    return {resourceId:manifest.resourceId,manifestSha256:digest,verified:true,archiveOnly:manifest.archiveOnly,...(authority?{authority}:{} )};
  }
  async flush(inputOwner,{force=false}={}) {
    const owner=this.owner(inputOwner);if(!this.isEnabled(owner))reject('SYNC_DISABLED','请先开启存档同步');
    if(this.uploading.has(owner))return {busy:true};this.uploading.add(owner);
    const verified=[],errors=[];
    try {
      const jobs=this.db.prepare("SELECT * FROM lingjing_resource_cloud_outbox WHERE owner_account_id=? AND (data_mode=? OR (?=1 AND data_mode='unverified')) AND (status IN ('pending','retry') OR (?=1 AND status='blocked') OR (status='verified' AND data_mode='live' AND authority_registered=0)) AND (next_attempt_at<=? OR ?=1) ORDER BY created_at,resource_id LIMIT 1000").all(owner,this.mode,force?1:0,force?1:0,this.now(),force?1:0);
      for(const job of jobs)try{verified.push(await this.uploadJob(owner,job));}catch(error){
        const safe=cloudError(error),retry=['RESOURCE_CLOUD_UNAVAILABLE','RESOURCE_CLOUD_AUTH_REQUIRED','RESOURCE_CLOUD_IDENTITY_CHANGED','RESOURCE_CLOUD_FORBIDDEN','SESSION_CHANGED'].includes(safe.code);
        this.db.prepare('UPDATE lingjing_resource_cloud_outbox SET status=?,attempts=attempts+1,next_attempt_at=?,last_error=? WHERE owner_account_id=? AND action_id=? AND resource_id=?').run(retry?'retry':'blocked',this.now()+Math.min(1800000,2000*2**Math.min(job.attempts+1,10)),safe.code,owner,job.action_id,job.resource_id);
        errors.push({resourceId:job.resource_id,code:safe.code});if(retry)break;
      }
      const preferences=await this.preferences.flush(owner,{force});
      return {verified,errors,preferences,pending:preferences.pending+this.status(owner).uploads.filter(row=>['pending','retry','blocked','awaiting-authority'].includes(row.status)).reduce((n,row)=>n+row.count,0)};
    } finally {this.uploading.delete(owner);}
  }
  async cachedChunk(owner,uid,manifest,digest,file,index,chunk) {
    await this.actor(owner,uid);
    const root=await fs.realpath(this.service.storageRoot),directory=path.join(root,'.cloud-transfer',uid,digest,file.sha256);
    if(!isWithin(root,directory))reject('UNSAFE_PATH','资源缓存路径越界');
    await fs.mkdir(directory,{recursive:true});
    if(await fs.realpath(directory)!==directory)reject('UNSAFE_PATH','资源缓存目录已变更');
    const filename=path.join(directory,`${index}-${chunk.sha256}.bin`);
    if((await fs.lstat(filename).catch(()=>null))?.isSymbolicLink())reject('UNSAFE_PATH','资源缓存文件已变更');
    const previous=await readBounded(filename,CHUNK_BYTES).catch(()=>null);
    if(previous&&previous.length===chunk.size&&hash(previous)===chunk.sha256)return previous;
    const actor=await this.actor(owner,uid);
    const bytes=await download(actor.client,chunkPath(uid,manifest.resourceId,digest,file.sha256,index,chunk.sha256),CHUNK_BYTES,chunk.sha256,chunk.size);
    const temp=filename+'.part-'+randomUUID();await fs.writeFile(temp,bytes,{flag:'wx'});await fs.rename(temp,filename);
    return bytes;
  }
  async downloadEntry(owner,actor,row) {
    validateIndex(row,owner,actor.authUserId);
    const authority=await this.verifyAuthority(owner,actor,row);
    const identityArgs=[owner,row.resource_id,actor.authUserId,row.manifest_sha256];
    this.db.prepare('INSERT INTO lingjing_resource_cloud_downloads(owner_account_id,resource_id,auth_user_id,manifest_sha256,directory,data_mode) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING').run(...identityArgs,'restore-'+randomUUID(),this.mode);
    const job=this.db.prepare('SELECT * FROM lingjing_resource_cloud_downloads WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=?').get(...identityArgs);
    if(![this.mode,'unverified'].includes(job.data_mode))reject('RESOURCE_CLOUD_MODE_MISMATCH','模拟与真实资源传输记录不可混用');
    try {
      let manifest;
      if(job.manifest_json)manifest=JSON.parse(job.manifest_json);
      else {
        const bytes=await download(actor.client,row.manifest_path,MANIFEST_BYTES,row.manifest_sha256,row.manifest_bytes);
        try{manifest=JSON.parse(bytes.toString('utf8'));}catch{reject('RESOURCE_CLOUD_INVALID','云端 manifest 格式无效');}
      }
      const manifestBytes=validateManifest(manifest,{owner,uid:actor.authUserId,digest:row.manifest_sha256});
      if(manifest.resourceId!==row.resource_id||manifest.contentHash!==row.content_hash||manifest.totalBytes!==row.total_bytes||manifestBytes.length!==row.manifest_bytes||row.resource_kind!==(manifest.archiveOnly?'model3d-archive':'spritesheet'))reject('RESOURCE_CLOUD_HASH_MISMATCH','资源索引与 manifest 不一致');
      this.db.prepare('UPDATE lingjing_resource_cloud_downloads SET manifest_json=? WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=?').run(manifestBytes.toString('utf8'),...identityArgs);
      assertRestoreOwnership(this.service,owner,manifest);
      let restored;
      if(await localMatches(this.service,owner,manifest)) {
        await this.actor(owner,actor.authUserId);
        this.service.repository.transaction(()=>{
          const add=this.db.prepare('INSERT INTO lingjing_resource_imports(import_id,resource_id,owner_account_id,source_filename,provenance_json,imported_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING');
          for(const receipt of manifest.imports)add.run(receipt.import_id,receipt.resource_id,owner,receipt.source_filename,receipt.provenance_json,receipt.imported_at);
        });restored={resourceId:manifest.resourceId,unchanged:true,archiveOnly:manifest.archiveOnly};
      } else restored=await hydratePackage(this.service,owner,manifest,{directory:job.directory,readChunk:(file,index,chunk)=>this.cachedChunk(owner,actor.authUserId,manifest,row.manifest_sha256,file,index,chunk),beforeApply:()=>this.actor(owner,actor.authUserId)});
      await this.actor(owner,actor.authUserId);
      this.receipt(owner,manifest,row.manifest_sha256,'download',authority);
      this.db.prepare("UPDATE lingjing_resource_cloud_downloads SET status='verified',last_error=NULL,verified_at=?,data_mode=?,authority_registered=? WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=?").run(new Date(this.now()).toISOString(),this.mode,this.protocolFixture?0:1,...identityArgs);
      this.onChanged(owner,manifest.resourceId);return {...restored,manifestSha256:row.manifest_sha256,verified:true};
    }catch(error){const safe=cloudError(error);this.db.prepare("UPDATE lingjing_resource_cloud_downloads SET status='retry',last_error=? WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=?").run(safe.code,...identityArgs);throw safe;}
  }
  async pull(inputOwner,{offset=0,limit=100,resourceIds}={}) {
    const owner=this.owner(inputOwner);if(!this.isEnabled(owner))reject('SYNC_DISABLED','请先开启存档同步');
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100||(resourceIds&&(!Array.isArray(resourceIds)||resourceIds.length>100||resourceIds.some(id=>!UUID.test(id)))))reject('INVALID_REQUEST','资源恢复分页无效');
    if(this.downloading.has(owner))return {busy:true};this.downloading.add(owner);
    try {
      const actor=await this.actor(owner);
      let query=actor.client.from(this.protocolFixture?TABLE:REFERENCES).select(this.protocolFixture?INDEX_FIELDS:REFERENCE_FIELDS).eq('auth_user_id',actor.authUserId).eq('owner_account_id',owner).order('created_at',{ascending:true}).order('resource_id',{ascending:true}).order('manifest_sha256',{ascending:true}).range(offset,offset+limit-1);
      if(resourceIds)query=query.in('resource_id',resourceIds);
      const rows=result(await query);if(!Array.isArray(rows)||rows.length>limit)reject('RESOURCE_CLOUD_INVALID','云端资源列表格式无效');
      const restored=[];
      for(const row of rows){await this.actor(owner,actor.authUserId);restored.push(await this.downloadEntry(owner,actor,row));}
      await this.preferences.pull(owner);
      return {restored,nextOffset:rows.length===limit?offset+limit:null};
    } finally {this.downloading.delete(owner);}
  }
  async synchronize(owner,{actionId=randomUUID()}={}) {
    this.enqueue(owner,actionId);const upload=await this.flush(owner);let offset=0;const restored=[];
    do{const batch=await this.pull(owner,{offset});if(batch.busy)return {upload,busy:true};restored.push(...batch.restored);offset=batch.nextOffset;}while(offset!==null);
    return {upload,restored};
  }
  async referenceSnapshot(inputOwner,{includePreferences=true}={}) {
    const owner=this.owner(inputOwner),actor=await this.actor(owner);if(this.protocolFixture)reject('RESOURCE_AUTHORITY_REQUIRED','模拟场景没有真实权威资源引用');
    const rows=result(await actor.client.from(REFERENCES).select(REFERENCE_FIELDS).eq('auth_user_id',actor.authUserId).eq('owner_account_id',owner).order('resource_id').order('manifest_sha256').limit(10000));
    if(!Array.isArray(rows)||rows.length===10000)reject('RESOURCE_CLOUD_INVALID','资源引用数量超过一次恢复范围');
    for(const row of rows){validateIndex(row,owner,actor.authUserId);await this.verifyAuthority(owner,actor,row);}
    const preferences=includePreferences?await this.preferences.remoteSnapshot(owner):[];
    return {version:2,data:{format:'lingjing-resource-references',ownerAccountId:owner,references:rows.map(row=>({authUserId:row.auth_user_id,resourceId:row.resource_id,manifestSha256:row.manifest_sha256,contentHash:row.content_hash,manifestPath:row.manifest_path,manifestBytes:row.manifest_bytes,totalBytes:row.total_bytes,kind:row.resource_kind})),preferences}};
  }
  referenceManifestLocal(inputOwner,reference) {
    const owner=this.owner(inputOwner),args=[owner,reference.resourceId,reference.authUserId,reference.manifestSha256];
    const cached=this.db.prepare('SELECT manifest_json FROM lingjing_resource_cloud_downloads WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=? AND data_mode=\'live\' AND authority_registered=1 UNION ALL SELECT manifest_json FROM lingjing_resource_cloud_outbox WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=? AND data_mode=\'live\' AND authority_registered=1 LIMIT 1').get(...args,...args);
    if(!cached?.manifest_json)reject('RESOURCE_AUTHORITY_REQUIRED','资源的已核验 manifest 缓存缺失');
    const manifest=JSON.parse(cached.manifest_json);validateManifest(manifest,{owner,uid:reference.authUserId,digest:reference.manifestSha256});return manifest;
  }
  referenceSnapshotLocal(inputOwner) {
    const owner=this.owner(inputOwner);
    const rows=this.db.prepare("SELECT DISTINCT resource_id,auth_user_id,manifest_sha256,content_hash FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND data_mode='live' AND authority_action_id IS NOT NULL AND authority_revision>0 AND length(authority_checksum)=64 ORDER BY resource_id,manifest_sha256").all(owner);
    const references=rows.map(row=>{
      const reference={authUserId:row.auth_user_id,resourceId:row.resource_id,manifestSha256:row.manifest_sha256,contentHash:row.content_hash};
      const manifest=this.referenceManifestLocal(owner,reference),bytes=Buffer.from(canonical(manifest));
      if(manifest.contentHash!==row.content_hash)reject('RESOURCE_AUTHORITY_REQUIRED','资源回执与本机 manifest 不一致');
      return {...reference,manifestPath:manifestPath(row.auth_user_id,row.resource_id,row.manifest_sha256),manifestBytes:bytes.length,totalBytes:manifest.totalBytes,kind:manifest.archiveOnly?'model3d-archive':'spritesheet'};
    });
    return {version:2,data:{format:'lingjing-resource-references',ownerAccountId:owner,references,preferences:this.preferences.snapshot(owner)}};
  }
  async hydrateReferences(inputOwner,snapshot) {
    const owner=this.owner(inputOwner);
    if(snapshot?.version!==2||snapshot.data?.format!=='lingjing-resource-references'||snapshot.data.ownerAccountId!==owner||!Array.isArray(snapshot.data.references)||snapshot.data.references.length>10000)reject('RESOURCE_AUTHORITY_REQUIRED','资源引用存档格式或归属无效');
    const expected=await this.referenceSnapshot(owner,{includePreferences:false}),trusted=new Map(expected.data.references.map(row=>[row.resourceId+':'+row.manifestSha256,row]));
    for(const row of snapshot.data.references)if(canonical(trusted.get(row.resourceId+':'+row.manifestSha256))!==canonical(row))reject('RESOURCE_AUTHORITY_REQUIRED','客户端不能声明未核验的资源引用');
    const actor=await this.actor(owner),restored=[];
    for(const reference of snapshot.data.references){const row=validateIndex(result(await actor.client.from(REFERENCES).select(REFERENCE_FIELDS).eq('auth_user_id',actor.authUserId).eq('resource_id',reference.resourceId).eq('manifest_sha256',reference.manifestSha256).maybeSingle()),owner,actor.authUserId);restored.push(await this.downloadEntry(owner,actor,row));}
    await this.preferences.prepare(owner,snapshot.data.preferences||[]);
    return {restored};
  }
}
module.exports={ResourceCloudSync,download,immutablePut,cloudError,INDEX_FIELDS,REFERENCE_FIELDS};
