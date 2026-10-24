const TABLES = {
  sessions: { table: "battle_sessions", columns: ["id", "room_id", "status", "data_json", "revision", "updated_at"] },
  actions: { table: "battle_action_receipts", columns: ["action_id", "session_id", "command_json", "result_json"] },
  reports: { table: "battle_reports_v2", columns: ["id", "session_id", "data_json", "ended_at"] },
  rewards: { table: "battle_reward_receipts", columns: ["session_id", "action_id", "pet_id", "data_json"] }
};
function invalid(message) { throw Object.assign(new Error(message), { code: "INVALID_BATTLE_BACKUP" }); }
function createBattleBackupAdapter(db) {
  return {
    id: "battle", version: 1,
    export(owner) {
      return Object.fromEntries(Object.entries(TABLES).map(([key, { table, columns }]) => [key,
        db.prepare(`SELECT ${columns.join(",")} FROM ${table} WHERE owner_account_id=?`).all(owner)]));
    },
    validate(data) {
      if (!data || typeof data !== "object" || Array.isArray(data)) invalid("战斗备份结构无效");
      for (const [key, { columns }] of Object.entries(TABLES)) {
        if (!Array.isArray(data[key]) || data[key].length > 50000) invalid("战斗备份记录数量无效");
        for (const row of data[key]) {
          if (!row || typeof row !== "object" || columns.some(column => !Object.hasOwn(row, column))) invalid("战斗备份字段不完整");
          if (Object.hasOwn(row, "owner_account_id")) invalid("战斗备份不能指定其他账号归属");
          for (const column of columns) {
            const value = row[column];
            if (value !== null && typeof value !== "string" && !(column === "revision" && Number.isSafeInteger(value) && value > 0)) invalid("战斗备份字段类型无效");
            if (typeof value === "string" && value.length > 8000000) invalid("战斗备份记录过大");
            if (column.endsWith("_json") && value !== null) {
              try { const parsed = JSON.parse(value); if (!parsed || typeof parsed !== "object") invalid("战斗备份内容无效"); }
              catch { invalid("战斗备份 JSON 无效"); }
            }
          }
        }
      }
    },
    restore(owner, data) {
      this.validate(data);
      // Append missing records; never erase settlement ledgers or roll a newer fight backward.
      for (const [key, { table, columns }] of Object.entries(TABLES)) {
        const insert = db.prepare(`INSERT OR IGNORE INTO ${table}(owner_account_id,${columns.join(",")}) VALUES(${["?", ...columns.map(() => "?")].join(",")})`);
        for (const row of data[key]) insert.run(owner, ...columns.map(column => row[column]));
      }
    }
  };
}
module.exports = { createBattleBackupAdapter };
