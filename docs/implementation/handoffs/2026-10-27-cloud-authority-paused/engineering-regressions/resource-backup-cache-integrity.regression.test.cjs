const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { createHash } = require('node:crypto');
const source = file => require(path.resolve(process.cwd(), file));
const { openDatabase, migrate } = source('apps/pc-app/runtime/core/database.cjs');
const { migrations, ResourcesService } = source('apps/pc-app/runtime/features/resources/index.cjs');
const { createResourceBackupAdapter } = source('apps/pc-app/runtime/core/resource-backup.cjs');
const { imageSize } = source('apps/pc-app/runtime/features/resources/parser.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Guard the pending missing-file repair: a backup's own checksum is insufficient
// to replace bytes under an existing immutable resource content hash.
// Only disposable files/SQLite are touched; every preserved byte is retained.
test('repair cannot install a different valid PNG under an existing resource pack hash', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-resource-cache-integrity-'));
  const db = openDatabase(path.join(root, 'fixture.sqlite'));
  try {
    migrate(db, 'resources', migrations);
    const resources = new ResourcesService({ db, storageRoot: path.join(root, 'managed') });
    await resources.seed();
    const owner = 'isolated-resource-integrity-owner';
    const manifest = path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/qingya/character.json');
    const imported = await resources.importFile(owner, manifest);
    const originalPath = await resources.assetFile(owner, imported.resource.id, imported.resource.entryAsset);
    const originalBytes = fs.readFileSync(originalPath), size = imageSize(originalBytes, 'sprites.png');
    const roster = path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2');
    let replacement;
    for (const entry of fs.readdirSync(roster, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const file = path.join(roster, entry.name, 'sprites.png');
      if (!fs.existsSync(file)) continue;
      const bytes = fs.readFileSync(file);
      if (hash(bytes) !== hash(originalBytes) && JSON.stringify(imageSize(bytes, 'sprites.png')) === JSON.stringify(size)) {
        replacement = bytes; break;
      }
    }
    assert.ok(replacement, 'Fixture needs a different original project PNG with identical dimensions');
    const adapter = createResourceBackupAdapter({ db, get: () => resources });
    const backup = adapter.export(owner), forged = structuredClone(backup);
    const entry = forged.resources.find(row => row.row.resource_id === imported.resource.id);
    const file = entry.files.find(row => row.key === imported.resource.entryAsset);
    file.bytes = replacement.toString('base64'); file.sha256 = hash(replacement);
    const packHash = createHash('sha256');
    for (const row of [...entry.files].sort((a, b) => a.key.localeCompare(b.key))) {
      packHash.update(row.key).update('\0').update(Buffer.from(row.bytes, 'base64'));
    }
    assert.notEqual(packHash.digest('hex'), entry.row.content_hash);
    const rowBefore = { ...db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(imported.resource.id) };
    const importsBefore = db.prepare('SELECT * FROM lingjing_resource_imports WHERE owner_account_id=? ORDER BY import_id').all(owner);
    const realRoot = fs.realpathSync.native(root), realFile = fs.realpathSync.native(originalPath);
    const relative = path.relative(realRoot, realFile);
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    const preserved = originalPath + '.preserved';
    assert.equal(fs.existsSync(preserved), false);
    fs.renameSync(originalPath, preserved);
    let validationAccepted = false, rejectedCode = null;
    try {
      adapter.validate(forged, owner); validationAccepted = true;
      db.transaction(() => adapter.restore(owner, forged, 'merge'))();
    } catch (error) {
      rejectedCode = error.code;
      assert.ok(['RESOURCE_BACKUP_INVALID', 'RESOURCE_CLOUD_HASH_MISMATCH'].includes(error.code), 'Only a deliberate integrity rejection is expected');
    }
    let active;
    try { active = await resources.assetFile(owner, imported.resource.id, imported.resource.entryAsset); }
    catch (error) { assert.equal(error.code, 'MISSING_ASSET'); }
    if (active) assert.deepEqual(fs.readFileSync(active), originalBytes, 'A repair must never render the substituted image');
    assert.deepEqual(fs.readFileSync(preserved), originalBytes);
    assert.deepEqual({ ...db.prepare('SELECT * FROM lingjing_resources WHERE resource_id=?').get(imported.resource.id) }, rowBefore);
    assert.deepEqual(db.prepare('SELECT * FROM lingjing_resource_imports WHERE owner_account_id=? ORDER BY import_id').all(owner), importsBefore);
    assert.equal((await resources.list(owner)).filter(row => row.origin === 'import').length, 1);
    t.diagnostic(JSON.stringify({ validationAccepted, rejectedCode, substitutedImageInstalled: false, originalBytesPreserved: true, nativeAcceptance: false }));
  } finally { db.close(); }
});
