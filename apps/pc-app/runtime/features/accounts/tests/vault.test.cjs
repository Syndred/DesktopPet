const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');
const { SessionVault } = require('../vault.cjs');
function fixture(t, backend, encrypted = true) {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-vault-contract-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = { encrypt: 0, decrypt: 0 };
  // Public synthetic codec only; this test does not establish native encryption.
  const safeStorage = { isEncryptionAvailable: () => encrypted,
    encryptString: value => { calls.encrypt++; return Buffer.from(value); },
    decryptString: bytes => { calls.decrypt++; return bytes.toString(); } };
  if (backend !== undefined) safeStorage.getSelectedStorageBackend = () => backend;
  return { vault: new SessionVault({ safeStorage, userData: directory }), safeStorage, calls };
}
test('basic_text refuses save and load without touching existing bytes or codec', t => {
  const { vault, calls } = fixture(t, 'basic_text');
  mkdirSync(dirname(vault.file), { recursive: true });
  const original = Buffer.from('synthetic-existing-file'); writeFileSync(vault.file, original);
  assert.equal(vault.available(), false);
  assert.throws(() => vault.save({ ownerAccountId: 'synthetic-owner', proof: 'synthetic-proof' }), { code: 'SECURE_STORAGE_UNAVAILABLE' });
  assert.equal(vault.load(), null); assert.deepEqual(readFileSync(vault.file), original);
  assert.deepEqual(calls, { encrypt: 0, decrypt: 0 });
  vault.clear(); assert.equal(existsSync(vault.file), false); vault.clear();
});
test('basic_text never creates a new session file', t => {
  const { vault } = fixture(t, 'basic_text');
  assert.throws(() => vault.save({}), { code: 'SECURE_STORAGE_UNAVAILABLE' });
  assert.equal(vault.load(), null); assert.equal(existsSync(vault.file), false);
});
test('unavailable storage and backend query errors fail closed', t => {
  const { vault, safeStorage, calls } = fixture(t, 'gnome_libsecret', false);
  assert.equal(vault.available(), false);
  safeStorage.isEncryptionAvailable = () => true;
  safeStorage.getSelectedStorageBackend = () => { throw Error('synthetic-backend-unavailable'); };
  assert.equal(vault.available(), false); assert.equal(vault.load(), null);
  assert.throws(() => vault.save({}), { code: 'SECURE_STORAGE_UNAVAILABLE' });
  assert.deepEqual(calls, { encrypt: 0, decrypt: 0 });
  assert.equal(new SessionVault({ userData: '/unused-no-write' }).available(), false);
});
for (const backend of [undefined, 'gnome_libsecret', 'kwallet6']) test(`existing secure codec contract remains compatible: ${backend ?? 'backend API absent'}`, t => {
  const { vault, calls } = fixture(t, backend);
  const session = { ownerAccountId: 'synthetic-owner', proof: 'synthetic-proof' };
  assert.equal(vault.available(), true); vault.save(session);
  assert.deepEqual(vault.load(), { version: 1, ...session });
  assert.deepEqual(calls, { encrypt: 1, decrypt: 1 }); vault.clear();
  assert.equal(existsSync(vault.file), false);
});
