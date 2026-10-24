const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { migrations } = require("../schema.cjs");
const { AccountsService } = require("../service.cjs");
const { importLegacy } = require("../legacy.cjs");
const { defaultSettings, isQuiet, notificationPolicy } = require("../settings.cjs");
const { checksum } = require("../util.cjs");

const fixtures = [];
function fixture(source, remoteOverride) {
  const directory = mkdtempSync(join(tmpdir(), "lingjing-accounts-"));
  const file = join(directory, "state.json"), dbFile = join(directory, "test.sqlite");
  if (source) writeFileSync(file, JSON.stringify(source));
  const db = new DatabaseSync(dbFile); db.exec("PRAGMA foreign_keys=ON");
  migrations.forEach(m => db.exec(m.sql));
  const events = [], applications = [];
  const remote = { enabled: false, setCurrentUser() {}, async clear() {}, ...remoteOverride };
  const host = { async apply(document, options) { applications.push({ document, options }); }, clear() {}, dispose() {} };
  const services = { db, paths: { userData: directory, legacyDataFile: file }, safeStorage: { isEncryptionAvailable: () => false },
    events: { emit: (name, data) => events.push({ name, data }) } };
  const accounts = new AccountsService({ services, remote, host });
  const value = { directory, db, file, dbFile, accounts, events, applications, remote, host, services };
  fixtures.push(value); return value;
}
afterEach(() => { while (fixtures.length) { const f = fixtures.pop(); f.accounts.dispose(); f.db.close(); rmSync(f.directory, { recursive: true, force: true }); } });
const hash = text => createHash("sha256").update(text).digest("hex");
const legacyUser = (id, account) => ({ id, account, username: account, passwordHash: hash("secret123"), createdAt: "2026-01-01T00:00:00Z" });
async function register(f, name) {
  return f.accounts.authenticate({ provider: "local", account: name, username: name, password: "secret123", confirmPassword: "secret123" }, true);
}
async function login(f, name, secret = "secret123") { return f.accounts.authenticate({ provider: "local", account: name, password: secret }); }

test("raw legacy migration preserves bytes, isolates explicit inventories and is idempotent", async () => {
  const source = { users: [legacyUser("user-a", "alice"), legacyUser("user-b", "bobby")],
    userInventories: { "user-a": { pets: [{ id: "same-pet", name: "A" }], battleReports: [{ id: "a-report" }] },
      "user-b": { pets: [{ id: "same-pet", name: "B" }], chats: [{ text: "B private" }] } }, pets: [{ id: "mirror-only" }] };
  const f = fixture(source), original = readFileSync(f.file);
  await login(f, "alice"); assert.equal(f.accounts.requireOwner(), "local:user-a");
  assert.equal(f.accounts.getLegacyInventory().pets[0].name, "A");
  await f.accounts.logout(); await login(f, "bobby");
  assert.equal(f.accounts.getLegacyInventory().chats[0].text, "B private");
  assert.deepEqual(readFileSync(f.file), original);
  const again = importLegacy({ db: f.db, filePath: f.file, archiveDir: join(f.directory, "archives") });
  assert.equal(again.duplicate, true); assert.equal(f.db.prepare("SELECT COUNT(*) n FROM account_legacy_data").get().n, 2);
  assert.equal(readFileSync(again.archivePath, "utf8"), original.toString());
});

test("ambiguous global history is archived instead of cloned into every missing inventory", () => {
  const f = fixture({ users: [legacyUser("a", "alice"), legacyUser("b", "bobby")], pets: [{ id: "unowned" }], battleReports: [{ id: "private" }] });
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM account_legacy_data").get().n, 0);
  assert.equal(f.accounts.migration.status, "review-required");
  assert.equal(f.accounts.migration.unresolved.length, 2);
  assert.equal(existsSync(f.accounts.migration.archivePath), true);
});

test("legacy missing credentials cannot log in with the old default password", async () => {
  const f = fixture({ users: [{ id: "a", account: "alice", username: "Alice" }], pets: [] });
  await assert.rejects(() => login(f, "alice", "123456"), { code: "INVALID_CREDENTIALS" });
  assert.equal(f.accounts.getCurrentUser(), null);
});

test("remote placeholder hashes without tokens are never accepted as local credentials", async () => {
  const f = fixture({ users: [{ ...legacyUser("remote-a", "alice"), passwordHash: hash("remote-session-remote-a") }], pets: [{ id: "remote-pet" }] });
  await assert.rejects(() => login(f, "alice", "remote-session-remote-a"), { code: "INVALID_CREDENTIALS" });
  assert.equal(f.accounts.identity("remote-a").provider, "runtime");
  assert.equal(f.accounts.getLegacyInventory("remote-a").pets[0].id, "remote-pet");
});

