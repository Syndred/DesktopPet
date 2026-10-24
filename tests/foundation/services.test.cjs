const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { openDatabase, migrate } = require('../../apps/pc-app/runtime/core/database.cjs');
const { createServices } = require('../../apps/pc-app/runtime/core/services.cjs');

test('migration failure rolls back all writes and retry applies exactly once', () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'lingjing-foundation-')), 'save.sqlite'));
  const migrations = [{ id: '001', up(connection) { connection.exec('CREATE TABLE items(id TEXT PRIMARY KEY, quantity INTEGER CHECK(quantity>=0))'); connection.prepare('INSERT INTO items VALUES (?,?)').run('rice', -1); } }];
  assert.throws(() => migrate(db, 'garden', migrations));
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='items'").get(), undefined);
  migrate(db, 'garden', [{ id: '001', sql: 'CREATE TABLE items(id TEXT PRIMARY KEY, quantity INTEGER CHECK(quantity>=0))' }]);
  migrate(db, 'garden', [{ id: '001', sql: 'INVALID SQL' }]);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM lingjing_migrations').get().n, 1);
  db.close();
});

test('main process session owns commands even if renderer sends a forged owner', async () => {
  let user = null;
  const services = createServices({ db: null, legacy: { runtimeDataStore: { getAuthSession: () => ({ currentUser: user }) } } });
  services.ipc.handle('companions:list', (_payload, context) => context.ownerAccountId);
  assert.equal((await services.invoke('companions', 'list', { ownerAccountId: 'victim' })).code, 'AUTH_REQUIRED');
  user = { id: 'verified-owner' };
  assert.equal((await services.invoke('companions', 'list', { ownerAccountId: 'victim' })).data, 'verified-owner');
  assert.equal((await services.invoke('companions', 'unregistered')).code, 'COMMAND_UNAVAILABLE');
});
