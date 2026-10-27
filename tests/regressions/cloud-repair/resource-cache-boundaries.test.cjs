const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { openDatabase, migrate } = require('../../../apps/pc-app/runtime/core/database.cjs');
const { migrations, ResourcesService } = require('../../../apps/pc-app/runtime/features/resources/index.cjs');
const { createResourceBackupAdapter } = require('../../../apps/pc-app/runtime/core/resource-backup.cjs');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const tables = ['lingjing_resources', 'lingjing_resource_files', 'lingjing_resource_imports', 'lingjing_resource_preferences'];
const snapshot = db => Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()]));

// All filesystem changes are confined to a fresh temporary fixture, never a user profile.
async function fixture(t, count = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lingjing-cache-boundaries-'));
  const db = openDatabase(path.join(root, 'fixture.sqlite'));
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  migrate(db, 'resources', migrations);
  const resources = new ResourcesService({ db, storageRoot: path.join(root, 'managed') });
  await resources.seed();
  const owner = 'disposable-cache-boundary-owner';
  for (const name of ['qingya', 'hatcat'].slice(0, count)) {
    await resources.importFile(owner, path.resolve('apps/pc-app/runtime/features/resources/assets/roster-v2', name, 'character.json'));
  }
  const adapter = createResourceBackupAdapter({ db, get: name => name === 'resources' ? resources : undefined });
  const backup = adapter.export(owner);
  const destination = pack => {
    const document = JSON.parse(pack.row.document_json);
    const registered = db.prepare('SELECT file_path FROM lingjing_resource_files WHERE resource_id=? AND asset_key=?').get(pack.row.resource_id, document.entryAsset);
    return resources.currentFilePath(document, document.entryAsset, registered.file_path);
  };
  const remove = pack => {
    const file = destination(pack), preserved = file + '.preserved';
    assert.ok(path.relative(root, file) && !path.relative(root, file).startsWith('..'));
    fs.renameSync(file, preserved);
    return { file, preserved, bytes: fs.readFileSync(preserved) };
  };
  const prepare = data => adapter.prepareCache(owner, { version: 1, data });
  return { root, db, owner, resources, adapter, backup, destination, remove, prepare };
}
function repack(pack) {
  const digest = createHash('sha256');
  for (const file of [...pack.files].sort((a, b) => a.key.localeCompare(b.key))) {
    const bytes = Buffer.from(file.bytes, 'base64'); file.sha256 = hash(bytes);
    digest.update(file.key).update('\0').update(bytes);
  }
  pack.row.content_hash = digest.digest('hex');
  const document = JSON.parse(pack.row.document_json); document.contentHash = pack.row.content_hash;
  pack.row.document_json = JSON.stringify(document);
}
function alterDescriptor(pack) {
  const file = pack.files.find(file => /\.json$/i.test(file.key));
  assert.ok(file);
  file.bytes = Buffer.concat([Buffer.from(file.bytes, 'base64'), Buffer.from('\n ')]).toString('base64');
  repack(pack);
}
const rejected = operation => assert.throws(operation, error => error.code === 'RESOURCE_BACKUP_INVALID' || error.code === 'UNSAFE_PATH');

test('validate all cache plans before writes: later current-hash conflict leaves earlier missing resource untouched', async t => {
  const f = await fixture(t, 2), missing = f.remove(f.backup.resources[0]), forged = structuredClone(f.backup);
  alterDescriptor(forged.resources[1]);
  f.adapter.validate(forged, f.owner); // Self-consistent backup still cannot replace the current immutable hash.
  const before = snapshot(f.db);
  rejected(() => f.prepare(forged));
  assert.equal(fs.existsSync(missing.file), false);
  assert.deepEqual(fs.readFileSync(missing.preserved), missing.bytes);
  assert.deepEqual(snapshot(f.db), before);
});

test('recomputed file and whole-package hashes do not authorize new bytes for an existing ID', async t => {
  const f = await fixture(t), missing = f.remove(f.backup.resources[0]), forged = structuredClone(f.backup);
  alterDescriptor(forged.resources[0]);
  f.adapter.validate(forged, f.owner);
  assert.notEqual(forged.resources[0].row.content_hash, f.backup.resources[0].row.content_hash);
  const before = snapshot(f.db);
  rejected(() => f.prepare(forged));
  assert.equal(fs.existsSync(missing.file), false);
  assert.deepEqual(snapshot(f.db), before);
});