test("corrupt legacy content stays archived without blocking the recoverable account UI", async () => {
  const f = fixture("invalid legacy document shape");
  assert.equal(f.accounts.migration.status, "corrupt");
  assert.equal(readFileSync(f.accounts.migration.archivePath, "utf8"), readFileSync(f.file, "utf8"));
  assert.equal(f.accounts.session().currentUser, null);
  await register(f, "new-local"); assert.equal(f.accounts.getLegacyInventory(), null);
});

test("logout revokes persisted session resumption even when encrypted file removal fails", async () => {
  const f = fixture(); await register(f, "alice");
  f.accounts.vault.clear = () => { throw new Error("simulated read-only vault"); };
  await f.accounts.logout(); assert.equal(f.accounts.getCurrentUser(), null);
  assert.equal(f.db.prepare("SELECT blocked FROM account_session_control WHERE singleton=1").get().blocked, 1);
  const restarted = new AccountsService({ services: f.services, remote: f.remote, host: f.host });
  try { await restarted.ready; assert.equal(restarted.getCurrentUser(), null); } finally { restarted.dispose(); }
});

test("local login upgrades legacy SHA256, and nickname/password changes are atomic and readable", async () => {
  const f = fixture({ users: [legacyUser("a", "alice")], pets: [{ id: "old-pet" }] });
  await login(f, "alice"); const owner = f.accounts.requireOwner();
  assert.match(f.accounts.identity(owner).password_hash, /^scrypt\$/);
  await f.accounts.updateProfile({ username: "新昵称", revision: 0 });
  await assert.rejects(() => f.accounts.updateProfile({ oldPassword: "badpass", newPassword: "newsecret", confirmPassword: "newsecret", revision: 1 }, true), { code: "INVALID_OLD_PASSWORD" });
  assert.equal(f.accounts.getCurrentUser().username, "新昵称");
  await f.accounts.updateProfile({ oldPassword: "secret123", newPassword: "newsecret", confirmPassword: "newsecret", revision: 1 }, true);
  await f.accounts.logout(); await assert.rejects(() => login(f, "alice"), { code: "INVALID_CREDENTIALS" });
  await login(f, "alice", "newsecret"); assert.equal(f.accounts.getLegacyInventory().pets[0].id, "old-pet");
  assert.equal(f.accounts.getCurrentUser().revision, 2);
});

test("settings are owner-scoped, revision-aware and actionId-idempotent across account switches", async () => {
  const f = fixture(); await register(f, "alice"); const ownerA = f.accounts.requireOwner();
  const document = defaultSettings(); document.desktop.alwaysOnTop = false;
  const input = { document, revision: 0, actionId: randomUUID() };
  const saved = await f.accounts.saveSettings(input); assert.equal(saved.revision, 1);
  assert.equal((await f.accounts.saveSettings(input)).duplicate, true);
  await assert.rejects(() => f.accounts.saveSettings({ ...input, document: defaultSettings() }), { code: "ACTION_ID_REUSED" });
  await assert.rejects(() => f.accounts.saveSettings({ document, revision: 0, actionId: randomUUID() }), { code: "REVISION_CONFLICT" });
  await register(f, "bobby"); assert.equal(f.accounts.settings().document.desktop.alwaysOnTop, true);
  assert.equal(f.accounts.settings(ownerA).document.desktop.alwaysOnTop, false);
  assert.equal(f.applications[0].options, undefined);
});

test("cloud and local users with the same account name keep distinct stable owners", async () => {
  const remoteUser = { id: "cloud-user-a", account: "alice", username: "Cloud Alice", sessionToken: "cloud-token-is-private-123456" };
  const f = fixture({ users: [legacyUser("old-local", "alice")], pets: [{ id: "private-local-pet" }] },
    { enabled: true, async login() { return remoteUser; } });
  await login(f, "alice"); const localOwner = f.accounts.requireOwner();
  await f.accounts.authenticate({ provider: "runtime", account: "alice", password: "secret123" });
  assert.equal(f.accounts.requireOwner(), remoteUser.id); assert.equal(f.accounts.getLegacyInventory(), null);
  assert.equal(f.accounts.getLegacyInventory(localOwner).pets[0].id, "private-local-pet");
  assert.equal(JSON.stringify(f.accounts.session()).includes(remoteUser.sessionToken), false);
});

