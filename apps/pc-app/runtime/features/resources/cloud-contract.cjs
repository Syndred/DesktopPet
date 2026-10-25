const { createHash } = require('node:crypto');
const { ResourceError, safeRelative, plain, LIMITS } = require('./parser.cjs');
const BUCKET = 'lingjing-resources-v1';
const TABLE = 'lingjing_resource_packages';
const REFERENCES = 'lingjing_resource_references';
const CHUNK_BYTES = 4 * 1024 * 1024;
const MANIFEST_BYTES = 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function reject(code, message) { throw new ResourceError(code, message); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function noCredentials(value, depth = 0) {
  if (depth > 64) reject('RESOURCE_CLOUD_INVALID', '资源描述嵌套过深');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (/(?:apikey|accesskey|secretkey|servicerole|password|accesstoken|refreshtoken|sessiontoken|authorization|credentials|privatekey)|^(?:secret|token)$/i.test(key.replace(/[_-]/g, ''))) reject('RESOURCE_CONTAINS_CREDENTIALS', '资源描述含凭据字段，未上传');
    noCredentials(child, depth + 1);
  }
}
function identity(actor, owner, {allowProtocolFixture=false}={}) {
  let url;try{url=new URL(actor?.client?.supabaseUrl);}catch{reject('RESOURCE_CLOUD_AUTH_REQUIRED','云端客户端配置无效');}
  const live=actor?.authority==='live'&&actor.authKind==='supabase'&&url.protocol==='https:';
  const fixture=allowProtocolFixture&&actor?.authority==='simulated'&&actor.authKind==='fixture'&&url.protocol==='http:'&&url.hostname==='127.0.0.1';
  if (!actor || actor.schemaVersion !== 1 || !(live||fixture) || actor.ownerAccountId !== owner || !UUID.test(actor.authUserId) || !UUID.test(actor.deviceId) || !UUID.test(actor.sessionId) || !actor.client?.storage?.from || !actor.client?.from) reject('RESOURCE_CLOUD_AUTH_REQUIRED', '请使用经验证的云端账号同步资源');
  return actor;
}
function prefix(uid, resourceId, digest) {
  if (!UUID.test(uid) || !UUID.test(resourceId) || !SHA.test(digest)) reject('RESOURCE_CLOUD_INVALID', '资源云端路径无效');
  return `${uid}/${resourceId}/${digest}`;
}
const manifestPath = (uid, id, digest) => prefix(uid, id, digest) + '/manifest.json';
const chunkPath = (uid, id, digest, fileHash, index, chunkHash) => {
  if (!SHA.test(fileHash) || !SHA.test(chunkHash) || !Number.isSafeInteger(index) || index < 0 || index > 9999) reject('RESOURCE_CLOUD_INVALID', '资源分块路径无效');
  return `${prefix(uid, id, digest)}/chunks/${fileHash}/${index}-${chunkHash}.bin`;
};
function validateManifest(manifest, { owner, uid, digest } = {}) {
  if (!plain(manifest) || manifest.format !== 'lingjing.resource-package' || manifest.version !== 1 || manifest.ownerAccountId !== owner || manifest.authUserId !== uid || !UUID.test(manifest.resourceId) || !SHA.test(manifest.contentHash)) reject('RESOURCE_CLOUD_OWNER_MISMATCH', '资源包身份或归属不一致');
  const document = manifest.document;
  if (!plain(document) || document.id !== manifest.resourceId || document.contentHash !== manifest.contentHash || document.origin !== 'import' || !['spritesheet', 'model3d'].includes(document.kind) || manifest.archiveOnly !== (document.kind === 'model3d')) reject('RESOURCE_CLOUD_INVALID', '资源包描述不兼容');
  noCredentials(manifest);
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > LIMITS.files || !Array.isArray(manifest.imports) || manifest.imports.length > 10000) reject('RESOURCE_CLOUD_INVALID', '资源包文件或历史数量无效');
  const keys = new Set(), folded = new Set(); let total = 0;
  for (const file of manifest.files) {
    safeRelative(file.key);
    if (keys.has(file.key) || folded.has(file.key.toLowerCase()) || !/\.(json|png|webp|glb|gltf|bin|jpe?g|ktx2)$/i.test(file.key) || !SHA.test(file.sha256) || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > LIMITS.file || !Array.isArray(file.chunks) || !file.chunks.length || file.chunks.length !== Math.ceil(file.size / CHUNK_BYTES)) reject('RESOURCE_CLOUD_INVALID', '资源文件路径、大小或哈希无效');
    if (document.kind === 'spritesheet' && !/\.(json|png|webp)$/i.test(file.key)) reject('RESOURCE_CLOUD_INVALID', '2D 包含不支持的文件');
    if (/\.(json|gltf)$/i.test(file.key) && file.size>LIMITS.json) reject('RESOURCE_CLOUD_INVALID','资源 JSON 超过大小限制');
    keys.add(file.key); folded.add(file.key.toLowerCase()); total += file.size;
    let size = 0;
    for (const [index, chunk] of file.chunks.entries()) {
      const expected = Math.min(CHUNK_BYTES, file.size - index * CHUNK_BYTES);
      if (!plain(chunk) || !SHA.test(chunk.sha256) || chunk.size !== expected) reject('RESOURCE_CLOUD_INVALID', '资源分块大小或哈希无效');
      size += chunk.size;
    }
    if (size !== file.size) reject('RESOURCE_CLOUD_INVALID', '资源分块不完整');
  }
  if (total > LIMITS.total || total !== manifest.totalBytes || !keys.has(safeRelative(document.entryAsset)) || (document.kind === 'spritesheet' && (!keys.has(safeRelative(manifest.descriptorKey)) || !/\.json$/i.test(manifest.descriptorKey)))) reject('RESOURCE_CLOUD_INVALID', '资源包大小或入口无效');
  const receiptIds = new Set();
  for (const receipt of manifest.imports) {
    if (!plain(receipt) || !UUID.test(receipt.import_id) || receiptIds.has(receipt.import_id) || receipt.resource_id !== manifest.resourceId || receipt.owner_account_id !== owner || typeof receipt.source_filename !== 'string' || receipt.source_filename.length > 500 || typeof receipt.provenance_json !== 'string' || typeof receipt.imported_at !== 'string') reject('RESOURCE_CLOUD_INVALID', '导入历史归属或格式无效');
    receiptIds.add(receipt.import_id);
  }
  const bytes = Buffer.from(canonical(manifest));
  if (bytes.length > MANIFEST_BYTES || (digest && hash(bytes) !== digest)) reject('RESOURCE_CLOUD_HASH_MISMATCH', '资源 manifest 完整性校验失败');
  return bytes;
}
function validateIndex(row, owner, uid) {
  if (!row || row.auth_user_id !== uid || row.owner_account_id !== owner || !UUID.test(row.resource_id) || !SHA.test(row.manifest_sha256) || !SHA.test(row.content_hash) || row.manifest_path !== manifestPath(uid, row.resource_id, row.manifest_sha256) || !Number.isSafeInteger(row.manifest_bytes) || row.manifest_bytes < 1 || row.manifest_bytes > MANIFEST_BYTES || !Number.isSafeInteger(row.total_bytes) || row.total_bytes < 1 || row.total_bytes > LIMITS.total || !['spritesheet','model3d-archive'].includes(row.resource_kind)) reject('RESOURCE_CLOUD_OWNER_MISMATCH', '云端资源索引归属或路径无效');
  return row;
}
module.exports = { BUCKET, TABLE, REFERENCES, CHUNK_BYTES, MANIFEST_BYTES, UUID, SHA, hash, canonical, noCredentials, identity, manifestPath, chunkPath, validateManifest, validateIndex, reject };
