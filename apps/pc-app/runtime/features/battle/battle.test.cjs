const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const vm = require("node:vm");
const { openDatabase, migrate } = require("../../core/database.cjs");
const { createServices } = require("../../core/services.cjs");
const { RuntimeDataStore } = require("../../services/runtime-data-store.cjs");
const { BattleRuntimeService, createSession, executeRound } = require("../../services/battle-runtime.cjs");
const { OnlineDuelService } = require("../../services/online-duel-service.cjs");
const { BattleFeatureService } = require("./service.cjs");
const migrations = require("./migrations.cjs");
const { createBattleBackupAdapter } = require("./backup.cjs");

const companionsFile = process.env.LINGJING_COMPANIONS_MODULE || resolve(__dirname, "../companions/index.cjs");
const hasCompanions = existsSync(companionsFile);
const clone = value => JSON.parse(JSON.stringify(value));
function setup(folder = mkdtempSync(join(tmpdir(), "lingjing-battle-"))) {
  const db = openDatabase(join(folder, "state.sqlite"));
  const legacy = new RuntimeDataStore({ filePath: join(folder, "legacy.json"), sessionFilePath: join(folder, "session.json") });
  if (!legacy.getAuthSession().currentUser) legacy.registerUser("battle-local-test", "battle-test-password", "实机验证伙伴");
  const services = createServices({ db, legacy: { runtimeDataStore: legacy }, paths: { userData: folder } });
  if (hasCompanions) {
    const module = require(companionsFile);
    migrate(db, "companions", module.migrations);
    module.register(services);
    const owner = services.session.getOwnerAccountId();
    if (!services.get('companions').listPets(owner).length) {
      const { CompanionsService } = require('../companions/service.cjs');
      const domain = new CompanionsService({ db });
      for (const [index,name] of ['训练伙伴甲','训练伙伴乙'].entries()) domain.adopt(owner, { templateId:'big-fish-gentle',name,showOnDesktop:false,actionId:`2d-fixture-${index}` });
    }
  }
  migrate(db, "battle", migrations);
  const service = new BattleFeatureService(services);
  const owner = services.session.getOwnerAccountId();
  const context = { ownerAccountId: owner };
  return { folder, db, legacy, services, service, owner, context, close() { service.dispose(); db.close(); } };
}

test("desktop and edge formulas agree for all 400 five-element/action pairs and stacked effects", () => {
  const source = readFileSync(resolve(__dirname, "../../../../../infra/supabase/functions/duel-online/index.ts"), "utf8").trimStart().replace(/^import[^\n]+\n/, "");
  const scope = { Deno: { serve() {} }, console, crypto: globalThis.crypto };
  vm.runInNewContext(`${source}\nglobalThis.resolveForTest=resolveRound;`, scope);
  const elements = ["metal", "wood", "earth", "water", "fire"];
  const actions = ["normal_attack", "element_attack", "dodge", "ultimate"];
  for (const left of elements) for (const right of elements) for (const a of actions) for (const b of actions) {
    const session = createSession(left, right);
    session.player.hp = 83; session.enemy.hp = 79;
    session.player.anger = 70; session.enemy.anger = 80;
    session.player.statuses = [{ type: "burn", duration: 3, stacks: 2, sourceId: "enemy" }, { type: "petrify", duration: 3, stacks: 2, sourceId: "enemy" }];
    session.enemy.statuses = [{ type: "parasite", duration: 3, stacks: 2, potency: 2, sourceId: "player" }, { type: "vulnerability", duration: 3, stacks: 2, sourceId: "player" }];
    const room = { current_round: 1 };
    for (const [role, side] of [["player", "host"], ["enemy", "guest"]]) {
      for (const key of ["element", "hp", "anger"]) room[`${side}_${key}`] = session[role][key];
      room[`${side}_free_dodge_used`] = false;
      room[`${side}_statuses`] = session[role].statuses.map(status => ({ ...status, sourceId: status.sourceId === "player" ? "host" : "guest" }));
    }
    const local = executeRound(session, a, b);
    const cloud = clone(scope.resolveForTest(room, a, b));
    assert.deepEqual(local.hpAfter, { player: cloud.hp_after.host, enemy: cloud.hp_after.guest }, `${left}/${right} ${a}/${b} hp`);
    assert.deepEqual(local.angerAfter, { player: cloud.anger_after.host, enemy: cloud.anger_after.guest });
    assert.deepEqual(local.actions, { player: cloud.actions.host, enemy: cloud.actions.guest });
    assert.equal(local.winner, cloud.winner_side === "host" ? "player" : cloud.winner_side === "guest" ? "enemy" : null);
    for (const [role, side] of [["player", "host"], ["enemy", "guest"]]) {
      const statuses = cloud.statuses_after[side].map(status => ({ ...status, sourceId: status.sourceId === "host" ? "player" : "enemy" }));
      assert.deepEqual(local.statusesAfter[role].map(status => ({ ...status, stackable: Boolean(status.stackable) })), statuses);
      assert.deepEqual(local.dotDamageEvents[role], cloud.dot_damage_events[side]);
      assert.deepEqual(local.healEvents[role], cloud.heal_events[side]);
    }
  }
});

