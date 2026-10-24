const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { safeRelative } = require('../features/resources/parser.cjs');

const TABLES = ['lingjing_resources', 'lingjing_resource_imports', 'lingjing_resource_preferences'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const reject = message => { throw Object.assign(new Error(message), { code: 'RESOURCE_BACKUP_INVALID' }); };

/** Owner imports include actual bytes; immutable shipped assets remain package resources. */
function createResourceBackupAdapter(services) {
  const db = services.db;
  const storage = services.get('resources').storageRoot;
  const owned = owner => db.prepare('SELECT * FROM lingjing_resources WHERE owner_account_id=? ORDER BY resource_id').all(owner);
  function exportData(owner) {
    const resources = owned(owner).map(row => ({ row, files: db.prepare('SELECT asset_key,file_path FROM lingjing_resource_files WHERE resource_id=? ORDER BY asset_key').all(row.resource_id).map(file => {
      const bytes = fs.readFileSync(file.file_path);
      return { key: file.asset_key, sha256: hash(bytes), bytes: bytes.toString('base64') };
    }) }));
    return { ownerAccountId: owner, resources,
      imports: db.prepare('SELECT * FROM lingjing_resource_imports WHERE owner_account_id=? ORDER BY import_id').all(owner),
      preferences: db.prepare('SELECT * FROM lingjing_resource_preferences WHERE owner_account_id=? ORDER BY resource_id').all(owner) };
  }
  function validate(data, owner) {
    if (!data || data.ownerAccountId !== owner || !Array.isArray(data.resources) || !Array.isArray(data.imports) || !Array.isArray(data.preferences) || data.resources.length > 1000) reject('角色资源备份归属或格式无效。');
    const ids = new Set(); let total = 0;
    for (const resource of data.resources) {
      const row = resource.row;
      if (!row || row.owner_account_id !== owner || typeof row.resource_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(row.resource_id) || ids.has(row.resource_id)) reject('角色资源备份包含无效实例。');
      ids.add(row.resource_id);
      const existing = db.prepare('SELECT owner_account_id FROM lingjing_resources WHERE resource_id=?').get(row.resource_id);
      if (existing && existing.owner_account_id !== owner) reject('角色资源编号属于其他账号。');
      let document;
      try { document = JSON.parse(row.document_json); } catch { reject('角色资源描述损坏。'); }
      if (document.id !== row.resource_id || document.origin !== 'import' || !['spritesheet','model3d'].includes(document.kind) || !Array.isArray(resource.files) || !resource.files.length || resource.files.length > 128) reject('角色资源描述不兼容。');
      const files = new Map();
      for (const file of resource.files) {
        safeRelative(file.key);
        if (files.has(file.key) || !/\.(png|jpe?g|webp|glb|gltf|bin|json|ktx2)$/i.test(file.key) || typeof file.bytes !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.bytes)) reject('角色备份文件格式无效。');
        const bytes = Buffer.from(file.bytes, 'base64'); total += bytes.length;
        if (!bytes.length || total > 18 * 1024 * 1024 || hash(bytes) !== file.sha256) reject('角色备份文件完整性校验失败，或超过备份容量。');
        files.set(file.key, bytes);
      }
      const entry = files.get(safeRelative(document.entryAsset));
      if (!entry) reject('角色备份缺少主文件。');
      if (document.kind === 'model3d') {
        let model;
        try {
          if (/\.glb$/i.test(document.entryAsset)) {
            if (entry.toString('ascii',0,4) !== 'glTF' || entry.readUInt32LE(4) !== 2 || entry.readUInt32LE(8) !== entry.length || entry.readUInt32LE(16) !== 0x4e4f534a) reject('模型备份损坏。');
            model = JSON.parse(entry.subarray(20, 20 + entry.readUInt32LE(12)).toString('utf8'));
          } else model = JSON.parse(entry.toString('utf8'));
        } catch { reject('模型备份描述损坏。'); }
        for (const item of [...(model.buffers || []), ...(model.images || [])]) {
          if (!item.uri) continue;
          if (/^data:(application\/(octet-stream|gltf-buffer)|image\/(png|jpeg|webp));base64,[A-Za-z0-9+/=]+$/.test(item.uri)) continue;
          if (!files.has(safeRelative(item.uri))) reject('模型备份包含外部或缺失的关联文件。');
        }
      } else {
        const sheet = document.sheet;
        if (!sheet || !Number.isFinite(sheet.width) || !Number.isFinite(sheet.height) || !Number.isInteger(sheet.columns) || !Number.isInteger(sheet.rows) || sheet.width <= 0 || sheet.height <= 0 || sheet.columns < 1 || sheet.rows < 1 || sheet.columns * sheet.rows > 4096) reject('动画备份尺寸无效。');
        if (!/\.(png|webp)$/i.test(document.entryAsset)) reject('动画备份图片格式无效。');
      }
    }
    for (const row of [...data.imports, ...data.preferences]) {
      if (!row || row.owner_account_id !== owner || typeof row.resource_id !== 'string') reject('角色备份记录归属无效。');
      if (!ids.has(row.resource_id) && !db.prepare('SELECT 1 FROM lingjing_resources WHERE resource_id=? AND owner_account_id IS NULL').get(row.resource_id)) reject('备份引用的内置角色不可用。');
    }
    for (const row of data.imports) {
      const prior = db.prepare('SELECT owner_account_id FROM lingjing_resource_imports WHERE import_id=?').get(row.import_id);
      if (prior && prior.owner_account_id !== owner) reject('导入历史编号属于其他账号。');
    }
  }
  function restore(owner, data, mode) {
    validate(data, owner);
    if (mode === 'replace') {
      const ids = owned(owner).map(row => row.resource_id);
      db.prepare('DELETE FROM lingjing_resource_imports WHERE owner_account_id=?').run(owner);
      db.prepare('DELETE FROM lingjing_resource_preferences WHERE owner_account_id=?').run(owner);
      for (const id of ids) db.prepare('DELETE FROM lingjing_resource_files WHERE resource_id=?').run(id);
      db.prepare('DELETE FROM lingjing_resources WHERE owner_account_id=?').run(owner);
    }
    const columns = ['resource_id','owner_account_id','content_hash','document_json','revision','created_at'];
    const insert = db.prepare(`INSERT INTO lingjing_resources(${columns.join(',')}) VALUES(?,?,?,?,?,?)`);
    for (const resource of data.resources) {
      if (db.prepare('SELECT 1 FROM lingjing_resources WHERE resource_id=?').get(resource.row.resource_id)) continue;
      const target = path.join(storage, `restore-${randomUUID()}`);
      fs.mkdirSync(target, { recursive: true });
      insert.run(...columns.map(column => resource.row[column]));
      for (const file of resource.files) {
        const destination = path.join(target, safeRelative(file.key));
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, Buffer.from(file.bytes, 'base64'), { flag: 'wx' });
        db.prepare('INSERT INTO lingjing_resource_files VALUES(?,?,?)').run(resource.row.resource_id, file.key, destination);
      }
    }
    for (const [table, rows] of [['lingjing_resource_imports', data.imports], ['lingjing_resource_preferences', data.preferences]]) {
      const fields = db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
      const statement = db.prepare(`INSERT INTO ${table}(${fields.join(',')}) VALUES(${fields.map(() => '?').join(',')}) ON CONFLICT DO NOTHING`);
      for (const row of rows) statement.run(...fields.map(column => row[column]));
    }
  }
  return { id: 'character-resources', version: 1, tables: TABLES, export: exportData, validate, restore };
}
module.exports = { createResourceBackupAdapter };
