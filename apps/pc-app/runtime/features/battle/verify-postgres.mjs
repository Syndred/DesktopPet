// Development verification only; PGlite is installed under ignored artifacts, not runtime dependencies.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(resolve('artifacts/battle/sql-validation/package.json'));
const { PGlite } = require('@electric-sql/pglite');
const database = await PGlite.create();
const checks = [];
try {
  await database.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const file of ['0003_duel_realtime_schema.sql', '0004_runtime_cloud_auth_duel_requests.sql', '0005_runtime_single_login_session.sql', '20261024_lingjing_battle_atomic_rounds.sql']) {
    await database.exec(readFileSync(resolve('infra/supabase/migrations', file), 'utf8').replace(/^\uFEFF/, ''));
  }
  checks.push('existing room/account migrations and additive battle migration executed');
  await database.query(`INSERT INTO runtime_accounts(id,account,account_key,username,password_hash,session_token) VALUES
    ('owner-a','battle-a','battle-a','甲','test-hash','local-sql-validation-a'),('owner-b','battle-b','battle-b','乙','test-hash','local-sql-validation-b')`);
  const room = (await database.query(`INSERT INTO duel_rooms(room_code,status,host_user_id,host_account,guest_user_id,guest_account,host_pet_id,guest_pet_id)
    VALUES('TEST01','active','owner-a','battle-a','owner-b','battle-b','pet-a','pet-b') RETURNING *`)).rows[0];
  for (const [owner, side] of [['owner-a','host'], ['owner-b','guest']]) {
    await database.query('INSERT INTO duel_actions(room_id,round_no,actor_user_id,actor_side,action_type) VALUES($1,1,$2,$3,\'normal_attack\')', [room.id, owner, side]);
  }
  const result = { actions: { host: 'normal_attack', guest: 'normal_attack' }, hp_after: { host: 110, guest: 110 }, anger_after: { host: 5, guest: 5 }, statuses_after: { host: [], guest: [] }, free_dodge_used: { host: false, guest: false }, winner_side: null };
  const commit = async (roundNo, value) => (await database.query('SELECT lingjing_commit_duel_round($1,$2,$3,$4,$5::jsonb) value', [room.id, roundNo, 'normal_attack', 'normal_attack', JSON.stringify(value)])).rows[0].value;
  const first = await commit(1, result);
  assert.equal(first.room.current_round, 2); assert.equal(first.room.host_hp, 110);
  const duplicate = await commit(1, { ...result, hp_after: { host: 1, guest: 0 }, winner_side: 'host' });
  assert.equal(duplicate.room.host_hp, 110); assert.equal(duplicate.round.id, first.round.id);
  assert.equal((await database.query('SELECT COUNT(*)::int n FROM duel_rounds')).rows[0].n, 1);
  checks.push('duplicate round commit returns original round without overwriting newer state');
  for (const [owner, side] of [['owner-a','host'], ['owner-b','guest']]) {
    await database.query('INSERT INTO duel_actions(room_id,round_no,actor_user_id,actor_side,action_type) VALUES($1,2,$2,$3,\'normal_attack\')', [room.id, owner, side]);
  }
  await assert.rejects(commit(2, { ...result, hp_after: { host: -1, guest: 90 } }), /check constraint/);
  assert.equal((await database.query('SELECT COUNT(*)::int n FROM duel_rounds')).rows[0].n, 1);
  assert.equal((await database.query('SELECT current_round FROM duel_rooms WHERE id=$1', [room.id])).rows[0].current_round, 2);
  checks.push('failed state advance rolls back the round insert atomically');
  await commit(2, { ...result, hp_after: { host: 100, guest: 0 }, winner_side: 'host' });
  const claim = async (owner, pet) => (await database.query('SELECT lingjing_claim_battle_settlement($1,$2,$3) value', [owner, room.id, pet])).rows[0].value;
  const receipt = await claim('owner-a', 'pet-a');
  assert.equal(receipt.experience, 20); assert.equal(receipt.won, true);
  assert.deepEqual(await claim('owner-a', 'pet-a'), receipt);
  assert.equal((await claim('owner-b', 'pet-b')).experience, 5);
  assert.equal((await database.query('SELECT COUNT(*)::int n FROM runtime_battle_settlements')).rows[0].n, 2);
  await assert.rejects(claim('owner-a', 'other-pet'), /pet mismatch/);
  await assert.rejects(claim('intruder', 'pet-a'), /not room participant/);
  checks.push('room/account settlement receipt is idempotent, pet-bound and participant-only');
  await database.exec('SET ROLE anon');
  await assert.rejects(database.query('SELECT lingjing_claim_battle_settlement($1,$2,$3)', ['owner-a', room.id, 'pet-a']), /permission denied/);
  await database.exec('RESET ROLE');
  checks.push('anon cannot invoke privileged settlement function');
  mkdirSync(resolve('artifacts/battle'), { recursive: true });
  writeFileSync(resolve('artifacts/battle/postgres-evidence.json'), JSON.stringify({ at: new Date().toISOString(), backend: 'PGlite embedded PostgreSQL, not the deployed Supabase service', checks }, null, 2));
  console.log(JSON.stringify({ checks, passed: true }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ passed: false, code: error.code, message: error.message, checks }, null, 2));
  process.exitCode = 1;
} finally { await database.close(); }
