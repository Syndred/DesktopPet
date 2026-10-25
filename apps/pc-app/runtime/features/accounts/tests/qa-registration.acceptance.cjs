const { app } = require("electron");
const assert = require("node:assert/strict");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { execFileSync } = require("node:child_process");
const { provisionQaProfile } = require("../qa-scenario.cjs");
const { readQaScenario } = require("../../../core/qa-scenario.cjs");
const { createServices } = require("../../../core/services.cjs");
const { openDatabase, migrate } = require("../../../core/database.cjs");
const feature = require("../index.cjs");
const output = resolve(`artifacts/accounts/qa-registration-${Date.now()}`); mkdirSync(output, { recursive: true });
const profile = join(output, "profile"), marker = provisionQaProfile(profile);
app.setPath("userData", profile);
process.env.PET_USER_DATA_DIR = profile; process.env.LINGJING_QA_SCENARIO = "unified-battle";
app.whenReady().then(async () => {
  let registered, db;
  try {
    const shared = readQaScenario({ userData: profile });
    db = openDatabase(join(profile, "lingjing.sqlite"));
    migrate(db, "accounts", feature.migrations);
    const services = createServices({ db, paths: { userData: profile, legacyDataFile: join(profile, "pet-runtime-data.json") },
      safeStorage: require("electron").safeStorage, windows: { all: () => [] },
      legacy: { runtimeDataStore: { getAuthSession: () => ({ currentUser: null }) }, onlineDuelService: { enabled: false } } });
    services.provide("qaScenario", shared); // Foundation already owns this frozen service.
    registered = feature.register(services);
    for (const [command, handler] of Object.entries(registered.commands)) services.ipc.handle(`accounts:${command}`, handler, { public: feature.publicCommands.includes(command) });
    assert.equal(services.get("qaScenario"), shared);
    const qaIdentity = services.get("qaIdentity"); assert.deepEqual(qaIdentity.descriptor, shared.descriptor);
    assert.throws(() => qaIdentity.requireIdentity(), { code: "LOGIN_REQUIRED" });
    const result = await services.invoke("accounts", "register", { provider: "local", account: "qa_actor", username: "测试伙伴", password: "qa-secret-789", confirmPassword: "qa-secret-789", rememberSession: true });
    assert.equal(result.ok, true); const identity = qaIdentity.requireIdentity();
    assert.equal(identity.ownerAccountId, result.data.currentUser.id); assert.equal(identity.authority, "simulated");
    assert.equal(identity.runId, marker.runId); assert.equal(identity.provider, "qa"); assert.equal(identity.sessionToken, undefined);
    assert.throws(() => services.get("accounts").requireRuntimeUser(), { code: "SIMULATED_SESSION_ONLY" });
    await services.invoke("accounts", "logout");
    assert.throws(() => qaIdentity.requireIdentity(), { code: "LOGIN_REQUIRED" });
    const evidence = { passed: true, at: new Date().toISOString(), sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(),
      electron: process.versions.electron, sharedDescriptorUnchanged: true, scenario: shared.descriptor, identity,
      checks: ["existing foundation qaScenario is retained without duplicate registration", "qaIdentity resolves verified current owner only", "no cloud token is synthesized", "live-cloud guard rejects QA", "identity capability rejects access after logout"] };
    writeFileSync(join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
    console.log("ACCOUNTS_QA_REGISTRATION_PASSED", output);
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { registered?.dispose(); db?.close(); app.exit(process.exitCode || 0); }
});
