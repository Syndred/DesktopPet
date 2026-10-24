const { test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const { migrations } = require("../schema.cjs");
const { AccountsService } = require("../service.cjs");
const { provisionQaProfile, resolveQaScenario, MARKER } = require("../qa-scenario.cjs");
const { checksum } = require("../util.cjs");

const fixtures = [];
function fixture(qa = true) {
  const root = mkdtempSync(join(tmpdir(), "lingjing-qa-boundary-")), directory = join(root, "profile");
  const marker = qa ? provisionQaProfile(directory) : (mkdirSync(directory), null);
  const env = qa ? { PET_USER_DATA_DIR: directory, LINGJING_QA_SCENARIO: "unified-battle" } : {};
  const file = join(directory, "pet-runtime-data.json"), db = new DatabaseSync(join(directory, "lingjing.sqlite"));
  migrations.forEach(m => db.exec(m.sql));
  const calls = [], services = { db, paths: { userData: directory, legacyDataFile: file },
    safeStorage: { isEncryptionAvailable: () => true, encryptString: value => { calls.push("encrypt"); return Buffer.from(value); }, decryptString: value => value.toString() }, events: { emit() {} } };
  const host = { async apply(document, options) { calls.push({ document, options }); }, status: () => ({}), notify: () => calls.push("notification"), dispose() {}, clear() {} };
  const remote = { enabled: true, setCurrentUser() { calls.push("remote-current"); }, async login() { calls.push("remote-login"); throw new Error("No real network in this fixture"); } };
  const value = { root, directory, marker, env, file, db, services, host, remote, calls, accounts: null,
    context: () => resolveQaScenario({ env, userData: directory, legacyDataFile: file }),
    open(context) { this.accounts = new AccountsService({ services, host, remote, qaScenario: context }); return this.accounts; } };
  fixtures.push(value); return value;
}
afterEach(() => { while (fixtures.length) { const f = fixtures.pop(); f.accounts?.dispose(); f.db.close(); rmSync(f.root, { recursive: true, force: true }); } });
const register = (accounts, account = "qa_alice") => accounts.authenticate({ provider: "local", account, username: account,
  password: "secret123", confirmPassword: "secret123", rememberSession: true }, true);

test("QA requires explicit flag, fresh marker and matching directory/scenario; normal profiles never fall back", async () => {
  const normal = fixture(false);
  assert.equal(normal.context(), null);
  assert.throws(() => provisionQaProfile(normal.directory), { code: "EEXIST" });
  const accounts = normal.open(null); await accounts.ready;
  await accounts.authenticate({ provider: "local", account: "normal", username: "Normal", password: "secret123", confirmPassword: "secret123", scenario: "unified-battle", dataMode: "simulated" }, true);
  assert.equal(accounts.session().dataMode, "live"); assert.equal(accounts.session().scenario, null);
  assert.throws(() => accounts.requireScenarioIdentity("unified-battle"), { code: "QA_SCENARIO_REQUIRED" });
  const qa = fixture();
  assert.throws(() => resolveQaScenario({ env: {}, userData: qa.directory }), { code: "QA_SCENARIO_REQUIRED" });
  assert.throws(() => resolveQaScenario({ env: { LINGJING_QA_SCENARIO: "unified-battle" }, userData: qa.directory }), { code: "QA_PROFILE_REQUIRED" });
  assert.throws(() => resolveQaScenario({ env: { ...qa.env, LINGJING_QA_SCENARIO: "another-scenario" }, userData: qa.directory }), { code: "QA_PROFILE_REQUIRED" });
  assert.throws(() => resolveQaScenario({ env: qa.env, userData: qa.directory, productionDirectories: [qa.directory] }), { code: "QA_PRODUCTION_PROFILE_FORBIDDEN" });
  assert.throws(() => resolveQaScenario({ env: qa.env, userData: qa.directory, legacyDataFile: normal.file }), { code: "QA_PROFILE_ESCAPE" });
});

test("QA refuses existing accounts/raw history and cannot reopen its database as a normal profile", async () => {
  const f = fixture(); writeFileSync(f.file, JSON.stringify({ users: [{ id: "real-user" }] }));
  assert.throws(() => f.context(), { code: "QA_EXISTING_DATA_FORBIDDEN" });
  writeFileSync(f.file, "{}"); const context = f.context(); const accounts = f.open(context);
  await register(accounts); accounts.dispose(); f.accounts = null;
  assert.throws(() => f.open(null), { code: "QA_SCENARIO_REQUIRED" });
  const changed = { ...f.marker, runId: randomUUID() }; writeFileSync(join(f.directory, MARKER), JSON.stringify(changed));
  assert.throws(() => f.open(f.context()), { code: "QA_SCENARIO_MISMATCH" });
  const normal = fixture(false); const real = normal.open(null); await register(real, "real_user"); real.dispose(); normal.accounts = null;
  writeFileSync(join(normal.directory, MARKER), JSON.stringify(f.marker));
  assert.throws(() => resolveQaScenario({ env: { PET_USER_DATA_DIR: normal.directory, LINGJING_QA_SCENARIO: "unified-battle" }, userData: normal.directory }), { code: "QA_PROFILE_REQUIRED" });
  writeFileSync(join(normal.directory, MARKER), JSON.stringify({ ...f.marker, profilePath: normal.directory }));
  const forged = resolveQaScenario({ env: { PET_USER_DATA_DIR: normal.directory, LINGJING_QA_SCENARIO: "unified-battle" }, userData: normal.directory });
  assert.throws(() => normal.open(forged), { code: "QA_EXISTING_DATA_FORBIDDEN" });
});

test("verified QA identities are namespaced, memory-only, owner-scoped and rejected by live cloud paths", async () => {
  const f = fixture(), accounts = f.open(f.context()); await register(accounts);
  const owner = accounts.requireOwner(), identity = accounts.requireScenarioIdentity("unified-battle");
  assert.ok(owner.startsWith(`qa:${f.marker.runId}:`)); assert.equal(identity.ownerAccountId, owner);
  assert.equal(identity.provider, "qa"); assert.equal(identity.authority, "simulated");
  assert.equal(identity.sessionToken, undefined); assert.equal(identity.proof, undefined);
  assert.equal(accounts.session().secureStorageAvailable, false); assert.equal(accounts.session().persistence, "memory");
  assert.equal(accounts.session().defaultProvider, "local");
  assert.throws(() => accounts.requireRuntimeUser(), { code: "SIMULATED_SESSION_ONLY" });
  assert.throws(() => accounts.requireScenarioIdentity("another-scenario"), { code: "QA_SCENARIO_REQUIRED" });
  await assert.rejects(() => accounts.authenticate({ provider: "runtime", account: "qa_alice", password: "secret123" }), { code: "SIMULATED_SESSION_ONLY" });
  const a = accounts.settings(); a.document.desktop.volume = 31;
  await accounts.saveSettings({ ...a, actionId: randomUUID() });
  await accounts.logout(); assert.throws(() => accounts.requireScenarioIdentity("unified-battle"), { code: "LOGIN_REQUIRED" });
  await register(accounts, "qa_bobby"); assert.notEqual(accounts.requireOwner(), owner); assert.equal(accounts.settings().document.desktop.volume, 70);
  assert.equal(f.calls.some(call => typeof call === "string" && /remote|encrypt/.test(call)), false);
  accounts.dispose(); f.accounts = null;
  const restarted = f.open(f.context()); await restarted.ready; assert.equal(restarted.getCurrentUser(), null);
});

test("QA backups retain provenance, restore with preservation, and reject every normal/other-scenario envelope", async () => {
  const f = fixture(), accounts = f.open(f.context()); await register(accounts);
  const owner = accounts.requireOwner(), file = join(f.directory, "qa-save.json");
  accounts.backups.save(owner, file);
  const exported = JSON.parse(readFileSync(file, "utf8"));
  assert.deepEqual(exported.provenance, { mode: "simulated", runId: f.marker.runId, scenarioId: "unified-battle" });
  assert.equal(JSON.stringify(exported).includes("secret123"), false);
  const settings = accounts.settings(); settings.document.desktop.volume = 13;
  await accounts.saveSettings({ ...settings, actionId: randomUUID() });
  const preview = accounts.backups.preview(owner, file);
  const restored = accounts.backups.restore(owner, { previewId: preview.previewId, mode: "replace", actionId: randomUUID() });
  assert.equal(accounts.settings().document.desktop.volume, 70);
  assert.equal(JSON.parse(readFileSync(restored.preservedBackup.filePath)).data.modules.settings.data.desktop.volume, 13);
  const tamper = provenance => { const { checksum: old, ...body } = exported; body.provenance = provenance; return { ...body, checksum: checksum(body) }; };
  assert.throws(() => accounts.backups.validate(tamper({ mode: "live" }), owner), { code: "BACKUP_ENVIRONMENT_MISMATCH" });
  assert.throws(() => accounts.backups.validate(tamper({ ...exported.provenance, runId: randomUUID() }), owner), { code: "BACKUP_ENVIRONMENT_MISMATCH" });
  const normal = fixture(false), live = normal.open(null); await register(live, "qa_alice");
  assert.throws(() => live.backups.validate(exported, live.requireOwner()), { code: "BACKUP_ENVIRONMENT_MISMATCH" });
  const { checksum: digest, provenance, ...oldBody } = live.backups.snapshot(live.requireOwner());
  assert.equal(live.backups.validate({ ...oldBody, checksum: checksum(oldBody) }, live.requireOwner()).version, 1);
});

test("QA host never enables system startup, location, emotion collection or native notifications", async () => {
  const f = fixture(), accounts = f.open(f.context()); await register(accounts);
  const settings = accounts.settings(); settings.document.desktop.launchAtLogin = true;
  settings.document.privacy.locationAllowed = true; settings.document.privacy.emotionStatistics = true;
  await accounts.saveSettings({ ...settings, actionId: randomUUID() });
  const applied = f.calls.filter(call => typeof call === "object").at(-1);
  assert.equal(applied.options.explicitStartupChange, false); assert.equal(applied.document.privacy.locationAllowed, false);
  assert.equal(applied.document.privacy.emotionStatistics, false);
  assert.equal(accounts.host.mayUseLocation(), false); assert.equal(accounts.host.mayCollectEmotion(), false);
  assert.deepEqual(accounts.host.notify({}), { delivered: false, reason: "qa-scenario" });
  assert.equal(f.calls.includes("notification"), false);
});
