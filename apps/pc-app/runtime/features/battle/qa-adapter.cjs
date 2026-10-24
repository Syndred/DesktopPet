const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { OnlineDuelService } = require('../../services/online-duel-service.cjs');
/** Foundation validates the isolated profile before stores open. No second QA gate or live fallback. */
function readQaProfile(services) {
  const scenario = services.get('qaScenario');
  if (!scenario) return null;
  const marker = join(scenario.profilePath, 'battle-transport.json');
  if (!existsSync(marker)) return { ...scenario };
  const config = JSON.parse(readFileSync(marker, 'utf8')), endpoint = new URL(config.endpoint);
  if (config.runId !== scenario.runId || endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || typeof config.token !== 'string' || config.token.length < 32) throw new Error('QA_TRANSPORT_INVALID');
  return { ...config, ...scenario };
}
function createQaOnline(config) {
  const online = new OnlineDuelService({ supabaseUrl: config.endpoint, supabaseAnonKey: 'isolated-qa-only' });
  online.invoke = async (op, payload = {}) => {
    const response = await fetch(config.endpoint, { method: 'POST', signal: AbortSignal.timeout(5000), headers: { 'content-type': 'application/json', 'x-qa-run': config.runId, 'x-qa-token': config.token }, body: JSON.stringify({ userAccount: online.currentUser?.account, username: online.currentUser?.username, op, ...payload }) });
    const value = await response.json();
    if (!response.ok || value.ok === false) throw Object.assign(new Error(value.message || 'QA transport rejected request'), { code: value.code || 'QA_TRANSPORT_ERROR' });
    return value;
  };
  let notifiedRoom;
  online.subscribeRoom = async () => {
    if (notifiedRoom !== online.room?.id) { notifiedRoom = online.room?.id; online.emit('realtime-status', { status: 'SIMULATED_POLLING', scenarioId: config.runId }); }
  };
  return online;
}
function qaUser(services, owner, config) {
  const user = services.get('accounts')?.privateSession?.();
  if (!config.endpoint || user?.provider !== 'local' || user.ownerAccountId !== owner) throw Object.assign(new Error('需要隔离模拟连接与本机场景账号'), { code: 'QA_TRANSPORT_REQUIRED' });
  return { ...user, id: owner, sessionToken: `qa:${config.runId}:${owner}` };
}
module.exports = { readQaProfile, createQaOnline, qaUser };
