const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = file => require(path.resolve(process.cwd(), file));
const { openDatabase, migrate } = source('apps/pc-app/runtime/core/database.cjs');
const gardenFeature = source('apps/pc-app/runtime/features/garden/index.cjs');

// Real provider and in-memory SQLite; only a throwing transport is simulated.
// No live account, cloud request, credential, profile or product file is changed.
test('cached garden projection retains the original durable pending count without replaying the command', async () => {
  const db = openDatabase(':memory:');
  for (const feature of ['accounts', 'companions']) migrate(db, feature, source(`apps/pc-app/runtime/features/${feature}/${feature === 'accounts' ? 'schema' : 'migrations'}.cjs`).migrations);
  const owner = 'isolated-cached-status-owner', provided = new Map(), calls = [];
  const services = { db, session: { getOwnerAccountId: () => owner }, events: { emit() {} }, get: key => provided.get(key), provide: (key, value) => provided.set(key, value) };
  provided.set('territories', {});
  provided.set('accounts', { privateSession: () => ({ ownerAccountId: owner, provider: 'runtime', authKind: 'supabase' }) });
  provided.set('companions', { listForOwner: () => [] });
  provided.set('cloudActor', { requireActor: async () => ({ actor: { schemaVersion: 1, authority: 'live', authKind: 'supabase', ownerAccountId: owner, authUserId: 'fixture-user', deviceId: 'fixture-device', sessionId: 'fixture-session' }, url: 'https://jbvrdmrkwpznbrvteive.supabase.co', publishableKey: 'sb_publishable_fixture_only', invoke: async (...args) => { calls.push(args); throw Object.assign(new Error('Controlled unavailable transport'), { code: 'CLOUD_UNAVAILABLE' }); } }) });
  const runtime = gardenFeature.register(services);
  try {
    const context = { ownerAccountId: owner };
    // Create only disposable fixture cache through its normal local service.
    assert.equal(provided.get('garden').service.snapshot(context).ok, true);
    const inventory = JSON.stringify(db.prepare('SELECT * FROM garden_items ORDER BY item_id').all());
    const input = { actionId: 'original-cached-feed-request', sessionOwnerAccountId: owner, expectedRevision: 0, petId: 'fixture-pet', expectedPetRevision: 1, itemId: 'carrot', quantity: 1 };
    assert.equal((await runtime.commands.feed(input, context)).ok, false);
    const before = db.prepare('SELECT * FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(owner, input.actionId);
    assert.equal(before.status, 'pending');
    const snapshot = await runtime.commands.snapshot({}, context);
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.data.sync.mode, 'cached');
    assert.equal(snapshot.data.sync.pending, 1, 'cached display must not claim zero while the original request is unconfirmed');
    assert.equal(calls.length, 2, 'one original command and one failed read, with no resend');
    assert.deepEqual(db.prepare('SELECT * FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(owner, input.actionId), before);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM garden_items ORDER BY item_id').all()), inventory);
  } finally { runtime.dispose(); db.close(); }
});