test("restore preserves free dodge, anger, stacks and terminal state without resetting a fight", () => {
  const engine = new BattleRuntimeService();
  const saved = engine.snapshot(); saved.round = 3; saved.player.freeDodgeUsed = true; saved.player.anger = 50;
  saved.enemy.statuses = [{ type: "burn", stacks: 3, duration: 6, sourceId: "player" }];
  assert.deepEqual(engine.restore(saved), saved);
  const result = engine.act("ultimate");
  assert.equal(result.roundResult.actions.player, "ultimate");
  assert.ok(result.roundResult.healEvents.player);
  const ended = engine.snapshot(); ended.enemy.hp = 0;
  engine.restore(ended);
  assert.throws(() => engine.act("normal_attack"), /already finished/);
  assert.throws(() => engine.restore({ ...saved, player: { ...saved.player, hp: -2 } }), /invalid battle combatant/);
});

test("online round review uses that round's HP, anger, statuses and free dodge, not latest room state", () => {
  const online = new OnlineDuelService();
  online.currentUser = { id: "a" }; online.side = "host";
  online.room = { id: "r", current_round: 9, host_hp: 5, guest_hp: 6, host_element: "water", guest_element: "fire" };
  const mapped = online.mapRoundToBattleResult({ round_no: 2, host_action: "stunned", guest_action: "ultimate", round_result: {
    hp_after: { host: 96, guest: 101 }, anger_after: { host: 24, guest: 16 }, free_dodge_used: { host: true, guest: false },
    statuses_after: { host: [{ type: "burn", stacks: 2, duration: 4, sourceId: "guest" }], guest: [] }
  } });
  assert.equal(mapped.state.round, 2); assert.equal(mapped.state.player.hp, 96); assert.equal(mapped.state.enemy.hp, 101);
  assert.equal(mapped.state.player.anger, 24); assert.equal(mapped.state.player.freeDodgeUsed, true);
  assert.equal(mapped.state.player.statuses[0].sourceId, "enemy");
  assert.equal(mapped.roundResult.actions.player, "stunned");
});

test("realtime does not regress a newer room or keep another room's cached rounds", () => {
  const online = new OnlineDuelService(); online.currentUser = { id: "a" };
  online.applyRoom({ id: "one", host_user_id: "a", last_resolved_round: 4, current_round: 5, updated_at: "2026-10-24T12:00:04Z" });
  online.applyRoom({ id: "one", host_user_id: "a", last_resolved_round: 2, current_round: 3, updated_at: "2026-10-24T12:00:02Z" });
  assert.equal(online.room.current_round, 5);
  online.roundCache.set(3, {});
  online.applyRoom({ id: "two", host_user_id: "a", current_round: 1 });
  assert.equal(online.roundCache.size, 0);
});

