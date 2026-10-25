"use strict";
const { GardenError, canonical } = require('./service.cjs');
const PERSONAL = ['garden_accounts','garden_plots','garden_items','garden_actions','garden_events','garden_reward_receipts','garden_garrisons','garden_outbox','garden_territory_attempts','garden_territory_challenges'];
const fail = message => { throw new GardenError('GARDEN_BACKUP_CONFLICT', message); };
/** Garden inventory is one consistency unit. Per-table INSERT IGNORE could combine
 * a harvested action from one device with an unharvested plot from another. */
function createGardenBackupAdapter(db) {
  function exportData(owner) {
    const logs = db.prepare('SELECT * FROM garden_territory_logs WHERE owner_account_id=?').all(owner);
    const ids = new Set(logs.map(row => row.territory_id));
    const territories = db.prepare('SELECT * FROM garden_territory_records').all().filter(row => row.owner_account_id === owner || ids.has(row.territory_id));
    return { ownerAccountId: owner, tables: Object.fromEntries(PERSONAL.map(name => [name, db.prepare(`SELECT * FROM ${name} WHERE owner_account_id=?`).all(owner)])), territoryArchive: { territories, logs } };
  }
  function validate(data, owner) {
    if (!data || data.ownerAccountId !== owner || !data.tables || Object.keys(data.tables).sort().join(',') !== [...PERSONAL].sort().join(',')) fail('菜园备份归属或版本不匹配');
    for (const name of PERSONAL) {
      const rows = data.tables[name]; const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name).sort().join(',');
      if (!Array.isArray(rows) || rows.length > 100000 || rows.some(row => row.owner_account_id !== owner || Object.keys(row).sort().join(',') !== columns)) fail('菜园备份包含无效的记录');
    }
    if (data.tables.garden_accounts.length > 1 || data.tables.garden_plots.some(row => !/^plot-[1-6]$/.test(row.plot_id)) || data.tables.garden_items.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 0)) fail('菜园备份的地块或库存无效');
    if (data.territoryArchive && (!Array.isArray(data.territoryArchive.territories) || !Array.isArray(data.territoryArchive.logs) || data.territoryArchive.logs.some(row => row.owner_account_id !== owner))) fail('领地历史归属无效');
  }
  function restore(owner, data, mode) {
    validate(data, owner);
    const existing = exportData(owner);
    const normalize = value => JSON.stringify(canonical(Object.fromEntries(Object.entries(value.tables).map(([name, rows]) => [name, [...rows].sort((a,b) => JSON.stringify(canonical(a)).localeCompare(JSON.stringify(canonical(b))))]))));
    if (mode === 'merge' && (existing.tables.garden_accounts[0]?.revision || 0) > 0) {
      if (normalize(existing) === normalize(data)) return;
      fail('两份菜园存档存在不同操作，不能相加库存或拼接地块。请保留备份后预览完整替换。');
    }
    for (const name of [...PERSONAL].reverse()) db.prepare(`DELETE FROM ${name} WHERE owner_account_id=?`).run(owner);
    for (const name of PERSONAL) {
      const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);
      const insert = db.prepare(`INSERT INTO ${name}(${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for (const row of data.tables[name]) insert.run(...columns.map(c => row[c]));
    }
    // Personal restore never overwrites a living shared-world territory. A new
    // installation may recover missing records; existing ownership always wins.
    for (const row of data.territoryArchive?.territories || []) db.prepare('INSERT OR IGNORE INTO garden_territory_records VALUES (?,?,?,?,?)').run(row.territory_id,row.owner_account_id,row.revision,row.data_json,row.updated_at);
    for (const row of data.territoryArchive?.logs || []) {
      const exists=db.prepare('SELECT 1 FROM garden_territory_logs WHERE territory_id=? AND owner_account_id=? AND action=? AND battle_id IS ? AND created_at=?').get(row.territory_id,owner,row.action,row.battle_id,row.created_at);
      if(!exists)db.prepare('INSERT INTO garden_territory_logs(territory_id,owner_account_id,action,old_owner_id,new_owner_id,battle_id,created_at) VALUES (?,?,?,?,?,?,?)').run(row.territory_id,owner,row.action,row.old_owner_id,row.new_owner_id,row.battle_id,row.created_at);
    }
  }
  // Device delivery journal stays in this SQLite profile and is never exported
  // as account economics or merged into another device's queue.
  return { id: 'garden', version: 1, tables: [...PERSONAL, 'garden_ledger', 'garden_cloud_state', 'garden_territory_records', 'garden_territory_logs','garden_cloud_requests'], export: exportData, validate, restore };
}
module.exports = { createGardenBackupAdapter, PERSONAL };
