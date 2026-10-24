"use strict";
const { GardenError, canonical } = require('./service.cjs');
const PERSONAL = ['garden_accounts','garden_plots','garden_items','garden_actions','garden_events','garden_reward_receipts','garden_garrisons','garden_outbox','garden_territory_attempts','garden_territory_challenges'];
const fail = message => { throw new GardenError('GARDEN_BACKUP_CONFLICT', message); };
/** Garden inventory is one consistency unit. Per-table INSERT IGNORE could combine
 * a harvested action from one device with an unharvested plot from another. */
function createGardenBackupAdapter(db) {
  function exportData(owner) {
    return { ownerAccountId: owner, tables: Object.fromEntries(PERSONAL.map(name => [name, db.prepare(`SELECT * FROM ${name} WHERE owner_account_id=?`).all(owner)])) };
  }
  function validate(data, owner) {
    if (!data || data.ownerAccountId !== owner || !data.tables || Object.keys(data.tables).sort().join(',') !== [...PERSONAL].sort().join(',')) fail('菜园备份归属或版本不匹配');
    for (const name of PERSONAL) {
      const rows = data.tables[name]; const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name).sort().join(',');
      if (!Array.isArray(rows) || rows.length > 100000 || rows.some(row => row.owner_account_id !== owner || Object.keys(row).sort().join(',') !== columns)) fail('菜园备份包含无效的记录');
    }
    if (data.tables.garden_accounts.length > 1 || data.tables.garden_plots.some(row => !/^plot-[1-6]$/.test(row.plot_id)) || data.tables.garden_items.some(row => !Number.isSafeInteger(row.quantity) || row.quantity < 0)) fail('菜园备份的地块或库存无效');
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
  }
  return { id: 'garden', version: 1, tables: [...PERSONAL, 'garden_ledger'], export: exportData, validate, restore };
}
module.exports = { createGardenBackupAdapter, PERSONAL };