test("real SQLite and companions: full training awards only the selected instance once, and preserves legacy data", { skip: !hasCompanions }, async () => {
  const f = setup();
  try {
    const pets = f.service.pets(f.owner);
    const companions = f.services.get("companions");
    const selected = pets[0].petId;
    const before = companions.getPet(f.owner, selected).growth;
    const otherBefore = companions.getPet(f.owner, pets[1].petId);
    const legacyBefore = readFileSync(join(f.folder, "legacy.json"), "utf8");
    let session = await f.service.startTraining({ actionId: "start-one", petId: selected, enemyElement: "metal" }, f.context);
    assert.equal((await f.service.startTraining({ actionId: "start-one", petId: selected, enemyElement: "metal" }, f.context)).id, session.id);
    let finalAction;
    for (let round = 1; round <= 150 && session.status === "active"; round++) {
      finalAction = { actionId: `round-${round}`, sessionId: session.id, action: session.snapshot.player.anger >= 50 ? "ultimate" : "element_attack", expectedRound: session.snapshot.round + 1 };
      session = await f.service.act(finalAction, f.context);
    }
    assert.equal(session.status, "finished"); assert.equal(session.reward.applied, true);
    const after = companions.getPet(f.owner, selected).growth;
    const award = session.winner === "player" ? 20 : 5;
    assert.equal((after.level - before.level) * 100 + after.experience - before.experience, award);
    await f.service.act(finalAction, f.context);
    await f.service.retrySettlement({ sessionId: session.id }, f.context);
    assert.deepEqual(companions.getPet(f.owner, selected).growth, after);
    assert.deepEqual(companions.getPet(f.owner, pets[1].petId), otherBefore);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM battle_reward_receipts").get().n, 1);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM battle_reports_v2").get().n, 1);
    const report = f.service.getReport({ reportId: session.id }, f.context);
    assert.equal(report.rounds.length, session.snapshot.round);
    assert.deepEqual(report.rounds.at(-1).state, session.snapshot);
    assert.equal(readFileSync(join(f.folder, "legacy.json"), "utf8"), legacyBefore);
    assert.equal(companions.getSelections(f.owner).battlePetId, selected);
  } finally { f.close(); }
});

test("real disk restart restores a fight and stale simultaneous commands cannot play a second round", { skip: !hasCompanions }, async () => {
  let f = setup(); const folder = f.folder;
  try {
    const petId = f.service.pets(f.owner)[0].petId;
    let session = await f.service.startTraining({ actionId: "restart-start", petId, enemyElement: "wood" }, f.context);
    session = await f.service.act({ sessionId: session.id, actionId: "first", action: "dodge", expectedRound: 1 }, f.context);
    const saved = clone(session.snapshot); const id = session.id;
    f.close(); f = setup(folder);
    session = f.service.snapshot({ sessionId: id }, f.context);
    assert.deepEqual(session.snapshot, saved);
    assert.equal(f.service.overview({}, f.context).session.id, id);
    const attempts = await Promise.allSettled(["same-round-a", "same-round-b"].map(actionId => f.service.act({ sessionId: id, actionId, action: "normal_attack", expectedRound: 2 }, f.context)));
    assert.equal(attempts.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(attempts.find(item => item.status === "rejected").reason.code, "ROUND_CONFLICT");
    assert.equal(f.service.snapshot({ sessionId: id }, f.context).snapshot.round, 2);
  } finally { f.close(); }
});

test("failed seed adapter rolls back the final round, experience, report and reward receipt together", { skip: !hasCompanions }, async () => {
  const f = setup();
  try {
    const petId = f.service.pets(f.owner)[0].petId;
    let session = await f.service.startTraining({ actionId: "rollback-start", petId, enemyElement: "metal" }, f.context);
    session.snapshot.player.anger = 100; session.snapshot.enemy.hp = 1;
    f.service.store.save(f.owner, session);
    const growth = f.services.get("companions").getPet(f.owner, petId).growth;
    f.services.provide("garden", { grantSeeds() { throw new Error("injected seed storage failure"); } });
    await assert.rejects(f.service.act({ sessionId: session.id, actionId: "rollback-end", action: "ultimate", expectedRound: 1 }, f.context), /injected seed/);
    assert.deepEqual(f.services.get("companions").getPet(f.owner, petId).growth, growth);
    assert.equal(f.service.snapshot({ sessionId: session.id }, f.context).snapshot.round, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM battle_reward_receipts").get().n, 0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM battle_reports_v2").get().n, 0);
    assert.equal(f.service.store.action(f.owner, "rollback-end"), null);
  } finally { f.close(); }
});

