const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { randomUUID, createHash } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createBattleDisplayViews, checkedMetadata } = require('../display-views.cjs');
const { OnlineDuelService } = require('../../../services/online-duel-service.cjs');
const { reportFor } = require('../../../../../../infra/supabase/functions/lingjing-battle/projection.js');
const ownerA = 'view-owner-a', ownerB = 'view-owner-b', templateId = 'animal-white-fox';
const longNumber = '900719925474099312345678901234567890123456789012345678901234567890';
const copy = value => structuredClone(value), bytes = value => JSON.stringify(value);
const digest = value => createHash('sha256').update(bytes(value)).digest('hex');
const pet = (petId, name) => ({ petId, petName: name, element: 'water', level: 1, resource: { kind: '2d', resourceId: 'builtin:lingjing-xiaohu-v1' } });
function document(id = randomUUID()) {
  return { id: 'online-' + id, sessionId: 'online-' + id, mode: 'friend', status: 'active', side: 'host',
    room: { id, host_user_id: ownerA, guest_user_id: ownerB, host_pet_id: 'same-pet-id', guest_pet_id: 'same-pet-id' },
    player: { ...pet('same-pet-id', '旧己方名字'), globalSerial: '9999', displayIdentity: { roleName: '伪造名字', instanceNumber: '9999' } },
    enemy: { ...pet('same-pet-id', '旧对手名字'), globalSerial: '8888' }, snapshot: { round: 1 }, rounds: [], context: { cloudUserId: ownerA } };
}
function metadata(ids, viewer = ownerA) {
  return { format: 'lingjing.battle.serial-views', version: 1, ownerAccountId: viewer, namespace: 'qa:views', rooms: ids.map(id => ({ roomId: id, roomRevision: '9007199254740993', participants: [
    { side: 'host', ownerAccountId: ownerA, petId: 'same-pet-id', templateId, globalSerial: '7' },
    { side: 'guest', ownerAccountId: ownerB, petId: 'same-pet-id', templateId, globalSerial: longNumber }
  ] })) };
}
function fixture(options = {}) {
  let owner = ownerA; const bus = new EventEmitter(), registry = new Map(), calls = [], receivers = new Set();
  const services = { session: { getOwnerAccountId: () => owner }, get: name => registry.get(name), events: { emit: (name, value) => bus.emit(name, value), on(name, fn) { bus.on(name, fn); return () => bus.off(name, fn); } } };
  registry.set('accounts', { privateSession: () => ({ ownerAccountId: owner, authKind: 'supabase' }) });
  registry.set('companions', { readIdentityPet(who, id) { assert.equal(who, owner); return { ownerAccountId: who, petId: id, templateId, name: '旧己方名字', globalSerial: who === ownerA ? '7' : longNumber }; } });
  const online = { cloudProvider: () => {}, onDisplayMetadata(fn) { receivers.add(fn); return () => receivers.delete(fn); }, onEvent() { return () => {}; },
    async invoke(op, input) { calls.push({ op, input: copy(input), owner }); return options.lookup ? options.lookup(op, input, owner) : metadata(input.roomIds, owner); } };
  const views = createBattleDisplayViews({ services, online, prepareOnline: who => assert.equal(who, owner), waitMs: options.waitMs ?? 1000 });
  return { views, registry, services, online, calls, receivers, switchOwner(value) { owner = value; bus.emit('accounts:session-changed', {}); } };
}

