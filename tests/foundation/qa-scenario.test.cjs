const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { readQaScenario, MARKER, SCENARIO } = require('../../apps/pc-app/runtime/core/qa-scenario.cjs');

function fixture() {
  const profile = mkdtempSync(join(tmpdir(), 'lingjing-qa-'));
  const marker = { schemaVersion: 1, application: 'lingjing', scenario: SCENARIO, runId: randomUUID(), isolated: true, profilePath: profile };
  writeFileSync(join(profile, MARKER), JSON.stringify(marker));
  return { profile, marker, env: { LINGJING_QA_SCENARIO: SCENARIO, PET_USER_DATA_DIR: profile } };
}
test('ordinary startup has no simulation; an existing QA profile requires its explicit flag', () => {
  assert.equal(readQaScenario({ env: {}, userData: 'unused-no-filesystem-read' }), null);
  const f = fixture();
  assert.throws(() => readQaScenario({ env: { PET_USER_DATA_DIR: f.profile }, userData: f.profile }), { code: 'QA_SCENARIO_REQUIRED' });
});
test('scenario refuses an ordinary profile, unknown mode, or marker copied from another directory', () => {
  const f = fixture();
  const ordinary = join(f.profile, 'ordinary'); mkdirSync(ordinary);
  assert.throws(() => readQaScenario({ env: { ...f.env, PET_USER_DATA_DIR: ordinary }, userData: ordinary }), { code: 'QA_PROFILE_REQUIRED' });
  assert.throws(() => readQaScenario({ env: { ...f.env, LINGJING_QA_SCENARIO: 'other' }, userData: f.profile }), { code: 'QA_PROFILE_REQUIRED' });
  writeFileSync(join(ordinary, MARKER), JSON.stringify(f.marker));
  assert.throws(() => readQaScenario({ env: { ...f.env, PET_USER_DATA_DIR: ordinary }, userData: ordinary }), { code: 'QA_PROFILE_REQUIRED' });
});
test('scenario cannot point the legacy store outside its independent profile', () => {
  const f = fixture();
  assert.throws(() => readQaScenario({ env: { ...f.env, PET_RUNTIME_DATA_FILE: join(f.profile, '..', 'original-user.json') }, userData: f.profile }), { code: 'QA_PROFILE_REQUIRED' });
});
test('verified QA profile can reopen with the same provenance and cannot mutate the descriptor', () => {
  const f = fixture();
  const first = readQaScenario({ env: f.env, userData: f.profile });
  const second = readQaScenario({ env: f.env, userData: f.profile });
  assert.deepEqual(first.descriptor, second.descriptor);
  assert.deepEqual(first.descriptor, { id: SCENARIO, runId: f.marker.runId, provenance: 'simulated', isolated: true });
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.descriptor), true);
});
