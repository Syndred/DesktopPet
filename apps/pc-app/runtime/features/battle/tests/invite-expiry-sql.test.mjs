import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadSharedActorGuard } from './shared-actor-sql.mjs';

// Actual migration SQL in an isolated embedded PostgreSQL database. The platform
// fixture and clock below are test-only; this is not cloud/native expiry evidence.
test('QA022 invitation deadlines, immutable receipts and legacy preservation in PostgreSQL', async () => {
  const db = new PGlite(), checks = [];
  const epoch = Date.parse('2031-01-02T03:04:05Z');
  const clock = async delta => db.query('UPDATE qa022_clock.instant SET value=$1::timestamptz', [new Date(epoch + delta).toISOString()]);
  const users = Object.fromEntries(['a', 'b', 'c'].map(name => [name, {
    uid: randomUUID(), sid: randomUUID(), device: randomUUID(), owner: `expiry-owner-${name}`, account: `expiry_${name}`,
    pet: { ownerId: `expiry-owner-${name}`, petId: `expiry-pet-${name}`, resourceId: 'builtin:lingjing-yuwan-v2', name: `伙伴${name}`, element: 'water' },
  }]));
  const binding = user => [user.uid, user.owner, user.device, user.sid];
  const query = async (role, sql, args = [], user) => {
    await db.exec(`BEGIN; SET LOCAL ROLE ${role}`);
    try {
      await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)", [
        JSON.stringify(user ? { sub: user.uid, session_id: user.sid, role: 'authenticated' } : {}),
        JSON.stringify(user ? { 'x-lingjing-device-id': user.device } : {}),
      ]);
      const result = await db.query(sql, args); await db.exec('COMMIT'); return result.rows;
    } catch (error) { await db.exec('ROLLBACK'); throw error; }
  };
  const command = async (user, op, input, id = randomUUID()) => (await query('service_role',
    'SELECT public.lingjing_battle_command($1,$2,$3,$4,$5,$6,$7::jsonb) value', [...binding(user), op, id, JSON.stringify(input)]))[0].value;
  const list = async user => (await query('service_role', 'SELECT public.lingjing_battle_list_invites($1,$2,$3,$4) value', binding(user)))[0].value;
  const sendInput = (from, to) => ({ account: from.account, target: { authUid: to.uid, ownerId: to.owner, account: to.account } });
  const acceptInput = (user, id) => ({ account: user.account, requestId: id, pet: user.pet });
  const snapshot = async () => {
    const result = {};
    for (const name of ['invites', 'rooms', 'members', 'commands', 'actions', 'rounds', 'settlements']) {
      result[name] = (await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM public.lingjing_battle_${name} t`)).rows[0].rows;
    }
    return result;
  };
  const record = name => { checks.push(name); console.log(name); };
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean NOT NULL DEFAULT false);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
      CREATE SCHEMA realtime; GRANT USAGE ON SCHEMA realtime TO authenticated,service_role;
      CREATE TABLE realtime.messages(topic text,extension text); ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY; GRANT SELECT ON realtime.messages TO authenticated;
      CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.topic',true)$$;`);
    // No product clock, client timestamp or cloud/QA database is changed.
    await db.exec(`CREATE SCHEMA qa022_clock; CREATE TABLE qa022_clock.instant(value timestamptz NOT NULL);
      INSERT INTO qa022_clock.instant VALUES('2031-01-02T03:04:05Z');
      GRANT USAGE ON SCHEMA qa022_clock TO service_role,authenticated;
      GRANT SELECT,UPDATE ON qa022_clock.instant TO service_role;`);
    await loadSharedActorGuard(db);
    await db.exec(readFileSync('infra/supabase/migrations/20261025034744_lingjing_battle_jwt_rooms.sql', 'utf8'));
    for (const user of Object.values(users)) {
      await db.query('INSERT INTO auth.users(id) VALUES($1)', [user.uid]);
      await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)', [user.sid, user.uid]);
      await db.query('INSERT INTO public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username) VALUES($1,$2,$3,$3,$3)', [user.owner, user.uid, user.account]);
      await query('authenticated', "SELECT public.lingjing_register_device($1,'expiry SQL fixture')", [user.device], user);
    }
    const { a, b, c } = users;
    const oldAccepted = (await command(a, 'invite', sendInput(a, b))).request;
    const oldRoom = (await command(b, 'accept_invite', acceptInput(b, oldAccepted.id))).room;
    const oldRejected = (await command(a, 'invite', sendInput(a, c))).request;
    await command(c, 'reject_invite', { requestId: oldRejected.id });
    const oldCancelled = (await command(a, 'invite', sendInput(a, c))).request;
    await command(a, 'cancel_invite', { requestId: oldCancelled.id });
    const oldAction = randomUUID(), oldInput = sendInput(a, b);
    const oldPending = await command(a, 'invite', oldInput, oldAction);
    const before = await snapshot();
    await db.exec(readFileSync('infra/supabase/migrations/20261026080525_lingjing_battle_invite_expiry.sql', 'utf8'));
    const migrated = await snapshot();
    assert.deepEqual(migrated.invites.map(({ expires_at, ...row }) => { assert.equal(expires_at, null); return row; }), before.invites);
    for (const name of Object.keys(before).filter(name => name !== 'invites')) assert.deepEqual(migrated[name], before[name]);
    assert.deepEqual(await command(a, 'invite', oldInput, oldAction), oldPending);
    record('migration preserves every original legacy field, status, timestamp, room, membership and command/receipt value; expiry is null');
    const shippedClock=(await db.query('SELECT lingjing_private.battle_invite_now() actual,pg_catalog.clock_timestamp() expected')).rows[0];
    assert.ok(Math.abs(new Date(shippedClock.actual).getTime()-new Date(shippedClock.expected).getTime())<100);

    // Override only the private parameterless clock inside this isolated database.
    // The shipped clock calls pg_catalog.clock_timestamp with no override input.
    await db.exec(`CREATE OR REPLACE FUNCTION lingjing_private.battle_invite_now() RETURNS timestamptz
      LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$SELECT value FROM qa022_clock.instant$$;`);
    assert.equal(Date.parse((await db.query('SELECT lingjing_private.battle_invite_now() value')).rows[0].value), epoch);

    const legacyList = await list(a);
    assert.equal(legacyList.invitations.find(row => row.id === oldPending.request.id).status, 'pending');
    assert.deepEqual(await snapshot(), migrated);
    const reusedLegacy = await command(a, 'invite', oldInput);
    assert.equal(reusedLegacy.request.id, oldPending.request.id); assert.equal(reusedLegacy.request.expires_at, null);
    await command(b, 'leave_room', { roomId: oldRoom.id });
    const legacyAccepted = await command(b, 'accept_invite', acceptInput(b, oldPending.request.id));
    await command(b, 'leave_room', { roomId: legacyAccepted.room.id });
    record('server-time polling and resend do not impose a deadline on legacy pending invitations; ordinary legacy acceptance still works');

    const action = randomUUID(), input = { ...sendInput(a, b), expiresAt: '2099-01-01T00:00:00Z' };
    const fresh = await command(a, 'invite', input, action), deadline = epoch + 300_000;
    assert.equal(Date.parse(fresh.request.created_at), epoch);
    assert.equal(Date.parse(fresh.request.updated_at), epoch);
    assert.equal(Date.parse(fresh.request.expires_at), deadline);
    await clock(299_999);
    assert.equal((await list(b)).invitations.find(row => row.id === fresh.request.id).status, 'pending');
    assert.deepEqual(await command(a, 'invite', input, action), fresh);
    assert.deepEqual((await command(a, 'invite', input)).request, fresh.request);
    await assert.rejects(command(b, 'invite', sendInput(b, a)), /INVITE_ALREADY_RECEIVED/);
    record('new invitations use exactly server creation plus five minutes; valid resend, retry and reverse send cannot renew or duplicate the pending invite');

    await clock(300_000);
    const expiredBaseline = await snapshot();
    const expiredList = await list(b);
    assert.equal(expiredList.invitations.find(row => row.id === fresh.request.id).status, 'expired');
    assert.equal(expiredBaseline.invites.find(row => row.id === fresh.request.id).status, 'pending');
    await assert.rejects(command(b, 'accept_invite', acceptInput(b, fresh.request.id)), /INVITE_EXPIRED/);
    await assert.rejects(command(c, 'accept_invite', acceptInput(c, fresh.request.id)), /INVITE_FORBIDDEN/);
    assert.deepEqual(await command(a, 'invite', input, action), fresh);
    assert.deepEqual(await snapshot(), expiredBaseline);
    record('at exact deadline server list shows expired, acceptance is rejected atomically, polling is read-only, and original action returns its unchanged result');

    const renewed = await command(a, 'invite', sendInput(a, b));
    assert.notEqual(renewed.request.id, fresh.request.id);
    assert.equal(Date.parse(renewed.request.created_at), deadline);
    assert.equal(Date.parse(renewed.request.expires_at), deadline + 300_000);
    const oldExpired = (await snapshot()).invites.find(row => row.id === fresh.request.id);
    assert.equal(oldExpired.status, 'expired');
    assert.equal(oldExpired.created_at, fresh.request.created_at); assert.equal(oldExpired.expires_at, fresh.request.expires_at);
    await assert.rejects(command(b, 'accept_invite', acceptInput(b, fresh.request.id)), /INVITE_EXPIRED/);
    const acceptedAction = randomUUID(), acceptedInput = acceptInput(b, renewed.request.id);
    await clock(599_999);
    const accepted = await command(b, 'accept_invite', acceptedInput, acceptedAction);
    await clock(600_001);
    assert.equal((await list(a)).invitations.find(row => row.id === renewed.request.id).status, 'accepted');
    assert.deepEqual(await command(b, 'accept_invite', acceptedInput, acceptedAction), accepted);
    assert.equal((await command(b, 'accept_invite', acceptedInput)).room.id, accepted.room.id);
    assert.equal((await command(a, 'join_room', { account: a.account, roomCode: accepted.room.room_code, pet: a.pet })).room.status, 'active');
    await command(b, 'leave_room', { roomId: accepted.room.id });
    record('only a new business action creates a fresh invitation; before-deadline acceptance stays accepted and reuses its room after the deadline');

    const race = await command(b, 'invite', sendInput(b, a));
    const raceDeadline = Date.parse(race.request.expires_at);
    await clock(raceDeadline - epoch - 1);
    // Emulate time passing while the actual membership INSERT waits, then make
    // the real production SQL perform its second deadline check and rollback.
    await db.exec(`CREATE FUNCTION qa022_clock.after_member() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
      UPDATE qa022_clock.instant SET value='${race.request.expires_at}'::timestamptz; RETURN NEW; END$$;
      CREATE TRIGGER qa022_expire_during_membership AFTER INSERT ON public.lingjing_battle_members FOR EACH ROW EXECUTE FUNCTION qa022_clock.after_member();`);
    const raceBaseline = await snapshot();
    await assert.rejects(command(a, 'accept_invite', acceptInput(a, race.request.id)), /INVITE_EXPIRED/);
    assert.deepEqual(await snapshot(), raceBaseline);
    await db.exec('DROP TRIGGER qa022_expire_during_membership ON public.lingjing_battle_members');
    await clock(raceDeadline - epoch);
    const unsafeRoom = (await command(c, 'create_room', { account: c.account, pet: c.pet })).room;
    // Corrupt-state fixture proves room-code entry cannot bypass a pending
    // invitation's deadline; it is not an invite/room created on a real provider.
    await db.query('UPDATE public.lingjing_battle_rooms SET invitation_id=$1 WHERE id=$2', [race.request.id, unsafeRoom.id]);
    const joinBaseline = await snapshot();
    await assert.rejects(command(b, 'join_room', { account: b.account, roomCode: unsafeRoom.room_code, pet: b.pet }), /INVITE_EXPIRED/);
    assert.deepEqual(await snapshot(), joinBaseline);
    record('time crossing during membership insertion rolls back room/member/command; room-code join cannot bypass an expired pending invitation');

    for (const role of ['anon', 'authenticated']) await assert.rejects(query(role, 'SELECT public.lingjing_battle_list_invites($1,$2,$3,$4)', binding(a), a), /permission denied/);
    await assert.rejects(query('service_role', 'SELECT public.lingjing_battle_list_invites($1,$2,$3,$4)', [a.uid, b.owner, a.device, a.sid]), /LJ_|ACTOR_OWNER_MISMATCH/);
    assert.ok((await list(c)).invitations.every(row => row.from_user_id === c.owner || row.to_user_id === c.owner));
    const functions = (await db.query("SELECT n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('anon',p.oid,'EXECUTE') anon FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('lingjing_battle_command','lingjing_battle_list_invites','battle_invite_now')")).rows;
    assert.equal(functions.length, 3); assert.ok(functions.every(row => !row.prosecdef && !row.authenticated && !row.anon && row.proconfig.includes('search_path=""')));
    assert.equal(functions.find(row=>row.proname==='battle_invite_now').nspname,'lingjing_private');
    const all = await snapshot();
    assert.equal(all.settlements.length, 0); assert.equal(all.rounds.length, 0); assert.equal(all.actions.length, 0);
    for (const id of [oldAccepted.id, oldRejected.id, oldCancelled.id]) assert.deepEqual(all.invites.find(row => row.id === id), migrated.invites.find(row => row.id === id));
    await db.query('DELETE FROM auth.sessions WHERE id=$1', [a.sid]);
    await assert.rejects(list(a), /LJ_SESSION_REVOKED/);
    await assert.rejects(command(a, 'invite', input, action), /LJ_SESSION_REVOKED/);
    assert.deepEqual(await snapshot(), all);
    record('new read RPC and receipt replay retain service-only invoker/fresh-actor checks; foreign history, terminal legacy rows and reward/round tables stay intact');
    mkdirSync('artifacts/qa/qa022-invite-expiry', { recursive: true });
    writeFileSync('artifacts/qa/qa022-invite-expiry/sql-evidence.json', JSON.stringify({
      at: new Date().toISOString(), provenance: 'isolated-embedded-PostgreSQL-with-test-only-clock',
      liveCloudVerified: false, nativeFiveMinuteAcceptance: false, multiConnectionLockRaceVerified: false,
      migration: '20261026080525_lingjing_battle_invite_expiry.sql', checks, functions, passed: true,
    }, null, 2));
  } finally { await db.close(); }
});