test('legacy zh names remain readable strings in actual identity tooltip and preserve original bytes', async () => {
  const f = fixture(); try {
    const raw = document(); raw.mode = 'duel'; raw.enemy.petName = { zh: '旧报告对手名', en: 'Archived peer' };
    const before = bytes(raw), view = await f.views.project(raw, ownerA);
    assert.deepEqual(view.enemy.petName, raw.enemy.petName);
    assert.equal(view.enemy.displayIdentity.historicalNickname, '旧报告对手名');
    assert.equal(typeof view.enemy.displayIdentity.historicalNickname, 'string');
    const built = require('esbuild').buildSync({ entryPoints: [require('node:path').resolve(__dirname, '../../../../ui/src/features/battle/identity.tsx')],
      bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent' });
    const component = { exports: {} };
    new Function('require', 'module', 'exports', built.outputFiles[0].text)(require, component, component.exports);
    const html = require('react-dom/server').renderToStaticMarkup(require('react').createElement(component.exports.ParticipantIdentity, { pet: view.enemy }));
    assert.ok(html.includes('<strong>旧报告对手名</strong>'));
    assert.ok(html.includes('title="历史昵称：旧报告对手名"'));
    assert.equal(html.includes('[object Object]'), false);
    assert.equal(bytes(raw), before);
  } finally { f.views.dispose(); }
});

test('trusted friend sides use owner+petId, preserve long text and ignore stored number fields; all result shapes are cloned', async () => {
  const f = fixture(); try {
    const raw = document(), before = bytes(raw), result = await f.views.project({ session: raw, reports: [raw] }, ownerA);
    for (const view of [result.session, result.reports[0]]) {
      assert.equal(view.player.displayIdentity.instanceNumber, '0007'); assert.equal(view.enemy.displayIdentity.instanceNumber, longNumber);
      assert.equal(view.enemy.displayIdentity.roleName, '小狐'); assert.equal(view.player.petId, view.enemy.petId);
      assert.equal(Object.hasOwn(view.player, 'globalSerial'), false); assert.equal(Object.hasOwn(view.enemy, 'globalSerial'), false);
      assert.notEqual(view, raw);
    }
    assert.equal(bytes(raw), before); assert.equal(f.calls.length, 1); assert.deepEqual(Object.keys(f.calls[0].input), ['roomIds']);
    assert.equal((await f.views.project([raw], ownerA))[0].enemy.displayIdentity.instanceNumber, longNumber);
    assert.equal(f.calls.length, 1, 'same-owner room identity is reused');
    for (const receive of f.receivers) {
      const older = metadata([raw.room.id]); older.rooms[0].roomRevision = '1'; older.rooms[0].participants = [];
      receive(older, ownerA);
    }
    assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, longNumber, 'older waiting metadata cannot erase confirmed participants');
  } finally { f.views.dispose(); }
});

test('malformed viewer/room/side/template/decimal metadata never asserts peer authority', async () => {
  const mutations = [value => { value.ownerAccountId = ownerB; }, value => { value.rooms[0].roomId = randomUUID(); },
    value => { value.rooms[0].roomRevision = 3; }, value => { value.rooms[0].participants[0].side = 'guest'; },
    value => { value.rooms[0].participants[1].templateId = 'made-up-template'; }, value => { value.rooms[0].participants[1].globalSerial = '0008'; }];
  for (const mutate of mutations) {
    const f = fixture({ lookup: (_op, input) => { const value = metadata(input.roomIds); mutate(value); return value; } });
    try { assert.equal((await f.views.project(document(), ownerA)).enemy.displayIdentity.instanceNumber, '待同步'); } finally { f.views.dispose(); }
  }
  const f = fixture(); try {
    const raw = document(); raw.side = 'guest';
    assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, '待同步');
    const forged = document(); forged.room.id = randomUUID();
    assert.equal((await f.views.project(forged, ownerA)).enemy.displayIdentity.instanceNumber, '待同步');
    const foreign = metadata([randomUUID()]); foreign.rooms[0].participants[1].ownerAccountId = ownerA;
    assert.equal(checkedMetadata(foreign, ownerA), null);
  } finally { f.views.dispose(); }
});

test('unregistered/failed peer metadata remains pending and is retried; raw metadata is not a transport source', async () => {
  let ready = false;
  const f = fixture({ lookup: (_op, input) => { const value = metadata(input.roomIds); if (!ready) value.rooms.forEach(room => { room.participants = []; }); return value; } });
  try {
    const raw = document(); raw.displayMetadata = metadata([raw.room.id]);
    assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, '待同步');
    ready = true; assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, longNumber); assert.equal(f.calls.length, 2);
  } finally { f.views.dispose(); }
  const offline = fixture({ lookup: () => { throw Object.assign(new Error('scripted forbidden'), { code: 'ROOM_FORBIDDEN' }); } });
  try { assert.equal((await offline.views.project(document(), ownerA)).enemy.displayIdentity.instanceNumber, '待同步'); } finally { offline.views.dispose(); }
});

