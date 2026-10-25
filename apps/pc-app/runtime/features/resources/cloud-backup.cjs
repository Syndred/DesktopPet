const { canonical, validateIndex, noCredentials, reject } = require('./cloud-contract.cjs');
const { ownedRow } = require('./cloud-packages.cjs');
const {normalized}=require('./cloud-preferences.cjs');
const catalog=require('./assets/roster-v2/catalog.json');

const CLOUD_TABLES=['lingjing_resource_cloud_outbox','lingjing_resource_cloud_downloads','lingjing_resource_cloud_receipts','lingjing_resource_preference_outbox','lingjing_resource_preference_state','lingjing_resource_preference_cache'];
function validateReferences(data,owner){
  if(!data||data.format!=='lingjing-resource-references'||data.ownerAccountId!==owner||!Array.isArray(data.references)||data.references.length>10000
    ||!['format,ownerAccountId,references','format,ownerAccountId,preferences,references'].includes(Object.keys(data).sort().join(',')))reject('RESOURCE_AUTHORITY_REQUIRED','资源引用存档归属或格式无效');
  noCredentials(data);const seen=new Set();
  for(const row of data.references){
    if(!row||Object.keys(row).sort().join(',')!=='authUserId,contentHash,kind,manifestBytes,manifestPath,manifestSha256,resourceId,totalBytes')reject('RESOURCE_AUTHORITY_REQUIRED','资源引用字段无效');
    validateIndex({auth_user_id:row.authUserId,owner_account_id:owner,resource_id:row.resourceId,manifest_sha256:row.manifestSha256,content_hash:row.contentHash,
      manifest_path:row.manifestPath,manifest_bytes:row.manifestBytes,total_bytes:row.totalBytes,resource_kind:row.kind},owner,row.authUserId);
    const key=row.resourceId+':'+row.manifestSha256;if(seen.has(key))reject('RESOURCE_AUTHORITY_REQUIRED','资源引用重复');seen.add(key);
  }
  if(data.preferences!==undefined){
    if(!Array.isArray(data.preferences)||data.preferences.length>1000)reject('RESOURCE_PREFERENCE_INVALID','角色偏好列表无效');
    const ids=new Set();for(const pref of data.preferences){
      if(!pref||Object.keys(pref).sort().join(',')!=='actions,calibration,resourceId,revision'||ids.has(pref.resourceId)||!Number.isSafeInteger(pref.revision)||pref.revision<1
        ||(!data.references.some(row=>row.resourceId===pref.resourceId)&&!catalog.characters.some(row=>row.resourceId===pref.resourceId)))reject('RESOURCE_PREFERENCE_INVALID','角色偏好实例、版本或字段无效');
      normalized({calibration:pref.calibration,actions:pref.actions},{clips:Object.values(pref.actions||{}).filter(value=>typeof value==='string').map(name=>({name}))});ids.add(pref.resourceId);
    }
  }
  return data;
}
/** Local backup v1 keeps its original bytes/history/preferences. Cloud v2 only
 * names already server-verified private objects and never imports proof rows. */
function attachCloudBackup(adapter,services){
  const service=services.get('resources'),db=services.db;
  const cloud=()=>services.get('resourceCloud')||service.cloud;
  const isCloud=data=>data?.format==='lingjing-resource-references';
  return {...adapter,versions:[1,2],tables:[...adapter.tables,...CLOUD_TABLES],
    validate(data,owner){if(isCloud(data))validateReferences(data,owner);else adapter.validate(data,owner);},
    validateModule(module,owner){
      if((module.version===2)!==isCloud(module.data))reject('RESOURCE_AUTHORITY_REQUIRED','资源备份模块版本与内容不一致');
      if(module.version===2)validateReferences(module.data,owner);else adapter.validate(module.data,owner);
    },
    async prepareCloud(owner,module){
      if(module?.version!==2)return;
      validateReferences(module.data,owner);
      if(!cloud()?.hydrateReferences)reject('RESOURCE_AUTHORITY_REQUIRED','资源云端恢复服务尚未就绪');
      return cloud().hydrateReferences(owner,module);
    },
    restore(owner,data,mode){
      if(!isCloud(data))return adapter.restore(owner,data,mode);
      validateReferences(data,owner);
      // The asynchronous real-provider hydration must finish before the common
      // synchronous save transaction can apply companions or any dependent row.
      for(const reference of data.references){
        const row=ownedRow(service,owner,reference.resourceId);
        const proof=db.prepare("SELECT 1 FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=? AND content_hash=? AND data_mode='live' AND authority_action_id=? AND authority_revision>0 AND length(authority_checksum)=64").get(owner,reference.resourceId,reference.authUserId,reference.manifestSha256,reference.contentHash,`resources:${reference.resourceId}:${reference.manifestSha256}`);
        if(row.content_hash!==reference.contentHash||!proof)reject('RESOURCE_AUTHORITY_REQUIRED','资源文件尚未通过真实云端核验，请重新预览云端存档');
      }
      if(data.preferences?.length){if(!cloud()?.preferences)reject('RESOURCE_AUTHORITY_REQUIRED','角色偏好云端恢复服务尚未就绪');cloud().preferences.restore(owner,data.preferences,mode);}
      return {restored:true,resourceReferences:data.references.length};
    },
    cloudModule(owner,module){
      if(module?.version===2){validateReferences(module.data,owner);return {...module,data:{...module.data,preferences:module.data.preferences||[]}};}
      if(module?.version!==1||!cloud()?.referenceSnapshotLocal)return module;
      const local=cloud().referenceSnapshotLocal(owner);
      // Unpublished imports or changed local document/preferences remain in the
      // unverified original snapshot instead of being silently called complete.
      for(const row of module.data.preferences||[]){
        const current=service.getRecord(owner,row.resource_id),document=normalized({calibration:JSON.parse(row.calibration_json),actions:JSON.parse(row.actions_json)},current);
        if(!local.data.preferences?.some(pref=>pref.resourceId===current.id&&canonical({calibration:pref.calibration,actions:pref.actions})===canonical(document)))return module;
      }
      for(const resource of module.data.resources||[]){
        const document=JSON.parse(resource.row.document_json);
        if(!local.data.references.some(ref=>ref.resourceId===document.id&&ref.contentHash===document.contentHash&&canonical(cloud().referenceManifestLocal(owner,ref).document)===canonical(document)))return module;
      }
      for(const imported of module.data.imports||[])if(!local.data.references.some(ref=>ref.resourceId===imported.resource_id&&cloud().referenceManifestLocal(owner,ref).imports.some(row=>{const original={...row};delete original.source_owner_account_id;return canonical(original)===canonical(imported);})))return module;
      return local;
    },
  };
}
module.exports={attachCloudBackup,validateReferences,CLOUD_TABLES};
