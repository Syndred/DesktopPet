import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { canonical, checkedFix, locationEnvelope, rejectClientAuthority, verifySignedLocation } from '../../../../../../infra/supabase/functions/discovery/protocol.mjs';
const now = 1792895000000, actor = { schemaVersion: 1, authority: 'live', authKind: 'supabase', authUserId: '1ae1fce5-3932-426e-b365-80f3df668140', ownerAccountId: 'runtime:original-text-owner', deviceId: 'device-a', sessionId: 'session-a' };
function fixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }), publicJwk = publicKey.export({ format: 'jwk' });
  const device = { ...actor, publicJwk, keyFingerprint: createHash('sha256').update(canonical(publicJwk)).digest('hex') };
  const challenge = { ...actor, id: 'challenge-a', nonce: 'this-is-an-independent-server-nonce-123456789', purpose: 'begin', reference: 'wild-a', keyFingerprint: device.keyFingerprint, createdAt: now, expiresAt: now + 30000 };
  const fix = { lat: 31.2, lng: 121.4, accuracyMeters: 10, timestampMs: now, coordinateSystem: 'wgs84', source: 'os', provider: 'windows-geolocator', positionSource: 'WiFi' };
  const signature = sign('sha256', Buffer.from(canonical(locationEnvelope(actor, challenge, fix))), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return { actor, device, challenge, fix, signature, now };
}
test('actual P-256 signature binds native fix to the verified legacy owner, auth UID, device, session, nonce, purpose and target', async () => {
  const f = fixture(); assert.deepEqual(await verifySignedLocation(f), f.fix);
  for (const mutation of [{ fix: { ...f.fix, lat: 32 } }, { challenge: { ...f.challenge, nonce: 'different-server-nonce-with-at-least-32-bytes' } }, { challenge: { ...f.challenge, reference: 'wild-b' } }, { challenge: { ...f.challenge, purpose: 'capture' } }]) await assert.rejects(verifySignedLocation({ ...f, ...mutation }), { code: 'LOCATION_SIGNATURE_INVALID' });
  for (const key of ['authUserId', 'ownerAccountId', 'deviceId', 'sessionId']) await assert.rejects(verifySignedLocation({ ...f, challenge: { ...f.challenge, [key]: 'foreign' } }), { code: 'LOCATION_OWNER_MISMATCH' });
});
test('proof rejects expired/replayed challenges, rotated keys, inaccurate/default/stale fixes and ordinary simulated input', async () => {
  const f = fixture();
  await assert.rejects(verifySignedLocation({ ...f, now: now + 30000 }), { code: 'LOCATION_CHALLENGE_EXPIRED' });
  await assert.rejects(verifySignedLocation({ ...f, challenge: { ...f.challenge, consumedAt: now } }), { code: 'LOCATION_CHALLENGE_INVALID' });
  await assert.rejects(verifySignedLocation({ ...f, device: { ...f.device, keyFingerprint: 'rotated' } }), { code: 'DEVICE_KEY_CHANGED' });
  for (const [patch, code] of [[{ accuracyMeters: 81 }, 'LOCATION_IMPRECISE'], [{ timestampMs: now - 30001 }, 'LOCATION_STALE'], [{ positionSource: 'Default' }, 'LOCATION_DEFAULT_POSITION'], [{ source: 'simulated' }, 'REAL_LOCATION_REQUIRED']]) assert.throws(() => checkedFix({ ...f.fix, ...patch }, actor, now), { code });
});
test('only server-authorized scenario actors can retain simulated provenance; renderer authority fields are rejected', () => {
  const fix = { ...fixture().fix, source: 'simulated', provider: 'qa-discovery', scenarioId: 'qa-run' };
  assert.throws(() => checkedFix(fix, actor, now), { code: 'REAL_LOCATION_REQUIRED' });
  assert.equal(checkedFix(fix, { ...actor, allowSimulatedLocation: true, scenarioId: 'qa-run' }, now).source, 'simulated');
  for (const field of ['ownerAccountId', 'userId', 'sessionToken', 'winner', 'battle', 'pet', 'reward', 'globalSerial', 'namespace', 'entityKey', 'templateId']) assert.throws(() => rejectClientAuthority({ op: 'act', [field]: 'client-value' }), { code: 'CLIENT_AUTHORITY_FORBIDDEN' });
});
