const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Database = require('better-sqlite3');
const { parseCharacterFile, resolveAction, safeRelative, calibrations } = require('../parser.cjs');
const { migrations } = require('../repository.cjs');
const { ResourcesService } = require('../service.cjs');
const art = path.resolve(__dirname, '../../../assets/illustrations'), manifest = path.join(art, 'yuwan-character-v1.json'), builtin = 'builtin:lingjing-yuwan-v1';
let root, db, service;
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'lingjing-resource-2d-test-'));
  db = new Database(path.join(root, 'resources.sqlite')); db.pragma('foreign_keys = ON');
  migrations.forEach(migration => db.exec(migration.sql));
  service = new ResourcesService({ db, storageRoot: path.join(root, 'managed') }); await service.seed();
});
after(async () => { db?.close(); if (root?.startsWith(os.tmpdir())) await fs.rm(root, { recursive: true, force: true }); });
test('approved anime package becomes a standard Pixi spritesheet with authored actions', async () => {
  const parsed = await parseCharacterFile(manifest);
  assert.equal(parsed.resource.kind, 'spritesheet'); assert.equal(Object.keys(parsed.resource.atlas.frames).length, 8);
  assert.equal(parsed.resource.clips.length, 6); assert.deepEqual(parsed.resource.atlas.animations.walk, ['frame_2', 'frame_3']);
  assert.match(parsed.resource.provenance.author, /ImageGen/); assert.equal(parsed.resource.actions.skill, null);
  assert.equal(resolveAction(parsed.resource, 'skill').clip.name, 'idle');
  assert.equal((await service.list('owner-a')).length, 1); await service.seed(); assert.equal((await service.list('owner-a')).length, 1);
});
test('imports standard Pixi/TexturePacker atlases including trim and rotation metadata', async () => {
  const folder = path.join(root, 'atlas'); await fs.mkdir(folder);
  await fs.copyFile(path.join(art, 'yuwan-sprites-v1.png'), path.join(folder, 'atlas.png'));
  const atlas = { frames: {
    'idle.png': { frame: { x: 0, y: 0, w: 443, h: 443 }, sourceSize: { w: 460, h: 480 }, spriteSourceSize: { x: 10, y: 20, w: 443, h: 443 }, trimmed: true },
    'blink.png': { frame: { x: 444, y: 0, w: 443, h: 443 }, rotated: true },
  }, meta: { image: 'atlas.png' }, animations: { idle: ['idle.png', 'blink.png'] }, character: { name: '鱼丸 · 标准图集', fps: 6 } };
  const file = path.join(folder, 'atlas.json'); await fs.writeFile(file, JSON.stringify(atlas));
  const parsed = await parseCharacterFile(file);
  assert.equal(parsed.resource.atlas.frames['blink.png'].rotated, true); assert.equal(parsed.resource.atlas.frames['idle.png'].trimmed, true);
  assert.deepEqual(parsed.resource.clips[0].frameNames, ['idle.png', 'blink.png']); assert.equal(parsed.resource.clips[0].fps, 6);
  atlas.frames['idle.png'].spriteSourceSize.x = 1000; await fs.writeFile(file, JSON.stringify(atlas));
  await assert.rejects(parseCharacterFile(file), error => error.code === 'INVALID_ATLAS');
});
test('copies actual 2D assets, keeps receipts and source intact, isolates owners, repairs missing copies', async () => {
  const before = await fs.readFile(manifest), imported = await service.importFile('owner-a', manifest);
  const stored = await service.assetFile('owner-a', imported.resource.id, imported.resource.entryAsset);
  assert.notEqual(stored, path.join(art, imported.resource.entryAsset)); assert.deepEqual(await fs.readFile(stored), await fs.readFile(path.join(art, imported.resource.entryAsset)));
  const duplicate = await service.importFile('owner-a', manifest); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.resource.id, imported.resource.id);
  await assert.rejects(service.get('owner-b', imported.resource.id), error => error.code === 'RESOURCE_NOT_FOUND');
  await fs.unlink(stored); assert.equal((await service.get('owner-a', imported.resource.id)).availability, 'missing');
  const repaired = await service.importFile('owner-a', manifest); assert.equal(repaired.resource.id, imported.resource.id); assert.equal(repaired.resource.availability, 'ready');
  assert.equal(db.prepare('SELECT count(*) AS n FROM lingjing_resource_imports WHERE resource_id=?').get(imported.resource.id).n, 3);
  assert.deepEqual(await fs.readFile(manifest), before);
});
test('anchor, frame rate, rotation and scale save per scene and per owner; instances remain independent', async () => {
  const resource = await service.get('owner-a', builtin), calibration = structuredClone(resource.calibration);
  Object.assign(calibration.desktop, { scale: 1.16, rotationDeg: 8, anchorX: 0.43, anchorY: 0.91, fps: 12, verticalOffset: -0.08 });
  calibration.battle.scale = 0.88;
  const saved = await service.save('owner-a', { resourceId: builtin, expectedRevision: 0, calibration, actions: resource.actions }); assert.equal(saved.revision, 1);
  const a = await service.resolve('owner-a', { resourceId: builtin, petId: 'fish-a', action: 'walk', facing: 'left' });
  const b = await service.resolve('owner-a', { resourceId: builtin, petId: 'fish-b', action: 'idle' });
  assert.equal(a.resource.id, b.resource.id); assert.notEqual(a.petId, b.petId); assert.equal(a.calibration.mirrorX, true); assert.equal(b.calibration.mirrorX, false);
  a.calibration.anchorX = 0; assert.equal((await service.get('owner-a', builtin)).calibration.desktop.anchorX, 0.43);
  assert.equal((await service.get('owner-b', builtin)).calibration.desktop.scale, 1);
  const reopened = new ResourcesService({ db, storageRoot: path.join(root, 'managed') }); assert.equal((await reopened.get('owner-a', builtin)).calibration.desktop.fps, 12);
  await assert.rejects(service.save('owner-a', { resourceId: builtin, expectedRevision: 0, calibration, actions: resource.actions }), error => error.code === 'REVISION_CONFLICT');
});
test('rejects broken JSON, missing images, unsafe paths, frame overflow and invalid calibration without changing the library', async () => {
  const count = (await service.list('owner-a')).length, file = path.join(root, 'bad.json');
  for (const value of ['../image.png', 'C:/image.png', '/image.png', 'https://host/image.png', '%2e%2e/image.png', 'image.png?query']) assert.throws(() => safeRelative(value), error => error.code === 'UNSAFE_PATH');
  await fs.writeFile(file, '{'); await assert.rejects(service.importFile('owner-a', file), error => error.code === 'INVALID_JSON');
  const data = JSON.parse(await fs.readFile(manifest, 'utf8')); data.image = 'missing.png'; await fs.writeFile(file, JSON.stringify(data));
  await assert.rejects(service.importFile('owner-a', file), error => error.code === 'MISSING_ASSET');
  data.image = 'image.png'; await fs.copyFile(path.join(art, 'yuwan-sprites-v1.png'), path.join(root, 'image.png')); data.clips.idle.frames = [100]; await fs.writeFile(file, JSON.stringify(data));
  await assert.rejects(service.importFile('owner-a', file), error => error.code === 'INVALID_CLIPS');
  assert.throws(() => calibrations({ desktop: { anchorX: 1.1 } }), error => error.code === 'INVALID_CALIBRATION');
  assert.throws(() => calibrations({ desktop: { fps: 61 } }), error => error.code === 'INVALID_CALIBRATION');
  assert.equal((await service.list('owner-a')).length, count);
});
test('2D-only boundary rejects other formats while historical records and files remain unchanged', async () => {
  await assert.rejects(parseCharacterFile(path.join(root, 'old.glb')), error => error.code === 'TWO_D_ONLY');
  const file = path.join(root, 'legacy-preserved.bin'); await fs.writeFile(file, 'preserved-user-data');
  const archived = { id: 'historical-resource', name: 'Historical record', kind: 'model3d', contentHash: 'archive', importedAt: '2026-01-01', clips: [], actions: {}, calibration: {} };
  service.repository.insert('owner-a', archived, [['old.bin', file]]);
  assert.equal((await service.list('owner-a')).some(resource => resource.id === archived.id), false);
  await assert.rejects(service.get('owner-a', archived.id), error => error.code === 'TWO_D_ONLY');
  assert.equal(service.repository.get('owner-a', archived.id).name, archived.name); assert.equal(await fs.readFile(file, 'utf8'), 'preserved-user-data');
});
test('concurrent imports share an appearance and keep every successful receipt', async () => {
  const results = await Promise.all(Array.from({ length: 3 }, () => service.importFile('parallel-owner', manifest)));
  assert.equal(new Set(results.map(result => result.resource.id)).size, 1); assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM lingjing_resource_imports WHERE owner_account_id=?').get('parallel-owner').n, 3);
});
test('verified account aliases restore legacy 2D imports and preferences without rewriting ownership', async () => {
  const raw = 'legacy-resource-owner', mapped = `local:${raw}`, imported = await service.importFile(raw, manifest);
  db.exec('CREATE TABLE account_aliases(provider TEXT,subject_id TEXT,owner_account_id TEXT,evidence TEXT,created_at TEXT,PRIMARY KEY(provider,subject_id))');
  db.prepare('INSERT INTO account_aliases VALUES(?,?,?,?,?)').run('local', raw, mapped, 'legacy-id', new Date().toISOString());
  assert.equal((await service.get(mapped, imported.resource.id)).id, imported.resource.id);
  assert.equal(db.prepare('SELECT owner_account_id FROM lingjing_resources WHERE resource_id=?').get(imported.resource.id).owner_account_id, raw);
  db.prepare('INSERT INTO account_aliases VALUES(?,?,?,?,?)').run('runtime', raw, raw, 'ambiguous', new Date().toISOString());
  await assert.rejects(service.get(mapped, imported.resource.id), error => error.code === 'RESOURCE_NOT_FOUND');
});