test('reports batch at twenty, cap concurrency at two and never request an arbitrary peer actor', async () => {
  let active = 0, maximum = 0;
  const f = fixture({ lookup: async (op, input, who) => { assert.equal(op, 'get_display_metadata'); assert.equal(who, ownerA); assert.deepEqual(Object.keys(input), ['roomIds']);
    assert.ok(input.roomIds.length <= 20); assert.equal(new Set(input.roomIds).size, input.roomIds.length); maximum = Math.max(maximum, ++active);
    await new Promise(done => setImmediate(done)); active--; return metadata(input.roomIds); } });
  try {
    const values = Array.from({ length: 45 }, () => document()); const output = await f.views.project(values, ownerA);
    assert.equal(output.length, 45); assert.ok(output.every(value => value.enemy.displayIdentity.instanceNumber === longNumber));
    assert.equal(f.calls.length, 3); assert.equal(maximum, 2);
  } finally { f.views.dispose(); }
});

test('late lookup cannot return the old owner; account change clears room identity cache', async () => {
  let resolve; const f = fixture({ lookup: (_op, input) => new Promise(done => { resolve = () => done(metadata(input.roomIds)); }) });
  try {
    const work = f.views.project(document(), ownerA); await new Promise(done => setImmediate(done)); f.switchOwner(ownerB); resolve();
    await assert.rejects(work, { code: 'AUTH_CHANGED' });
  } finally { f.views.dispose(); }
  const current = fixture(); try {
    const raw = document(); await current.views.project(raw, ownerA); current.switchOwner(ownerB);
    const other = copy(raw); other.side = 'guest'; other.context.cloudUserId = ownerB;
    const output = await current.views.project(other, ownerB); assert.equal(output.player.displayIdentity.instanceNumber, longNumber);
    assert.equal(output.enemy.displayIdentity.instanceNumber, '0007'); assert.equal(current.calls.length, 2);
  } finally { current.views.dispose(); }
});

test('slow optional metadata does not hold a successful read and emits a later owner-bound refresh', async () => {
  let resolve; const f = fixture({ waitMs: 1, lookup: (_op, input) => new Promise(done => { resolve = () => done(metadata(input.roomIds)); }) });
  try {
    const raw = document(), result = await f.views.project(raw, ownerA); assert.equal(result.enemy.displayIdentity.instanceNumber, '待同步');
    const events = []; f.services.events.on('battle:online', event => events.push(event)); resolve(); await new Promise(done => setImmediate(done));
    assert.equal(events[0].ownerAccountId, ownerA); assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, longNumber);
  } finally { f.views.dispose(); }
});

