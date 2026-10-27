const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = file => require(path.resolve(process.cwd(), file));
const { openDatabase, migrate } = source('apps/pc-app/runtime/core/database.cjs');
const { AccountsService } = source('apps/pc-app/runtime/features/accounts/service.cjs');
const gardenFeature = source('apps/pc-app/runtime/features/garden/index.cjs');

// In-memory SQLite and actual garden command/provider + account status logic.
// The only remote boundary throws a controlled error. No real profiles or cloud.
function fixture() {
  const db = openDatabase(':memory:');
  for (const feature of ['accounts', 'companions']) migrate(db, feature, source(`apps/pc-app/runtime/features/${feature}/${feature === 'accounts' ? 'schema' : 'migrations'}.cjs`).migrations);
  const owner = 'status-fixture-owner', state = { companion: { pending: 0, error: null }, records: { initialized: true, pending: 0, conflicts: 0, error: null }, calls: 0 };
  const accounts = Object.create(AccountsService.prototype), provided = new Map();
  const services = { db, session: { getOwnerAccountId: () => owner }, events: { emit() {} },
    get: key => provided.get(key), provide: (key, value) => provided.set(key, value) };
  Object.assign(accounts, { db, services, current: { ownerAccountId: owner, authKind: 'supabase' },
    ready: Promise.resolve(), epoch: 1, cloudObservations: new Map(),
    cloudCache: { status: () => ({ revision: 0, domains: [] }) },
    privateSession: () => ({ ownerAccountId: owner, provider: 'runtime', authKind: 'supabase' }) });
  provided.set('accounts', accounts);
  provided.set('territories', {});
  provided.set('companions', { cloudStatus: () => state.companion, refreshCloud: async () => state.companion });
  provided.set('conversations', { cloudStatus: () => state.records, refreshCloud: async () => state.records });
  provided.set('cloudActor', { requireActor: async () => ({
    actor: { schemaVersion: 1, authority: 'live', authKind: 'supabase', ownerAccountId: owner, authUserId: 'fixture-user', deviceId: 'fixture-device', sessionId: 'fixture-session' },
    url: 'https://jbvrdmrkwpznbrvteive.supabase.co', publishableKey: 'sb_publishable_fixture_only',
    invoke: async () => { state.calls++; throw Object.assign(new Error('Controlled unavailable transport'), state.transportError || { code: 'CLOUD_UNAVAILABLE' }); }
  }) });
  const runtime = gardenFeature.register(services);
  return { db, owner, state, accounts, services, runtime, close() { runtime.dispose(); db.close(); } };
}

test('account status includes one durable original garden request without retrying it, including after provider recreation', async () => {
  const f = fixture();
  try {
    const input = { actionId: 'original-garden-request', sessionOwnerAccountId: f.owner, expectedRevision: 0, petId: 'fixture-pet', expectedPetRevision: 1, itemId: 'carrot', quantity: 1 };
    const result = await f.runtime.commands.feed(input, { ownerAccountId: f.owner });
    assert.equal(result.ok, false);
    const row = f.db.prepare('SELECT * FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(f.owner, input.actionId);
    assert.equal(row.status, 'pending'); assert.equal(f.state.calls, 1);
    const before = JSON.stringify(row);
    const recreated = gardenFeature.register(f.services);
    try {
      for (let read = 0; read < 3; read++) {
        const status = f.accounts.cloudStatus();
        assert.equal(status.pending, 1, 'aggregate must include the real durable garden pending row');
        assert.equal(status.domainStates.find(domain => domain.domain === 'garden')?.pending, 1);
      }
      assert.equal(f.accounts.cloudStatus('another-owner').pending, 0);
      assert.equal(f.state.calls, 1, 'status reads must not retry the unknown request');
      assert.equal(JSON.stringify(f.db.prepare('SELECT * FROM garden_cloud_requests WHERE owner_account_id=? AND action_id=?').get(f.owner, input.actionId)), before);
      assert.equal(f.db.prepare('SELECT count(*) n FROM garden_items').get().n, 0, 'status must not create inventory');
    } finally { recreated.dispose(); }
  } finally { f.close(); }
});

test('a current primary network failure outranks an older optional serial metadata warning', async () => {
  const f = fixture();
  try {
    f.state.companion = { pending: 0, error: 'CLOUD_UNAVAILABLE', metadataError: 'GLOBAL_SERIAL_SCOPE_REVOKED' };
    f.state.records = { initialized: true, pending: 0, conflicts: 0, error: 'CLOUD_UNAVAILABLE' };
    await f.accounts.runAutomaticSync();
    const status = f.accounts.cloudStatus(), companion = status.domainStates.find(domain => domain.domain === 'companions');
    assert.equal(companion.error, 'CLOUD_UNAVAILABLE'); assert.equal(companion.category, 'network');
    assert.equal(companion.status, 'offline', 'optional metadata must not mask the actual outage');
    assert.equal(status.status, 'offline');
  } finally { f.close(); }
});

test('primary errors in a later domain outrank an earlier metadata-only warning', async () => {
  const f = fixture();
  try {
    f.state.companion = { pending: 0, metadataError: 'GLOBAL_SERIAL_SCOPE_REVOKED' };
    f.state.records = { initialized: true, pending: 0, conflicts: 0, error: 'CLOUD_UNAVAILABLE' };
    await f.accounts.runAutomaticSync();
    assert.equal(f.accounts.cloudStatus().lastError, 'CLOUD_UNAVAILABLE');
    assert.equal(f.accounts.cloudStatus().domainStates.find(d => d.domain === 'companions').status, 'partial');
    f.state.records.error = null;
    await f.accounts.runAutomaticSync(); // garden is still unavailable and must still win.
    assert.equal(f.accounts.cloudStatus().lastError, 'CLOUD_UNAVAILABLE');
  } finally { f.close(); }
});


test('confirmed rejection is not counted as unknown pending, while a 401 remains unconfirmed', async () => {
  const f=fixture();
  try {
    const base={sessionOwnerAccountId:f.owner,expectedRevision:0,petId:'fixture-pet',expectedPetRevision:1,itemId:'carrot',quantity:1};
    f.state.transportError={code:'INSUFFICIENT_ITEMS',httpStatus:409};
    assert.equal((await f.runtime.commands.feed({...base,actionId:'confirmed-rejection'}, {ownerAccountId:f.owner})).ok,false);
    assert.equal(f.accounts.cloudStatus().pending,0);assert.equal(f.accounts.cloudStatus().conflicts,1);
    f.state.transportError={code:'CLOUD_AUTH_REQUIRED',httpStatus:401};
    assert.equal((await f.runtime.commands.feed({...base,actionId:'unknown-auth-reply'}, {ownerAccountId:f.owner})).ok,false);
    assert.equal(f.accounts.cloudStatus().pending,1);assert.equal(f.accounts.cloudStatus().conflicts,1);
    assert.equal(f.state.calls,2);
  } finally {f.close();}
});