test('existing damaged bytes are rejected and never overwritten', async t => {
  const f = await fixture(t), missing = f.remove(f.backup.resources[0]);
  const damaged = Buffer.from('fixture damaged cache'); fs.writeFileSync(missing.file, damaged, { flag: 'wx' });
  const before = snapshot(f.db);
  rejected(() => f.prepare(f.backup));
  assert.deepEqual(fs.readFileSync(missing.file), damaged);
  assert.deepEqual(fs.readFileSync(missing.preserved), missing.bytes);
  assert.deepEqual(snapshot(f.db), before);
});

for (const kind of ['file', 'parent']) test(`cache repair rejects ${kind} symlink without touching target`, async t => {
  const f = await fixture(t), pack = f.backup.resources[0], missing = f.remove(pack);
  const outside = path.join(f.root, 'outside-managed'); fs.mkdirSync(outside);
  const sentinel = path.join(outside, 'sentinel'); fs.writeFileSync(sentinel, 'untouched');
  if (kind === 'file') fs.symlinkSync(sentinel, missing.file);
  else {
    const directory = path.dirname(missing.file);
    fs.renameSync(directory, directory + '.preserved-directory');
    fs.symlinkSync(outside, directory, process.platform === 'win32' ? 'junction' : 'dir');
  }
  const before = snapshot(f.db);
  rejected(() => f.prepare(f.backup));
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'untouched');
  assert.deepEqual(fs.readdirSync(outside), ['sentinel']);
  assert.deepEqual(snapshot(f.db), before);
});

test('owner mismatch cannot repair or mutate another owner resource', async t => {
  const f = await fixture(t), missing = f.remove(f.backup.resources[0]);
  const forged = structuredClone(f.backup); forged.resources[0].row.owner_account_id = 'other-owner';
  const before = snapshot(f.db);
  rejected(() => f.prepare(forged));
  rejected(() => f.adapter.prepareCache('other-owner', { version: 1, data: f.backup }));
  assert.equal(fs.existsSync(missing.file), false);
  assert.deepEqual(snapshot(f.db), before);
});

for (const kind of ['missing', 'extra']) test(`registered asset-key set ${kind} entry rejects before repair`, async t => {
  const f = await fixture(t), pack = f.backup.resources[0], missing = f.remove(pack);
  if (kind === 'missing') f.db.prepare('DELETE FROM lingjing_resource_files WHERE resource_id=? AND asset_key=?').run(pack.row.resource_id, pack.files.find(file => /\.json$/i.test(file.key)).key);
  else f.db.prepare('INSERT INTO lingjing_resource_files VALUES(?,?,?)').run(pack.row.resource_id, 'extra.json', path.join(f.root, 'managed', 'extra.json'));
  const before = snapshot(f.db);
  rejected(() => f.prepare(f.backup));
  assert.equal(fs.existsSync(missing.file), false);
  assert.deepEqual(snapshot(f.db), before);
});

test('cache repair and repeat merge retain current authored metadata, revision, registry, and imports', async t => {
  const f = await fixture(t), pack = f.backup.resources[0], missing = f.remove(pack);
  const current = JSON.parse(pack.row.document_json); current.name = 'New authored name after backup'; current.revision = 17;
  f.db.prepare('UPDATE lingjing_resources SET document_json=?,revision=? WHERE resource_id=?').run(JSON.stringify(current), 17, pack.row.resource_id);
  f.db.prepare('INSERT INTO lingjing_resource_preferences VALUES(?,?,?,?,?)').run(pack.row.resource_id, f.owner, JSON.stringify(current.calibration), JSON.stringify(current.actions), 19);
  const before = snapshot(f.db);
  assert.ok(before.lingjing_resource_imports.length > 0);
  assert.ok(before.lingjing_resource_preferences.length > 0);
  assert.equal(f.prepare(f.backup).repaired, 1);
  assert.equal(f.prepare(f.backup).repaired, 0);
  f.db.transaction(() => f.adapter.restore(f.owner, f.backup, 'merge'))();
  assert.deepEqual(snapshot(f.db), before);
  assert.deepEqual(fs.readFileSync(missing.file), missing.bytes);
  assert.deepEqual(fs.readFileSync(missing.preserved), missing.bytes);
});