test('SCRIPTED expired positive identity cache wakes authority-report views after identical late metadata, without duplicate fresh notifications', async t => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now); // Test-process clock only; no product or database time changes.
  for (const viewer of [ownerA, ownerB]) await t.test(viewer, async () => {
    let finishLookup;
    const f = fixture({ waitMs: 1, lookup: (_op, input, who) => new Promise(done => { finishLookup = () => done(metadata(input.roomIds, who)); }) });
    try {
      f.switchOwner(viewer);
      const session = document(), id = session.room.id;
      session.context = { authority: 'supabase', cloudUserId: viewer };
      session.status = 'finished'; session.winner = 'player';
      delete session.player.globalSerial; delete session.player.displayIdentity; delete session.enemy.globalSerial;
      const raw = reportFor(session), original = digest(raw), trusted = metadata([id], viewer);
      assert.equal(Object.hasOwn(raw, 'room'), false); assert.equal(Object.hasOwn(raw, 'side'), false);
      assert.equal(Object.hasOwn(raw.enemy, 'displayIdentity'), false);
      const receive = value => { for (const listener of f.receivers) listener(copy(value), viewer); };
      receive(trusted);
      const events = []; let refreshed;
      f.services.events.on('battle:online', event => {
        if (event.type !== 'display-identities') return;
        events.push(event); refreshed = f.views.project({ reports: [raw] }, viewer);
      });
      const expected = viewer === ownerA ? longNumber : '0007';
      receive(trusted);
      assert.equal(events.length, 0, 'identical fresh metadata must not cause a reload loop');
      now += 15000;
      assert.equal((await f.views.project(raw, viewer)).enemy.displayIdentity.instanceNumber, expected);
      assert.equal(f.calls.length, 0, 'the existing fifteen-second cache boundary remains inclusive');
      now++;
      const pending = await f.views.project({ reports: [raw] }, viewer);
      assert.equal(pending.reports[0].enemy.displayIdentity.instanceNumber, '待同步');
      assert.equal(f.calls.length, 1); assert.equal(events.length, 0);
      assert.deepEqual(f.calls[0], { op: 'get_display_metadata', input: { roomIds: [id] }, owner: viewer });
      finishLookup(); await new Promise(done => setImmediate(done));
      assert.equal(events.length, 1, 'restoring expired positive data must wake the previously pending report');
      assert.equal(events[0].ownerAccountId, viewer);
      assert.equal((await refreshed).reports[0].enemy.displayIdentity.instanceNumber, expected);
      assert.equal(f.calls.length, 1, 'event-driven reprojection reuses the newly validated cache');
      receive(trusted);
      assert.equal(events.length, 1, 'another identical fresh sidecar must not trigger an extra refresh');
      assert.equal(digest(raw), original);
      console.log('QA023_FRESHNESS ' + bytes({ provenance: 'scripted-metadata-and-test-process-clock-only', viewer,
        authorityReportShape: true, initialPending: true, lateRefreshEvents: events.length, unchangedFreshDuplicate: true,
        rawReportSha256: original, liveJwtVerified: false, nativeAcceptance: false }));
    } finally { f.views.dispose(); }
  });
});

test('training NPC is a practice role without an issued number; wild only consumes the trusted current-owner encounter cache', async () => {
  const f = fixture(); try {
    const raw = document(); raw.mode = 'training'; raw.enemy.petId = 'training-water';
    const practice = await f.views.project(raw, ownerA); assert.equal(practice.enemy.displayKind, 'practice'); assert.equal(practice.enemy.displayIdentity.instanceNumber, '待同步'); assert.equal(f.calls.length, 0);
    const wild = document(); wild.mode = 'wild'; wild.id = 'battle-cloud-' + randomUUID(); delete wild.sessionId; wild.enemy.petId = 'original-spawn';
    assert.equal((await f.views.project(wild, ownerA)).enemy.displayIdentity.instanceNumber, '待同步');
    const trusted = copy(wild); trusted.enemy.templateId = templateId; trusted.enemy.globalSerial = '21'; trusted.context.cloudAuthority = 'discovery';
    f.registry.set('discovery', { cloudRuntime: { handlesSession: id => id === wild.id, peek: (who, id) => who === ownerA && id === wild.id ? trusted : null } });
    assert.equal((await f.views.project(wild, ownerA)).enemy.displayIdentity.instanceNumber, '0021');
    wild.enemy.petId = 'foreign-spawn'; assert.equal((await f.views.project(wild, ownerA)).enemy.displayIdentity.instanceNumber, '待同步');
  } finally { f.views.dispose(); }
});

