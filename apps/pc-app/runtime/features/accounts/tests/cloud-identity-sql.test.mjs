import { test, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const a = "10000000-0000-4000-8000-000000000001", b = "10000000-0000-4000-8000-000000000002";
const sa = "20000000-0000-4000-8000-000000000001", sa2 = "20000000-0000-4000-8000-000000000002", sb = "20000000-0000-4000-8000-000000000003";
const da = "30000000-0000-4000-8000-000000000001", da2 = "30000000-0000-4000-8000-000000000002", dbb = "30000000-0000-4000-8000-000000000003";
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; grant usage on schema auth to authenticated,service_role;
  create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
  create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
`);
await db.exec(readFileSync("infra/supabase/migrations/20261025020314_lingjing_identity_actor_contract.sql", "utf8"));
await db.exec(readFileSync("infra/supabase/migrations/20261025021755_lingjing_auth_bridge.sql", "utf8"));
await db.exec(readFileSync('infra/supabase/migrations/20261025031842_lingjing_session_revocation_ledger.sql','utf8'));
await db.query("insert into auth.users(id) values($1),($2)", [a,b]);
await db.query("insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5)", [sa,a,sa2,sb,b]);
await db.query("insert into lingjing_private.legacy_account_claims(source_instance,legacy_subject,owner_id,account_key,account,username,password_hash,source_record_checksum,source_manifest_checksum,created_at) values('old-runtime','legacy-a','user-original-text','alice','alice','Alice',repeat('a',64),repeat('b',64),repeat('c',64),now())");
async function as(uid,sid,device,sql,params=[],role="authenticated") {
  await db.exec(`begin; set local role ${role};`);
  try {
    await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)", [JSON.stringify({ sub:uid,session_id:sid,role }),JSON.stringify({ "x-lingjing-device-id":device })]);
    const result = await db.query(sql,params); await db.exec("commit"); return result.rows;
  } catch(error) { await db.exec("rollback"); throw error; }
}
const linkedA = (await as(null,null,null,"select public.lingjing_link_auth_user($1,'alice','Alice','old-runtime','legacy-a') result",[a],"service_role"))[0].result;
const linkedB = (await as(null,null,null,"select public.lingjing_link_auth_user($1,'bobby','Bobby') result",[b],"service_role"))[0].result;
after(async () => db.close());

test("LOCAL PGlite only: trusted migration preserves text owner and blocks direct/duplicate linkage", async () => {
  assert.equal(linkedA.owner_id,"user-original-text"); assert.equal(linkedA.auth_user_id,a);
  assert.notEqual(linkedB.owner_id,b); assert.ok(linkedB.owner_id.startsWith("account:"));
  await assert.rejects(as(a,sa,da,"select public.lingjing_link_auth_user($1,'steal','Steal')",[a]),/permission denied/);
  await assert.rejects(as(null,null,null,"select public.lingjing_link_auth_user($1,'alice','Alice','old-runtime','legacy-a')",[b],"service_role"),/LJ_IDENTITY_CONFLICT/);
  await assert.rejects(as(a,sa,da,"select password_hash from lingjing_private.legacy_account_claims"),/permission denied/);
});
test("LOCAL PGlite only: one Auth UID can keep two independently bound device sessions", async () => {
  const first=(await as(a,sa,da,"select public.lingjing_register_device($1,'A') actor",[da]))[0].actor;
  const second=(await as(a,sa2,da2,"select public.lingjing_register_device($1,'A2') actor",[da2]))[0].actor;
  await as(b,sb,dbb,"select public.lingjing_register_device($1,'B')",[dbb]);
  assert.equal(first.ownerAccountId,second.ownerAccountId); assert.notEqual(first.sessionId,second.sessionId);
  assert.equal((await as(a,sa,da,"select public.lingjing_current_owner() owner"))[0].owner,linkedA.owner_id);
  assert.equal((await as(a,sa2,da2,"select public.lingjing_current_owner() owner"))[0].owner,linkedA.owner_id);
});
test("LOCAL PGlite only: RLS denies cross owner, client writes, wrong device and anonymous/revoked sessions", async () => {
  assert.equal((await as(a,sa,da,"select * from public.lingjing_accounts")).length,1);
  assert.equal((await as(a,sa,da,"select * from public.lingjing_accounts where auth_user_id=$1",[b])).length,0);
  await assert.rejects(as(a,sa,da,"update public.lingjing_accounts set username='Hacked'"),/permission denied/);
  await assert.rejects(as(a,sa,da2,"select public.lingjing_actor_context($1)",[da2]),/LJ_DEVICE_SESSION_REQUIRED/);
  await assert.rejects(as(null,null,null,"select * from public.lingjing_accounts",[],"anon"),/permission denied/);
  await assert.rejects(as(a,"20000000-0000-4000-8000-000000000099",da,"select public.lingjing_actor_context($1)",[da]),/LJ_SESSION_REVOKED/);
});
test("LOCAL PGlite only: revoking device A leaves same-account device B active", async () => {
  await as(a,sa,da,"select public.lingjing_revoke_device($1)",[da]);
  await assert.rejects(as(a,sa,da,"select public.lingjing_actor_context($1)",[da]),/LJ_SESSION_REVOKED/);
  assert.equal((await as(a,sa2,da2,"select public.lingjing_actor_context($1) actor",[da2]))[0].actor.ownerAccountId,linkedA.owner_id);
});
test("LOCAL PGlite only: revoked refresh cannot re-register, fresh Auth session can rebind one device", async () => {
  await assert.rejects(as(a,sa,da,"select public.lingjing_register_device($1,'refresh')",[da]),/LJ_SESSION_REVOKED/);
  const sa3="20000000-0000-4000-8000-000000000004";
  await db.query("insert into auth.sessions(id,user_id) values($1,$2)",[sa3,a]);
  assert.equal((await as(a,sa3,da,"select public.lingjing_register_device($1,'new login') actor",[da]))[0].actor.sessionId,sa3);
  await assert.rejects(as(a,sa3,"30000000-0000-4000-8000-000000000099","select public.lingjing_register_device($1,'copy')",["30000000-0000-4000-8000-000000000099"]),/LJ_DEVICE_SESSION_BOUND/);
  assert.equal((await as(a,sa2,da2,"select public.lingjing_current_owner() owner"))[0].owner,linkedA.owner_id);
});
test('LOCAL PGlite only: revoke/new-login cannot resurrect an old SID, and replacement revokes previous SID permanently',async()=>{
 const old='20000000-0000-4000-8000-000000000004',next='20000000-0000-4000-8000-000000000005',latest='20000000-0000-4000-8000-000000000006';
 await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2)',[next,a,latest]);
 await as(a,old,da,'select public.lingjing_revoke_device($1)',[da]);
 await as(a,next,da,'select public.lingjing_register_device($1)',[da]);
 await assert.rejects(as(a,old,da,'select public.lingjing_register_device($1)',[da]),/LJ_SESSION_REVOKED/);
 await assert.rejects(as(a,old,da,'select * from public.lingjing_accounts'),/LJ_SESSION_REVOKED/);
 await as(a,latest,da,'select public.lingjing_register_device($1)',[da]);
 await assert.rejects(as(a,next,da,'select public.lingjing_register_device($1)',[da]),/LJ_SESSION_REVOKED/);
 assert.equal((await as(a,sa2,da2,'select public.lingjing_current_owner() owner'))[0].owner,linkedA.owner_id);
 assert.equal((await db.query('select count(*) n from auth.sessions where id in ($1,$2)',[old,next])).rows[0].n,2); // Managed Auth is still live; the ledger is decisive.
 await assert.rejects(as(a,latest,da,'delete from lingjing_private.revoked_auth_sessions'),/permission denied/);
 await assert.rejects(db.query('delete from lingjing_private.revoked_auth_sessions where auth_session_id=$1',[old]),/LJ_REVOCATION_IMMUTABLE/);
});
test("LOCAL PGlite only: auth directory, staged reservation and rate limits are service-only", async () => {
  const record=(await as(null,null,null,"select public.lingjing_auth_reserve('charlie','Charlie') item",[],"service_role"))[0].item;
  assert.match(record.email,/^lj-[0-9a-f-]+@login\.lingjing\.invalid$/); assert.equal(record.authUserId,null);
  await assert.rejects(as(a,sa2,da2,"select public.lingjing_auth_record('charlie')"),/permission denied/);
  const row=(await as(null,null,null,"select public.lingjing_auth_record('alice') item",[],"service_role"))[0].item;
  assert.equal(row.legacy,null); // Already linked: the old hash can never be a login fallback.
  for(let i=0;i<2;i++)await as(null,null,null,"select public.lingjing_auth_rate_limit(repeat('d',64),2)",[],"service_role");
  await assert.rejects(as(null,null,null,"select public.lingjing_auth_rate_limit(repeat('d',64),2)",[],"service_role"),/LJ_AUTH_RATE_LIMITED/);
});
