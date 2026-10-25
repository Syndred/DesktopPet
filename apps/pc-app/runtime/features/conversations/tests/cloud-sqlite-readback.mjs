// A second, read-only pass after both real Electron processes have exited.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const source = resolve(process.argv[2]);
const evidence = JSON.parse(readFileSync(source, 'utf8')), runRoot = dirname(source);
assert.equal(evidence.status, 'passed'); assert.equal(evidence.fullChatSync, true);
assert.equal(evidence.taskId, '01a16dc5-c418-7372-ac4b-1d9abb116865');
assert.equal(evidence.sourceCommit, evidence.build.sourceCommit); assert.deepEqual(evidence.build.sourceDirtyFiles, []);
const hash = text => createHash('sha256').update(text).digest('hex');
const audited = {};
for (const label of ['a', 'b']) {
  const expected = evidence.sqliteReadback[label], profile = resolve(expected.profile);
  assert.ok(profile.toLowerCase().startsWith((runRoot + sep).toLowerCase()));
  assert.equal(profile, join(runRoot, `profile-${label}`));
  const db = new DatabaseSync(join(profile, 'lingjing.sqlite'), { readOnly: true }); db.exec('PRAGMA query_only=ON');
  try {
    assert.equal(db.prepare('PRAGMA query_only').get().query_only, 1);
    const owner = evidence.owner;
    const identity = { ...db.prepare('SELECT owner_account_id,auth_user_id FROM account_cloud_links WHERE owner_account_id=?').get(owner) };
    assert.equal(identity.owner_account_id, owner); assert.ok(identity.auth_user_id);
    const device = JSON.parse(readFileSync(join(profile, 'accounts/device.json'), 'utf8'));
    const rows = db.prepare('SELECT sequence,id,pet_id,action_id,role,status,content FROM conversation_messages WHERE owner_account_id=? ORDER BY sequence').all(owner)
      .map(({ content, ...row }) => ({ ...row, contentHash: hash(content) }));
    const memories = db.prepare('SELECT id,pet_id,content FROM conversation_memories WHERE owner_account_id=? ORDER BY id').all(owner)
      .map(({ content, ...row }) => ({ ...row, contentHash: hash(content) }));
    const cipherHashes = db.prepare('SELECT scope,scope_id,encrypted_key FROM conversation_credentials WHERE owner_account_id=? ORDER BY scope,scope_id').all(owner)
      .map(row => ({ scope: row.scope, scopeId: row.scope_id, hash: hash(row.encrypted_key) }));
    const profiles = db.prepare('SELECT pet_id,persona,revision,use_override FROM conversation_profiles WHERE owner_account_id=? ORDER BY pet_id').all(owner)
      .map(({ persona, ...row }) => ({ ...row, personaHash: hash(persona) }));
    const selections = JSON.parse(db.prepare('SELECT selections_json FROM companion_accounts WHERE owner_account_id=?').get(owner).selections_json);
    assert.deepEqual(rows, expected.rows); assert.deepEqual(memories, expected.memories); assert.deepEqual(cipherHashes, expected.cipherHashes);
    assert.deepEqual(selections, { chatPetId: evidence.petIds[0], battlePetId: null, guardPetId: null });
    assert.equal(rows.length, 8); assert.equal(memories.length, 2); assert.equal(profiles.length, 2); assert.equal(cipherHashes.length, 2);
    assert.ok(rows.every(row => evidence.petIds.includes(row.pet_id)));
    assert.ok(rows.filter(row => row.role === 'assistant').every(row => ['failed', 'cancelled'].includes(row.status) && row.contentHash === hash('')));
    audited[label] = { identity, deviceId: device.deviceId, profile, pid: expected.pid, selections, rows, memories, profiles, cipherHashes };
  } finally { db.close(); }
}
assert.equal(audited.a.identity.auth_user_id, audited.b.identity.auth_user_id);
assert.notEqual(audited.a.deviceId, audited.b.deviceId); assert.notEqual(audited.a.pid, evidence.sqliteReadback.previousPidA);
for (const petId of evidence.petIds) {
  const messages = label => audited[label].rows.filter(row => row.pet_id === petId).map(({ sequence, ...row }) => { void sequence; return row; });
  assert.deepEqual(messages('a'), messages('b'));
}
assert.deepEqual(audited.a.memories, audited.b.memories); assert.deepEqual(audited.a.profiles, audited.b.profiles);
assert.notDeepEqual(audited.a.cipherHashes, audited.b.cipherHashes);
const report = { at: new Date().toISOString(), status: 'passed', taskId: evidence.taskId, runId: evidence.runId, sourceCommit: evidence.sourceCommit,
  method: 'Post-exit DatabaseSync readOnly with query_only; current DB/auth-link/device files compared to the matching live run, not an independent reviewer',
  owner: evidence.owner, petIds: evidence.petIds, checks: ['same real Auth UID and owner, distinct stable devices', 'same per-pet message IDs/order/content and terminal states', 'same persona/memory and deletion outcome', 'same local per-scope ciphertexts across restart; different devices retain different ciphertexts', 'only chatPetId selected; battle/guard remain null'], audited };
const output = join(runRoot, 'sqlite-readback.json'); writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output, runId: report.runId }));