test('territory identities bind original session and both requested pets; null enemy never implies guardian', async () => {
  const f = fixture(); let mode = 'confirmed';
  f.registry.set('garden', { async getBattleSerialViews(input) { assert.equal(input.ownerAccountId, ownerA); return { format: 'lingjing.territory.serial-views', version: 1, ownerAccountId: ownerA, namespace: 'qa:views',
    sessions: input.sessions.map(subject => ({ sessionId: subject.sessionId, player: null, enemy: mode === 'confirmed' ? { ownerAccountId: ownerB, petId: subject.enemyPetId, templateId, globalSerial: '32' } : null, ...(mode === 'guardian' ? { enemyKind: 'guardian' } : {}) })) }; } });
  try {
    const raw = document(); raw.mode = 'territory'; raw.id = 'btl-original-territory'; delete raw.sessionId;
    assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, '0032');
    f.switchOwner(ownerA); mode = 'missing'; assert.equal((await f.views.project(raw, ownerA)).enemy.displayKind, 'instance');
    mode = 'guardian'; assert.equal((await f.views.project(raw, ownerA)).enemy.displayKind, 'guardian');
    f.switchOwner(ownerA); mode = 'confirmed'; const provider = f.registry.get('garden'); const real = provider.getBattleSerialViews;
    provider.getBattleSerialViews = async input => { const value = await real(input); value.sessions[0].enemy.petId = 'wrong-pet'; return value; };
    assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, '待同步');
    provider.getBattleSerialViews = async input => ({ format: 'lingjing.territory.serial-views', version: 1, ownerAccountId: ownerA, namespace: null,
      sessions: input.sessions.map(subject => ({ sessionId: subject.sessionId, player: null, enemy: null, enemyKind: 'guardian' })) });
    assert.equal((await f.views.project(raw, ownerA)).enemy.displayKind, 'guardian');
    f.switchOwner(ownerA); provider.getBattleSerialViews = async input => { const value = await real(input); value.namespace = null; return value; };
    assert.equal((await f.views.project(raw, ownerA)).enemy.displayIdentity.instanceNumber, '待同步', 'namespace:null never authorizes an entity number');
  } finally { f.views.dispose(); }
});

test('transport strips sibling metadata before core receipts; optional listener failure preserves the exact original response and request', async () => {
  const online = new OnlineDuelService(); online.currentUser = { id: ownerA }; online.cloudActor = { ownerAccountId: ownerA };
  online.refreshCloudTransport = async () => {}; const requests = [], original = { request: { id: 'original-request' }, room: { id: randomUUID() } };
  const sidecar = metadata([original.room.id]); online.cloudInvoker = async (_name, body) => { requests.push(copy(body)); return { ...copy(original), displayMetadata: sidecar }; };
  const received = []; online.onDisplayMetadata((value, who) => { received.push({ value, who }); throw new Error('optional view error'); });
  const input = Object.freeze({ actionId: 'original-action-id', roomId: original.room.id }); const before = digest(input);
  const result = await online.invokeCloud('leave_room', input);
  assert.deepEqual(result, original); assert.equal(digest(input), before); assert.deepEqual(requests, [{ ...input, op: 'leave_room' }]);
  assert.equal(received[0].who, ownerA); assert.deepEqual(received[0].value, sidecar); assert.equal(Object.hasOwn(result, 'displayMetadata'), false);
});

