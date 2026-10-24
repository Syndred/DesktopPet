"use strict";
const { GardenError } = require('./service.cjs');
const problem = (code, message) => { throw new GardenError(code, message); };
const EARTH_RADIUS = 6371000;
const dayKey = now => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
function validFix(fix, now) {
  if (!fix || fix.source !== 'os' || fix.coordinateSystem !== 'wgs84') problem('REAL_LOCATION_REQUIRED', '请在附近探索获取系统位置；演示位置不能改变领地归属');
  if (!Number.isFinite(fix.lat) || !Number.isFinite(fix.lng) || Math.abs(fix.lat) > 85 || Math.abs(fix.lng) > 180) problem('INVALID_COORDINATES', '系统位置无效');
  if (!Number.isFinite(fix.timestampMs) || now - fix.timestampMs > 30_000 || fix.timestampMs - now > 5_000) problem('LOCATION_STALE', '位置已过期，请重新获取系统位置');
  if (!Number.isFinite(fix.accuracyMeters) || fix.accuracyMeters <= 0 || fix.accuracyMeters > 80) problem('LOCATION_IMPRECISE', '需要精度在 80 米以内的系统位置');
  return fix;
}
function inside(point, boundary) {
  let result = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[i], b = boundary[j];
    if ((a.lat > point.lat) !== (b.lat > point.lat) && point.lng < (b.lng - a.lng) * (point.lat - a.lat) / (b.lat - a.lat) + a.lng) result = !result;
  }
  return result;
}
class TerritoryService {
  constructor(services, { now = Date.now } = {}) { this.services = services; this.db = services.db; this.now = now; }
  get(territoryId) {
    const row = this.db.prepare('SELECT * FROM garden_territory_records WHERE territory_id=?').get(territoryId);
    if (!row) return null;
    const data = JSON.parse(row.data_json);
    const logs = this.db.prepare('SELECT * FROM garden_territory_logs WHERE territory_id=? ORDER BY id DESC LIMIT 20').all(territoryId).map(l => ({ id: String(l.id), action: ({ invade: '发起入侵', occupy: '占领成功', defend: '守住领地' })[l.action] || l.action, actorName: l.owner_account_id, createdAt: new Date(l.created_at).toISOString() }));
    return { ...data, id: territoryId, ownerAccountId: row.owner_account_id, revision: row.revision, logs };
  }
  listForOwner() {
    return this.db.prepare('SELECT territory_id FROM garden_territory_records ORDER BY updated_at DESC LIMIT 30').all().map(row => this.get(row.territory_id));
  }
  getForOwner({ territoryId }) { return this.get(territoryId); }
  gardenBonusForOwner() { return 0; } // Keep crop balance separate; first version adds no unapproved bonus.
  dailyRemaining(owner, now = this.now()) {
    return 2 - (this.db.prepare('SELECT count FROM garden_territory_attempts WHERE owner_account_id=? AND day_key=?').get(owner, dayKey(now))?.count || 0);
  }
  /** Trusted authoritative import only; not an IPC command. No account UUID conversion. */
  importRecord(record) {
    if (!record || typeof record.id !== 'string' || typeof record.name !== 'string' || !Number.isSafeInteger(record.revision) || record.revision < 1 || !Array.isArray(record.boundary) || record.boundary.length < 3 || record.boundary.some(p => !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) || !Number.isFinite(record.captureMultiplier) || record.captureMultiplier < 1) problem('INVALID_TERRITORY', '领地记录无效');
    const previous = this.get(record.id);
    this.db.prepare(`INSERT INTO garden_territory_records VALUES(?,?,?,?,?) ON CONFLICT(territory_id) DO UPDATE SET
      owner_account_id=excluded.owner_account_id,revision=excluded.revision,data_json=excluded.data_json,updated_at=excluded.updated_at
      WHERE garden_territory_records.revision<excluded.revision`).run(record.id, record.ownerAccountId || null, record.revision, JSON.stringify(record), this.now());
    if (previous && previous.revision < record.revision && previous.ownerAccountId !== record.ownerAccountId) this.db.prepare('DELETE FROM garden_garrisons WHERE territory_id=?').run(record.id);
    return this.get(record.id);
  }
  /** Local world cells are deterministic geographic regions, never sample places. */
  discoverAtSystemFix(fix) {
    validFix(fix, this.now());
    const step = .006, latIndex = Math.floor(fix.lat / step), lngIndex = Math.floor(fix.lng / step);
    const id = `territory:${latIndex}:${lngIndex}`;
    if (!this.get(id)) {
      const south = latIndex * step, west = lngIndex * step;
      this.importRecord({ id, name: '附近的庭院', regionName: `${Math.abs(fix.lat).toFixed(3)}° ${fix.lat >= 0 ? 'N' : 'S'} · ${Math.abs(fix.lng).toFixed(3)}° ${fix.lng >= 0 ? 'E' : 'W'}`, ownerAccountId: null, revision: 1, captureMultiplier: 2, provenance: 'local-geographic', boundary: [{ lat: south, lng: west }, { lat: south + step, lng: west }, { lat: south + step, lng: west + step }, { lat: south, lng: west + step }] });
    }
    return this.get(id);
  }
  currentFix() { return this.services.get('discovery')?.location?.snapshot?.()?.fix || null; }
  startChallenge({ ownerAccountId, petId, territoryId, expectedTerritoryRevision, actionId }) {
    const territory = this.get(territoryId);
    if (!territory) problem('TERRITORY_NOT_FOUND', '找不到这片领地');
    if (territory.ownerAccountId === ownerAccountId) problem('ALREADY_OWNED', '这片领地已经属于你');
    if (territory.revision !== expectedTerritoryRevision) problem('TERRITORY_CONFLICT', '领地归属已更新，请刷新');
    const fix = validFix(this.currentFix(), this.now());
    if (!inside(fix, territory.boundary)) problem('OUT_OF_TERRITORY_RANGE', '请先进入领地区域再发起挑战');
    if (this.dailyRemaining(ownerAccountId) <= 0) problem('DAILY_INVASIONS_USED', '今日两次免费入侵机会已用完');
    const companions = this.services.get('companions');
    if (!companions?.getPet?.(ownerAccountId, petId)) problem('PET_NOT_FOUND', '请选择当前账号的出战伙伴');
    const battle = this.services.get('battle');
    if (!battle?.beginTerritoryChallenge) problem('BATTLE_UNAVAILABLE', '领地挑战服务尚未就绪');
    let opponent = { petId: `guardian:${territory.id}`, petName: '庭院守护者', element: 'wood', level: 1 };
    if (territory.ownerAccountId) {
      const garrison = this.db.prepare('SELECT pet_id FROM garden_garrisons WHERE owner_account_id=? AND territory_id=?').get(territory.ownerAccountId, territory.id);
      if (garrison) {
        try {
          const pet = companions.getPet(territory.ownerAccountId, garrison.pet_id);
          if (pet) opponent = { petId: pet.petId, petName: pet.name, element: pet.element, level: pet.growth.level, resource: pet.resource };
        } catch { /* Released garrison falls back to the region guardian. */ }
      }
    }
    const session = battle.beginTerritoryChallenge({ ownerAccountId, petId, actionId: `garden:${actionId}`, challenge: { id: `${territory.id}:${territory.revision}`, territoryId: territory.id, territoryRevision: territory.revision, opponent } });
    if (!session || session.then || !session.id) problem('BATTLE_UNAVAILABLE', '领地挑战未能创建');
    this.db.prepare('INSERT INTO garden_territory_challenges(owner_account_id,battle_id,territory_id,territory_revision) VALUES (?,?,?,?)').run(ownerAccountId, session.id, territory.id, territory.revision);
    this.db.prepare('INSERT INTO garden_territory_attempts VALUES (?,?,1) ON CONFLICT(owner_account_id,day_key) DO UPDATE SET count=count+1').run(ownerAccountId, dayKey(this.now()));
    this.db.prepare('INSERT INTO garden_territory_logs(territory_id,owner_account_id,action,old_owner_id,new_owner_id,battle_id,created_at) VALUES (?,?,?,?,?,?,?)').run(territory.id, ownerAccountId, 'invade', territory.ownerAccountId, territory.ownerAccountId, session.id, this.now());
    return { sessionId: session.id, territoryId, remainingAttempts: this.dailyRemaining(ownerAccountId) };
  }
  settleChallenge({ ownerAccountId, sessionId }) {
    const record = this.db.prepare('SELECT * FROM garden_territory_challenges WHERE owner_account_id=? AND battle_id=?').get(ownerAccountId, sessionId);
    if (!record) problem('TERRITORY_CHALLENGE_NOT_FOUND', '找不到这次领地挑战');
    if (record.settled) return JSON.parse(record.result_json);
    const outcome = this.services.get('battle')?.getOutcome?.({ ownerAccountId, sessionId });
    if (!outcome?.settled) problem('BATTLE_UNFINISHED', '请先完成这场领地挑战');
    const context = outcome.session?.context;
    if (context?.territoryId !== record.territory_id || context?.territoryRevision !== record.territory_revision || outcome.session.mode !== 'territory') problem('INVALID_BATTLE_RECEIPT', '战斗凭据与领地不一致');
    const territory = this.get(record.territory_id);
    if (territory.revision !== record.territory_revision) problem('TERRITORY_CONFLICT', '战斗期间领地归属已更新，请重新查看');
    const nextOwner = outcome.won ? ownerAccountId : territory.ownerAccountId;
    const next = { ...territory, ownerAccountId: nextOwner, revision: territory.revision + 1, occupiedAt: outcome.won ? new Date(this.now()).toISOString() : territory.occupiedAt };
    this.db.prepare('UPDATE garden_territory_records SET owner_account_id=?,revision=?,data_json=?,updated_at=? WHERE territory_id=? AND revision=?').run(nextOwner, next.revision, JSON.stringify(next), this.now(), territory.id, territory.revision);
    if (nextOwner !== territory.ownerAccountId) this.db.prepare('DELETE FROM garden_garrisons WHERE territory_id=?').run(territory.id);
    this.db.prepare('INSERT INTO garden_territory_logs(territory_id,owner_account_id,action,old_owner_id,new_owner_id,battle_id,created_at) VALUES (?,?,?,?,?,?,?)').run(territory.id, ownerAccountId, outcome.won ? 'occupy' : 'defend', territory.ownerAccountId, nextOwner, sessionId, this.now());
    const result = { territoryId: territory.id, won: outcome.won, ownerAccountId: nextOwner, territoryRevision: next.revision, captureMultiplier: outcome.won ? territory.captureMultiplier : 1 };
    this.db.prepare('UPDATE garden_territory_challenges SET settled=1,result_json=? WHERE owner_account_id=? AND battle_id=?').run(JSON.stringify(result), ownerAccountId, sessionId);
    return result;
  }
  applyCaptureBonus({ ownerAccountId, territoryId, baseReward }) {
    if (!Number.isFinite(baseReward) || baseReward < 0) problem('INVALID_REWARD', '捕捉收益无效');
    const territory = this.get(territoryId); if (!territory) problem('TERRITORY_NOT_FOUND', '找不到这片领地');
    const multiplier = territory.ownerAccountId === ownerAccountId ? territory.captureMultiplier : 1;
    return { finalReward: Number((baseReward * multiplier).toFixed(2)), multiplier };
  }
}
module.exports = { TerritoryService, validFix, inside, dayKey, EARTH_RADIUS };
