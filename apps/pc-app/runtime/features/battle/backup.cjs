const TABLES = {
  sessions: { table: "battle_sessions", columns: ["id", "room_id", "status", "data_json", "revision", "updated_at"] },
  actions: { table: "battle_action_receipts", columns: ["action_id", "session_id", "command_json", "result_json"] },
  reports: { table: "battle_reports_v2", columns: ["id", "session_id", "data_json", "ended_at"] },
  rewards: { table: "battle_reward_receipts", columns: ["session_id", "action_id", "pet_id", "data_json"] }
};
const {COLUMNS,JOURNAL_COLUMNS,upgradeTransportJournal,cloudActions,transportRow,rowBytes,sameRow}=require('./transport-journal.cjs');
const JOURNAL={table:'battle_transport_journal',columns:JOURNAL_COLUMNS};
function invalid(message) { throw Object.assign(new Error(message), { code: "INVALID_BATTLE_BACKUP" }); }
function createBattleBackupAdapter(db) {
  upgradeTransportJournal(db);
  return {
    id: "battle", version: 2, versions:[1], tables: [...Object.values(TABLES),JOURNAL].map(value => value.table),
    export(owner) {
      return Object.fromEntries(Object.entries({...TABLES,transportJournal:JOURNAL}).map(([key, { table, columns }]) => [key,
        db.prepare(`SELECT ${columns.join(",")} FROM ${table} WHERE owner_account_id=?`).all(owner)]));
    },
    validate(data,owner) {
      if (!data || typeof data !== "object" || Array.isArray(data)) invalid("战斗备份结构无效");
      const expected=Object.hasOwn(data,'transportJournal')?{...TABLES,transportJournal:JOURNAL}:TABLES;
      if(Object.keys(data).sort().join(',')!==Object.keys(expected).sort().join(','))invalid('战斗备份包含未知字段');
      for (const [key, { columns }] of Object.entries(expected)) {
        if (!Array.isArray(data[key]) || data[key].length > 50000) invalid("战斗备份记录数量无效");
        const sessions=key==='transportJournal'?new Map(data.sessions.map(record=>[record.id,JSON.parse(record.data_json)])):null;
        for (const row of data[key]) {
          if (!row || typeof row !== "object" || Object.keys(row).sort().join(',')!==columns.toSorted().join(',')) invalid("战斗备份字段不完整");
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
          if(key==='transportJournal'){
            const expectedOwner=owner||sessions.get(row.session_id)?.context?.cloudUserId;
            if(!transportRow(row,sessions,expectedOwner))invalid('本机传输日志不是已识别的云端请求');
            if(row.legacy_row_json!==null){const before=JSON.parse(row.legacy_row_json);if(Object.keys(before).sort().join(',')!==COLUMNS.toSorted().join(',')||before.action_id!==row.action_id||before.session_id!==row.session_id||before.command_json!==row.command_json||!transportRow(before,sessions,expectedOwner))invalid('本机原始请求映射不一致');}
          }
        }
      }
    },
    validateModule(module,owner){
      if(![1,2].includes(module?.version)||Object.hasOwn(module.data||{},'transportJournal')!==(module.version===2))invalid('战斗备份版本与内容不一致');
      this.validate(module.data,owner);
    },
    cloudModule(owner,module){
      this.validateModule(module,owner);
      if(module.version===1)return module;
      const {transportJournal,...data}=module.data;void transportJournal;
      return {version:1,data:{...data,actions:cloudActions(module.data,owner,db)}};
    },
    /** Main-only: called inside BattleCloudAuthority's verified readback savepoint.
     * A user v1/v2 file cannot supply the nonserialized origin/seal columns. */
    acceptAuthorityProjection(owner,data,receipt){
      this.validate(data,owner);
      const session=data.sessions.find(row=>row.id===receipt.sessionId),body=session&&JSON.parse(session.data_json);
      if(!session||session.status!=='finished'||body.context?.authority!=='supabase'||body.context.cloudUserId!==owner||!Number.isSafeInteger(receipt.revision)||receipt.revision<1||!/^[0-9a-f]{64}$/.test(receipt.checksum)||typeof receipt.actionId!=='string')invalid('云端动作投影核验来源无效');
      const sessions=new Map([[session.id,body]]),canonicalIds=new Set(data.actions.map(row=>row.action_id));
      for(const row of db.prepare(`SELECT ${COLUMNS.join(',')} FROM battle_action_receipts WHERE owner_account_id=?`).all(owner)){
        const journal=db.prepare('SELECT legacy_row_json,session_id,command_json FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id);
        const command=JSON.parse(row.command_json),result=row.result_json&&JSON.parse(row.result_json),belongs=row.session_id===session.id||command.type?.startsWith('cloud:')&&result?.session?.id===session.id;
        if(canonicalIds.has(row.action_id)){db.prepare('UPDATE battle_transport_journal SET projection_origin=NULL,authority_json=? WHERE owner_account_id=? AND action_id=?').run(JSON.stringify(receipt),owner,row.action_id);continue;}
        if(!belongs||!journal||journal.session_id!==row.session_id||journal.command_json!==row.command_json||!sameRow(row,journal.legacy_row_json)||!transportRow(row,sessions,owner))continue;
        db.prepare("UPDATE battle_transport_journal SET projection_origin='readback',authority_json=? WHERE owner_account_id=? AND action_id=?").run(JSON.stringify(receipt),owner,row.action_id);
      }
    },
    restore(owner, data, mode = "merge") {
      this.validate(data,owner);
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
      const insertJournal=db.prepare(`INSERT OR IGNORE INTO battle_transport_journal(owner_account_id,${JOURNAL_COLUMNS.join(',')}) VALUES(${Array(1+JOURNAL_COLUMNS.length).fill('?').join(',')})`);
      for(const row of data.transportJournal||[]){
        const current=db.prepare('SELECT session_id,command_json,legacy_row_json FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?').get(owner,row.action_id);
        if(current&&(current.session_id!==row.session_id||current.command_json!==row.command_json||current.legacy_row_json!==row.legacy_row_json))invalid('本机原请求与备份不一致，已保留原记录');
        insertJournal.run(owner,...JOURNAL_COLUMNS.map(column=>row[column]));
      }
      // Generic v1 files are not an authority proof. Keep every imported action
      // protected, while copying recognized requests to a retryable local queue.
      // Its nonserialized projection_origin stays null, preventing a later
      // startup or an imported marker from declaring this file authoritative.
      if(!Object.hasOwn(data,'transportJournal')){
        const sessions=new Map(data.sessions.map(row=>[row.id,JSON.parse(row.data_json)]));
        for(const row of data.actions)if(transportRow(row,sessions,owner))insertJournal.run(owner,...COLUMNS.map(column=>row[column]),rowBytes(row));
      }
    }
  };
}
module.exports = { createBattleBackupAdapter };
