const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = file => require(path.resolve(process.cwd(), file));
const { openDatabase, migrate } = source('apps/pc-app/runtime/core/database.cjs');
const { BackupManager } = source('apps/pc-app/runtime/features/accounts/backups.cjs');
const { migrations: accountMigrations } = source('apps/pc-app/runtime/features/accounts/schema.cjs');
const { migrations, ResourcesService } = source('apps/pc-app/runtime/features/resources/index.cjs');
const { createResourceBackupAdapter } = source('apps/pc-app/runtime/core/resource-backup.cjs');

// Missing before choosing a backup is distinct from the native R05 fault after
// preview. Exercise actual preview/snapshot services without live profiles.
test('a valid original backup can be previewed when its known local cache file was already missing, without importing business rows', async () => {
  const directory = fs.mkdtempSync(path.join(__dirname, 'backup-preview-missing-fixture-'));
  const db = openDatabase(':memory:');
  try {
    migrate(db, 'accounts', accountMigrations);
    migrate(db, 'resources', migrations);
    const owner = 'isolated-preview-original-owner';
    const resources = new ResourcesService({ db, storageRoot: path.join(directory, 'managed') });
    await resources.seed();
    const backups = new BackupManager({ db, directory: path.join(directory, 'backups'), getIdentity: () => ({ provider: 'runtime', subject_id: owner }) });
    backups.register(createResourceBackupAdapter({ db, get: name => name === 'resources' ? resources : undefined }));
    const imported = await resources.importFile(owner, path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json'));
    const id = imported.resource.id;
    const original = await resources.assetFile(owner, id, imported.resource.entryAsset), bytes = fs.readFileSync(original);
    const sourcePath = path.join(directory, 'valid-original-backup.lingjing.json');
    backups.save(owner, sourcePath);
    const sourceBytes = fs.readFileSync(sourcePath);
    const before = Object.fromEntries(['lingjing_resources', 'lingjing_resource_imports', 'lingjing_resource_preferences'].map(t => [t, db.prepare(`SELECT * FROM ${t} WHERE owner_account_id=?`).all(owner)]));
    const relative = path.relative(fs.realpathSync.native(directory), fs.realpathSync.native(original));
    assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
    const preserved = original + '.preserved';
    assert.equal(fs.existsSync(preserved), false);
    fs.renameSync(original, preserved);
    const preview = backups.preview(owner, sourcePath);
    assert.ok(preview.previewId);
    assert.ok(preview.modules.includes('character-resources'));
    for (const [t, rows] of Object.entries(before)) assert.deepEqual(db.prepare(`SELECT * FROM ${t} WHERE owner_account_id=?`).all(owner), rows);
    assert.equal(db.prepare('SELECT count(*) n FROM account_actions').get().n, 0);
    assert.deepEqual(fs.readFileSync(sourcePath), sourceBytes);
    assert.deepEqual(fs.readFileSync(preserved), bytes);
  } finally { db.close(); }
});
