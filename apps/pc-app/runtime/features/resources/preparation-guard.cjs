const fs=require('node:fs');const path=require('node:path');
const {canonical,hash,reject}=require('./cloud-contract.cjs');
const {safeRelative}=require('./parser.cjs');
const changed=()=>reject('SAVE_CHANGED','资源准备期间本机内容已变化，原数据已保留，请重新核对。');
const equal=(a,b)=>canonical(a)===canonical(b);
const importsOf=(manifest,owner)=>manifest.imports.map(row=>({import_id:row.import_id,resource_id:row.resource_id,owner_account_id:owner,
 source_filename:row.source_filename,provenance_json:row.provenance_json,imported_at:row.imported_at}));

/** Main-only admission of exact verified resource deltas, never a module-wide
 * fingerprint exemption. Cached manifests are checked by07's production reader. */
function resourcePreparationGuard({service,db,cloud,validateReferences}){
 const parts=(module,owner)=>{
  if(!module)return{references:[],preferences:[]};
  if(module.version===2){validateReferences(module.data,owner);return{...module.data,preferences:module.data.preferences||[]};}
  if(module.version===1&&module.data?.ownerAccountId===owner&&['resources','imports','preferences'].every(key=>module.data[key]?.length===0))return{references:[],preferences:[]};
  changed();
 };
 const noPending=owner=>{
  if(db.prepare("SELECT 1 FROM lingjing_resource_cloud_outbox WHERE owner_account_id=? AND (status IN ('pending','retry','blocked') OR (status='verified' AND authority_registered=0)) LIMIT 1").get(owner)
   ||db.prepare("SELECT 1 FROM lingjing_resource_preference_outbox WHERE owner_account_id=? AND status IN ('pending','retry','conflict') LIMIT 1").get(owner))changed();
 };
 const hasReceipt=(owner,reference)=>db.prepare("SELECT 1 FROM lingjing_resource_cloud_receipts WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=? AND content_hash=? AND data_mode='live' AND authority_action_id=? AND authority_revision>0 AND length(authority_checksum)=64")
   .get(owner,reference.resourceId,reference.authUserId,reference.manifestSha256,reference.contentHash,`resources:${reference.resourceId}:${reference.manifestSha256}`);
 const trusted=(owner,reference)=>{
  if(!hasReceipt(owner,reference)||!cloud()?.referenceManifestLocal)changed();
  const manifest=cloud().referenceManifestLocal(owner,reference);
  if(manifest.resourceId!==reference.resourceId||manifest.contentHash!==reference.contentHash||manifest.totalBytes!==reference.totalBytes
   ||Buffer.byteLength(canonical(manifest))!==reference.manifestBytes)changed();
  return manifest;
 };
 const resourceMatches=(resource,manifest,owner)=>{
  const row=resource.row,expected={resource_id:manifest.resourceId,owner_account_id:owner,content_hash:manifest.contentHash,
   document_json:JSON.stringify(manifest.document),revision:1,created_at:manifest.document.importedAt};
  const {document_json,...metadata}=row,{document_json:discard,...expectedMetadata}=expected;
  // Native imports preserve original JSON property order; transmitted manifests
  // are canonical. Compare their meaning without ever rewriting the old row.
  let document;try{document=JSON.parse(document_json);}catch{return false;}
  if(!equal(metadata,expectedMetadata)||!equal(document,manifest.document)||resource.files.length!==manifest.files.length)return false;
  return resource.files.every(file=>{const expected=manifest.files.find(item=>item.key===file.key),bytes=Buffer.from(file.bytes,'base64');
   return expected&&file.sha256===expected.sha256&&bytes.length===expected.size&&hash(bytes)===expected.sha256;});
 };
 const snapshotFiles=owner=>db.prepare(`SELECT f.resource_id,f.asset_key,f.file_path FROM lingjing_resource_files f
   JOIN lingjing_resources r ON r.resource_id=f.resource_id WHERE r.owner_account_id=? ORDER BY f.resource_id,f.asset_key`).all(owner);
 const plans=(owner,references)=>{
  const result=new Map();
  for(const ref of references){
   // Not every incoming reference has been downloaded yet. A plan is trusted
   // only when the actual07 receipt/cache exists; absence admits no local row.
   if(!db.prepare('SELECT 1 FROM lingjing_resources WHERE resource_id=? AND owner_account_id=?').get(ref.resourceId,owner)||!hasReceipt(owner,ref))continue;
   const manifest=trusted(owner,ref),list=result.get(ref.resourceId)||[];list.push({ref,manifest});result.set(ref.resourceId,list);
  }return result;
 };
 const verifyRows=(data,owner,allowed,required={references:[],preferences:[]})=>{
  noPending(owner);if(data?.ownerAccountId!==owner)changed();
  const knownImports=new Map(),requiredImports=new Map();
  for(const entries of allowed.values())for(const {manifest}of entries)for(const row of importsOf(manifest,owner))knownImports.set(row.import_id,row);
  for(const ref of required.references){const manifest=trusted(owner,ref);if(!data.resources.some(item=>item.row.resource_id===ref.resourceId))changed();for(const row of importsOf(manifest,owner))requiredImports.set(row.import_id,row);}
  for(const resource of data.resources)if(!allowed.get(resource.row.resource_id)?.some(item=>resourceMatches(resource,item.manifest,owner)))changed();
  for(const row of data.imports)if(!equal(row,knownImports.get(row.import_id)))changed();
  for(const[id,row]of requiredImports)if(!data.imports.some(item=>item.import_id===id&&equal(item,row)))changed();
 };
 return{
  capture(owner,before){
   const beforeFiles=snapshotFiles(owner);
   return(expected,after)=>{
    if(expected?.version!==2)return equal(before,after);
    const target=parts(expected,owner);if(before?.version!==1||after?.version!==1)changed();
    noPending(owner);
    if(!equal({...after,data:{...after.data,resources:before.data.resources,imports:before.data.imports}},before))changed();
    const beforeResources=new Map(before.data.resources.map(row=>[row.row.resource_id,row]));
    for(const[id,row]of beforeResources)if(!after.data.resources.some(item=>item.row.resource_id===id&&equal(item,row)))changed();
    const beforeImports=new Map(before.data.imports.map(row=>[row.import_id,row]));
    for(const[id,row]of beforeImports)if(!after.data.imports.some(item=>item.import_id===id&&equal(item,row)))changed();
    const allowed=plans(owner,target.references);
    const newResources=after.data.resources.filter(row=>!beforeResources.has(row.row.resource_id));
    const newImports=after.data.imports.filter(row=>!beforeImports.has(row.import_id));
    verifyRows({ownerAccountId:owner,resources:newResources,imports:newImports},owner,allowed);
    const currentFiles=snapshotFiles(owner),previousFiles=new Map(beforeFiles.map(row=>[row.resource_id+'\0'+row.asset_key,row]));
    for(const previous of beforeFiles)if(!currentFiles.some(row=>row.resource_id===previous.resource_id&&row.asset_key===previous.asset_key))changed();
    for(const row of currentFiles){
     const previous=previousFiles.get(row.resource_id+'\0'+row.asset_key);if(previous&&equal(previous,row))continue;
     const accepted=allowed.get(row.resource_id)?.some(({ref,manifest})=>{
      const file=manifest.files.find(file=>file.key===row.asset_key);
      const job=db.prepare("SELECT directory FROM lingjing_resource_cloud_downloads WHERE owner_account_id=? AND resource_id=? AND auth_user_id=? AND manifest_sha256=? AND status='verified' AND data_mode='live' AND authority_registered=1")
       .get(owner,row.resource_id,ref.authUserId,ref.manifestSha256);
      if(!file||!/^restore-[0-9a-f-]{36}$/i.test(job?.directory||''))return false;
      return row.file_path===path.resolve(fs.realpathSync.native(service.storageRoot),job.directory,safeRelative(file.key));
     });if(!accepted)changed();
    }
    return true;
   };
  },
  baseline(owner,baseline,expected,current){
   const prior=parts(baseline,owner),target=parts(expected,owner);if(current?.version!==1)changed();
   const allowed=plans(owner,[...prior.references,...target.references]);verifyRows(current.data,owner,allowed,prior);
   const preferences=[...prior.preferences,...target.preferences];
   for(const row of current.data.preferences){
    const state=db.prepare('SELECT * FROM lingjing_resource_preference_state WHERE owner_account_id=? AND resource_id=?').get(owner,row.resource_id);
    const value={calibration:JSON.parse(row.calibration_json),actions:JSON.parse(row.actions_json)};
    const cached=state&&db.prepare('SELECT * FROM lingjing_resource_preference_cache WHERE owner_account_id=? AND resource_id=? AND cloud_revision=?').get(owner,row.resource_id,state.cloud_revision);
    if(!state||state.local_revision!==row.revision||state.document_json!==canonical(value)
     ||!/^resource-pref:[0-9a-f-]{36}$/.test(state.authority_action_id)||state.authority_revision<1||! /^[0-9a-f]{64}$/.test(state.authority_checksum)
     ||!cached||cached.document_json!==state.document_json||cached.authority_action_id!==state.authority_action_id||cached.authority_revision!==state.authority_revision||cached.authority_checksum!==state.authority_checksum
     ||!preferences.some(pref=>pref.resourceId===row.resource_id&&pref.revision===state.cloud_revision&&equal({calibration:pref.calibration,actions:pref.actions},value)))changed();
   }
   for(const pref of prior.preferences)if(!current.data.preferences.some(row=>row.resource_id===pref.resourceId))changed();
   return true;
  }
 };
}
module.exports={resourcePreparationGuard};
