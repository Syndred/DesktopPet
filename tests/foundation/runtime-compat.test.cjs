const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { RuntimeDataStore } = require('../../apps/pc-app/runtime/services/runtime-data-store.cjs');
const { createRuntimeCompatibility } = require('../../apps/pc-app/runtime/core/runtime-compat.cjs');

test('extracted compatibility reads existing accounts, pets and history without rewriting the archive or exposing legacy windows/IPC', () => {
  const userData = mkdtempSync(join(tmpdir(), 'lingjing-runtime-compat-')), file = join(userData, 'pet-runtime-data.json');
  const original = new RuntimeDataStore({ filePath: file });
  const { currentUser } = original.registerUser('compat_archive', 'isolated-compat-password', '已有账号');
  original.saveBattleReport({ id: 'retained-report', status: 'finished', winner: 'player', mode: 'duel', rounds: [] });
  const saved = JSON.parse(readFileSync(file, 'utf8')); saved.retainedExtension = { untouched: true };
  writeFileSync(file, JSON.stringify(saved)); const bytes = readFileSync(file);
  const compatibility = createRuntimeCompatibility({ userData, legacyDataFile: file });
  try {
    assert.equal(compatibility.runtimeDataStore.state.users.find(user => user.id === currentUser.id).account, 'compat_archive');
    assert.deepEqual(compatibility.runtimeDataStore.state.userInventories[currentUser.id].pets, saved.userInventories[currentUser.id].pets);
    assert.equal(compatibility.runtimeDataStore.state.userInventories[currentUser.id].battleReports[0].id, 'retained-report');
    assert.deepEqual(readFileSync(file), bytes);
    assert.equal(compatibility.invoke, undefined); assert.equal(compatibility.open, undefined);
  } finally { compatibility.dispose(); }
});
test('read-only legacy load never creates a missing archive or replaces malformed original bytes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'lingjing-archive-readonly-')), file = join(directory, 'original.json');
  const missing = new RuntimeDataStore({ filePath: file, readOnly: true });
  assert.equal(require('node:fs').existsSync(file), false);
  assert.throws(() => missing.registerUser('readonly_user', 'isolated-readonly-password', '只读'), error => error.code === 'READ_ONLY_LEGACY_ARCHIVE');
  writeFileSync(file, '{ incomplete archive'); const before = readFileSync(file);
  assert.throws(() => new RuntimeDataStore({ filePath: file, readOnly: true }), error => error.code === 'LEGACY_ARCHIVE_INVALID');
  assert.deepEqual(readFileSync(file), before);
});
