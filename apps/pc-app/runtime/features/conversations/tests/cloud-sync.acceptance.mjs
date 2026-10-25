// Requires approved 08 personal-save projection and 02 legal cloud adoption.
// Real Supabase saves + two real Electron processes on one host. Model calls use
// actual loopback connection failure/stall, without a synthetic model response.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';

const configPath = process.env.LINGJING_PUBLIC_CONFIG || 'C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/cloud-upgrade/2026-10-25/public-runtime-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
assert.equal(new URL(config.url || config.supabaseUrl).hostname, 'jbvrdmrkwpznbrvteive.supabase.co');
const output = resolve('artifacts/conversations/cloud-sync', `run-${Date.now()}`); mkdirSync(output, { recursive: true });
const account = `convpair_${Date.now().toString(36)}`, password = `Aa9!${randomBytes(20).toString('base64url')}`;
const keys = { a: `LOCAL-A-${randomUUID()}`, b: `LOCAL-B-${randomUUID()}` };
const checks = [], errors = [], clients = [], observedPushes = [];
const evidence = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  build: JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json', 'utf8')), realCloud: true, realElectron: true, sameHost: true,
  projectRef: 'jbvrdmrkwpznbrvteive', privilegedWrites: 0, syntheticModelResponses: false, checks, rendererErrors: errors,
  modelTransport: 'actual loopback connection refusal and stalled socket cancellation; no external provider/model success claimed',
  offlineTransport: 'explicit test injection causes actual loopback connection refusal for one cloud push; restart uses real HTTPS service' };
