const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { companionIdentity } = require('../display-identity.mjs');
const { migrateCompanions } = require('../migrations.cjs');
const { CompanionsService } = require('../service.cjs');
const { createCompanionBackupAdapter } = require('../backup.cjs');
const { createServices } = require('../../../core/services.cjs');
const { boundsFor, placeDesktopWindow } = require('../windows.cjs');

test('display identity formats supplied authoritative decimal metadata while preserving the original role, petId, nickname and legacy serial', () => {
  // Controlled preallocated metadata, not a local/global allocation mechanism.
  const first = Object.freeze({ templateId: 'animal-hat-cat', petId: 'pet-11111111-0000-4000-8000-000000000001', name: '我的旧昵称', serial: '11111111', globalSerial: '1', resource: { resourceId: 'builtin:lingjing-yuwan-v2' } });
  const second = Object.freeze({ ...first, petId: 'pet-11111111-0000-4000-8000-000000000002', globalSerial: '2' });
  const a = companionIdentity(first), b = companionIdentity(second);
  assert.equal(a.roleName, '礼帽喵'); assert.equal(a.historicalNickname, first.name);
  assert.equal(a.instanceNumber, '0001'); assert.equal(b.instanceNumber, '0002'); assert.notEqual(a.instanceNumber, b.instanceNumber);
  assert.equal(companionIdentity({ ...first, name: '礼帽喵' }).historicalNickname, null);
  const legacyId = '原始:账号/伙伴%2F#大小写AbC-' + '长'.repeat(160);
  assert.deepEqual(companionIdentity({ templateId: 'legacy:unknown-role', petId: legacyId, name: '从前的名字' }), {
    roleName: '历史伙伴', instanceNumber: '待同步', historicalNickname: '从前的名字'
  });
  assert.equal(first.globalSerial, '1'); assert.equal(first.serial, '11111111'); assert.notEqual(first.petId, second.petId);
  const wild = { templateId: 'animal-white-fox', name: '野外原名', globalSerial: '2' };
  assert.equal(companionIdentity(wild).instanceNumber, companionIdentity({ ...wild, petId: 'original-captured-pet-id' }).instanceNumber);
  assert.equal(companionIdentity({ ...wild, globalSerial: '1' }).instanceNumber, '0001', 'Different type counters may each supply sequence1');
});

test('display numbers never use UUID/legacy serial or JS Number conversion and remain pending without canonical confirmed metadata', () => {
  const pet = { templateId: 'animal-white-fox', petId: 'pet-original-id-unchanged', name: '小狐', serial: '0001' };
  for (const [globalSerial, expected] of [['1','0001'],['9999','9999'],['10000','10000'],['9007199254740993','9007199254740993']]) {
    const source = Object.freeze({ ...pet, globalSerial }), before = JSON.stringify(source);
    assert.equal(companionIdentity(source).instanceNumber, expected); assert.equal(JSON.stringify(source), before);
  }
  for (const globalSerial of [undefined, null, 1, 0, '', '0', '00', '0001', '-1', '+1', '1e3', '1.5', '１２', ' 1', '1 ', '1\n', '1\r', '1\u2028']) {
    assert.equal(companionIdentity({ ...pet, globalSerial }).instanceNumber, '待同步');
  }
  assert.equal(companionIdentity(pet).instanceNumber, '待同步'); assert.equal(Object.hasOwn(pet,'globalSerial'), false);
});

