const { createHash } = require('node:crypto');
const { atomic, CompanionError } = require('./service.cjs');

const TABLES = ['companion_accounts', 'companion_pets', 'companion_actions', 'companion_legacy_archive', 'companion_interactions', 'companion_capture_receipts'];
const IDENTITY_TABLE = 'companion_identity_imports';
const fail = message => { throw new CompanionError('COMPANION_BACKUP_INVALID', message); };
const conflict = message => { throw new CompanionError('COMPANION_BACKUP_CONFLICT', message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const id = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
function parse(value, label) { try { return JSON.parse(value); } catch { fail(`${label}已损坏，原存档已保留`); } }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  return object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
}
function digest(data) {
  const sorted = { ...data, tables: Object.fromEntries(Object.entries(data.tables).map(([name, rows]) => [name, [...rows].sort((a,b) => compare(JSON.stringify(canonical(a)), JSON.stringify(canonical(b))))])), identityImports: [...data.identityImports].sort((a,b) => compare(a.source_owner_account_id,b.source_owner_account_id)) };
  return createHash('sha256').update(JSON.stringify(canonical(sorted))).digest('hex');
}

/** One consistency unit. A row-union must never pair a new pet with old receipts. */
function createCompanionBackupAdapter(db) {
  const columns = name => db.prepare(`PRAGMA table_info(${name})`).all().map(column => column.name);
  const primary = name => db.prepare(`PRAGMA table_info(${name})`).all().filter(column => column.pk).sort((a,b) => a.pk-b.pk).map(column => column.name);
  const plainRows = rows => rows.map(row => ({ ...row }));
  const ordered = (name, rows) => { const keys = primary(name); return plainRows(rows).sort((a,b) => compare(JSON.stringify(keys.map(key => a[key])),JSON.stringify(keys.map(key => b[key])))); };
  function exportData(owner) {
    return { ownerAccountId: owner, tables: Object.fromEntries(TABLES.map(name => [name, ordered(name, db.prepare(`SELECT * FROM ${name} WHERE owner_account_id=?`).all(owner))])), identityImports: ordered(IDENTITY_TABLE, db.prepare(`SELECT * FROM ${IDENTITY_TABLE} WHERE target_owner_account_id=?`).all(owner)) };
  }
  function validate(data, owner) {
    if (!id(owner) || !object(data) || data.ownerAccountId !== owner || !object(data.tables) || Object.keys(data.tables).sort().join() !== [...TABLES].sort().join() || !Array.isArray(data.identityImports)) fail('伙伴存档归属或版本不匹配');
    for (const name of TABLES) {
      const keys = columns(name).sort().join(), primary = db.prepare(`PRAGMA table_info(${name})`).all().filter(column => column.pk).sort((a,b) => a.pk-b.pk).map(column => column.name), seen = new Set();
      if (!Array.isArray(data.tables[name]) || data.tables[name].length > 100000 || data.tables[name].some(row => !object(row) || row.owner_account_id !== owner || Object.keys(row).sort().join() !== keys)) fail('伙伴存档包含其他账号或不兼容记录');
      for (const row of data.tables[name]) { const key = JSON.stringify(primary.map(column => row[column])); if (seen.has(key)) fail('伙伴存档包含重复记录'); seen.add(key); }
    }
    const account = data.tables.companion_accounts;
    if (account.length > 1 || (account.length && !integer(account[0].revision))) fail('伙伴账号版本无效');
    const petIds = new Set();
    for (const row of data.tables.companion_pets) {
      const pet = parse(row.data_json, '伙伴记录');
      if (!object(pet) || !id(row.pet_id) || petIds.has(row.pet_id) || pet.petId !== row.pet_id || pet.ownerAccountId !== owner || pet.templateId !== row.template_id || pet.revision !== row.revision || !integer(row.revision) || row.revision < 1 || pet.createdAt !== row.created_at || pet.updatedAt !== row.updated_at || typeof pet.name !== 'string' || !pet.name.trim() || [...pet.name.trim()].length > 24) fail('伙伴编号、名字或修订不一致');
      if (!object(pet.resource) || !['2d','3d'].includes(pet.resource.kind) || !id(pet.resource.resourceId) || !['metal','wood','water','fire','earth'].includes(pet.element)) fail('伙伴原资源或元素无效');
      if (!object(pet.growth) || !integer(pet.growth.level) || pet.growth.level < 1 || !['experience','mood','satiety','affinity','winsTotal'].every(key => integer(pet.growth[key])) || !object(pet.growth.stats) || !['hp','atk','def','spd'].every(key => integer(pet.growth.stats[key]))) fail('伙伴养成数据无效');
      const desktop = pet.desktop, position = desktop?.position;
      if (!object(desktop) || typeof desktop.visible !== 'boolean' || !['quiet','wander','follow','sleep'].includes(desktop.behavior) || !Number.isFinite(desktop.scale) || desktop.scale < .5 || desktop.scale > 2 || !object(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y) || Math.abs(position.x) > 100000 || Math.abs(position.y) > 100000 || !(position.displayId === null || typeof position.displayId === 'string')) fail('伙伴桌面状态无效');
      petIds.add(row.pet_id);
    }
    if (petIds.size && account.length !== 1) fail('伙伴存档缺少所属账号');
    if (account.length) {
      const selections = parse(account[0].selections_json, '伙伴独立选择');
      if (!object(selections) || Object.keys(selections).sort().join() !== ['battlePetId','chatPetId','guardPetId'].sort().join() || Object.values(selections).some(value => value !== null && !petIds.has(value))) fail('伙伴独立选择引用了不存在的实例');
    }
    const actionIds = new Set();
    for (const row of data.tables.companion_actions) {
      if (!id(row.action_id) || actionIds.has(row.action_id) || !id(row.operation) || !/^[0-9a-f]{64}$/.test(row.request_hash)) fail('伙伴操作回执无效');
      const result = parse(row.result_json, '伙伴操作回执');
      if (!object(result) || result.ok !== true || !integer(result.revision)) fail('伙伴操作结果无效');
      const pet = result.data?.pet;
      if (pet && (pet.ownerAccountId !== owner || !petIds.has(pet.petId))) fail('伙伴操作回执串号或串宠');
      actionIds.add(row.action_id);
    }
    for (const row of data.tables.companion_legacy_archive) { if (!id(row.legacy_pet_id)) fail('旧伙伴历史编号无效'); parse(row.source_json, '旧伙伴原始历史'); }
    for (const row of data.tables.companion_interactions) if (!petIds.has(row.pet_id) || !integer(row.last_interacted_at)) fail('伙伴互动历史无效');
    const captures = new Set();
    for (const row of data.tables.companion_capture_receipts) {
      const key = JSON.stringify([row.battle_id, row.wild_pet_id]);
      if (!id(row.battle_id) || !id(row.wild_pet_id) || !petIds.has(row.pet_id) || captures.has(key)) fail('伙伴捕捉凭据无效'); captures.add(key);
    }
    const identityKeys = columns(IDENTITY_TABLE).sort().join(), sources = new Set();
    for (const row of data.identityImports) {
      if (!object(row) || Object.keys(row).sort().join() !== identityKeys || row.target_owner_account_id !== owner || !id(row.source_owner_account_id) || row.source_owner_account_id === owner || sources.has(row.source_owner_account_id)) fail('伙伴归属迁移历史无效');
      const existing = db.prepare(`SELECT target_owner_account_id FROM ${IDENTITY_TABLE} WHERE source_owner_account_id=?`).get(row.source_owner_account_id);
      if (existing && existing.target_owner_account_id !== owner) conflict('旧伙伴归属已关联其他账号，不能覆盖');
      parse(row.archive_json, '伙伴归属迁移原档'); sources.add(row.source_owner_account_id);
    }
    return data;
  }
  function fromLegacyTables(tables, owner) {
    if (!object(tables)) fail('旧伙伴存档格式无效');
    const found = TABLES.filter(name => Object.hasOwn(tables, name));
    // Archives predating this feature only have Accounts' raw legacy module.
    // An explicit replace clears stale imported markers so its verified raw
    // inventory can be imported again; merge still rejects nonempty progress.
    if (!found.length) return validate({ownerAccountId:owner,tables:Object.fromEntries(TABLES.map(name=>[name,[]])),identityImports:[]},owner);
    if (found.length !== TABLES.length || found.some(name => !object(tables[name]) || !Array.isArray(tables[name].rows))) fail('旧伙伴存档表不完整，不能局部拼接恢复');
    const data = { ownerAccountId: owner, tables: Object.fromEntries(TABLES.map(name => [name, ordered(name, tables[name].rows)])), identityImports: [] };
    validate(data, owner); return data;
  }
  function restore(owner, data, mode) {
    validate(data, owner);
    if (!['merge','replace'].includes(mode)) fail('伙伴恢复方式无效');
    return atomic(db, () => {
      const existing = exportData(owner);
      const empty = TABLES.filter(name => name !== 'companion_accounts').every(name => !existing.tables[name].length) && !existing.identityImports.length && (!existing.tables.companion_accounts.length || (existing.tables.companion_accounts[0].revision === 0 && Object.values(parse(existing.tables.companion_accounts[0].selections_json, '伙伴选择')).every(value => value === null)));
      if (digest(existing) === digest(data)) return { duplicate: true };
      if (mode === 'merge' && !empty) conflict('两份伙伴存档存在不同进度，已保留；请预览完整恢复，不能逐行拼接');
      for (const name of [...TABLES].reverse()) db.prepare(`DELETE FROM ${name} WHERE owner_account_id=?`).run(owner);
      db.prepare(`DELETE FROM ${IDENTITY_TABLE} WHERE target_owner_account_id=?`).run(owner);
      for (const name of [...TABLES, IDENTITY_TABLE]) {
        const keys = columns(name), insert = db.prepare(`INSERT INTO ${name}(${keys.join(',')}) VALUES(${keys.map(() => '?').join(',')})`);
        for (const row of name === IDENTITY_TABLE ? data.identityImports : data.tables[name]) insert.run(...keys.map(key => row[key]));
      }
      return { restored: true };
    });
  }
  return { id: 'companions', version: 1, tables: [...TABLES, IDENTITY_TABLE], legacyTables: TABLES, export: exportData, validate, restore, fromLegacyTables, dataChecksum: owner => digest(exportData(owner)) };
}

module.exports = { createCompanionBackupAdapter, TABLES, IDENTITY_TABLE, companionDataChecksum: digest };