const record = (name, data) => { checks.push({ name, data }); console.log('PASS', name); };
const invoke = (c, feature, command, payload = {}) => c.page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
async function call(c, feature, command, payload) { const r = await invoke(c, feature, command, payload); assert.equal(r.ok, true, `${feature}.${command}: ${r.code} ${r.message}`); return r.data; }
async function until(predicate, name) { const end = Date.now() + 15000; while (!await predicate()) { assert.ok(Date.now() < end, `Timed out: ${name}`); await new Promise(done => setTimeout(done, 60)); } }
const closedBase = await new Promise((done, reject) => { const s = createServer(); s.on('error', reject); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(error => error ? reject(error) : done(`http://127.0.0.1:${port}/v1`)); }); });
const sockets = new Set(), stalled = createServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}); });
await new Promise((done, reject) => { stalled.on('error', reject); stalled.listen(0, '127.0.0.1', done); });
const stallBase = `http://127.0.0.1:${stalled.address().port}/v1`;
async function launch(label, existingProfile) {
  const profile = existingProfile || join(output, `profile-${label}`); if (!existingProfile) mkdirSync(profile);
  const env = { ...process.env, PET_USER_DATA_DIR: profile, LINGJING_PUBLIC_CONFIG: configPath };
  delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_QA_SCENARIO; delete env.LINGJING_LEGACY_AUTH;
  const app = await electron.launch({ args: [resolve('.')], env }), page = await app.firstWindow();
  page.on('pageerror', error => errors.push({ label, message: error.message })); await page.waitForFunction(() => Boolean(window.lingjing));
  const c = { app, page, profile, label, closed: false }; clients.push(c);
  await app.evaluate((_electron, servicePath) => {
    const require = process.getBuiltinModule('node:module').createRequire(servicePath), { AccountsService } = require(servicePath);
    const original = AccountsService.prototype.session;
    AccountsService.prototype.session = function (...args) { globalThis.__conversationCloudAccounts = this; return original.apply(this, args); };
  }, resolve('apps/pc-app/runtime/features/accounts/service.cjs'));
  await call(c, 'accounts', 'session'); return c;
}
async function close(c) { await c.app.close(); c.closed = true; }
async function configure(c, baseUrl) {
  const s = await call(c, 'conversations', 'snapshot');
  return call(c, 'conversations', 'connection.save', { petId: null, revision: s.globalConnection?.revision || 0,
    connection: { provider: 'openai_compatible', baseUrl, model: 'no-fake-reply', contextChars: 24000, maxOutputTokens: 64 }, apiKey: keys[c.label] });
}
async function restore(c, mode = 'replace') {
  const preview = await call(c, 'accounts', 'cloudPreview');
  await call(c, 'accounts', 'backupRestore', { previewId: preview.previewId, mode, actionId: randomUUID() }); return preview;
}
async function enableSync(c) {
  const settings = await call(c, 'accounts', 'settingsGet'); settings.document.sync.enabled = true;
  await call(c, 'accounts', 'settingsSave', { document: settings.document, revision: settings.revision });
}
async function observePushPrivacy(c) {
  await c.app.evaluate((_electron, localKeys) => {
    const remote = globalThis.__conversationCloudAccounts.remote, original = remote.fetcher;
    globalThis.__conversationCloudPushes = [];
    remote.fetcher = async (url, init) => {
      if (String(url).endsWith('/functions/v1/lingjing-save')) {
        const request = JSON.parse(init.body);
        if (request.op === 'push') {
          const json = JSON.stringify(request.envelope), proof = remote.active;
          const db = globalThis.__conversationCloudAccounts.db;
          const ciphers = db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE encrypted_key IS NOT NULL').all().map(row => row.encrypted_key);
          globalThis.__conversationCloudPushes.push({ actionId: request.actionId, checksum: request.envelope.checksum,
            safe: ![...localKeys, ...ciphers, proof?.accessToken, proof?.refreshToken].filter(Boolean).some(value => json.includes(value)) && !/"(?:apiKey|api_key|encrypted_key|accessToken|refreshToken|sessionToken)"\s*:/.test(json) });
        }
      }
      return original(url, init);
    };
  }, Object.values(keys));
}
async function sendFailed(c, petId, text) {
  const actionId = randomUUID(), result = await invoke(c, 'conversations', 'send', { petId, text, actionId });
  assert.equal(result.code, 'NETWORK_ERROR'); return actionId;
}
async function snapshot(c, petId) { return call(c, 'conversations', 'snapshot', { petId }); }
async function assertStoredKey(c, owner) {
  const db = new DatabaseSync(join(c.profile, 'lingjing.sqlite'), { readOnly: true }); db.exec('PRAGMA query_only=ON');
  const row = db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE owner_account_id=?').get(owner);
  const rows = db.prepare('SELECT id,pet_id,action_id,role,status,content FROM conversation_messages WHERE owner_account_id=? ORDER BY sequence').all(owner); db.close();
  assert.ok(row?.encrypted_key && !row.encrypted_key.includes(keys[c.label]));
  return { cipherHash: createHash('sha256').update(row.encrypted_key).digest('hex'), ids: rows.map(item => item.id) };
}
try {
  let a = await launch('a');
  await call(a, 'accounts', 'register', { provider: 'runtime', account, password, confirmPassword: password, username: '聊天跨端验收', rememberSession: true });
  const b = await launch('b'); await call(b, 'accounts', 'login', { provider: 'runtime', account, password, rememberSession: true });
  const owner = (await call(a, 'accounts', 'session')).currentUser.id;
  assert.equal((await call(b, 'accounts', 'session')).currentUser.id, owner);
  // This public adoption must execute the approved server transaction, not the
  // former local-only implementation. Verify its authoritative readback below.
  const adopted = await call(a, 'companions', 'adopt', { templateId: 'big-fish-gentle', name: '跨端原伙伴', showOnDesktop: false, actionId: randomUUID() });
  const pet = adopted.pet, petId = pet.petId; assert.equal(pet.ownerAccountId, owner);
  await restore(b); const cloudPets = await call(b, 'companions', 'list');
  assert.ok(cloudPets.pets.some(item => item.petId === petId));
  record('Legal public cloud adoption is read back on B with the original petId', { owner, petId });
  await configure(a, closedBase); await configure(b, closedBase);
  await enableSync(a); await enableSync(b); await observePushPrivacy(a); await observePushPrivacy(b);
  await call(a, 'conversations', 'select', { petId });
  const firstAction = await sendFailed(a, petId, 'A 的第一条真实用户消息');
  await configure(a, stallBase);
  const cancelledAction = randomUUID(), pending = invoke(a, 'conversations', 'send', { petId, text: 'A 的取消消息', actionId: cancelledAction });
  await until(async () => sockets.size > 0 && (await snapshot(a, petId)).messages.at(-1)?.status === 'pending', 'actual pending request and accepted socket');
  await call(a, 'conversations', 'cancel', { petId }); const cancellation = await pending; assert.equal(cancellation.code, 'CANCELLED');
  await configure(a, closedBase);
  let state = await snapshot(a, petId);
  await call(a, 'conversations', 'profile.save', { petId, revision: state.profile.revision, profile: { ...state.profile, persona: 'A 已同步的人设' } });
  await call(a, 'conversations', 'memory.save', { petId, memory: { content: 'A 已同步的记忆' } });
  state = await snapshot(a, petId); const originalIds = state.messages.map(row => row.id);
  assert.equal(state.messages[1].status, 'failed'); assert.equal(state.messages[3].status, 'cancelled');
  assert.ok(state.messages.filter(row => row.role === 'assistant').every(row => row.content === ''));
  const sentA = await call(a, 'accounts', 'syncNow', { actionId: randomUUID() }); assert.equal(sentA.verified, true);
  await restore(b); let stateB = await snapshot(b, petId);
  assert.deepEqual(stateB.messages.map(row => row.id), originalIds); assert.equal(stateB.profile.persona, state.profile.persona);
  assert.deepEqual(stateB.memories, state.memories); assert.equal(stateB.globalConnection.hasKey, true);
  const keyA = await assertStoredKey(a, owner), keyB = await assertStoredKey(b, owner); assert.notEqual(keyA.cipherHash, keyB.cipherHash);
  record('Actual HTTPS CAS preserves message IDs/order, failed/cancelled turns, persona and memory on B; each device retains its own key', { receipt: sentA, originalIds, firstAction, cancelledAction });
  // Both devices edit after the same readback; B wins the next revision, and A
  // must preserve its failed CAS/outbox until an explicit conflict choice.
  state = await snapshot(a, petId);
  await call(a, 'conversations', 'profile.save', { petId, revision: state.profile.revision, profile: { ...state.profile, persona: 'A 未同步的人设冲突' } });
  await call(b, 'conversations', 'profile.save', { petId, revision: stateB.profile.revision, profile: { ...stateB.profile, persona: 'B 的较新人设' } });
  await call(b, 'conversations', 'memory.delete', { petId, id: stateB.memories[0].id, revision: stateB.memories[0].revision });
  const sentB = await call(b, 'accounts', 'syncNow', { actionId: randomUUID() }); assert.equal(sentB.verified, true);
  const conflicted = await invoke(a, 'accounts', 'syncNow', { actionId: randomUUID() }); assert.equal(conflicted.code, 'SYNC_CONFLICT');
  assert.equal((await call(a, 'accounts', 'syncStatus')).conflicts, 1);
  const preview = await call(a, 'accounts', 'cloudPreview');
  const merge = await invoke(a, 'accounts', 'backupRestore', { previewId: preview.previewId, mode: 'merge', actionId: randomUUID() });
  assert.equal(merge.code, 'CONVERSATION_MERGE_CONFLICT'); assert.equal((await snapshot(a, petId)).profile.persona, 'A 未同步的人设冲突');
  await restore(a); state = await snapshot(a, petId);
  assert.equal(state.profile.persona, 'B 的较新人设'); assert.equal(state.memories.length, 0); assert.deepEqual(state.messages.map(row => row.id), originalIds);
  assert.equal((await call(a, 'accounts', 'syncStatus')).conflicts, 0);
  assert.ok((await call(a, 'accounts', 'backupList')).length > 0);
  record('Real stale CAS is rejected; conflicting merge rolls back, explicit replace restores B and memory deletion with a local safety backup', { bReceipt: sentB, casCode: conflicted.code, mergeCode: merge.code });
  await sendFailed(a, petId, '断网待重试的用户消息'); await call(a, 'conversations', 'memory.save', { petId, memory: { content: '重启后应读回的记忆' } });
  const offlineAction = randomUUID(), beforeRestart = await snapshot(a, petId);
  await a.app.evaluate((_electron, closedBase) => {
    const remote = globalThis.__conversationCloudAccounts.remote, original = remote.fetcher;
    remote.fetcher = (url, init) => String(url).endsWith('/functions/v1/lingjing-save') && JSON.parse(init.body).op === 'push'
      ? fetch(closedBase, { signal: AbortSignal.timeout(2000) }) : original(url, init);
  }, closedBase);
  const offline = await invoke(a, 'accounts', 'syncNow', { actionId: offlineAction }); assert.equal(offline.code, 'CLOUD_UNAVAILABLE');
  assert.equal((await call(a, 'accounts', 'syncStatus')).pending, 1);
  observedPushes.push(...await a.app.evaluate(() => globalThis.__conversationCloudPushes));
  const profileA = a.profile; await close(a); a = await launch('a', profileA);
  assert.equal((await call(a, 'accounts', 'session')).currentUser.id, owner); await observePushPrivacy(a);
  const retried = await call(a, 'accounts', 'syncRetry'); assert.equal(retried.verified, true); assert.equal(retried.actionId, offlineAction);
  await restore(b); stateB = await snapshot(b, petId);
  assert.deepEqual(stateB.messages.map(row => row.id), beforeRestart.messages.map(row => row.id)); assert.deepEqual(stateB.memories, beforeRestart.memories);
  assert.equal((await assertStoredKey(a, owner)).cipherHash, keyA.cipherHash); assert.equal((await assertStoredKey(b, owner)).cipherHash, keyB.cipherHash);
  record('A persists the failed cloud outbox and local key across process restart; exact action retries through real HTTPS and B independently reads it back', { injectedFailure: offline.code, retry: retried, finalIds: stateB.messages.map(row => row.id) });
  for (const c of [a, b]) { observedPushes.push(...await c.app.evaluate(() => globalThis.__conversationCloudPushes)); assert.equal(await c.page.evaluate(() => localStorage.length), 0); }
  assert.ok(observedPushes.length >= 4 && observedPushes.every(row => row.safe)); assert.deepEqual(errors, []);
  evidence.privacyChecks = observedPushes; evidence.owner = owner; evidence.petId = petId; evidence.fullChatSync = true; evidence.status = 'passed';
  await b.page.evaluate(() => { location.hash = '#/chat'; });
  await b.page.getByRole('log', { name: '聊天记录' }).waitFor(); await b.page.screenshot({ path: join(output, 'cloud-restored-chat.png'), fullPage: true });
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ status: 'passed', checks: checks.length, fullChatSync: true, output }));
} catch (error) { evidence.status = 'failed'; evidence.error = { message: error.message, stack: error.stack }; writeFileSync(join(output, 'failure.json'), JSON.stringify(evidence, null, 2)); throw error; }
finally { for (const c of clients) if (!c.closed) await close(c); for (const socket of sockets) socket.destroy(); await new Promise(done => stalled.close(done)); }
