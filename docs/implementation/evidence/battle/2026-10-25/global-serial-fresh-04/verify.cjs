// Directed source/SQLite review only. Metadata and invitation transport below are
// explicitly scripted; this does not allocate a number or exercise live cloud/UI.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');

const root = resolve(__dirname, '../../../../../..');
const runtime = file => require(join(root, 'apps/pc-app/runtime', file));
const { createServices } = runtime('core/services.cjs');
const { migrations: accountMigrations } = runtime('features/accounts/schema.cjs');
const { checksum } = runtime('features/accounts/util.cjs');
const { migrateCompanions } = runtime('features/companions/migrations.cjs');
const { CompanionsService } = runtime('features/companions/service.cjs');
const { createCompanionBackupAdapter } = runtime('features/companions/backup.cjs');
const { BattleFeatureService } = runtime('features/battle/service.cjs');
const approvedBase = '85321dc2b2837e261d159ef136bcf52d855d6207';
const originalBattle = '8cff955f52b908163a70aa5f4b8e3ca68ffb1536';
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const digest = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);

async function main() {
  const runId = randomUUID(), directory = join(root, 'artifacts/qa/battle-global-serial', runId);
  mkdirSync(directory, { recursive: true });
  const database = join(directory, 'directed.sqlite'), db = new DatabaseSync(database);
  const checks = [], passed = (id, evidence) => checks.push({ id, passed: true, ...evidence });
  const ownerA = 'scripted_serial_battle_a', ownerB = 'scripted_serial_battle_b';
  let current = ownerA, authKind = 'supabase', feature, battle;
  const currentUser = () => ({ id: current, ownerAccountId: current, account: current, username: current, sessionToken: 'scripted-not-a-provider-token' });
  try {
    accountMigrations.forEach(migration => db.exec(migration.sql));
    migrateCompanions(db);
    runtime('features/battle/migrations.cjs').forEach(migration => { if (migration.sql) db.exec(migration.sql); if (migration.up) migration.up(db); });
    for (const owner of [ownerA, ownerB]) db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(owner, 'runtime', owner, owner, owner, owner, '2026-10-25', '2026-10-25');
    const raw = new CompanionsService({ db });
    const adopt = (owner, index) => raw.adopt(owner, { actionId: `original-adoption-${index}`, templateId: 'animal-white-fox', name: `历史名字${index}`, showOnDesktop: false }).data.pet;
    const petsA = [adopt(ownerA, 1), adopt(ownerA, 2)], petB = adopt(ownerB, 3);
    for (const owner of [ownerA, ownerB]) db.prepare('UPDATE companion_accounts SET legacy_imported_at=? WHERE owner_account_id=?').run('2026-10-25', owner);
    const forged = { ...raw.requirePet(ownerA, petsA[0].petId), globalSerial: '123456' };
    db.prepare('UPDATE companion_pets SET data_json=? WHERE owner_account_id=? AND pet_id=?').run(JSON.stringify(forged), ownerA, petsA[0].petId);
    db.prepare('INSERT INTO companion_legacy_archive VALUES(?,?,?,?)').run(ownerA, 'original-archive', '{"historicalName":"原档保持"}', '2026-10-24');
    const backup = createCompanionBackupAdapter(db);
    const original = new Map([ownerA, ownerB].map(owner => [owner, JSON.stringify(backup.export(owner))]));
    const petRows = () => JSON.stringify(db.prepare('SELECT owner_account_id,pet_id,data_json FROM companion_pets ORDER BY owner_account_id,pet_id').all());
    const originalPetRows = petRows();
    const originalActions = db.prepare('SELECT * FROM companion_actions ORDER BY owner_account_id,action_id').all();

    const services = createServices({ db, legacy: {}, paths: { userData: directory }, windows: {} });
    services.session.setAdapter({ getCurrentUser: currentUser });
    services.provide('accounts', {
      identity: who => ({ provider: 'runtime', subject_id: who }), getOwnerAccountId: () => current,
      privateSession: () => ({ ...currentUser(), authKind }),
      cloudInvoke: async () => { throw new Error('Unexpected external request: all readback inputs must be explicit scripted fixtures'); }
    });
    services.provide('resources', { ready: Promise.resolve() });
    feature = runtime('features/companions/index.cjs').register(services);
    const companions = services.get('companions');
    battle = new BattleFeatureService(services);
    const context = owner => ({ ownerAccountId: owner });
    const historical = { id: 'original-history', sessionId: 'original-history-session', mode: 'training', status: 'finished', winner: 'player',
      player: battle.ownedPet(ownerA, petsA[0].petId), enemy: { ...battle.ownedPet(ownerA, petsA[1].petId), petName: '原战报名字' },
      rounds: [], endedAt: '2026-10-24T12:00:00.000Z', rules: battle.overview({}, context(ownerA)).rules };
    const historicalBytes = JSON.stringify(historical);
    battle.store.saveRawReport(ownerA, { id: historical.id, session_id: historical.sessionId, data_json: historicalBytes, ended_at: historical.endedAt });
    const before = battle.overview({}, context(ownerA));
    assert.deepEqual(before.pets.map(pet => pet.displayIdentity.instanceNumber), ['待同步', '待同步']);
    assert.equal(companions.getPet(ownerA, petsA[0].petId).globalSerial, undefined);
    passed('untrusted-import-is-pending', { forgedRawNumber: '123456', lobbyNumbers: before.pets.map(pet => pet.displayIdentity.instanceNumber) });

    function readback(owner, numbers) {
      const data = JSON.parse(original.get(owner)), revision = 7;
      const body = { format: 'lingjing-account-save', version: 1, ownerAccountId: owner, identity: { provider: 'runtime', subjectId: owner },
        provenance: { mode: 'live' }, createdAt: '2026-10-25T00:00:00.000Z', data: { modules: { companions: { version: 1, data } }, tables: {} } };
      return { authority: 'live', ownerAccountId: owner, revision, envelope: { ...body, checksum: checksum(body) }, module: { version: 1, data },
        serialRegistry: { format: 'lingjing.global-serial.readback', version: 1, ownerAccountId: owner, namespace: 'qa:scripted-consumer-review', revision,
          pets: data.tables.companion_pets.map(row => ({ ownerAccountId: owner, petId: row.pet_id, templateId: row.template_id,
            namespace: 'qa:scripted-consumer-review', globalSerial: numbers[row.pet_id] })) } };
    }
    const confirmed = readback(ownerA, { [petsA[0].petId]: '7', [petsA[1].petId]: '9007199254740993' });
    companions.applyCloudReadback(ownerA, confirmed);
    const overview = battle.overview({}, context(ownerA));
    const identities = overview.pets.map(pet => ({ petId: pet.petId, ...pet.displayIdentity }));
    for (const pet of overview.pets) assert.deepEqual(pet.displayIdentity, companions.getDisplayIdentity(ownerA, pet.petId));
    assert.equal(identities.find(pet => pet.petId === petsA[0].petId).instanceNumber, '0007');
    assert.equal(identities.find(pet => pet.petId === petsA[1].petId).instanceNumber, '9007199254740993');
    assert.ok(identities.every(pet => pet.roleName === '小狐'));
    assert.equal(JSON.stringify(backup.export(ownerA)), original.get(ownerA));
    assert.equal(petRows(), originalPetRows);
    passed('overview-uses-trusted-read-only-identity', { readback: 'scripted fixture through actual applyCloudReadback/cache/getPet/getDisplayIdentity/overview', identities, rawPetBytesUnchanged: true, backupBytesUnchanged: true });

    const invalid = clone(confirmed); invalid.serialRegistry.pets[0].ownerAccountId = ownerB;
    assert.throws(() => companions.applyCloudReadback(ownerA, invalid), { code: 'GLOBAL_SERIAL_READBACK_INVALID' });
    const renumbered = clone(confirmed); renumbered.serialRegistry.pets[0].globalSerial = '88';
    assert.throws(() => companions.applyCloudReadback(ownerA, renumbered), { code: 'GLOBAL_SERIAL_READBACK_INVALID' });
    assert.deepEqual(battle.overview({}, context(ownerA)).pets.map(pet => pet.displayIdentity), overview.pets.map(pet => pet.displayIdentity));
    assert.throws(() => companions.getDisplayIdentity(ownerA, petB.petId), { code: 'PET_NOT_FOUND' });
    assert.throws(() => battle.overview({}, context(ownerB)), { code: 'AUTH_REQUIRED' });
    passed('foreign-or-renumbered-metadata-rejected', { confirmedNumbersUnchanged: true, wrongContextRejected: true, foreignPetRejected: true });

    current = ownerB;
    assert.equal(battle.overview({}, context(ownerB)).pets[0].displayIdentity.instanceNumber, '待同步');
    companions.applyCloudReadback(ownerB, readback(ownerB, { [petB.petId]: '8' }));
    assert.equal(battle.overview({}, context(ownerB)).pets[0].displayIdentity.instanceNumber, '0008');
    assert.throws(() => companions.getDisplayIdentity(ownerB, petsA[0].petId), { code: 'PET_NOT_FOUND' });
    current = ownerA;
    const display = companions.getDisplayIdentity;
    try {
      delete companions.getDisplayIdentity;
      assert.ok(battle.overview({}, context(ownerA)).pets.every(pet => pet.displayIdentity.instanceNumber === '待同步'));
    } finally { companions.getDisplayIdentity = display; }
    passed('owner-isolation-and-legacy-adapter-fallback', { ownerBNumber: '0008', ownerBWasPendingBeforeOwnReadback: true, absentIdentityAdapter: '待同步' });

    // Exercise the existing local SQLite selection path. The earlier verified
    // metadata remains a read-only cache; this is not a cloud select receipt.
    authKind = 'runtime';
    const selected = battle.selectPet({ petId: petsA[1].petId, actionId: 'original-selection-action' }, context(ownerA));
    assert.equal(selected.petId, petsA[1].petId);
    assert.equal(raw.selections(ownerA).battlePetId, petsA[1].petId);
    assert.equal(battle.overview({}, context(ownerA)).selectedPetId, petsA[1].petId);
    assert.throws(() => battle.selectPet({ petId: '9007199254740993', actionId: 'must-not-use-number' }, context(ownerA)), { code: 'PET_NOT_FOUND' });
    assert.throws(() => battle.selectPet({ petId: petB.petId, actionId: 'must-not-use-foreign-pet' }, context(ownerA)), { code: 'PET_NOT_FOUND' });
    assert.equal(Object.hasOwn(selected, 'displayIdentity'), false);
    assert.equal(Object.hasOwn(selected, 'globalSerial'), false);
    passed('selection-keeps-original-owner-and-petId', { owner: ownerA, petId: selected.petId, selectionSlot: 'battlePetId', visibleNumberIsNotAnIdentifier: true, combatDtoHasNoIdentityProjection: true });

    const sends = [];
    battle.online.sendDuelRequest = async input => { sends.push({ owner: battle.online.currentUser.id, input: clone(input) }); return { ok: true, request: { id: 'scripted-original-invite', status: 'pending' } }; };
    await battle.invite({ targetAccount: ownerB, petId: petsA[1].petId }, context(ownerA));
    assert.equal(sends.length, 1); assert.equal(sends[0].owner, ownerA);
    const invitation = battle.store.action(ownerA, 'invite:scripted-original-invite');
    assert.equal(invitation.command.petId, petsA[1].petId);
    assert.equal(battle.store.action(ownerB, 'invite:scripted-original-invite'), null);
    await assert.rejects(battle.invite({ targetAccount: ownerB, petId: petB.petId }, context(ownerA)), { code: 'PET_NOT_FOUND' });
    assert.equal(sends.length, 1);
    passed('invitation-journal-keeps-original-owner-and-petId', { transport: 'scripted sendDuelRequest; no network', sends, owner: ownerA, journal: invitation.command, foreignPetSent: false });

    let resolveInvite, signalSent;
    const sent = new Promise(resolveSent => { signalSent = resolveSent; });
    battle.online.sendDuelRequest = () => new Promise(resolveReply => { resolveInvite = resolveReply; signalSent(); });
    const late = battle.invite({ targetAccount: ownerB, petId: petsA[0].petId }, context(ownerA));
    await sent; current = ownerB;
    resolveInvite({ ok: true, request: { id: 'scripted-late-invite', status: 'pending' } });
    await assert.rejects(late, { code: 'AUTH_CHANGED' });
    for (const owner of [ownerA, ownerB]) assert.equal(battle.store.action(owner, 'invite:scripted-late-invite'), null);
    current = ownerA;
    assert.equal(petRows(), originalPetRows);
    assert.equal(db.prepare('SELECT data_json FROM battle_reports_v2 WHERE owner_account_id=? AND id=?').get(ownerA, historical.id).data_json, historicalBytes);
    for (const row of originalActions) assert.deepEqual(db.prepare('SELECT * FROM companion_actions WHERE owner_account_id=? AND action_id=?').get(row.owner_account_id, row.action_id), row);
    passed('late-account-switch-and-history-preservation', { lateReplyRejected: 'AUTH_CHANGED', noLateInviteJournal: true, originalPetRowsSha256: digest(originalPetRows), originalReportSha256: digest(historicalBytes), originalActionRowsUnchanged: originalActions.length });

    const paths = ['apps/pc-app/runtime/features/battle', 'apps/pc-app/runtime/services/battle-runtime.cjs', 'apps/pc-app/ui/src/features/battle', 'packages/shared-types/src/features/battle'];
    assert.equal(git('diff', '--name-only', originalBattle, approvedBase, '--', ...paths), '');
    assert.equal(git('diff', '--name-only', approvedBase, '--', ...paths), '');
    const files = ['apps/pc-app/runtime/features/battle/service.cjs', 'apps/pc-app/ui/src/features/battle/index.tsx', 'apps/pc-app/ui/src/features/battle/FriendsPanel.tsx', 'apps/pc-app/ui/src/features/battle/useBattleSession.ts', 'apps/pc-app/runtime/features/companions/index.cjs', 'apps/pc-app/runtime/features/companions/global-serial-cache.cjs', 'apps/pc-app/runtime/features/companions/display-identity.mjs'];
    const sourceFiles = files.map(file => ({ path: file, gitBlob: git('hash-object', `--path=${file}`, file), sha256: digest(readFileSync(join(root, file))) }));
    for (const file of sourceFiles) assert.equal(file.gitBlob, git('rev-parse', `${approvedBase}:${file.path}`));
    passed('approved-source-and-battle-scope-unchanged', { originalBattle, approvedBase, unchangedPaths: paths, sourceFiles });

    battle.dispose(); battle = null; feature.dispose(); feature = null; db.close();
    const readOnly = new DatabaseSync(database, { readOnly: true });
    try {
      readOnly.exec('PRAGMA query_only=ON');
      assert.equal(JSON.stringify(readOnly.prepare('SELECT owner_account_id,pet_id,data_json FROM companion_pets ORDER BY owner_account_id,pet_id').all()), originalPetRows);
      assert.equal(readOnly.prepare('SELECT data_json FROM battle_reports_v2 WHERE owner_account_id=? AND id=?').get(ownerA, historical.id).data_json, historicalBytes);
      passed('independent-read-only-SQLite-reopen', { database, queryOnly: true, originalPetRowsUnchanged: true, originalReportBytesUnchanged: true });
    } finally { readOnly.close(); }
    const result = { format: 'lingjing.battle.global-serial.directed-review', version: 1, runId, checkedAt: new Date().toISOString(), approvedBase,
      headWhenRun: git('rev-parse', 'HEAD'), verification: 'actual domain/services and SQLite with explicitly scripted number readbacks and invitation transport',
      realCloudVerified: false, sqlOrEdgeDeployed: false, realGlobalNumberAllocation: false, nativeUiExercised: false, productFilesChanged: false,
      pending: ['09 native lobby/selection/invitation verification on the frozen candidate', 'independent live cloud number readback after coordinator SQL/Edge deployment'],
      checkedCount: checks.length, passed: true, checks };
    writeFileSync(join(__dirname, 'checks.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checkedCount: checks.length, runId, database, evidence: join(__dirname, 'checks.json'), realCloudVerified: false, nativeUiExercised: false }));
  } finally { battle?.dispose(); feature?.dispose(); if (db.isOpen) db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