test('actual Main IPC and pure companion read work under query_only and retain original SQLite session/report/receipt/archive bytes', async () => {
  const db = new DatabaseSync(':memory:'); let companionFeature, battleFeature;
  try {
    const { migrations } = require('../../accounts/schema.cjs'); migrations.forEach(migration => db.exec(migration.sql));
    require('../../companions/migrations.cjs').migrateCompanions(db); require('../migrations.cjs').forEach(migration => { if (migration.sql) db.exec(migration.sql); if (migration.up) migration.up(db); });
    const { CompanionsService } = require('../../companions/service.cjs'), raw = new CompanionsService({ db });
    const adopted = raw.adopt(ownerA, { actionId: 'original-adoption', templateId, name: '原昵称', showOnDesktop: false }).data.pet;
    db.prepare('UPDATE companion_accounts SET legacy_imported_at=? WHERE owner_account_id=?').run('2026-10-25', ownerA);
    db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(ownerA, 'runtime', ownerA, ownerA, ownerA, ownerA, '2026-10-25', '2026-10-25');
    const { createServices } = require('../../../core/services.cjs'), services = createServices({ db, legacy: {}, paths: {}, windows: {} });
    services.session.setAdapter({ getCurrentUser: () => ({ id: ownerA }) }); let authKind = 'supabase';
    services.provide('accounts', { identity: () => ({ provider: 'runtime', subject_id: ownerA }), privateSession: () => ({ ownerAccountId: ownerA, authKind }) });
    services.provide('resources', { ready: Promise.resolve() }); companionFeature = require('../../companions/index.cjs').register(services);
    const api = services.get('companions'), backup = require('../../companions/backup.cjs').createCompanionBackupAdapter(db), data = backup.export(ownerA);
    const body = { format: 'lingjing-account-save', version: 1, ownerAccountId: ownerA, identity: { provider: 'runtime', subjectId: ownerA }, provenance: { mode: 'live' },
      createdAt: '2026-10-25T00:00:00Z', data: { modules: { companions: { version: 1, data } }, tables: {} } };
    api.applyCloudReadback(ownerA, { authority: 'live', ownerAccountId: ownerA, revision: 1, envelope: { ...body, checksum: require('../../accounts/util.cjs').checksum(body) }, module: { version: 1, data },
      serialRegistry: { format: 'lingjing.global-serial.readback', version: 1, ownerAccountId: ownerA, namespace: 'qa:views', revision: 1, pets: [{ ownerAccountId: ownerA, petId: adopted.petId, templateId, namespace: 'qa:views', globalSerial: '7' }] } });
    authKind = 'runtime'; battleFeature = require('../index.cjs').register(services);
    for (const [name, command] of Object.entries(battleFeature.commands)) services.ipc.handle('battle:' + name, command);
    const original = { id: 'battle-original-session', mode: 'training', status: 'active', player: { ...pet(adopted.petId, '原昵称'), globalSerial: '99999' }, enemy: pet('training-water', '鱼丸'),
      snapshot: require('../../../services/battle-runtime.cjs').createSession('water', 'water'), rounds: [], rules: require('../../../services/battle-runtime.cjs').getBattleRules(), context: {} };
    const report = { ...copy(original), id: 'original-report', sessionId: original.id, endedAt: '2026-10-25' };
    db.prepare('INSERT INTO battle_sessions(owner_account_id,id,status,data_json,updated_at) VALUES(?,?,?,?,?)').run(ownerA, original.id, original.status, bytes(original), '2026-10-25');
    db.prepare('INSERT INTO battle_reports_v2(owner_account_id,id,session_id,data_json,ended_at) VALUES(?,?,?,?,?)').run(ownerA, report.id, original.id, bytes(report), report.endedAt);
    const command = { petId: adopted.petId, actionId: 'original-protocol-action' };
    db.prepare('INSERT INTO battle_action_receipts(owner_account_id,action_id,session_id,command_json) VALUES(?,?,?,?)').run(ownerA, command.actionId, original.id, bytes(command));
    const tables = ['companion_pets', 'companion_actions', 'companion_legacy_archive', 'battle_sessions', 'battle_reports_v2', 'battle_action_receipts'];
    const persisted = () => tables.map(table => [table, db.prepare('SELECT * FROM ' + table).all()]); const before = digest(persisted());
    db.exec('PRAGMA query_only=ON'); assert.equal(api.readIdentityPet(ownerA, adopted.petId).globalSerial, '7');
    for (const [name, input] of [['snapshot', { sessionId: original.id }], ['getReport', { reportId: report.id }], ['listReports', {}]]) {
      const reply = await services.invoke('battle', name, input); assert.equal(reply.ok, true, name + ': ' + reply.message);
      const view = Array.isArray(reply.data) ? reply.data[0] : reply.data;
      assert.equal(view.player.displayIdentity.instanceNumber, '0007'); assert.equal(view.enemy.displayKind, 'practice');
    }
    assert.equal(digest(persisted()), before);
    assert.equal(db.prepare('SELECT command_json FROM battle_action_receipts WHERE action_id=?').get(command.actionId).command_json, bytes(command));
    const outcome = services.get('battle').getOutcome({ ownerAccountId: ownerA, sessionId: original.id });
    assert.equal(Object.hasOwn(outcome.session.player, 'displayIdentity'), false, 'internal settlement authority still reads the original core participant');
    console.log('QA014_SQLITE ' + bytes({ queryOnly: true, originalTablesSha256: before, rawSessionSha256: digest(original), rawReportSha256: digest(report), originalCommandSha256: digest(command), realCloud: false }));
  } finally { battleFeature?.dispose(); companionFeature?.dispose(); db.close(); }
});
