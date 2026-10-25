const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const {upgradeTransportJournal,cacheId,cacheRow,parse,friendCache,sameCommandInput}=require('./transport-journal.cjs');

class BattleStore {
  constructor(db) { this.db = db; upgradeTransportJournal(db); }
  session(owner, id) {
    const row = this.db.prepare("SELECT id,room_id,status,data_json,revision,updated_at FROM battle_sessions WHERE owner_account_id=? AND id=?").get(owner, id);
    if(row){const cache=this.cached(owner,id,true),original=cache?.legacy?.session;if(original&&['id','room_id','status','data_json','revision','updated_at'].every(key=>original[key]===row[key])&&!this.reward(owner,id))return cache.session;return { ...JSON.parse(row.data_json), revision: row.revision };}
    return this.cached(owner,id)?.session||null;
  }
  latest(owner) {
    const row = this.db.prepare("SELECT id FROM battle_sessions WHERE owner_account_id=? AND status IN ('waiting','active','settling') ORDER BY updated_at DESC LIMIT 1").get(owner);
    const current=row?this.session(owner,row.id):null;
    const canonical=new Set(this.db.prepare('SELECT id FROM battle_sessions WHERE owner_account_id=?').all(owner).map(value=>value.id));
    const cached=this.db.prepare('SELECT * FROM battle_transport_journal WHERE owner_account_id=?').all(owner).filter(value=>cacheRow(value,owner)).map(value=>parse(value.result_json)?.session).filter(session=>session&&!canonical.has(session.id)&&['waiting','active','settling'].includes(session.status));
    return [current,...cached].filter(session=>session&&['waiting','active','settling'].includes(session.status)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0]||null;
  }
  roomSession(owner, roomId) {
    const row = this.db.prepare("SELECT id FROM battle_sessions WHERE owner_account_id=? AND room_id=?").get(owner, roomId);
    return row ? this.session(owner, row.id) : this.cached(owner,`online-${roomId}`)?.session||null;
  }
  cached(owner,id,requireSeal=false){const row=this.db.prepare('SELECT * FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?').get(owner,cacheId(id));if(!row||!cacheRow(row,owner)||requireSeal&&!['upgrade','readback'].includes(row.projection_origin))return null;const value=parse(row.result_json);return value?{...value,...(requireSeal?{legacy:parse(row.legacy_row_json)}:{})}:null;}
  saveCache(owner,session,report){
    if(!friendCache(session,owner))throw Object.assign(new Error('好友房间缓存归属或状态无效'),{code:'INVALID_BATTLE_PROTOCOL'});
    const previous=this.cached(owner,session.id),next={...copy(session),revision:(previous?.session?.revision||0)+1,updatedAt:new Date().toISOString()};
    const result={session:next,...(report?{report:copy(report)}:previous?.report?{report:previous.report}:{})};
    this.db.prepare('INSERT INTO battle_transport_journal(owner_account_id,action_id,session_id,command_json,result_json) VALUES(?,?,?,?,?) ON CONFLICT(owner_account_id,action_id) DO UPDATE SET result_json=excluded.result_json').run(owner,cacheId(session.id),session.id,JSON.stringify({type:'friend-cache',roomId:session.room.id}),JSON.stringify(result));
    return next;
  }
  save(owner, session) {
    if(friendCache(session,owner)&&!this.reward(owner,session.id))return this.saveCache(owner,session);
    const next = { ...copy(session), updatedAt: new Date().toISOString() };
    this.db.prepare(`INSERT INTO battle_sessions(owner_account_id,id,room_id,status,data_json,updated_at)
      VALUES(?,?,?,?,?,?) ON CONFLICT(owner_account_id,id) DO UPDATE SET
      room_id=excluded.room_id,status=excluded.status,data_json=excluded.data_json,
      revision=battle_sessions.revision+1,updated_at=excluded.updated_at`)
      .run(owner, next.id, next.room?.id || null, next.status, JSON.stringify(next), next.updatedAt);
    return this.session(owner, next.id);
  }
  action(owner, actionId) {
    const row = this.db.prepare("SELECT * FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?").get(owner, actionId)
      ||this.db.prepare("SELECT * FROM battle_action_receipts WHERE owner_account_id=? AND action_id=?").get(owner, actionId);
    return row ? { sessionId: row.session_id, command: JSON.parse(row.command_json), result: row.result_json ? JSON.parse(row.result_json) : null } : null;
  }
  reserve(owner, actionId, sessionId, command) {
    this.db.prepare("INSERT INTO battle_action_receipts(owner_account_id,action_id,session_id,command_json) VALUES(?,?,?,?)").run(owner, actionId, sessionId, JSON.stringify(command));
  }
  reserveTransport(owner,actionId,sessionId,command){
    this.db.prepare('INSERT INTO battle_transport_journal(owner_account_id,action_id,session_id,command_json) VALUES(?,?,?,?)').run(owner,actionId,sessionId,JSON.stringify(command));
  }
  pendingCommand(owner, type, input) {
    const rows=this.db.prepare("SELECT action_id,command_json FROM battle_transport_journal WHERE owner_account_id=? AND result_json IS NULL").all(owner);
    for(const row of rows){const command=JSON.parse(row.command_json);if(command.type===`cloud:${type}`&&sameCommandInput(type,command.input,input))return row.action_id;}
    const actionId=`cloud:${type}:${require('node:crypto').randomUUID()}`;
    this.reserveTransport(owner,actionId,actionId,{type:`cloud:${type}`,input});return actionId;
  }
  resolve(owner, actionId, result) {
    const receipt = result?.snapshot ? { sessionId: result.id, revision: result.revision, resolvedRound: result.snapshot.round } : result;
    const journal=this.db.prepare('SELECT 1 FROM battle_transport_journal WHERE owner_account_id=? AND action_id=?').get(owner,actionId);
    this.db.prepare(`UPDATE ${journal?'battle_transport_journal':'battle_action_receipts'} SET result_json=? WHERE owner_account_id=? AND action_id=?`).run(JSON.stringify(receipt), owner, actionId);
  }
  report(owner, id) {
    const row = this.db.prepare("SELECT id,session_id,data_json,ended_at FROM battle_reports_v2 WHERE owner_account_id=? AND id=?").get(owner, id);
    const cache=this.cached(owner,id,true),before=cache?.legacy?.report;
    if(row&&before&&cache.report&&!this.reward(owner,id)&&['id','session_id','data_json','ended_at'].every(key=>row[key]===before[key]))return cache.report;
    return row ? JSON.parse(row.data_json) : this.cached(owner,id)?.report||null;
  }
  reports(owner, limit = 60) {
    const reports=this.db.prepare("SELECT id FROM battle_reports_v2 WHERE owner_account_id=? ORDER BY ended_at DESC LIMIT ?").all(owner, Math.max(1, Math.min(200, Number(limit) || 60))).map(row => this.report(owner,row.id));
    const known=new Set(reports.map(report=>report.id));
    for(const row of this.db.prepare('SELECT * FROM battle_transport_journal WHERE owner_account_id=?').all(owner).filter(value=>cacheRow(value,owner))){const report=parse(row.result_json)?.report;if(report&&!known.has(report.id))reports.push(report);}
    return reports.sort((a,b)=>String(b.endedAt||'').localeCompare(String(a.endedAt||''))).slice(0,Math.max(1,Math.min(200,Number(limit)||60)));
  }
  saveReport(owner, report, {protocol=false}={}) {
    if(protocol){const session=this.cached(owner,report.sessionId)?.session;if(!session)throw Object.assign(new Error('好友协议快照缺失'),{code:'INVALID_BATTLE_PROTOCOL'});this.saveCache(owner,session,report);return report;}
    this.saveRawReport(owner,{id:report.id,session_id:report.sessionId,data_json:JSON.stringify(report),ended_at:report.endedAt});return report;
  }
  saveRawReport(owner,row,{preserveExisting=false}={}){
    const current=preserveExisting&&this.db.prepare('SELECT id,session_id,data_json,ended_at FROM battle_reports_v2 WHERE owner_account_id=? AND id=?').get(owner,row.id);
    if(current&&!['id','session_id','data_json','ended_at'].every(key=>current[key]===row[key]))throw Object.assign(new Error('本机战报包含不同内容，原记录已保留，请核验原结算'),{code:'CLOUD_LOCAL_CONFLICT'});
    this.db.prepare(`INSERT INTO battle_reports_v2(owner_account_id,id,session_id,data_json,ended_at) VALUES(?,?,?,?,?)
      ON CONFLICT(owner_account_id,id) DO UPDATE SET data_json=excluded.data_json,ended_at=excluded.ended_at`)
      .run(owner,row.id,row.session_id,row.data_json,row.ended_at);
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
