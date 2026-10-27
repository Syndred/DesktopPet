const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const source = file => require(path.resolve(process.cwd(), file));
const { openDatabase, migrate } = source('apps/pc-app/runtime/core/database.cjs');
const { AccountsService } = source('apps/pc-app/runtime/features/accounts/service.cjs');
const { SupabaseRemote } = source('apps/pc-app/runtime/features/accounts/supabase-remote.cjs');
const { migrations: accountMigrations } = source('apps/pc-app/runtime/features/accounts/schema.cjs');
const { migrations: resourceMigrations, ResourcesService } = source('apps/pc-app/runtime/features/resources/index.cjs');
const { createResourceBackupAdapter } = source('apps/pc-app/runtime/core/resource-backup.cjs');

// Full normal cloud-account restore ordering with real production services.
// SQLite is in-memory; assets/backups remain in an isolated fixture directory.
// Auth transport is injected and synthetic: no listener, live profile or network.
test('normal cloud-account restore repairs a known missing cache before protection export, retaining identity and stable retry', async () => {
  const directory = fs.mkdtempSync(path.join(__dirname, 'account-backup-missing-fixture-'));
  const db = openDatabase(':memory:');
  let accounts;
  try {
    migrate(db, 'accounts', accountMigrations);
    migrate(db, 'resources', resourceMigrations);
    const resources = new ResourcesService({ db, storageRoot: path.join(directory, 'managed') });
    await resources.seed();
    const owner = 'isolated-account-backup-original-owner';
    let bundle;
    const remote = new SupabaseRemote({ userData: directory, config: { url: 'https://fixture.example.invalid', key: 'sb_publishable_protocol_unit_only' }, fetcher: async (url, options) => {
      assert.equal(new URL(url).hostname, 'fixture.example.invalid');
      const body = JSON.parse(options.body);
      if (body.op === 'login') {
        const deviceId = options.headers['X-Lingjing-Device-Id'], sessionId = randomUUID();
        const actor = { schemaVersion: 1, authority: 'live', authKind: 'supabase', ownerAccountId: owner, authUserId: '10000000-0000-4000-8000-000000000001', deviceId, sessionId, account: 'alice', username: 'Isolated resource regression' };
        bundle = { actor, currentUser: { id: owner, authKind: 'supabase', authUserId: actor.authUserId, account: actor.account, username: actor.username }, tokens: { deviceId, sessionId, accessToken: 'synthetic.protocol.fixture', refreshToken: 'synthetic_fixture_refresh', expiresAt: Date.now() / 1000 + 3600 } };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, data: body.op === 'login' ? bundle : { actor: bundle.actor } }) };
    } });
    const services = { db, paths: { userData: directory, legacyDataExisted: false }, safeStorage: { isEncryptionAvailable: () => false }, events: { emit() {} }, get: name => name === 'resources' ? resources : undefined };
    accounts = new AccountsService({ services, remote, host: { async apply() {}, clear() {}, dispose() {} } });
    await accounts.authenticate({ provider: 'runtime', account: 'alice', password: 'synthetic-fixture-only' });
    assert.equal(accounts.requireOwner(), owner);
    accounts.backups.register(createResourceBackupAdapter(services));
    const imported = await resources.importFile(owner, path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json'));
    const id = imported.resource.id;
    const original = await resources.assetFile(owner, id, imported.resource.entryAsset);
    const bytes = fs.readFileSync(original);
    const rowBefore = { ...db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(id) };
    const importsBefore = db.prepare('SELECT * FROM lingjing_resource_imports WHERE owner_account_id=? ORDER BY import_id').all(owner);
    const preferencesBefore = db.prepare('SELECT * FROM lingjing_resource_preferences WHERE owner_account_id=? ORDER BY resource_id').all(owner);
    const backupPath = path.join(directory, 'valid-original-backup.lingjing.json');
    accounts.backups.save(owner, backupPath);
    const originalBackupBytes = fs.readFileSync(backupPath);
    const preview = accounts.backups.preview(owner, backupPath);
    const relative = path.relative(fs.realpathSync.native(directory), fs.realpathSync.native(original));
    assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
    const preserved = original + '.preserved';
    assert.equal(fs.existsSync(preserved), false);
    fs.renameSync(original, preserved);
    const input = { previewId: preview.previewId, actionId: randomUUID(), mode: 'merge' };
    const result = await accounts.restoreBackup(input);
    assert.equal(result.restored, true);
    assert.deepEqual(fs.readFileSync(await resources.assetFile(owner, id, imported.resource.entryAsset)), bytes);
    assert.deepEqual(fs.readFileSync(preserved), bytes);
    assert.deepEqual(fs.readFileSync(backupPath), originalBackupBytes);
    assert.deepEqual({ ...db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(id) }, rowBefore);
    assert.deepEqual(db.prepare('SELECT * FROM lingjing_resource_imports WHERE owner_account_id=? ORDER BY import_id').all(owner), importsBefore);
    assert.deepEqual(db.prepare('SELECT * FROM lingjing_resource_preferences WHERE owner_account_id=? ORDER BY resource_id').all(owner), preferencesBefore);
    const protection = JSON.parse(fs.readFileSync(result.preservedBackup.filePath, 'utf8'));
    accounts.backups.validate(protection, owner);
    const protectedPack = protection.data.modules['character-resources'].data.resources.find(p => p.row.resource_id === id);
    assert.deepEqual(Buffer.from(protectedPack.files.find(f => f.key === imported.resource.entryAsset).bytes, 'base64'), bytes);
    const receipts = db.prepare('SELECT count(*) n FROM account_backup_receipts WHERE owner_account_id=?').get(owner).n;
    const duplicate = await accounts.restoreBackup(input);
    assert.equal(duplicate.duplicate, true);
    assert.equal(db.prepare('SELECT count(*) n FROM account_backup_receipts WHERE owner_account_id=?').get(owner).n, receipts);
    assert.equal(db.prepare("SELECT count(*) n FROM account_actions WHERE owner_account_id=? AND kind='restore-records'").get(owner).n, 1);
  } finally { accounts?.dispose(); db.close(); }
});