test("wild/territory adapters keep trusted challenge provenance and isolate owner access", { skip: !hasCompanions }, async () => {
  const f = setup();
  try {
    const petId = f.service.pets(f.owner)[0].petId;
    const challenge = { id: "territory-one", territoryId: "territory-one", opponent: { petId: "defender-instance", petName: "驻守伙伴", element: "water" } };
    const session = f.service.beginTerritoryChallenge({ ownerAccountId: f.owner, petId, actionId: "territory-start", challenge });
    assert.equal(f.service.getOutcome({ ownerAccountId: f.owner, sessionId: session.id }).settled, false);
    assert.throws(() => f.service.settleTerritoryChallenge({ ownerAccountId: f.owner, sessionId: session.id }), /尚未完成/);
    assert.throws(() => f.service.getOutcome({ ownerAccountId: "other", sessionId: session.id }), /请先登录/);
    f.legacy.registerUser("battle-other-test", "battle-other-password", "另一个账号");
    const other = { ownerAccountId: f.services.session.getOwnerAccountId() };
    assert.throws(() => f.service.snapshot({ sessionId: session.id }, other), /未找到/);
    assert.equal(f.service.listReports({}, other).length, 0);
  } finally { f.close(); }
});

test("real accounts local-ID migration keeps pets reachable and logout revokes battle access", { skip: !hasCompanions || !existsSync(resolve(__dirname, '../accounts/service.cjs')) }, async () => {
  const f = setup(); let accounts;
  try {
    const { AccountsService } = require('../accounts/service.cjs');
    const { migrations: accountMigrations } = require('../accounts/schema.cjs');
    migrate(f.db, 'accounts', accountMigrations);
    f.services.paths.legacyDataFile = join(f.folder, 'legacy.json');
    // The real account service is used with cloud explicitly disabled, never a simulated cloud login.
    accounts = new AccountsService({ services: f.services, remote: { enabled: false, setCurrentUser() {} } });
    f.services.provide('accounts', accounts); f.services.session.setAdapter(accounts);
    await accounts.ready;
    assert.throws(() => f.service.overview({}, {}), error => error.code === 'AUTH_REQUIRED');
    await accounts.authenticate({ provider: 'local', account: 'battle-local-test', password: 'battle-test-password', rememberSession: false });
    const owner = accounts.getOwnerAccountId();
    assert.notEqual(owner, f.owner);
    assert.equal(f.service.overview({}, { ownerAccountId: owner }).pets.length, 2);
    assert.equal(f.services.get('companions').listPets(owner).length, 2);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS count FROM companion_legacy_archive WHERE owner_account_id=?').get(owner).count, 6);
    assert.throws(() => f.service.user(owner), /云端账号/);
    await accounts.logout();
    assert.throws(() => f.service.overview({}, { ownerAccountId: owner }), error => error.code === 'AUTH_REQUIRED');
  } finally { accounts?.dispose(); f.close(); }
});

