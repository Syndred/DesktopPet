/* eslint-disable @typescript-eslint/no-require-imports -- Node/Electron tests use CommonJS. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('node:http');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { migrations, createConversationsFeature } = require('../index.cjs');
const { requestCompletion } = require('../transport.cjs');

// A local HTTP protocol fixture, never presented as a successful cloud/model call.
async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-conversation-'));
  const path = join(directory, 'conversations.sqlite');
  const requests = [];
  const events = [];
  let behavior = 'success';
  let closedWhileStreaming = 0;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    requests.push({ body, authorization: req.headers.authorization });
    if (behavior === 'auth') { res.writeHead(401); res.end(JSON.stringify({ error: { message: req.headers.authorization + raw } })); return; }
    if (behavior === 'rate') { res.writeHead(429); res.end('{}'); return; }
    if (behavior === 'json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ choices: [{ message: { content: 'JSON text' } }] })); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const emit = value => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: value } }] })}\r\n\r\n`);
    // Chinese UTF-8 and CRLF boundaries exercise the actual fetch reader/parser.
    emit('收到');
    if (behavior === 'truncate') { res.end(); return; }
    if (behavior === 'wait') { res.on('close', () => { closedWhileStreaming++; }); return; }
    emit('，这是协议测试响应。');
    res.end('data: [DONE]\r\n\r\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  const encryptionKey = randomBytes(32);
  const secrets = {
    available: () => true,
    encrypt(value) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64'); },
    decrypt(value) { const data = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', encryptionKey, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28)); return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'); }
  };
  const listeners = new Set();
  let session = { ownerAccountId: 'account-A', sessionId: 'session-A' };
  const pets = owner => [{ petId: 'same-shape-one', ownerAccountId: owner, templateId: 'same-template', name: '鱼丸', growth: { level: 8 } },
    { petId: 'same-shape-two', ownerAccountId: owner, templateId: 'same-template', name: '小蓝', growth: { level: 2 } }];
  let db;
  let feature;
  function open() {
    db = new DatabaseSync(path); for (const migration of migrations) db.exec(migration.sql);
    feature = createConversationsFeature({ db, secrets, getSession: () => session, listPets: pets,
      onSessionChanged: callback => { listeners.add(callback); return () => listeners.delete(callback); },
      publish: event => events.push(event) });
  }
  open();
  async function call(command, payload = {}) { return feature.invoke(command, payload); }
  async function ok(command, payload = {}) { const result = await call(command, payload); assert.equal(result.ok, true, result.message); return result.data; }
  async function config(petId = null, apiKey = 'synthetic-fixture-key') {
    const old = feature.service.store.getConnection(session.ownerAccountId, petId);
    return ok('connection.save', { petId, connection: { provider: 'openai_compatible', baseUrl, model: 'fixture-model', contextChars: 12000, maxOutputTokens: 512 }, apiKey, revision: old?.revision ?? 0 });
  }
  async function waitFor(predicate) {
    const until = Date.now() + 2500;
    while (!predicate()) { if (Date.now() > until) throw new Error('Timed out waiting for real HTTP/SQLite state'); await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  t.after(async () => {
    feature.dispose(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    db.close(); rmSync(directory, { recursive: true, force: true });
  });
  return { call, ok, config, requests, events, baseUrl, secrets, waitFor,
    get feature() { return feature; }, get db() { return db; },
    setBehavior(value) { behavior = value; }, get aborted() { return closedWhileStreaming; },
    switchAccount(owner) { session = owner ? { ownerAccountId: owner, sessionId: `session-${Date.now()}-${Math.random()}` } : null; for (const callback of listeners) callback(); },
    restart() { feature.dispose(); db.close(); open(); }
  };
}

test('account + pet instance isolates personas, notes, selections and durable history', async t => {
  const f = await fixture(t);
  await f.config();
  const a = await f.ok('snapshot');
  assert.equal(a.pets[0].templateId, a.pets[1].templateId);
  await f.ok('profile.save', { petId: 'same-shape-one', revision: 0, profile: { ...a.profile, persona: 'persona-only-one', replyStyle: 'warm' } });
  await f.ok('memory.save', { petId: 'same-shape-one', memory: { content: 'note-only-one' } });
  await f.ok('send', { petId: 'same-shape-one', actionId: 'one-turn', text: 'hello-one' });
  const firstRequest = f.requests.at(-1).body;
  assert.match(JSON.stringify(firstRequest), /persona-only-one/);
  assert.match(JSON.stringify(firstRequest), /note-only-one/);
  const two = await f.ok('select', { petId: 'same-shape-two', ownerAccountId: 'forged-owner' });
  assert.equal(two.profile.persona, ''); assert.equal(two.messages.length, 0); assert.equal(two.memories.length, 0);
  await f.ok('send', { petId: 'same-shape-two', actionId: 'two-turn', text: 'hello-two' });
  assert.doesNotMatch(JSON.stringify(f.requests.at(-1).body), /note-only-one|persona-only-one|hello-one/);
  f.switchAccount('account-B');
  const b = await f.ok('snapshot', { ownerAccountId: 'account-A', petId: 'same-shape-one' });
  assert.equal(b.accountId, 'account-B'); assert.equal(b.messages.length, 0); assert.equal(b.memories.length, 0); assert.equal(b.profile.persona, '');
  assert.equal(b.globalConnection, null);
  assert.equal((await f.call('snapshot', { petId: 'not-owned' })).data.petId, 'same-shape-one');
  assert.equal((await f.call('memory.save', { petId: 'not-owned', memory: { content: 'x' } })).code, 'PET_NOT_FOUND');
  f.switchAccount('account-A'); f.restart();
  const restored = await f.ok('snapshot');
  assert.equal(restored.petId, 'same-shape-two'); assert.equal(restored.messages.length, 2);
  const restoredOne = await f.ok('snapshot', { petId: 'same-shape-one' });
  assert.equal(restoredOne.memories[0].content, 'note-only-one'); assert.equal(restoredOne.profile.persona, 'persona-only-one');
  assert.equal(restoredOne.messages.length, 2); assert.equal(restoredOne.pets[0].level, 8);
  f.switchAccount(null); assert.equal((await f.call('snapshot')).code, 'AUTH_REQUIRED');
});

test('saved connection is encrypted, redacted, scoped and actually tested over HTTP', async t => {
  const f = await fixture(t);
  await f.config();
  const tested = await f.ok('connection.test', { petId: null });
  assert.equal(tested.receivedText, true); assert.equal(tested.model, 'fixture-model');
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].body.messages.length, 1);
  assert.equal((await f.ok('snapshot')).messages.length, 0);
  assert.doesNotMatch(JSON.stringify(await f.ok('snapshot')), /synthetic-fixture-key|encryptedKey/);
  const stored = f.db.prepare('SELECT encrypted_key FROM conversation_connections').get().encrypted_key;
  assert.notEqual(stored, 'synthetic-fixture-key'); assert.equal(f.secrets.decrypt(stored), 'synthetic-fixture-key');
  await f.config('same-shape-one', 'synthetic-pet-key');
  const profile = (await f.ok('snapshot')).profile;
  await f.ok('profile.save', { petId: 'same-shape-one', profile: { ...profile, useOverride: true }, revision: 0 });
  await f.ok('send', { petId: 'same-shape-one', actionId: 'override', text: 'private connection' });
  assert.equal(f.requests.at(-1).authorization, 'Bearer synthetic-pet-key');
  await f.ok('send', { petId: 'same-shape-two', actionId: 'global', text: 'global connection' });
  assert.equal(f.requests.at(-1).authorization, 'Bearer synthetic-fixture-key');
  const old = (await f.ok('snapshot')).globalConnection;
  const changed = await f.ok('connection.save', { petId: null, revision: old.revision, connection: { ...old, baseUrl: 'https://different.example/v1' } });
  assert.equal(changed.hasKey, false);
  assert.equal((await f.call('connection.save', { petId: null, revision: changed.revision, apiKey: 'x', connection: { ...old, baseUrl: 'http://example.com/v1' } })).code, 'CONNECTION_INVALID');
  f.feature.service.secrets = { available: () => false, encrypt() { const { fail } = require('../errors.cjs'); fail('SECURE_STORAGE_UNAVAILABLE'); } };
  assert.equal((await f.call('connection.save', { petId: null, revision: changed.revision, apiKey: 'x', connection: old })).code, 'SECURE_STORAGE_UNAVAILABLE');
});

test('connection tests can be cancelled separately without creating history', async t => {
  const f = await fixture(t); await f.config(); f.setBehavior('wait');
  const pending = f.call('connection.test', { petId: null });
  await f.waitFor(() => f.requests.length === 1);
  await f.ok('connection.cancel', { petId: null });
  assert.equal((await pending).code, 'CANCELLED');
  assert.equal((await f.ok('snapshot')).messages.length, 0);
});

test('cancellation aborts the real stream; retry keeps one user turn; action IDs deduplicate', async t => {
  const f = await fixture(t); await f.config(); f.setBehavior('wait');
  const request = f.call('send', { petId: 'same-shape-one', actionId: 'cancelled', text: 'cancel me' });
  await f.waitFor(() => f.events.some(event => event.status === 'streaming'));
  await f.ok('cancel', { petId: 'same-shape-one' });
  assert.equal((await request).code, 'CANCELLED'); await f.waitFor(() => f.aborted > 0);
  const cancelled = (await f.ok('snapshot')).messages;
  assert.equal(cancelled[1].status, 'cancelled'); assert.equal(cancelled[1].content, '收到');
  f.setBehavior('success'); await f.ok('retry', { petId: 'same-shape-one', actionId: 'cancelled' });
  const retried = (await f.ok('snapshot')).messages;
  assert.equal(retried.length, 2); assert.equal(retried[1].attempt, 2); assert.equal(retried[1].status, 'complete');
  const requests = f.requests.length;
  assert.equal((await f.ok('send', { petId: 'same-shape-one', actionId: 'cancelled', text: 'cancel me' })).duplicate, true);
  assert.equal(f.requests.length, requests);
  assert.equal((await f.call('send', { petId: 'same-shape-one', actionId: 'cancelled', text: 'different' })).code, 'INVALID_INPUT');
  assert.equal((await f.call('retry', { petId: 'same-shape-one', actionId: 'cancelled' })).code, 'RETRY_NOT_ALLOWED');
});

test('account switching aborts pending replies and never emits old-account data into the new session', async t => {
  const f = await fixture(t); await f.config(); f.setBehavior('wait');
  const pending = f.call('send', { petId: 'same-shape-one', actionId: 'account-switch', text: 'A private message' });
  await f.waitFor(() => f.events.some(event => event.status === 'streaming'));
  const beforeSwitch = f.events.length;
  f.switchAccount('account-B'); assert.equal((await pending).code, 'SESSION_CHANGED');
  assert.equal(f.events.length, beforeSwitch);
  assert.equal((await f.ok('snapshot')).messages.length, 0);
  f.switchAccount('account-A');
  assert.equal((await f.ok('snapshot')).messages[1].status, 'cancelled');
});

test('memory edits use revisions; deletion aborts old context and disappears from later prompts after restart', async t => {
  const f = await fixture(t); await f.config();
  const [note] = await f.ok('memory.save', { petId: 'same-shape-one', memory: { content: 'MEMORY_TO_DELETE' } });
  assert.equal((await f.call('memory.save', { petId: 'same-shape-one', memory: { ...note, revision: 0, content: 'stale edit' } })).code, 'REVISION_CONFLICT');
  const [updated] = await f.ok('memory.save', { petId: 'same-shape-one', memory: { ...note, content: 'EDITED_MEMORY_TO_DELETE' } });
  assert.equal(updated.revision, 2);
  f.setBehavior('wait');
  const pending = f.call('send', { petId: 'same-shape-one', actionId: 'old-memory', text: 'first' });
  await f.waitFor(() => f.events.some(event => event.status === 'streaming'));
  assert.match(JSON.stringify(f.requests.at(-1).body), /EDITED_MEMORY_TO_DELETE/);
  await f.ok('memory.delete', { petId: 'same-shape-one', id: updated.id, revision: updated.revision });
  assert.equal((await pending).code, 'CANCELLED');
  f.restart(); f.setBehavior('success');
  await f.ok('send', { petId: 'same-shape-one', actionId: 'new-memory', text: 'second' });
  assert.doesNotMatch(JSON.stringify(f.requests.at(-1).body), /MEMORY_TO_DELETE/);
  assert.equal((await f.ok('snapshot')).memories.length, 0);
});

test('startup recovers interrupted turns, bounded context preserves recent complete pairs, history pages remain scoped', async t => {
  const f = await fixture(t); await f.config();
  const store = f.feature.service.store;
  for (let i = 0; i < 32; i++) {
    store.createTurn('account-A', 'same-shape-one', `seed-${i}`, `turn${i} ` + '字'.repeat(700), { provider: 'fixture', model: 'fixture-model' });
    store.updateReply('account-A', 'same-shape-one', `seed-${i}`, '答'.repeat(700), 'complete');
  }
  store.createTurn('account-A', 'same-shape-one', 'interrupted', 'restart me', { provider: 'fixture', model: 'fixture-model' });
  f.restart();
  const snapshot = await f.ok('snapshot');
  assert.equal(snapshot.messages.at(-1).status, 'cancelled'); assert.equal(snapshot.messages.at(-1).errorCode, 'INTERRUPTED');
  assert.equal(snapshot.messages.length, 50); assert.ok(snapshot.nextCursor);
  const older = await f.ok('history', { petId: 'same-shape-one', before: snapshot.nextCursor });
  assert.equal(older.messages.length, 16);
  await f.ok('send', { petId: 'same-shape-one', actionId: 'bounded', text: 'new bounded prompt' });
  const body = f.requests.at(-1).body;
  assert.ok(body.messages.reduce((sum, item) => sum + item.content.length, 0) <= 12000);
  assert.match(JSON.stringify(body), /turn31/); assert.doesNotMatch(JSON.stringify(body), /turn0 |restart me/);
  f.switchAccount('account-B');
  assert.equal((await f.ok('history', { petId: 'same-shape-one', before: Number.MAX_SAFE_INTEGER })).messages.length, 0);
});

test('provider failures remain retryable; raw error bodies never leak; incomplete streams do not count as success', async t => {
  const f = await fixture(t); await f.config();
  for (const [behavior, code] of [['auth', 'PROVIDER_AUTH'], ['rate', 'RATE_LIMITED'], ['truncate', 'INVALID_RESPONSE']]) {
    f.setBehavior(behavior);
    const result = await f.call('send', { petId: 'same-shape-one', actionId: behavior, text: 'private fixture text' });
    assert.equal(result.code, code); assert.doesNotMatch(JSON.stringify(result), /synthetic-fixture-key|private fixture text/);
    assert.equal((await f.ok('snapshot')).messages.at(-1).status, 'failed');
  }
  f.setBehavior('json');
  assert.equal((await f.ok('send', { petId: 'same-shape-one', actionId: 'json', text: 'non-streaming compatibility' })).messages.at(-1).content, 'JSON text');
  f.setBehavior('wait');
  await assert.rejects(requestCompletion({ connection: { baseUrl: f.baseUrl, model: 'fixture', provider: 'openai_compatible', maxOutputTokens: 64 },
    apiKey: 'synthetic', messages: [{ role: 'user', content: 'timeout' }], signal: new AbortController().signal, timeoutMs: 40 }), { code: 'TIMEOUT' });
});

test('clear history preserves notes/persona and never clears the same template in another instance', async t => {
  const f = await fixture(t); await f.config();
  await f.ok('memory.save', { petId: 'same-shape-one', memory: { content: 'keep note' } });
  await f.ok('send', { petId: 'same-shape-one', actionId: 'one', text: 'one' });
  await f.ok('send', { petId: 'same-shape-two', actionId: 'two', text: 'two' });
  await f.ok('history.clear', { petId: 'same-shape-one' });
  const one = await f.ok('snapshot', { petId: 'same-shape-one' });
  assert.equal(one.messages.length, 0); assert.equal(one.memories.length, 1);
  assert.equal((await f.ok('snapshot', { petId: 'same-shape-two' })).messages.length, 2);
});

test('stale renderer actions cannot write to a new account or a new login of the same account', async t => {
  const f = await fixture(t);
  const initial = await f.ok('snapshot');
  f.switchAccount('account-B');
  const oldAccount = await f.call('memory.save', { petId: 'same-shape-one', expectedAccountId: initial.accountId,
    expectedSessionRevision: initial.sessionRevision, memory: { content: 'must never reach B' } });
  assert.equal(oldAccount.code, 'SESSION_CHANGED');
  assert.equal((await f.ok('snapshot')).memories.length, 0);
  f.switchAccount('account-A');
  const oldSession = await f.call('memory.save', { petId: 'same-shape-one', expectedAccountId: initial.accountId,
    expectedSessionRevision: initial.sessionRevision, memory: { content: 'old A dialog must not save' } });
  assert.equal(oldSession.code, 'SESSION_CHANGED');
  assert.equal((await f.ok('snapshot')).memories.length, 0);
});

test('synchronous shutdown records cancellation before the shared database closes', async t => {
  const f = await fixture(t); await f.config(); f.setBehavior('wait');
  const pending = f.call('send', { petId: 'same-shape-one', actionId: 'shutdown', text: 'shutdown' });
  await f.waitFor(() => f.events.some(event => event.status === 'streaming'));
  f.feature.dispose();
  assert.equal(f.db.prepare("SELECT status FROM conversation_messages WHERE role='assistant'").get().status, 'cancelled');
  assert.equal((await pending).code, 'INTERRUPTED');
});
