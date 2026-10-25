const { spawnSync } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const assert = require('node:assert/strict');

if (process.argv[2] === '--child') {
  const directory = process.argv[3], phase = process.versions.electron ? 'electron' : 'node';
  const Database = require('better-sqlite3');
  const db = new Database(join(directory, 'shared-napi.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS native_probe (runtime TEXT PRIMARY KEY, version TEXT NOT NULL)');
  if (phase === 'electron') assert.ok(db.prepare('SELECT * FROM native_probe WHERE runtime=?').get('node'), 'Electron must read the Node-written database');
  db.transaction(() => db.prepare('INSERT INTO native_probe VALUES (?,?)').run(phase, process.versions.electron || process.versions.node))();
  assert.equal(db.pragma('quick_check', { simple: true }), 'ok');
  const evidence = { runtime: phase, versions: { node: process.versions.node, electron: process.versions.electron || null, modules: process.versions.modules, napi: process.versions.napi },
    sqlitePackage: require('better-sqlite3/package.json').version, sqliteEngine: db.prepare('SELECT sqlite_version() AS version').get().version, rows: db.prepare('SELECT * FROM native_probe ORDER BY runtime').all() };
  db.close(); writeFileSync(join(directory, `${phase}.json`), JSON.stringify(evidence, null, 2));
} else {
  const root = resolve('artifacts/foundation/cloud-engineering/native'); mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'probe-'));
  for (const [runtime, executable] of [['node', process.execPath], ['electron', require('electron')]]) {
    const env = { ...process.env }; if (runtime === 'electron') env.ELECTRON_RUN_AS_NODE = '1'; else delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(executable, [__filename, '--child', directory], { env, windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, `${runtime} native probe failed: ${result.error || result.stderr || result.stdout}`);
  }
  const node = JSON.parse(readFileSync(join(directory, 'node.json'))), electron = JSON.parse(readFileSync(join(directory, 'electron.json')));
  assert.equal(electron.rows.length, 2); assert.equal(node.sqlitePackage, electron.sqlitePackage);
  const proof = { passed: true, at: new Date().toISOString(), directory, node, electron,
    nativePolicy: 'better-sqlite3 13 uses bundled N-API prebuilds. Do not rebuild a shared node_modules tree for an older Electron ABI.' };
  writeFileSync(join(root, 'latest.json'), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof));
}