test("a late cloud login cannot resurrect a logged-out session", async () => {
  let finish;
  const f = fixture(null, { enabled: true, login: () => new Promise(resolve => { finish = resolve; }) });
  const pending = f.accounts.authenticate({ provider: "runtime", account: "alice", password: "secret123" });
  await new Promise(resolve => setImmediate(resolve));
  await f.accounts.logout(); finish({ id: "remote", account: "alice", username: "Alice", sessionToken: "secret-token-123456789" });
  await assert.rejects(() => pending, { code: "SESSION_CHANGED" }); assert.equal(f.accounts.getCurrentUser(), null);
});

test("quiet hours cross midnight and gate notification sound without reading input", () => {
  const settings = defaultSettings();
  const at = (hours, minutes = 0) => new Date(2026, 9, 24, hours, minutes);
  assert.equal(isQuiet(settings, at(23)), true); assert.equal(isQuiet(settings, at(7, 59)), true);
  assert.equal(isQuiet(settings, at(8)), false); assert.equal(isQuiet(settings, at(22)), true);
  assert.equal(notificationPolicy(settings, "garden", at(23)).allowed, false);
  settings.desktop.interactionSounds = false;
  assert.deepEqual(notificationPolicy(settings, "garden", at(12)), { allowed: true, silent: true });
});

test("real SQLite backup/replace preserves original data, rejects tampering and other accounts, survives reopening", async () => {
  const f = fixture(); await register(f, "alice"); const ownerA = f.accounts.requireOwner();
  f.db.exec("CREATE TABLE garden_test_items(owner_account_id TEXT NOT NULL,item_id TEXT NOT NULL,quantity INTEGER NOT NULL CHECK(quantity>=0),PRIMARY KEY(owner_account_id,item_id))");
  f.db.prepare("INSERT INTO garden_test_items VALUES(?,?,?)").run(ownerA, "rice", 4);
  const backupFile = join(f.directory, "export.json"); f.accounts.backups.save(ownerA, backupFile);
  const raw = readFileSync(backupFile, "utf8"); assert.equal(raw.includes("password_hash"), false); assert.equal(raw.includes("proof_hash"), false);
  const envelope = JSON.parse(raw); envelope.data.tables.garden_test_items.rows[0].quantity++;
  assert.throws(() => f.accounts.backups.validate(envelope, ownerA), { code: "BACKUP_CHECKSUM_MISMATCH" });
  await register(f, "bobby"); const ownerB = f.accounts.requireOwner();
  f.db.prepare("INSERT INTO garden_test_items VALUES(?,?,?)").run(ownerB, "rice", 99);
  assert.throws(() => f.accounts.backups.preview(ownerB, backupFile), { code: "BACKUP_OWNER_MISMATCH" });
  await login(f, "alice");
  f.db.prepare("UPDATE garden_test_items SET quantity=8 WHERE owner_account_id=?").run(ownerA);
  const preview = f.accounts.backups.preview(ownerA, backupFile);
  const action = { previewId: preview.previewId, actionId: randomUUID(), mode: "replace" };
  const restored = f.accounts.backups.restore(ownerA, action);
  assert.equal(f.db.prepare("SELECT quantity FROM garden_test_items WHERE owner_account_id=?").get(ownerA).quantity, 4);
  assert.equal(f.db.prepare("SELECT quantity FROM garden_test_items WHERE owner_account_id=?").get(ownerB).quantity, 99);
  const preserved = JSON.parse(readFileSync(restored.preservedBackup.filePath, "utf8"));
  assert.equal(preserved.data.tables.garden_test_items.rows[0].quantity, 8);
  assert.equal(f.accounts.backups.restore(ownerA, action).duplicate, true);
  const reopened = new DatabaseSync(f.dbFile);
  assert.equal(reopened.prepare("SELECT quantity FROM garden_test_items WHERE owner_account_id=?").get(ownerA).quantity, 4); reopened.close();
});

test("restoring a failed feature adapter rolls back all rows and leaves before-restore backup", async () => {
  const f = fixture(); await register(f, "alice"); const owner = f.accounts.requireOwner();
  f.accounts.backups.register({ id: "failing", version: 1, export: () => ({ value: 1 }), validate() {},
    restore() { f.db.prepare("UPDATE account_settings SET revision=90 WHERE owner_account_id=?").run(owner); throw new Error("intentional adapter failure"); } });
  const file = join(f.directory, "export.json"); f.accounts.backups.save(owner, file);
  const preview = f.accounts.backups.preview(owner, file);
  assert.throws(() => f.accounts.backups.restore(owner, { previewId: preview.previewId, actionId: randomUUID(), mode: "replace" }), /intentional/);
  assert.equal(f.accounts.settings().revision, 0);
  const receipt = f.accounts.backups.list(owner).find(r => r.reason === "before-restore"); assert.equal(existsSync(receipt.filePath), true);
});

