const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

class BattleStore {
  constructor(db) { this.db = db; }
  session(owner, id) {
    const row = this.db.prepare("SELECT data_json, revision FROM battle_sessions WHERE owner_account_id=? AND id=?").get(owner, id);
    return row ? { ...JSON.parse(row.data_json), revision: row.revision } : null;
  }
  latest(owner) {
    const row = this.db.prepare("SELECT data_json, revision FROM battle_sessions WHERE owner_account_id=? AND status IN ('waiting','active','settling') ORDER BY updated_at DESC LIMIT 1").get(owner);
    return row ? { ...JSON.parse(row.data_json), revision: row.revision } : null;
  }
  roomSession(owner, roomId) {
    const row = this.db.prepare("SELECT id FROM battle_sessions WHERE owner_account_id=? AND room_id=?").get(owner, roomId);
    return row ? this.session(owner, row.id) : null;
  }
  save(owner, session) {
    const next = { ...copy(session), updatedAt: new Date().toISOString() };
    this.db.prepare(`INSERT INTO battle_sessions(owner_account_id,id,room_id,status,data_json,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(owner_account_id,id) DO UPDATE SET
      room_id=excluded.room_id,status=excluded.status,data_json=excluded.data_json,
      revision=battle_sessions.revision+1,updated_at=excluded.updated_at`)
      .run(owner, next.id, next.room?.id || null, next.status, JSON.stringify(next), next.updatedAt);
    return this.session(owner, next.id);
  }
  action(owner, actionId) {
    const row = this.db.prepare("SELECT * FROM battle_action_receipts WHERE owner_account_id=? AND action_id=?").get(owner, actionId);
    return row ? { sessionId: row.session_id, command: JSON.parse(row.command_json), result: row.result_json ? JSON.parse(row.result_json) : null } : null;
  }
  reserve(owner, actionId, sessionId, command) {
    this.db.prepare("INSERT INTO battle_action_receipts(owner_account_id,action_id,session_id,command_json) VALUES(?,?,?,?)").run(owner, actionId, sessionId, JSON.stringify(command));
  }
  pendingCommand(owner, type, input) {
    const rows=this.db.prepare("SELECT action_id,command_json FROM battle_action_receipts WHERE owner_account_id=? AND result_json IS NULL").all(owner);
    for(const row of rows){const command=JSON.parse(row.command_json);if(command.type===`cloud:${type}`&&JSON.stringify(command.input)===JSON.stringify(input))return row.action_id;}
    const actionId=`cloud:${type}:${require('node:crypto').randomUUID()}`;
    this.reserve(owner,actionId,actionId,{type:`cloud:${type}`,input});return actionId;
  }
  resolve(owner, actionId, result) {
    const receipt = result?.snapshot ? { sessionId: result.id, revision: result.revision, resolvedRound: result.snapshot.round } : result;
    this.db.prepare("UPDATE battle_action_receipts SET result_json=? WHERE owner_account_id=? AND action_id=?").run(JSON.stringify(receipt), owner, actionId);
  }
  report(owner, id) {
    const row = this.db.prepare("SELECT data_json FROM battle_reports_v2 WHERE owner_account_id=? AND id=?").get(owner, id);
    return row ? JSON.parse(row.data_json) : null;
  }
  reports(owner, limit = 60) {
    return this.db.prepare("SELECT data_json FROM battle_reports_v2 WHERE owner_account_id=? ORDER BY ended_at DESC LIMIT ?").all(owner, Math.max(1, Math.min(200, Number(limit) || 60))).map(row => JSON.parse(row.data_json));
  }
  saveReport(owner, report) {
    this.db.prepare(`INSERT INTO battle_reports_v2(owner_account_id,id,session_id,data_json,ended_at) VALUES(?,?,?,?,?)
      ON CONFLICT(owner_account_id,id) DO UPDATE SET data_json=excluded.data_json,ended_at=excluded.ended_at`)
      .run(owner, report.id, report.sessionId, JSON.stringify(report), report.endedAt);
    return report;
  }
  reward(owner, sessionId) {
    const row = this.db.prepare("SELECT data_json FROM battle_reward_receipts WHERE owner_account_id=? AND session_id=?").get(owner, sessionId);
    return row ? JSON.parse(row.data_json) : null;
  }
  saveReward(owner, session, reward) {
    this.db.prepare("INSERT INTO battle_reward_receipts(owner_account_id,session_id,action_id,pet_id,data_json) VALUES(?,?,?,?,?)")
      .run(owner, session.id, reward.actionId, session.player.petId, JSON.stringify(reward));
  }
}
module.exports = { BattleStore, copy };
