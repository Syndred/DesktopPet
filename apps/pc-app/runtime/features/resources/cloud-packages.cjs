const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { parseCharacterFile, safeRelative, isWithin, readBounded, parseJson, LIMITS, calibrations, actionMap } = require('./parser.cjs');
const { historicalFile, validateHistoricalFiles } = require('./history.cjs');
const { CHUNK_BYTES, UUID, hash, canonical, noCredentials, validateManifest, reject } = require('./cloud-contract.cjs');

function ownedRow(service, owner, resourceId) {
  service.repository.get(owner,resourceId);
  const row=service.repository.db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(resourceId);
  if (!row || !service.repository.ownerKeys(owner).includes(row.owner_account_id)) reject('RESOURCE_CLOUD_PRIVATE_ONLY','仅同步当前账号的导入资源');
  return row;
}
async function sourceLocations(service, owner, resourceId) {
  const row=ownedRow(service,owner,resourceId), document=JSON.parse(row.document_json), locations=new Map();
  if (!UUID.test(resourceId) || !['spritesheet','model3d'].includes(document.kind)) reject('RESOURCE_CLOUD_INVALID','历史资源编号或类型不兼容');
  for (const file of service.repository.files(owner,resourceId)) locations.set(file.asset_key,await (document.kind==='model3d'?historicalFile(service,owner,resourceId,file.asset_key):service.assetFile(owner,resourceId,file.asset_key)));
  return {row,document,locations};
}
async function packageHash(locations) {
  const digest=createHash('sha256');
  for (const [key,filename] of [...locations].sort(([a],[b])=>a.localeCompare(b))) {
    digest.update(key).update('\0');
    for await (const bytes of createReadStream(filename)) digest.update(bytes);
  }
  return digest.digest('hex');
}
async function validatePayload(manifest, locations) {
  if (await packageHash(locations)!==manifest.contentHash) reject('RESOURCE_CLOUD_HASH_MISMATCH','资源包内容与原始哈希不一致');
  if (manifest.archiveOnly) return validateHistoricalFiles(manifest.document,locations);
  const parsed=await parseCharacterFile(locations.get(manifest.descriptorKey));
  if (parsed.resource.contentHash!==manifest.contentHash || parsed.files.size!==locations.size || [...parsed.files.keys()].some(key=>!locations.has(key))) reject('RESOURCE_CLOUD_HASH_MISMATCH','资源包文件集合不一致');
  for (const key of ['kind','entryAsset','sheet','atlas','clips']) if (canonical(parsed.resource[key])!==canonical(manifest.document[key])) reject('RESOURCE_CLOUD_INVALID','资源描述与安全解析结果不一致');
  calibrations(manifest.document.calibration); actionMap(manifest.document.actions,parsed.resource.clips,true);
}
async function buildPackage(service, owner, uid, resourceId) {
  const {row,document,locations}=await sourceLocations(service,owner,resourceId);
  noCredentials(document);
  const files=[]; let totalBytes=0;
  for (const [key,filename] of [...locations].sort(([a],[b])=>a.localeCompare(b))) {
    const bytes=await readBounded(filename,/\.json$/i.test(key)?LIMITS.json:LIMITS.file);
    if (/\.(json|gltf)$/i.test(key)) noCredentials(parseJson(bytes));
    totalBytes+=bytes.length;
    if (totalBytes>LIMITS.total) reject('RESOURCE_CLOUD_TOO_LARGE','资源包超过同步容量');
    const chunks=[];
    for(let start=0;start<bytes.length;start+=CHUNK_BYTES){const part=bytes.subarray(start,start+CHUNK_BYTES);chunks.push({sha256:hash(part),size:part.length});}
    files.push({key,size:bytes.length,sha256:hash(bytes),chunks});
  }
  const keys=service.repository.ownerKeys(owner), placeholders=keys.map(()=>'?').join(',');
  const imports=service.repository.db.prepare(`SELECT * FROM lingjing_resource_imports WHERE resource_id=? AND owner_account_id IN (${placeholders}) ORDER BY import_id`).all(resourceId,...keys).map(receipt=>({...receipt,source_owner_account_id:receipt.owner_account_id,owner_account_id:owner}));
  const manifest={format:'lingjing.resource-package',version:1,ownerAccountId:owner,sourceOwnerAccountId:row.owner_account_id,authUserId:uid,resourceId,contentHash:row.content_hash,document,archiveOnly:document.kind==='model3d',
    descriptorKey:document.kind==='spritesheet'?files.find(file=>/\.json$/i.test(file.key))?.key:null,files,totalBytes,imports};
  const bytes=validateManifest(manifest,{owner,uid});
  await validatePayload(manifest,locations);
  return {manifest,bytes,digest:hash(bytes),locations};
}
function assertRestoreOwnership(service,owner,manifest) {
  const existing=service.repository.db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(manifest.resourceId);
  if (existing && (!service.repository.ownerKeys(owner).includes(existing.owner_account_id) || existing.content_hash!==manifest.contentHash || canonical(JSON.parse(existing.document_json))!==canonical(manifest.document))) reject('RESOURCE_REFERENCE_CONFLICT','已有资源编号对应不同账号或内容，保留现有记录');
  for(const receipt of manifest.imports){
    const prior=service.repository.db.prepare('SELECT * FROM lingjing_resource_imports WHERE import_id=?').get(receipt.import_id);
    if(prior && (!service.repository.ownerKeys(owner).includes(prior.owner_account_id) || prior.resource_id!==manifest.resourceId || ['source_filename','provenance_json','imported_at'].some(key=>prior[key]!==receipt[key]))) reject('RESOURCE_REFERENCE_CONFLICT','已有导入流水与云端不一致，保留现有历史');
  }
  return existing;
}
async function localMatches(service,owner,manifest) {
  try {
    const {locations}=await sourceLocations(service,owner,manifest.resourceId);
    if(locations.size!==manifest.files.length)return false;
    for(const file of manifest.files){const name=locations.get(file.key);if(!name)return false;const bytes=await readBounded(name);if(bytes.length!==file.size || hash(bytes)!==file.sha256)return false;}
    return true;
  } catch { return false; }
}
async function hydratePackage(service,owner,manifest,{directory,readChunk,beforeApply}) {
  const existing=assertRestoreOwnership(service,owner,manifest);
  if (!/^restore-[0-9a-f-]{36}$/i.test(directory)) reject('RESOURCE_CLOUD_INVALID','资源恢复目录无效');
  const root=await fs.realpath(service.storageRoot), target=path.resolve(root,directory);
  if(!isWithin(root,target))reject('UNSAFE_PATH','资源恢复目录越界');
  await fs.mkdir(target,{recursive:true});
  if(await fs.realpath(target)!==target)reject('UNSAFE_PATH','资源恢复目录存在路径替换');
  const locations=new Map();
  for(const file of manifest.files) {
    const destination=path.resolve(target,safeRelative(file.key));
    if(!isWithin(target,destination))reject('UNSAFE_PATH','资源文件路径越界');
    await fs.mkdir(path.dirname(destination),{recursive:true});
    const actualParent=await fs.realpath(path.dirname(destination));
    if(actualParent!==target&&!isWithin(target,actualParent))reject('UNSAFE_PATH','资源恢复路径已变更');
    if((await fs.lstat(destination).catch(()=>null))?.isSymbolicLink())reject('UNSAFE_PATH','资源恢复文件存在路径替换');
    const previous=await readBounded(destination,file.size).catch(()=>null);
    if(previous && previous.length===file.size && hash(previous)===file.sha256){locations.set(file.key,destination);continue;}
    const temp=destination+'.part-'+randomUUID(), handle=await fs.open(temp,'wx'), digest=createHash('sha256');
    try {
      for(const [index,chunk] of file.chunks.entries()) {
        const bytes=await readChunk(file,index,chunk);
        if(bytes.length!==chunk.size || hash(bytes)!==chunk.sha256)reject('RESOURCE_CLOUD_HASH_MISMATCH','资源下载分块校验失败');
        digest.update(bytes); await handle.writeFile(bytes);
      }
      await handle.sync();
    } finally { await handle.close(); }
    if(digest.digest('hex')!==file.sha256)reject('RESOURCE_CLOUD_HASH_MISMATCH','资源下载文件校验失败');
    // Only this allocated restore directory is replaced; existing registered user files are untouched.
    await fs.rename(temp,destination); locations.set(file.key,destination);
  }
  await validatePayload(manifest,locations);
  await beforeApply();
  service.repository.transaction(()=>{
    assertRestoreOwnership(service,owner,manifest);
    if(!existing) service.repository.insert(owner,manifest.document,[...locations]);
    else {
      // A missing/corrupt managed copy is repaired by updating the registry, preserving its old bytes.
      const set=service.repository.db.prepare('INSERT INTO lingjing_resource_files(resource_id,asset_key,file_path) VALUES(?,?,?) ON CONFLICT(resource_id,asset_key) DO UPDATE SET file_path=excluded.file_path');
      for(const [key,filename]of locations)set.run(manifest.resourceId,key,filename);
    }
    const add=service.repository.db.prepare('INSERT INTO lingjing_resource_imports(import_id,resource_id,owner_account_id,source_filename,provenance_json,imported_at) VALUES(?,?,?,?,?,?) ON CONFLICT(import_id) DO NOTHING');
    for(const receipt of manifest.imports)add.run(receipt.import_id,receipt.resource_id,owner,receipt.source_filename,receipt.provenance_json,receipt.imported_at);
  });
  return {resourceId:manifest.resourceId,archiveOnly:manifest.archiveOnly,restored:!existing,repaired:Boolean(existing)};
}
module.exports={ownedRow,sourceLocations,packageHash,buildPackage,validatePayload,assertRestoreOwnership,localMatches,hydratePackage};
