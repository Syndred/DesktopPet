const fs = require('node:fs/promises');
const path = require('node:path');
const { safeRelative, isWithin, readBounded, parseJson, LIMITS, fail } = require('./parser.cjs');
const { noCredentials } = require('./cloud-contract.cjs');

/** Read-only compatibility for registered historical data. Never imports or renders a model. */
async function historicalFile(service, owner, id, key) {
  const resource = service.repository.get(owner, id);
  if (resource.kind !== 'model3d' || resource.origin !== 'import') fail('RESOURCE_ARCHIVE_ONLY', '仅可读取已有本机模型档案');
  const registered = service.repository.file(owner, id, safeRelative(key));
  const actual = await fs.realpath(service.currentFilePath(resource, key, registered)).catch(() => fail('MISSING_ASSET', '历史资源文件已缺失'));
  const root = await fs.realpath(service.storageRoot);
  if (!isWithin(root, actual)) fail('UNSAFE_PATH', '历史资源路径超出托管目录');
  return actual;
}
function listHistoricalResources(service, owner) {
  service.owner(owner);
  return service.repository.list(owner).filter(resource=>resource.kind==='model3d').map(resource=>({
    id:resource.id,name:resource.name,kind:'model3d',archiveOnly:true,origin:resource.origin,
    importedAt:resource.importedAt,contentHash:resource.contentHash,provenance:resource.provenance,
    entryAsset:resource.entryAsset,registeredFiles:service.repository.files(owner,resource.id).map(file=>file.asset_key)
  }));
}
async function validateHistoricalFiles(document, locations) {
  const entry = locations.get(safeRelative(document.entryAsset));
  if (!entry || !/\.(glb|gltf)$/i.test(document.entryAsset)) fail('RESOURCE_ARCHIVE_INVALID','历史资源入口无效');
  const bytes = await readBounded(entry);
  let model;
  if (/\.glb$/i.test(document.entryAsset)) {
    if (bytes.length<20 || bytes.toString('ascii',0,4)!=='glTF' || bytes.readUInt32LE(4)!==2 || bytes.readUInt32LE(8)!==bytes.length || bytes.readUInt32LE(16)!==0x4e4f534a || bytes.readUInt32LE(12)>LIMITS.json || 20+bytes.readUInt32LE(12)>bytes.length) fail('RESOURCE_ARCHIVE_INVALID','历史 GLB 头损坏');
    model=parseJson(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  } else model=parseJson(bytes);
  if (!model || typeof model!=='object' || Array.isArray(model) || (model.buffers!==undefined&&!Array.isArray(model.buffers)) || (model.images!==undefined&&!Array.isArray(model.images))) fail('RESOURCE_ARCHIVE_INVALID','历史资源描述损坏');
  noCredentials(model);
  const base=path.posix.dirname(document.entryAsset);
  for (const item of [...(model.buffers||[]),...(model.images||[])]) {
    if (!item.uri) continue;
    if (/^data:(application\/(octet-stream|gltf-buffer)|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/.test(item.uri)) continue;
    safeRelative(item.uri);
    if (!locations.has(safeRelative(base==='.'?item.uri:base+'/'+item.uri))) fail('RESOURCE_ARCHIVE_INVALID','历史资源引用包外或缺失文件');
  }
}
module.exports={historicalFile,listHistoricalResources,validateHistoricalFiles};