test('unconfirmed legacy identity stays pending and preserves original SQLite bytes, checksum, receipts, owner, growth, resource and selections across reopen', () => {
  const folder = mkdtempSync(join(tmpdir(), 'lingjing-display-identity-'));
  const file = join(folder, 'shared.sqlite'); let db = new DatabaseSync(file); let registration;
  const owner = 'existing-identity-owner', foreign = 'other-identity-owner';
  try {
    migrateCompanions(db);
    let sequence = 0;
    const service = new CompanionsService({ db, uuid: () => `11111111-0000-4000-8000-${String(++sequence).padStart(12,'0')}` });
    const pets = ['旧昵称一', '旧昵称二'].map((name, index) => service.adopt(owner, { actionId: `original-adopt-${index}`, templateId: 'animal-hat-cat', name, showOnDesktop: false }).data.pet);
    assert.equal(pets[0].serial, pets[1].serial);
    for (const pet of pets) {
      assert.equal(Object.hasOwn(pet, 'globalSerial'), false);
      assert.equal(companionIdentity(pet).instanceNumber, '待同步', 'Local adoption must never fabricate a global number');
    }
    service.account(foreign);
    service.select(owner, { actionId: 'original-chat', petId: pets[0].petId, slot: 'chatPetId' });
    service.select(owner, { actionId: 'original-battle', petId: pets[1].petId, slot: 'battlePetId' });
    service.select(owner, { actionId: 'original-guard', petId: pets[1].petId, slot: 'guardPetId' });
    service.updateDesktop(owner, { actionId: 'original-scale', petId: pets[0].petId, scale: 1.35, position: { x: 137, y: 293, displayId: 'old-monitor' } });
    service.applyGrowthInTransaction(owner, { actionId: 'original-growth', petId: pets[0].petId, effect: { experience: 125, affinity: 7 } });
    db.prepare('INSERT INTO companion_legacy_archive VALUES(?,?,?,?)').run(owner, 'original-archive-id', '{"name":"未改写的历史"}', '2026-10-24');
    const services = createServices({ db, legacy: {}, paths: { userData: folder }, windows: {} });
    services.session.setAdapter({ getCurrentUser: () => ({ id: owner }) });
    registration = require('../index.cjs').register(services);
    const api = services.get('companions'), backup = createCompanionBackupAdapter(db);
    const original = backup.export(owner), checksum = backup.dataChecksum(owner);
    const numbers = pets.map(pet => api.getDisplayIdentity(owner, pet.petId).instanceNumber);
    for (let i = 0; i < 100; i++) for (const pet of api.listPets(owner)) {
      const identity = api.getDisplayIdentity(owner, pet.petId);
      assert.equal(identity.roleName, '礼帽喵'); assert.equal(identity.instanceNumber, '待同步');
      assert.equal(Object.hasOwn(pet, 'globalSerial'), false);
      assert.equal(identity.historicalNickname, pet.name);
    }
    assert.throws(() => api.getDisplayIdentity(foreign, pets[0].petId), error => error.code === 'PET_NOT_FOUND');
    assert.deepEqual(backup.export(owner), original); assert.equal(backup.dataChecksum(owner), checksum);
    registration.dispose(); registration = null; db.close(); db = new DatabaseSync(file); db.exec('PRAGMA query_only=ON');
    const reopened = new CompanionsService({ db });
    assert.deepEqual(createCompanionBackupAdapter(db).export(owner), original);
    const rows = db.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id=? ORDER BY pet_id').all(owner);
    assert.deepEqual(rows.map(row => companionIdentity(JSON.parse(row.data_json)).instanceNumber).sort(), numbers.sort());
    const selections = JSON.parse(db.prepare('SELECT selections_json FROM companion_accounts WHERE owner_account_id=?').get(owner).selections_json);
    assert.deepEqual(selections, { chatPetId: pets[0].petId, battlePetId: pets[1].petId, guardPetId: pets[1].petId });
    const first = reopened.requirePet(owner, pets[0].petId), second = reopened.requirePet(owner, pets[1].petId);
    assert.equal(first.desktop.scale, 1.35); assert.deepEqual(first.desktop.position, { x: 137, y: 293, displayId: 'old-monitor' });
    assert.equal(first.growth.level, 2); assert.equal(second.growth.level, 1); assert.equal(first.name, '旧昵称一'); assert.equal(second.name, '旧昵称二');
    console.log('COMPANION_IDENTITY_DB ' + JSON.stringify({ kind: 'unconfirmed-legacy-real-SQLite-readback', realGlobalAllocation: false, owner, numbers,
      internalPetIds: [first.petId, second.petId], confirmedFieldAbsent: !Object.hasOwn(first, 'globalSerial') && !Object.hasOwn(second, 'globalSerial'),
      roleNames: [companionIdentity(first).roleName, companionIdentity(second).roleName], legacySerials: [first.serial, second.serial],
      historicalNicknames: [first.name, second.name], selections, savedScale: first.desktop.scale, savedPosition: first.desktop.position,
      backupChecksumBefore: checksum, backupChecksumAfterReopen: createCompanionBackupAdapter(db).dataChecksum(owner),
      exactExportUnchanged: true, reopenedQueryOnly: true, originalReceiptCount: original.tables.companion_actions.length }));
  } finally {
    registration?.dispose(); db.close();
    assert.equal(dirname(resolve(folder)), resolve(tmpdir())); assert.ok(basename(folder).startsWith('lingjing-display-identity-'));
    rmSync(folder, { recursive: true, force: true });
  }
});

test('geometry policy uses saved logical scale across mixed-DPI and negative-origin display fixtures without reading a native size back', () => {
  // Simulated monitor geometry only; actual mouse/cross-screen acceptance belongs to09.
  const displays = [{ id: 1, scaleFactor: 1.25, workArea: { x: 0, y: 0, width: 1536, height: 824 } },
    { id: 2, scaleFactor: 2, workArea: { x: -1920, y: -250, width: 1920, height: 1080 } }];
  const screen = { getAllDisplays: () => displays, getDisplayNearestPoint: point => displays[point.x < 0 ? 1 : 0], getPrimaryDisplay: () => displays[0] };
  const pet = { desktop: { scale: 1.35, position: { x: 100, y: 100, displayId: '1' } } };
  let actual;
  const window = { getBounds() { throw new Error('native size must never feed the next requested size'); }, setPosition() { throw new Error('setPosition reintroduces growth'); }, setBounds: next => { actual = next; } };
  for (let i = 0; i < 1000; i++) {
    placeDesktopWindow(window, pet, screen, { x: i % 2 ? -1500 : 300, y: i % 2 ? -100 : 100, displayId: null });
    assert.equal(actual.width, 311); assert.equal(actual.height, 378);
    assert.equal(pet.desktop.scale, 1.35);
  }
  assert.deepEqual(boundsFor(pet, screen, { x: -3000, y: -500, displayId: '2' }), { x: -1920, y: -250, width: 311, height: 378, displayId: '2' });
});
