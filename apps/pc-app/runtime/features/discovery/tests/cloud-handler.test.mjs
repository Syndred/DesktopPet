// Local Request/Response + real ECDSA/encrypted test vault + embedded PostgreSQL.
// This is explicitly not Supabase Auth, deployed HTTPS or physical OS evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createRequire } from 'node:module';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { createDiscoveryHandler } from '../../../../../../infra/supabase/functions/discovery/handler.mjs';
const { CloudLocationProofs } = createRequire(import.meta.url)('../cloud-location.cjs');
const actor = { schemaVersion: 1, authority: 'live', authKind: 'supabase', authUserId: 'b02582a6-d067-40a6-8f9e-8d4028f594e2', ownerAccountId: 'runtime:preserved-owner', deviceId: 'd2bad113-8a5b-490f-a128-caa382a8b13a', sessionId: '783d46f0-8c19-4f16-b0c7-1181d251c628' };
function vault() {
  const key = randomBytes(32);
  return { isEncryptionAvailable: () => true, encryptString(value) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(value, 'utf8'), cipher.final(), cipher.getAuthTag()]); },
    decryptString(value) { const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12)); cipher.setAuthTag(value.subarray(-16)); return Buffer.concat([cipher.update(value.subarray(12, -16)), cipher.final()]).toString('utf8'); } };
}
test('local main signer, HTTP handler and SQL retain the original owner, persisted key and explicitly bound server location proof', async () => {
  const db = new PGlite(), parent = resolve('artifacts/cloud-discovery'); mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'signer-unit-')), safeStorage = vault();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key);insert into auth.users values('${actor.authUserId}');`);
    await db.exec(readFileSync('infra/supabase/migrations/20261025020719_lingjing_discovery_cloud_authority.sql', 'utf8'));
    await db.exec('set role service_role');
    const store = { location: async (who, op, input) => (await db.query('select public.lingjing_discovery_location($1::jsonb,$2,$3::jsonb) value', [JSON.stringify(who), op, JSON.stringify(input)])).rows[0].value };
    const handler = createDiscoveryHandler({ requireActor: async () => actor, store });
    const calls = [];
    const invoke = async (op, input) => { calls.push({ op, input }); const response = await handler(new Request('http://local-unit.invalid', { method: 'POST', body: JSON.stringify({ ...input, op }) })); const result = await response.json(); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
    const authority = { getActor: async () => actor, invoke }, fix = { lat: 31.2, lng: 121.4, accuracyMeters: 5, timestampMs: Date.now(), coordinateSystem: 'wgs84', source: 'os', provider: 'windows-geolocator', positionSource: 'WiFi' };
    let signer = new CloudLocationProofs({ authority, getFix: () => fix, safeStorage, userData: directory });
    const proof = await signer.prove('discover'); assert.equal(proof.ownerAccountId, actor.ownerAccountId); assert.equal(proof.source, 'os');
    const repeated = calls.find(call => call.op === 'location.prove'); assert.deepEqual(await invoke(repeated.op, repeated.input), proof);
    const found = await invoke('nearby', { proofId: proof.id }); assert.ok(found.spawns.length); assert.equal(found.source, 'os');
    const encryptedFile = join(directory, 'secure', 'discovery', readdirSync(join(directory, 'secure', 'discovery'))[0]);
    assert.ok(!readFileSync(encryptedFile).includes(Buffer.from('PRIVATE KEY')));
    signer = new CloudLocationProofs({ authority, getFix: () => fix, safeStorage, userData: directory });
    const next = await signer.prove('begin', found.spawns[0].id); assert.notEqual(next.id, proof.id);
    assert.deepEqual(calls.filter(call => call.op === 'device.register').map(call => call.input.publicJwk)[0], calls.filter(call => call.op === 'device.register').map(call => call.input.publicJwk)[1]);
    const forbidden = await handler(new Request('http://local-unit.invalid', { method: 'POST', body: JSON.stringify({ op: 'protocol', ownerAccountId: 'foreign' }) }));
    assert.equal(forbidden.status, 403); assert.equal((await forbidden.json()).code, 'CLIENT_AUTHORITY_FORBIDDEN');
    await assert.rejects(signer.prove('begin', { lat: 0, lng: 0 }), { code: 'LOCATION_PURPOSE_INVALID' });
  } finally {
    await db.close(); assert.ok(directory.startsWith(parent + sep)); rmSync(directory, { recursive: true, force: true });
  }
});