test("real garden adapter consumes the battle outcome and never repeats territory ownership or seed settlement", { skip: !hasCompanions || !existsSync(resolve(__dirname, '../garden/index.cjs')) }, async () => {
  const f = setup();
  try {
    const gardenModule = require('../garden/index.cjs');
    migrate(f.db, 'garden', gardenModule.migrations);
    const entry = gardenModule.register(f.services);
    f.services.provide('battle', {
      beginTerritoryChallenge: input => f.service.beginTerritoryChallenge(input),
      getOutcome: input => f.service.getOutcome(input)
    });
    // Explicit domain fixture, not a claim that Windows positioning was verified in this test.
    const fix = { lat: 31.2304, lng: 121.4737, accuracyMeters: 10, timestampMs: Date.now(), source: 'os', coordinateSystem: 'wgs84' };
    f.services.provide('discovery', { location: { snapshot: () => ({ fix: { ...fix, timestampMs: Date.now() } }) } });
    const garden = f.services.get('garden');
    const territory = garden.territories.discoverAtSystemFix(fix);
    const before = garden.snapshot(f.context);
    const petId = f.service.pets(f.owner)[0].petId;
    const started = await entry.commands.territoryChallenge({ sessionOwnerAccountId:f.owner, actionId: 'territory-adapter-start', petId, territoryId: territory.id, expectedTerritoryRevision: territory.revision, expectedRevision: before.revision }, f.context);
    assert.equal(started.ok, true, JSON.stringify(started));
    let session = f.service.snapshot({ sessionId: started.data.sessionId }, f.context);
    for (let n = 0; n < 150 && session.status === 'active'; n++) session = await f.service.act({ sessionId: session.id, actionId: `territory-round-${n}`, action: session.snapshot.player.anger >= 50 ? 'ultimate' : 'element_attack', expectedRound: session.snapshot.round + 1 }, f.context);
    assert.equal(session.status, 'finished'); assert.equal(session.reward.applied, true);
    assert.equal(session.reward.seeds.quantity, 2);
    const settled = f.db.transaction(() => garden.territories.settleChallenge({ ownerAccountId: f.owner, sessionId: session.id }))();
    assert.equal(settled.won, session.winner === 'player');
    assert.equal(settled.ownerAccountId, settled.won ? f.owner : null);
    assert.deepEqual(garden.territories.settleChallenge({ ownerAccountId: f.owner, sessionId: session.id }), settled);
    await f.service.retrySettlement({ sessionId: session.id }, f.context);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM garden_reward_receipts WHERE receipt_id=?').get(session.id).n, 1);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM garden_territory_logs WHERE battle_id=? AND action IN ('occupy','defend')").get(session.id).n, 1);
    assert.equal(garden.snapshot(f.context).data.plots.length, before.data.plots.length);
  } finally { f.close(); }
});

test("battle backup keeps newer final state and cannot roll a reward ledger backward", { skip: !hasCompanions }, async () => {
  const f = setup();
  try {
    const petId = f.service.pets(f.owner)[0].petId;
    let session = await f.service.startTraining({ actionId: 'backup-start', petId, enemyElement: 'metal' }, f.context);
    const backup = createBattleBackupAdapter(f.db);
    const earlier = backup.export(f.owner);
    for (let n = 0; n < 150 && session.status === 'active'; n++) session = await f.service.act({ sessionId: session.id, actionId: `backup-round-${n}`, action: session.snapshot.player.anger >= 50 ? 'ultimate' : 'element_attack', expectedRound: session.snapshot.round + 1 }, f.context);
    assert.equal(session.status, 'finished');
    const settled = backup.export(f.owner);
    assert.throws(() => backup.restore(f.owner, earlier, 'replace'), error => error.code === 'BATTLE_BACKUP_CONFLICT');
    backup.restore(f.owner, settled, 'merge'); backup.restore(f.owner, settled, 'replace');
    assert.deepEqual(f.service.snapshot({ sessionId: session.id }, f.context), session);
    const invalid = clone(settled); invalid.sessions[0].data_json = JSON.stringify({ ...JSON.parse(invalid.sessions[0].data_json), id: 'another-session' });
    assert.throws(() => backup.validate(invalid), error => error.code === 'INVALID_BATTLE_BACKUP');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM battle_reward_receipts').get().n, 1);
  } finally { f.close(); }
});
