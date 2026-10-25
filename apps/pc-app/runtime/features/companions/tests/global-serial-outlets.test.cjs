const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve, dirname, basename } = require('node:path');
const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { CompanionsService } = require('../service.cjs');
const { migrateCompanions } = require('../migrations.cjs');
const { createCompanionBackupAdapter } = require('../backup.cjs');
const { BackupManager } = require('../../accounts/backups.cjs');
const { migrations } = require('../../accounts/schema.cjs');
const { checksum } = require('../../accounts/util.cjs');
const { createServices } = require('../../../core/services.cjs');

// Controlled protocol and cryptography fixtures. This independently exercises
// actual SQLite, service registration and IPC dispatch, not live allocation or
// Windows DPAPI. Production safeStorage is verified separately by the root.
function sealedStorageFixture() {
  const key = randomBytes(32);
  return {
    isEncryptionAvailable: () => true,
    encryptString(text) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]);
    },
    decryptString(bytes) {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
    }
  };
}
const digest = value => createHash('sha256').update(value).digest('hex');

test('independent main/IPC projection isolates shared petIds and never promotes imported receipt metadata', { timeout: 15000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-serial-outlets-'));
  const databaseFile = join(directory, 'shared.sqlite');
  let db = new DatabaseSync(databaseFile), feature, releaseGate;
  const owners = ['qa_serial_outlets_a', 'qa_serial_outlets_b'];
  const templates = ['animal-white-fox', 'animal-white-fox', 'animal-hat-cat'];
  const numbers = [['1', '9007199254740993', '1'], ['10000', '9007199254740994', '2']];
  const labels = [['0001', '9007199254740993', '0001'], ['10000', '9007199254740994', '0002']];
  const safeStorage = sealedStorageFixture(), remoteByOwner = new Map(), originals = new Map(), petsByOwner = new Map();
  let currentOwner = owners[0], offline = false, gate = null, cloudSession = true;
  try {
    migrations.forEach(migration => db.exec(migration.sql)); migrateCompanions(db);
    const backup = createCompanionBackupAdapter(db);
    for (const [ownerIndex, owner] of owners.entries()) {
      db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .run(owner, 'runtime', owner, owner, owner, '原账号', '2026-10-25', '2026-10-25');
      let sequence = 0;
      const raw = new CompanionsService({ db, uuid: () => `shared-instance-${++sequence}` });
      const pets = templates.map((templateId, index) => raw.adopt(owner, {
        actionId: `unchanged-action-${index}`, templateId, name: `原昵称${index + 1}`, showOnDesktop: false
      }).data.pet);
      db.prepare('UPDATE companion_accounts SET legacy_imported_at=? WHERE owner_account_id=?').run('2026-10-25', owner);
      db.prepare('INSERT INTO companion_legacy_archive VALUES(?,?,?,?)').run(owner, 'original-archive', '{"原存档":"保持字节"}', '2026-10-25');
      const imported = backup.export(owner);
      for (const row of imported.tables.companion_pets) row.data_json = JSON.stringify({ ...JSON.parse(row.data_json), globalSerial: '666666666666' });
      for (const row of imported.tables.companion_actions) {
        const result = JSON.parse(row.result_json);
        result.data.pet.globalSerial = '666666666666'; row.result_json = JSON.stringify(result);
      }
      backup.restore(owner, imported, 'replace');
      petsByOwner.set(owner, pets); originals.set(owner, JSON.stringify(backup.export(owner)));
      const data = backup.export(owner), body = {
        format: 'lingjing-account-save', version: 1, ownerAccountId: owner,
        identity: { provider: 'runtime', subjectId: owner }, provenance: { mode: 'live' },
        createdAt: '2026-10-25T00:00:00.000Z', data: { modules: { companions: { version: 1, data } }, tables: {} }
      };
      remoteByOwner.set(owner, {
        authority: 'live', ownerAccountId: owner, revision: 3,
        envelope: { ...body, checksum: checksum(body) }, module: { version: 1, data },
        serialRegistry: {
          format: 'lingjing.global-serial.readback', version: 1, ownerAccountId: owner, namespace: 'live', revision: 3,
          pets: pets.map((pet, index) => ({ ownerAccountId: owner, petId: pet.petId, templateId: pet.templateId, namespace: 'live', globalSerial: numbers[ownerIndex][index] }))
        }
      });
    }
    assert.deepEqual(petsByOwner.get(owners[0]).map(pet => pet.petId), petsByOwner.get(owners[1]).map(pet => pet.petId));
    const originalArchive = join(directory, 'original-envelope-bytes.json');
    writeFileSync(originalArchive, JSON.stringify([...originals])); const archiveHash = digest(readFileSync(originalArchive));

    function openProfile(name) {
      const userData = join(directory, name); mkdirSync(userData, { recursive: true });
      const services = createServices({ db, legacy: {}, paths: { userData }, windows: {}, safeStorage });
      services.session.setAdapter({ getCurrentUser: () => ({ id: currentOwner }) });
      const backups = new BackupManager({ db, directory: join(userData, 'backups'), getIdentity: owner => db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(owner) });
      services.provide('backups', backups);
      services.provide('accounts', {
        identity: owner => ({ provider: 'runtime', subject_id: owner }),
        privateSession: () => ({ ownerAccountId: currentOwner, authKind: cloudSession ? 'supabase' : 'runtime' }),
        async cloudInvoke(name, input) {
          assert.equal(name, 'companions-sync'); assert.equal(input.op, 'snapshot');
          const requestedOwner = currentOwner;
          if (offline) throw Object.assign(new Error('controlled offline fixture'), { code: 'CLOUD_UNAVAILABLE' });
          const pending = gate; if (pending) { pending.started(); await pending.promise; }
          return structuredClone(remoteByOwner.get(requestedOwner));
        }
      });
      services.provide('resources', { ready: Promise.resolve() });
      feature = require('../index.cjs').register(services);
      for (const [name, handler] of Object.entries(feature.commands)) services.ipc.handle(`companions:${name}`, handler);
      return { services, api: services.get('companions'), backups, userData };
    }
    let profile = openProfile('confirmed-profile');
    const savedModules = new Map(owners.map(owner => [owner, JSON.stringify(profile.backups.snapshot(owner).data)]));
    const assertOriginalBytes = () => {
      for (const owner of owners) {
        assert.equal(JSON.stringify(backup.export(owner)), originals.get(owner));
        assert.equal(JSON.stringify(profile.backups.snapshot(owner).data), savedModules.get(owner));
      }
      assert.equal(digest(readFileSync(originalArchive)), archiveHash);
    };

    await t.test('an in-flight read loses authority when its session changes', async () => {
      let signalStarted;
      const started = new Promise(resolve => { signalStarted = resolve; });
      gate = { started: signalStarted, promise: new Promise(resolve => { releaseGate = resolve; }) };
      const pending = profile.services.invoke('companions', 'list'); await started;
      currentOwner = owners[1]; gate = null; releaseGate();
      const cancelled = await pending; assert.equal(cancelled.ok, false); assert.equal(cancelled.code, 'SESSION_CHANGED');
      for (const owner of owners) assert.equal(profile.api.getPet(owner, petsByOwner.get(owner)[0].petId).globalSerial, undefined);
      assertOriginalBytes();
    });

    await t.test('all main and IPC read outlets bind exact owner, pet and original template', async () => {
      const events = []; profile.services.events.on('companions:changed', event => events.push(event));
      for (const [ownerIndex, owner] of owners.entries()) {
        currentOwner = owner;
        const snapshot = await profile.services.invoke('companions', 'list'); assert.equal(snapshot.ok, true);
        assert.equal(snapshot.data.ownerAccountId, owner);
        const listed = profile.api.listPets(owner); assert.equal(listed.length, 3);
        for (const [index, pet] of petsByOwner.get(owner).entries()) {
          const outputs = [listed.find(value => value.petId === pet.petId), snapshot.data.pets.find(value => value.petId === pet.petId), profile.api.getPet(owner, pet.petId), (await profile.services.invoke('companions', 'get', { petId: pet.petId })).data];
          for (const output of outputs) {
            assert.equal(output.ownerAccountId, owner); assert.equal(output.petId, pet.petId); assert.equal(output.templateId, pet.templateId);
            assert.equal(output.globalSerial, numbers[ownerIndex][index]); assert.equal(output.name, pet.name); assert.equal(output.serial, pet.serial);
          }
          assert.equal(profile.api.getDisplayIdentity(owner, pet.petId).instanceNumber, labels[ownerIndex][index]);
          const identity = await profile.services.invoke('companions', 'identity', { petId: pet.petId });
          assert.equal(identity.ok, true); assert.equal(identity.data.instanceNumber, labels[ownerIndex][index]);
        }
        assert.ok(events.some(event => event.ownerAccountId === owner));
      }
      currentOwner = owners[0];
      const invalid = structuredClone(remoteByOwner.get(currentOwner)); invalid.serialRegistry.pets[0].ownerAccountId = owners[1];
      assert.throws(() => profile.api.applyCloudReadback(currentOwner, invalid), { code: 'GLOBAL_SERIAL_READBACK_INVALID' });
      assert.equal(profile.api.getPet(currentOwner, petsByOwner.get(currentOwner)[0].petId).globalSerial, '1');
      assertOriginalBytes();
    });

    await t.test('IPC mutation retries retain raw imported receipt bytes while reads retain verified numbers', async () => {
      cloudSession = false;
      try {
        for (const [ownerIndex, owner] of owners.entries()) {
          currentOwner = owner;
          for (const [index, pet] of petsByOwner.get(owner).entries()) {
            const response = await profile.services.invoke('companions', 'adopt', {
              actionId: `unchanged-action-${index}`, templateId: templates[index], name: `原昵称${index + 1}`, showOnDesktop: false
            });
            assert.equal(response.ok, true); assert.equal(response.duplicate, true);
            assert.equal(response.data.pet.globalSerial, '666666666666', 'Immutable imported receipts are raw historical records, not trusted read DTOs');
            assert.equal(profile.api.getPet(owner, pet.petId).globalSerial, numbers[ownerIndex][index]);
          }
        }
        assertOriginalBytes();
      } finally { cloudSession = true; }
    });

    await t.test('backup-only profiles stay pending; confirmed sealed-cache restart restores only the original bindings', async () => {
      const sealed = readFileSync(join(profile.userData, 'accounts', 'global-pet-serials.cache'));
      assert.equal(sealed.includes(Buffer.from(owners[0])), false);
      feature.dispose(); feature = null; offline = true; profile = openProfile('backup-only-profile');
      for (const owner of owners) {
        currentOwner = owner;
        for (const pet of petsByOwner.get(owner)) {
          const value = await profile.services.invoke('companions', 'get', { petId: pet.petId });
          assert.equal(value.ok, true); assert.equal(Object.hasOwn(value.data, 'globalSerial'), false);
          assert.equal(profile.api.getDisplayIdentity(owner, pet.petId).instanceNumber, '待同步');
        }
      }
      assertOriginalBytes(); feature.dispose(); feature = null; profile = openProfile('confirmed-profile');
      for (const [ownerIndex, owner] of owners.entries()) {
        currentOwner = owner;
        for (const [index, pet] of petsByOwner.get(owner).entries()) {
          const value = await profile.services.invoke('companions', 'get', { petId: pet.petId });
          assert.equal(value.ok, true); assert.equal(value.data.globalSerial, numbers[ownerIndex][index]);
        }
      }
      assertOriginalBytes();
    });

    feature.dispose(); feature = null; db.close(); db = new DatabaseSync(databaseFile, { readOnly: true }); db.exec('PRAGMA query_only=ON');
    const reopened = new CompanionsService({ db });
    for (const owner of owners) {
      assert.equal(JSON.stringify(createCompanionBackupAdapter(db).export(owner)), originals.get(owner));
      for (const pet of petsByOwner.get(owner)) assert.equal(reopened.requirePet(owner, pet.petId).globalSerial, '666666666666');
    }
    console.log('COMPANION_OUTLETS_INDEPENDENT ' + JSON.stringify({ kind: 'real-SQLite-and-main-IPC-with-controlled-provider', owners: 2, samePetIdsAcrossOwners: true, pets: 6, rawModuleHashes: owners.map(owner => digest(originals.get(owner))), archiveHash, exactOriginalBytesRetained: true, queryOnlyReopen: true, allocationVerified: false, nativeSafeStorageVerified: false, nativeUiOperated: false }));
  } finally {
    releaseGate?.(); feature?.dispose(); db.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('lingjing-serial-outlets-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
