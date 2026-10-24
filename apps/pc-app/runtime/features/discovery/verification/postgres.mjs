// Development check against embedded PostgreSQL; never connects to Supabase.
// Install PGlite under ignored artifacts/discovery/sql-validation, or provide
// LINGJING_PGLITE_ROOT pointing to an existing development-only installation.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(resolve(process.env.LINGJING_PGLITE_ROOT || 'artifacts/discovery/sql-validation', 'package.json'));
const { PGlite } = require('@electric-sql/pglite');
const version = JSON.parse(readFileSync(resolve(dirname(require.resolve('@electric-sql/pglite')), '../package.json'), 'utf8')).version;
const database = await PGlite.create(), checks = [];
try {
  await database.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const migration of ['0003_duel_realtime_schema.sql', '0004_runtime_cloud_auth_duel_requests.sql', '0005_runtime_single_login_session.sql', '20261024_discovery_authority.sql']) {
    await database.exec(readFileSync(resolve('infra/supabase/migrations', migration), 'utf8').replace(/^\uFEFF/, ''));
  }
  checks.push('existing runtime account schema and additive discovery migration execute');
  await database.query(`INSERT INTO runtime_accounts(id,account,account_key,username,password_hash,session_token) VALUES
    ('owner-a','discovery-a','discovery-a','甲','test-hash','isolated-validation-a'),
    ('owner-b','discovery-b','discovery-b','乙','test-hash','isolated-validation-b')`);
  const permitId = randomUUID(), spawnId = 'wild-2d-sql-verification';
  const permit = { id: permitId, owner: 'owner-a', spawn: { id: spawnId }, expiresAt: Date.now() + 1800000, status: 'reserved', battle: { finished: false, winner: null, view: { round: 0 } } };
  await database.query('INSERT INTO runtime_discovery_permits(id,owner_account_id,spawn_id,data_json) VALUES($1,$2,$3,$4::jsonb)', [permitId, permit.owner, spawnId, JSON.stringify(permit)]);
  const receipt = { id: randomUUID(), permitId, owner: permit.owner, spawnId, distanceMeters: 32, capturedAt: Date.now() };
  const claim = async (value = receipt, owner = permit.owner, id = permitId) => (await database.query('SELECT claim_runtime_discovery_capture($1,$2,$3::jsonb) value', [owner, id, JSON.stringify(value)])).rows[0].value;
  const advance = async (actionId, round, battle, action = 'normal_attack') => (await database.query('SELECT advance_runtime_discovery_battle($1,$2,$3,$4,$5,$6::jsonb) value', [permit.owner, permitId, actionId, action, round, JSON.stringify(battle)])).rows[0].value;
  await assert.rejects(claim(), /VICTORY_REQUIRED/);
  await assert.rejects(claim(receipt, 'owner-b'), /PERMIT_INVALID/);
  assert.equal((await database.query('SELECT COUNT(*)::int n FROM runtime_discovery_captures')).rows[0].n, 0);
  checks.push('unfinished battle and foreign account cannot claim capture');
  const firstRound = { finished: false, winner: null, view: { round: 1, player: { hp: 99 } } };
  assert.deepEqual(await advance('round-one', 1, firstRound), firstRound);
  assert.deepEqual(await advance('round-one', 1, { ...firstRound, winner: 'player' }), firstRound);
  await assert.rejects(advance('round-one', 2, firstRound, 'ultimate'), /ACTION_ID_CONFLICT/);
  await assert.rejects(advance('round-conflict', 4, { ...firstRound, view: { round: 4 } }), /ROUND_CONFLICT/);
  await assert.rejects(advance('bad-action', 2, { ...firstRound, view: { round: 2 } }, 'win'), /INVALID_BATTLE_ACTION/);
  await assert.rejects(advance('', 2, { ...firstRound, view: { round: 2 } }), /ACTION_ID_REQUIRED/);
  checks.push('round compare-and-swap, action validation and action replay preserve persisted server outcome');
  const won = { finished: true, winner: 'player', view: { round: 2 } };
  await advance('round-two', 2, won);
  await assert.rejects(advance('after-win', 3, { ...won, view: { round: 3 } }), /BATTLE_FINISHED/);
  for (const mutation of [{ owner: 'owner-b' }, { permitId: randomUUID() }, { spawnId: 'other' }]) {
    await assert.rejects(claim({ ...receipt, ...mutation }), /RECEIPT_MISMATCH/);
  }
  await assert.rejects(claim({ ...receipt, distanceMeters: '32' }), /DISTANCE_INVALID/);
  await assert.rejects(claim({ ...receipt, distanceMeters: -1 }), /OUT_OF_RANGE/);
  await assert.rejects(claim({ ...receipt, distanceMeters: 101 }), /OUT_OF_RANGE/);
  await assert.rejects(claim({ ...receipt, id: 'invalid-uuid' }), /invalid input syntax/);
  assert.equal((await database.query('SELECT COUNT(*)::int n FROM runtime_discovery_captures')).rows[0].n, 0);
  assert.equal((await database.query('SELECT data_json->>\'status\' status FROM runtime_discovery_permits WHERE id=$1', [permitId])).rows[0].status, 'reserved');
  checks.push('locked claim rechecks victory, receipt identity and range; failed insert leaves no partial capture');
  assert.deepEqual(await claim(), receipt);
  assert.deepEqual(await claim({ ...receipt, id: randomUUID(), distanceMeters: 90 }), receipt);
  assert.equal((await database.query('SELECT COUNT(*)::int n FROM runtime_discovery_captures')).rows[0].n, 1);
  assert.equal((await database.query('SELECT data_json->>\'status\' status FROM runtime_discovery_permits WHERE id=$1', [permitId])).rows[0].status, 'captured');
  checks.push('capture receipt and permit state commit together, duplicate claim returns original receipt');
  const expiredId = randomUUID(), expired = { ...permit, id: expiredId, expiresAt: Date.now() - 10000, battle: won };
  await database.query('INSERT INTO runtime_discovery_permits(id,owner_account_id,spawn_id,data_json) VALUES($1,$2,$3,$4::jsonb)', [expiredId, permit.owner, 'expired', JSON.stringify(expired)]);
  await assert.rejects(claim({ ...receipt, id: randomUUID(), permitId: expiredId, spawnId: 'expired' }, permit.owner, expiredId), /ENCOUNTER_EXPIRED/);
  await assert.rejects(database.query('SELECT advance_runtime_discovery_battle($1,$2,$3,$4,$5,$6::jsonb)', [permit.owner, expiredId, 'expired-action', 'normal_attack', 3, JSON.stringify(won)]), /ENCOUNTER_EXPIRED/);
  checks.push('expired permit cannot advance or settle');
  for (const role of ['anon', 'authenticated']) {
    await database.exec(`SET ROLE ${role}`);
    await assert.rejects(claim(), /permission denied/);
    await assert.rejects(database.query('SELECT * FROM runtime_discovery_permits'), /permission denied/);
    await database.exec('RESET ROLE');
  }
  checks.push('anon and authenticated cannot directly read state or invoke privileged settlement');
  const evidence = { at: new Date().toISOString(), passed: true, backend: `PGlite ${version} embedded PostgreSQL; not deployed Supabase`, checks };
  mkdirSync(resolve('artifacts/discovery'), { recursive: true });
  writeFileSync(resolve('artifacts/discovery/postgres-evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally { await database.close(); }
