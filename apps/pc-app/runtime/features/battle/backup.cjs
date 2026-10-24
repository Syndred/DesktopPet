const TABLES = {
  sessions: { table: "battle_sessions", columns: ["id", "room_id", "status", "data_json", "revision", "updated_at"] },
  actions: { table: "battle_action_receipts", columns: ["action_id", "session_id", "command_json", "result_json"] },
  reports: { table: "battle_reports_v2", columns: ["id", "session_id", "data_json", "ended_at"] },
  rewards: { table: "battle_reward_receipts", columns: ["session_id", "action_id", "pet_id", "data_json"] }
};
function invalid(message) { throw Object.assign(new Error(message), { code: "INVALID_BATTLE_BACKUP" }); }
function createBattleBackupAdapter(db) {
  return {
    id: "battle", version: 1, tables: Object.values(TABLES).map(value => value.table),
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
          const body = row.data_json ? JSON.parse(row.data_json) : null;
          if ((key === "sessions" || key === "reports") && body?.id !== row.id) invalid("战斗备份记录编号不一致");
          if (key === "rewards" && (body?.actionId !== row.action_id || body?.petId !== row.pet_id || ![5,20].includes(body?.experience))) invalid("战斗奖励备份无效");
        }
      }
    },
    restore(owner, data, mode = "merge") {
      this.validate(data);
      const current = this.export(owner);
      const rewards = new Map(data.rewards.map(row => [row.session_id, row.data_json]));
      for (const row of current.rewards) {
        if (rewards.get(row.session_id) !== row.data_json) {
          throw Object.assign(new Error("备份缺少当前已结算的奖励记录，不能回退结算流水。"), { code: "BATTLE_BACKUP_CONFLICT" });
        }
      }
      if (mode === "merge" && data.rewards.some(row => !current.rewards.some(existing => existing.session_id === row.session_id))) {
        const hasCompanions = db.prepare("SELECT 1 FROM sqlite_master WHERE name='companion_pets'").get() && db.prepare("SELECT 1 FROM companion_pets WHERE owner_account_id=? LIMIT 1").get(owner);
        if (hasCompanions) throw Object.assign(new Error("战斗奖励与伙伴经验必须作为完整存档恢复，请预览完整替换。"), { code: "BATTLE_BACKUP_CONFLICT" });
      }
      // Append missing records; never erase settlement ledgers or roll a newer fight backward.
      for (const [key, { table, columns }] of Object.entries(TABLES)) {
        const insert = db.prepare(`INSERT OR IGNORE INTO ${table}(owner_account_id,${columns.join(",")}) VALUES(${["?", ...columns.map(() => "?")].join(",")})`);
        for (const row of data[key]) {
          if (key === "sessions") {
            const existing = db.prepare("SELECT status,revision FROM battle_sessions WHERE owner_account_id=? AND id=?").get(owner, row.id);
            if (existing && !["finished", "abandoned"].includes(existing.status) && (row.revision > existing.revision || ["finished", "abandoned"].includes(row.status))) {
              db.prepare("UPDATE battle_sessions SET room_id=?,status=?,data_json=?,revision=?,updated_at=? WHERE owner_account_id=? AND id=?")
                .run(row.room_id, row.status, row.data_json, row.revision, row.updated_at, owner, row.id);
            }
          }
          insert.run(owner, ...columns.map(column => row[column]));
        }
      }
    }
  };
}
module.exports = { createBattleBackupAdapter };
