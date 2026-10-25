// Embedded PostgreSQL checks only. No real Auth, HTTPS or concurrency claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { generateKeyPairSync, createHash } from 'node:crypto';
const migration = 'infra/supabase/migrations/20261025020719_lingjing_discovery_cloud_authority.sql';
const actor = { authUserId: 'dfb705bf-90f6-45ca-83f6-a4c3fc3cb46e', ownerAccountId: 'runtime:original-non-uuid-owner', deviceId: 'device-a', sessionId: 'session-a' };
test('embedded PostgreSQL validates additive location permissions, nonce replay, device binding and service-only RPC', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${actor.authUserId}');`);
    await db.exec(readFileSync(migration, 'utf8'));
    const key = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
    const keyFingerprint = createHash('sha256').update(JSON.stringify(key)).digest('hex');
    const call = async (op, input, who = actor) => (await db.query('select public.lingjing_discovery_location($1::jsonb,$2,$3::jsonb) value', [JSON.stringify(who), op, JSON.stringify(input)])).rows[0].value;
    const take = async (proofId, purpose = 'begin', reference = 'wild-a', consumer = 'permit-a', who = actor) => (await db.query('select public.lingjing_discovery_take_location($1::jsonb,$2::uuid,$3,$4,$5) value', [JSON.stringify(who), proofId, purpose, reference, consumer])).rows[0].value;
    await db.exec('set role service_role');
    assert.equal((await call('register_device', { publicJwk: key, keyFingerprint })).ownerAccountId, actor.ownerAccountId);
    const nonce = await call('issue_nonce', { purpose: 'begin', reference: 'wild-a' }); assert.ok(nonce.nonce.length >= 32);
    const fix = { lat: 31.2, lng: 121.4, timestampMs: Date.now(), accuracyMeters: 5, coordinateSystem: 'wgs84', source: 'os', provider: 'windows-geolocator', positionSource: 'WiFi' };
    const payload = { challengeId: nonce.id, fix, signatureHash: 'a'.repeat(64) };
    const proof = await call('accept_nonce', payload); assert.equal(proof.ownerAccountId, actor.ownerAccountId); assert.equal(proof.source, 'os');
    assert.deepEqual(await call('accept_nonce', payload), proof);
    await assert.rejects(call('accept_nonce', { ...payload, fix: { ...fix, lat: 32 } }), /LOCATION_NONCE_REPLAY/);
    await assert.rejects(call('read_proof', { proofId: proof.id }, { ...actor, sessionId: 'other-session' }), /LOCATION_PROOF_INVALID/);
    await assert.rejects(take(proof.id, 'capture'), /LOCATION_PROOF_SCOPE_MISMATCH/);
    await assert.rejects(take(proof.id, 'begin', 'wild-b'), /LOCATION_PROOF_SCOPE_MISMATCH/);
    const consumed = await take(proof.id); assert.equal(consumed.consumedBy, 'permit-a');
    assert.deepEqual(await take(proof.id), consumed); await assert.rejects(take(proof.id, 'begin', 'wild-a', 'permit-b'), /LOCATION_PROOF_USED/);
    const second = await call('issue_nonce', { purpose: 'capture', reference: 'permit-a' });
    await assert.rejects(call('accept_nonce', { ...payload, challengeId: second.id, fix: { ...fix, accuracyMeters: 81 } }), /LOCATION_IMPRECISE/);
    await assert.rejects(call('accept_nonce', { ...payload, challengeId: second.id, fix: { ...fix, source: 'simulated', provider: 'qa-discovery', scenarioId: 'qa-a' } }), /REAL_LOCATION_REQUIRED/);
    await assert.rejects(call('nonce', { challengeId: second.id }, { ...actor, ownerAccountId: 'foreign-owner' }), /DEVICE_KEY_REQUIRED/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(call('read_proof', { proofId: proof.id }), /permission denied/);
      await assert.rejects(db.query('select * from lingjing_discovery.location_proofs'), /permission denied/);
    }
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int n from lingjing_discovery.location_proofs')).rows[0].n, 1);
  } finally { await db.close(); }
});
