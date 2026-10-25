// Uses approved 08 projection and deployed 02 adoption through main cloudActor.
// Adoption is a server-path acceptance; final companion UI routing is separate.
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
const runId = randomUUID();
const account = `convpair_${Date.now().toString(36)}`, password = `Aa9!${randomBytes(20).toString('base64url')}`;
const keys = { a: `LOCAL-A-${randomUUID()}`, b: `LOCAL-B-${randomUUID()}`, aPet: `LOCAL-A-PET-${randomUUID()}`, bPet: `LOCAL-B-PET-${randomUUID()}` };
// User-authored examples are text, not connection credentials. The real local
// provider keys above must be excluded while these exact bytes survive cloud CAS.
const authored = {
  message: JSON.stringify({ apiKey: 'example-only', nested: { password: 'demo', encrypted_key: 'example-cipher' }, unicode: '💬 中文', literal: 'a\\nb' }),
  persona: JSON.stringify({ apiKey: 'persona-example', code: '{"password":"inner-example"}' }),
  memory: JSON.stringify({ Authorization: 'example-value', refresh_token: 'example-placeholder', note: '记忆正文示例' })
};
const checks = [], errors = [], clients = [], observedPushes = [];
const evidence = { at: new Date().toISOString(), runId, taskId: '01a16dc5-c418-7372-ac4b-1d9abb116865', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  build: JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json', 'utf8')), realCloud: true, realElectron: true, sameHost: true,
  projectRef: 'jbvrdmrkwpznbrvteive', privilegedWrites: 0, syntheticModelResponses: false, checks, rendererErrors: errors,
  adoptionPath: 'actual main-only accounts.requireCloudActor().invoke(companions-sync), then public Accounts cloudPreview/backupRestore; final companion UI adoption is not claimed',
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
  const c = { app, page, profile, label, closed: false, pid: app.process().pid }; clients.push(c);
  await app.evaluate((_electron, servicePath) => {
    const require = process.getBuiltinModule('node:module').createRequire(servicePath), { AccountsService } = require(servicePath);
    const original = AccountsService.prototype.session;
    AccountsService.prototype.session = function (...args) { globalThis.__conversationCloudAccounts = this; return original.apply(this, args); };
  }, resolve('apps/pc-app/runtime/features/accounts/service.cjs'));
  await call(c, 'accounts', 'session'); return c;
}
async function close(c) { await c.app.close(); c.closed = true; }
async function configure(c, baseUrl, petId = null) {
  const s = await call(c, 'conversations', 'snapshot', petId ? { petId } : {});
  return call(c, 'conversations', 'connection.save', { petId, revision: (petId ? s.connection : s.globalConnection)?.revision || 0,
    connection: { provider: 'openai_compatible', baseUrl, model: 'no-fake-reply', contextChars: 24000, maxOutputTokens: 64 }, apiKey: keys[petId ? `${c.label}Pet` : c.label] });
}
async function adopt(c, reader, owner, name) {
  const input = { templateId: 'big-fish-gentle', name, showOnDesktop: false, actionId: randomUUID() };
  const receipt = await c.app.evaluate(async (_electron, input) => {
    const ctx = await globalThis.__conversationCloudAccounts.requireCloudActor();
    const r = await ctx.invoke('companions-sync', { op: 'command', command: 'adopt', input });
    return { pet: r.result?.data?.pet, actionId: r.actionId, revision: r.revision, checksum: r.checksum, ownerAccountId: r.ownerAccountId, authority: r.authority };
  }, input);
  assert.equal(receipt.authority, 'live'); assert.equal(receipt.ownerAccountId, owner);
  assert.equal(receipt.actionId, `companions:${input.actionId}`); assert.equal(receipt.pet.ownerAccountId, owner);
  const readback = await reader.app.evaluate(async (_electron, actionId) => {
    const ctx = await globalThis.__conversationCloudAccounts.requireCloudActor(), r = await ctx.invoke('lingjing-save', { op: 'read', actionId });
    return { actionId: r.actionId, revision: r.revision, checksum: r.checksum, petIds: r.envelope.data.modules.companions.data.tables.companion_pets.map(row => row.pet_id) };
  }, receipt.actionId);
  assert.equal(readback.checksum, receipt.checksum); assert.equal(readback.revision, receipt.revision); assert.ok(readback.petIds.includes(receipt.pet.petId));
  return { receipt, readback };
}
async function restore(c, mode = 'replace') {
  const preview = await call(c, 'accounts', 'cloudPreview');
  await call(c, 'accounts', 'backupRestore', { previewId: preview.previewId, mode, actionId: randomUUID() }); return preview;
}
async function enableSync(c) {
  const settings = await call(c, 'accounts', 'settingsGet'); settings.document.sync.enabled = true;
  await call(c, 'accounts', 'settingsSave', { document: settings.document, revision: settings.revision, actionId: randomUUID() });
}
async function observePushPrivacy(c) {
  await c.app.evaluate((_electron, localKeys) => {
    const remote = globalThis.__conversationCloudAccounts.remote, original = remote.fetcher;
    globalThis.__conversationCloudPushes = [];
    remote.fetcher = async (url, init) => {
      if (String(url).endsWith('/functions/v1/lingjing-save')) {
        const request = JSON.parse(init.body);
        if (request.op === 'push' || request.op === 'archive') {
          const json = JSON.stringify(request.envelope), proof = remote.active;
          const db = globalThis.__conversationCloudAccounts.db;
          const ciphers = db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE encrypted_key IS NOT NULL').all().map(row => row.encrypted_key);
          globalThis.__conversationCloudPushes.push({ op: request.op, actionId: request.actionId, checksum: request.envelope.checksum,
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
const comparableMessages = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'sequence')));
async function assertStoredKey(c, owner) {
  const db = new DatabaseSync(join(c.profile, 'lingjing.sqlite'), { readOnly: true }); db.exec('PRAGMA query_only=ON');
  const credentials = db.prepare('SELECT scope,scope_id,encrypted_key FROM conversation_credentials WHERE owner_account_id=? ORDER BY scope,scope_id').all(owner);
  const rows = db.prepare('SELECT sequence,id,pet_id,action_id,role,status,content FROM conversation_messages WHERE owner_account_id=? ORDER BY sequence').all(owner);
  const memories = db.prepare('SELECT id,pet_id,content FROM conversation_memories WHERE owner_account_id=? ORDER BY id').all(owner); db.close();
  assert.equal(credentials.length, 2);
  assert.ok(credentials.every(row => row.encrypted_key && Object.values(keys).every(key => !row.encrypted_key.includes(key))));
  const hash = text => createHash('sha256').update(text).digest('hex');
  return { owner, profile: c.profile, pid: c.pid, cipherHashes: credentials.map(row => ({ scope: row.scope, scopeId: row.scope_id, hash: hash(row.encrypted_key) })),
    rows: rows.map(({ content, ...row }) => ({ ...row, contentHash: hash(content) })), memories: memories.map(({ content, ...row }) => ({ ...row, contentHash: hash(content) })) };
}
try {
  let a = await launch('a');
  await call(a, 'accounts', 'register', { provider: 'runtime', account, password, confirmPassword: password, username: '聊天跨端验收', rememberSession: true });
  const b = await launch('b'); await call(b, 'accounts', 'login', { provider: 'runtime', account, password, rememberSession: true });
  const owner = (await call(a, 'accounts', 'session')).currentUser.id;
  assert.equal((await call(b, 'accounts', 'session')).currentUser.id, owner);
  const adopted = await adopt(a, b, owner, '跨端原伙伴'), adoptedSecond = await adopt(a, b, owner, '同模板第二只');
  const petId = adopted.receipt.pet.petId, secondPetId = adoptedSecond.receipt.pet.petId; assert.notEqual(petId, secondPetId);
  assert.equal(adopted.receipt.pet.templateId, adoptedSecond.receipt.pet.templateId);
  await restore(a);
  await restore(b); const cloudPets = await call(b, 'companions', 'list');
  assert.ok([petId, secondPetId].every(id => cloudPets.pets.some(item => item.petId === id)));
  record('Main cloudActor legally adopts two same-template pets; B independently reads both exact action receipts and IDs', { owner, adopted, adoptedSecond });
  await configure(a, closedBase); await configure(b, closedBase);
  await configure(a, closedBase, secondPetId); await configure(b, closedBase, secondPetId);
  await enableSync(a); await enableSync(b); await observePushPrivacy(a); await observePushPrivacy(b);
  await call(a, 'conversations', 'select', { petId });
  const firstAction = await sendFailed(a, petId, authored.message);
  await configure(a, stallBase);
  const cancelledAction = randomUUID(), pending = invoke(a, 'conversations', 'send', { petId, text: 'A 的取消消息', actionId: cancelledAction });
  await until(async () => sockets.size > 0 && (await snapshot(a, petId)).messages.at(-1)?.status === 'pending', 'actual pending request and accepted socket');
  await call(a, 'conversations', 'cancel', { petId }); const cancellation = await pending; assert.equal(cancellation.code, 'CANCELLED');
  await configure(a, closedBase);
  let state = await snapshot(a, petId);
  await call(a, 'conversations', 'profile.save', { petId, revision: state.profile.revision, profile: { ...state.profile, persona: authored.persona } });
  await call(a, 'conversations', 'memory.save', { petId, memory: { content: authored.memory } });
  const secondProfile = await snapshot(a, secondPetId);
  await call(a, 'conversations', 'profile.save', { petId: secondPetId, revision: secondProfile.profile.revision, profile: { ...secondProfile.profile, persona: '第二只的独立人设', useOverride: true } });
  await call(a, 'conversations', 'memory.save', { petId: secondPetId, memory: { content: '只属于第二只的记忆' } });
  await sendFailed(a, secondPetId, '只属于第二只的用户消息');
  const secondBefore = await snapshot(a, secondPetId);
  state = await snapshot(a, petId); const originalIds = state.messages.map(row => row.id);
  assert.equal(state.messages[1].status, 'failed'); assert.equal(state.messages[3].status, 'cancelled');
  assert.ok(state.messages.filter(row => row.role === 'assistant').every(row => row.content === ''));
  const sentA = await call(a, 'accounts', 'syncNow', { actionId: randomUUID() }); assert.equal(sentA.personalVerified, true);
  await restore(b); let stateB = await snapshot(b, petId);
  assert.deepEqual(comparableMessages(stateB.messages), comparableMessages(state.messages));
  assert.deepEqual(stateB.messages.map(row => row.id), originalIds); assert.equal(stateB.profile.persona, authored.persona);
  assert.equal(stateB.messages.find(row => row.actionId === firstAction && row.role === 'user').content, authored.message);
  assert.equal(stateB.memories[0].content, authored.memory);
  assert.deepEqual(stateB.memories, state.memories); assert.equal(stateB.globalConnection.hasKey, true);
  const secondOnB = await snapshot(b, secondPetId);
  assert.deepEqual(comparableMessages(secondOnB.messages), comparableMessages(secondBefore.messages)); assert.deepEqual(secondOnB.memories, secondBefore.memories);
  assert.equal(secondOnB.profile.persona, secondBefore.profile.persona); assert.equal(secondOnB.connection.hasKey, true);
  const keyA = await assertStoredKey(a, owner), keyB = await assertStoredKey(b, owner); assert.notDeepEqual(keyA.cipherHashes, keyB.cipherHashes);
  record('Actual HTTPS CAS preserves message IDs/order, cancelled/failed states and exact user-authored JSON in message/persona/memory; each device retains its own key', { receipt: sentA, originalIds, firstAction, cancelledAction, authoredTextUnchanged: true });
  // Both devices edit after the same readback; B wins the next revision, and A
  // must preserve its failed CAS/outbox until an explicit conflict choice.
  state = await snapshot(a, petId);
  await call(a, 'conversations', 'profile.save', { petId, revision: state.profile.revision, profile: { ...state.profile, persona: 'A 未同步的人设冲突' } });
  await call(b, 'conversations', 'profile.save', { petId, revision: stateB.profile.revision, profile: { ...stateB.profile, persona: 'B 的较新人设' } });
  await call(b, 'conversations', 'memory.delete', { petId, id: stateB.memories[0].id, revision: stateB.memories[0].revision });
  const sentB = await call(b, 'accounts', 'syncNow', { actionId: randomUUID() }); assert.equal(sentB.personalVerified, true);
  const conflicted = await invoke(a, 'accounts', 'syncNow', { actionId: randomUUID() }); assert.equal(conflicted.code, 'SYNC_CONFLICT');
  assert.equal((await call(a, 'accounts', 'syncStatus')).conflicts, 1);
  const preview = await call(a, 'accounts', 'cloudPreview');
  const merge = await invoke(a, 'accounts', 'backupRestore', { previewId: preview.previewId, mode: 'merge', actionId: randomUUID() });
  assert.equal(merge.code, 'CONVERSATION_MERGE_CONFLICT'); assert.equal((await snapshot(a, petId)).profile.persona, 'A 未同步的人设冲突');
  await restore(a); state = await snapshot(a, petId);
  assert.equal(state.profile.persona, 'B 的较新人设'); assert.equal(state.memories.length, 0); assert.deepEqual(state.messages.map(row => row.id), originalIds);
  assert.equal((await call(a, 'accounts', 'syncStatus')).conflicts, 0);
  assert.deepEqual(comparableMessages((await snapshot(a, secondPetId)).messages), comparableMessages(secondBefore.messages));
  assert.deepEqual((await snapshot(a, secondPetId)).memories, secondBefore.memories);
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
  const profileA = a.profile, previousPid = a.pid; await close(a); a = await launch('a', profileA); assert.notEqual(a.pid, previousPid);
  assert.equal((await call(a, 'accounts', 'session')).currentUser.id, owner); await observePushPrivacy(a);
  let retried = await call(a, 'accounts', 'syncRetry');
  if (retried.idle) {
    // Startup may have already flushed the durable row before the explicit
    // retry command. Independently read this exact action from the real service.
    const receipt = await a.app.evaluate(async (_electron, actionId) => {
      const ctx = await globalThis.__conversationCloudAccounts.requireCloudActor();
      const r = await ctx.invoke('lingjing-save', { op: 'read', actionId });
      return { actionId: r.actionId, revision: r.revision, checksum: r.envelope?.checksum };
    }, offlineAction);
    assert.equal(receipt.actionId, offlineAction); assert.ok(receipt.checksum);
    retried = { ...retried, ...receipt, completedDuringStartup: true };
  } else assert.equal(retried.personalVerified, true);
  assert.equal(retried.actionId, offlineAction);
  await restore(b); stateB = await snapshot(b, petId);
  assert.deepEqual(comparableMessages(stateB.messages), comparableMessages(beforeRestart.messages)); assert.deepEqual(stateB.memories, beforeRestart.memories);
  const nativeA = await assertStoredKey(a, owner), nativeB = await assertStoredKey(b, owner);
  assert.deepEqual(nativeA.cipherHashes, keyA.cipherHashes); assert.deepEqual(nativeB.cipherHashes, keyB.cipherHashes);
  const finalSecond = await snapshot(b, secondPetId);
  assert.deepEqual(comparableMessages(finalSecond.messages), comparableMessages(secondBefore.messages)); assert.deepEqual(finalSecond.memories, secondBefore.memories);
  evidence.sqliteReadback = { a: nativeA, b: nativeB, previousPidA: previousPid };
  record('A persists the failed cloud outbox and local key across process restart; exact action retries through real HTTPS and B independently reads it back', { injectedFailure: offline.code, retry: retried, finalIds: stateB.messages.map(row => row.id) });
  for (const c of [a, b]) { observedPushes.push(...await c.app.evaluate(() => globalThis.__conversationCloudPushes)); assert.equal(await c.page.evaluate(() => localStorage.length), 0); }
  assert.ok(observedPushes.filter(row => row.op === 'push').length >= 4 && observedPushes.every(row => row.safe)); assert.deepEqual(errors, []);
  evidence.privacyChecks = observedPushes; evidence.owner = owner; evidence.petIds = [petId, secondPetId]; evidence.fullChatSync = true; evidence.status = 'passed';
  evidence.runtime = (await call(b, 'app', 'info')).runtime;
  await b.page.evaluate(() => { location.hash = '#/chat'; });
  await b.page.getByRole('log', { name: '聊天记录' }).waitFor(); await b.page.screenshot({ path: join(output, 'cloud-restored-chat.png'), fullPage: true });
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ status: 'passed', checks: checks.length, fullChatSync: true, output }));
} catch (error) { evidence.status = 'failed'; evidence.error = { message: error.message, stack: error.stack }; writeFileSync(join(output, 'failure.json'), JSON.stringify(evidence, null, 2)); throw error; }
finally { for (const c of clients) if (!c.closed) await close(c); for (const socket of sockets) socket.destroy(); await new Promise(done => stalled.close(done)); }
