// Actual HTTPS + two Electron main processes, with fresh real Auth accounts.
// No QA identity, SQL pet seeding, model response fixture, or network replacement.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const configPath = process.env.LINGJING_PUBLIC_CONFIG || 'C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/cloud-upgrade/2026-10-25/public-runtime-config.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
assert.equal(new URL(config.url || config.supabaseUrl).hostname, 'jbvrdmrkwpznbrvteive.supabase.co');
const output = resolve('artifacts/conversations/cloud-boundary', `run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const account = `convqa_${Date.now().toString(36)}`;
const password = `Aa9!${randomBytes(20).toString('base64url')}`;
const key = `LOCAL-ONLY-NOT-A-PROVIDER-KEY-${randomUUID()}`;
const checks = [], errors = [], clients = [];
const evidence = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  build: JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json', 'utf8')), projectRef: 'jbvrdmrkwpznbrvteive',
  realCloud: true, realElectron: true, sameHost: true, checks, rendererErrors: errors,
  scope: 'Auth/main-only actor, pet rejection and local credential privacy; successful pet chat CAS is a separate acceptance',
  privilegedWrites: 0, petIdsCreated: 0, modelResponsesSimulated: false };
const record = (name, data) => { checks.push({ name, data }); console.log('PASS', name); };
async function invoke(client, feature, command, payload = {}) {
  return client.page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
}
async function call(client, feature, command, payload) {
  const result = await invoke(client, feature, command, payload);
  assert.equal(result.ok, true, result.message); return result.data;
}
async function launch(label) {
  const profile = join(output, `profile-${label}`); mkdirSync(profile);
  const env = { ...process.env, PET_USER_DATA_DIR: profile, LINGJING_PUBLIC_CONFIG: configPath };
  delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_QA_SCENARIO; delete env.LINGJING_LEGACY_AUTH;
  const app = await electron.launch({ args: [resolve('.')], env });
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push({ label, message: error.message }));
  await page.waitForFunction(() => Boolean(window.lingjing));
  const client = { app, page, profile, label }; clients.push(client);
  // Observe the actual service instance without exposing its proof to renderer.
  await app.evaluate((_electron, servicePath) => {
    const require = process.getBuiltinModule('node:module').createRequire(servicePath);
    const { AccountsService } = require(servicePath);
    const original = AccountsService.prototype.authenticate;
    AccountsService.prototype.authenticate = function (...args) { globalThis.__conversationCloudAccounts = this; return original.apply(this, args); };
  }, resolve('apps/pc-app/runtime/features/accounts/service.cjs'));
  return client;
}
try {
  const a = await launch('a');
  const first = await call(a, 'accounts', 'register', { provider: 'runtime', account, password, confirmPassword: password, username: '聊天云端边界验收', rememberSession: true });
  const b = await launch('b');
  await call(b, 'accounts', 'login', { provider: 'runtime', account, password, rememberSession: true });
  const publicA = await call(a, 'accounts', 'session'), publicB = await call(b, 'accounts', 'session');
  assert.equal(publicA.currentUser.id, publicB.currentUser.id);
  assert.equal(publicA.currentUser.id, first.currentUser.id);
  assert.equal(publicA.currentUser.authKind, 'supabase');
  assert.equal(publicA.persistence, 'secure'); assert.equal(publicB.persistence, 'secure');
  assert.equal(/accessToken|refreshToken|cloudProof|sessionToken/.test(JSON.stringify([publicA, publicB])), false);
  record('Two real Electron processes log into one real Supabase owner; public IPC contains no Auth proof', { owner: publicA.currentUser.id, persistence: [publicA.persistence, publicB.persistence] });
  const actor = async client => client.app.evaluate(async () => {
    const ctx = await globalThis.__conversationCloudAccounts.requireCloudActor();
    const serialized = JSON.stringify(ctx);
    return { actor: ctx.actor, serializationSafe: !serialized.includes(ctx.accessToken) && !serialized.includes(ctx.publishableKey) && !Object.keys(ctx).includes('client') };
  });
  const actorA = await actor(a), actorB = await actor(b);
  assert.equal(actorA.actor.ownerAccountId, publicA.currentUser.id);
  assert.equal(actorA.actor.authority, 'live'); assert.equal(actorB.actor.authority, 'live');
  assert.notEqual(actorA.actor.deviceId, actorB.actor.deviceId); assert.notEqual(actorA.actor.sessionId, actorB.actor.sessionId);
  assert.ok(actorA.serializationSafe && actorB.serializationSafe);
  record('Fresh main-only cloudActor validates two device/session bindings and hides SDK/token properties', { a: actorA.actor, b: actorB.actor });
  await call(a, 'conversations', 'connection.save', { petId: null, revision: 0,
    connection: { provider: 'openai_compatible', baseUrl: 'https://example.invalid/v1', model: 'not-invoked', contextChars: 24000, maxOutputTokens: 64 }, apiKey: key });
  const snapA = await call(a, 'conversations', 'snapshot'), snapB = await call(b, 'conversations', 'snapshot');
  assert.equal(snapA.globalConnection.hasKey, true); assert.equal(snapB.globalConnection, null);
  assert.equal(JSON.stringify(snapA).includes(key), false);
  const db = new DatabaseSync(join(a.profile, 'lingjing.sqlite'), { readOnly: true }); db.exec('PRAGMA query_only=ON');
  const cipher = db.prepare('SELECT encrypted_key FROM conversation_credentials WHERE owner_account_id=?').get(publicA.currentUser.id).encrypted_key;
  assert.ok(cipher && !cipher.includes(key));
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { createConversationBackupAdapter } = require('../backup.cjs');
  const personal = createConversationBackupAdapter({ db }).export(publicA.currentUser.id);
  assert.equal(JSON.stringify(personal).includes(key), false); assert.equal(JSON.stringify(personal).includes(cipher), false);
  assert.equal(/encrypted_key|apiKey|sessionToken|accessToken|refreshToken/.test(JSON.stringify(personal)), false); db.close();
  record('Actual DPAPI key stays on A; conversation archive carries metadata without key or encrypted blob', { encryptedKeyBytes: Buffer.from(cipher, 'base64').length, bHasConnection: Boolean(snapB.globalConnection) });
  const fakePet = `not-registered-${randomUUID()}`;
  const rejected = await invoke(a, 'conversations', 'memory.save', { petId: fakePet, memory: { content: 'Must never be persisted' } });
  assert.equal(rejected.code, 'PET_NOT_FOUND');
  record('Public conversation IPC rejects an unowned pet before any memory write', { code: rejected.code });
  // This negative request is based on the real exported personal module, with
  // one deliberately unregistered reference. It must never create a cloud save.
  personal.tables.conversation_preferences = [{ owner_account_id: publicA.currentUser.id, selected_pet_id: fakePet, updated_at: Date.now() }];
  const negative = await a.app.evaluate(async (_electron, { personal, utilPath }) => {
    const require = process.getBuiltinModule('node:module').createRequire(utilPath);
    const accounts = globalThis.__conversationCloudAccounts, ctx = await accounts.requireCloudActor();
    const { checksum } = require(utilPath);
    const body = { format: 'lingjing-account-save', version: 1, ownerAccountId: ctx.ownerAccountId, provenance: { mode: 'live' },
      identity: { provider: 'runtime', subjectId: ctx.ownerAccountId }, createdAt: new Date().toISOString(), data: { modules: { conversations: { version: 1, data: personal } }, tables: {} }, excluded: [] };
    try { await ctx.invoke('lingjing-save', { op: 'push', actionId: require('node:crypto').randomUUID(), baseRevision: 0, envelope: { ...body, checksum: checksum(body) } }); return { accepted: true }; }
    catch (error) { return { accepted: false, code: error.code, httpStatus: error.httpStatus }; }
  }, { personal, utilPath: resolve('apps/pc-app/runtime/features/accounts/util.cjs') });
  assert.equal(negative.accepted, false); assert.equal(negative.code, 'PET_OWNER_MISMATCH'); assert.equal(negative.httpStatus, 403);
  record('Real HTTPS personal-save SQL rejects an unregistered owner/pet reference', negative);
  await call(a, 'accounts', 'logout');
  const alive = await actor(b); assert.equal(alive.actor.sessionId, actorB.actor.sessionId);
  record('A signs out while B retains its real live device session', { bSessionId: alive.actor.sessionId });
  const info = await call(b, 'app', 'info'); evidence.runtime = info.runtime;
  assert.deepEqual(errors, []); evidence.status = 'passed';
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ status: evidence.status, checks: checks.length, realCloud: true, fullChatSync: false, output }));
} catch (error) {
  evidence.status = 'failed'; evidence.error = { message: error.message, stack: error.stack };
  writeFileSync(join(output, 'failure.json'), JSON.stringify(evidence, null, 2)); throw error;
} finally { for (const client of clients) await client.app.close(); }