test("backup previews become stale when domain data changes, before writing any restore", async () => {
  const f = fixture(); await register(f, "alice"); const owner = f.accounts.requireOwner();
  const file = join(f.directory, "export.json"); f.accounts.backups.save(owner, file);
  const preview = f.accounts.backups.preview(owner, file);
  const document = defaultSettings(); document.desktop.volume = 20;
  await f.accounts.saveSettings({ document, revision: 0, actionId: randomUUID() });
  assert.throws(() => f.accounts.backups.restore(owner, { previewId: preview.previewId, actionId: randomUUID() }), { code: "SAVE_CHANGED" });
  assert.equal(f.accounts.settings().document.desktop.volume, 20);
});

test("offline sync queues remain owner-scoped and retryable after a real network refusal", async () => {
  const f = fixture(null, { enabled: true,
    async login(name) { return { id: `remote-${name}`, account: name, username: name, sessionToken: `token-${name}-123456789` }; },
    async cloudSave() { await fetch("http://127.0.0.1:1/unavailable"); }
  });
  await f.accounts.authenticate({ provider: "runtime", account: "alice", password: "secret123" });
  const owner = f.accounts.requireOwner(); const document = defaultSettings(); document.sync.enabled = true;
  await f.accounts.saveSettings({ document, revision: 0, actionId: randomUUID() });
  const id = randomUUID(); f.accounts.sync.enqueue(owner, id);
  await assert.rejects(() => f.accounts.sync.flush(owner, true));
  const row = f.db.prepare("SELECT * FROM account_sync_outbox WHERE owner_account_id=?").get(owner);
  assert.equal(row.status, "retry"); assert.equal(row.attempts, 1); assert.equal(row.action_id, id);
  assert.equal(row.document.includes("token-alice"), false); assert.equal(f.accounts.sync.status(owner).lastVerifiedAt, null);
  await register(f, "bobby"); assert.equal(f.accounts.sync.status(f.accounts.requireOwner()).pending, 0);
});

test("sync requires an exact receipt AND independent readback before being marked verified (protocol unit)", async () => {
  let stored, incorrect = true;
  const f = fixture(null, { enabled: true,
    async login() { return { id: "remote-alice", account: "alice", username: "Alice", sessionToken: "token-alice-123456789" }; },
    async cloudSave(op, session, payload) {
      if (op === "push") { stored = payload; return { actionId: payload.actionId, checksum: payload.envelope.checksum, revision: 1 }; }
      return { actionId: incorrect ? "other-action" : stored.actionId, revision: 1, envelope: stored.envelope };
    }
  });
  await f.accounts.authenticate({ provider: "runtime", account: "alice", password: "secret123" });
  const owner = f.accounts.requireOwner(); const document = defaultSettings(); document.sync.enabled = true;
  await f.accounts.saveSettings({ document, revision: 0, actionId: randomUUID() });
  f.accounts.sync.enqueue(owner, randomUUID());
  await assert.rejects(() => f.accounts.sync.flush(owner, true), { code: "SYNC_READBACK_MISMATCH" });
  assert.equal(f.accounts.sync.status(owner).lastVerifiedAt, null); incorrect = false;
  const result = await f.accounts.sync.flush(owner, true); assert.equal(result.verified, true);
  assert.equal(f.accounts.sync.status(owner).cloudRevision, 1);
  assert.equal(f.accounts.sync.status(owner).localChanged, false);
  assert.equal(checksum(stored.envelope.data), f.accounts.backups.dataChecksum(owner));
});

test("cloud session invalidation clears only that verified session and retains its outbox", async () => {
  const f = fixture(null, { enabled: true,
    async login() { return { id: "remote-alice", account: "alice", username: "Alice", sessionToken: "token-alice-123456789" }; },
    async cloudSave() { throw Object.assign(new Error("登录已失效"), { code: "SESSION_INVALIDATED" }); }
  });
  await f.accounts.authenticate({ provider: "runtime", account: "alice", password: "secret123" });
  const owner = f.accounts.requireOwner(), document = defaultSettings(); document.sync.enabled = true;
  await f.accounts.saveSettings({ document, revision: 0, actionId: randomUUID() });
  f.accounts.sync.enqueue(owner, randomUUID());
  await assert.rejects(() => f.accounts.sync.flush(owner, true), { code: "SESSION_INVALIDATED" });
  assert.equal(f.accounts.getCurrentUser(), null);
  assert.equal(f.db.prepare("SELECT status FROM account_sync_outbox WHERE owner_account_id=?").get(owner).status, "retry");
});
