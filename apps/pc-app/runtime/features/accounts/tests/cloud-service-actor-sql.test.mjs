import {test,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
const db=new PGlite(),uid='10000000-0000-4000-8000-000000000001',sid='20000000-0000-4000-8000-000000000001',device='30000000-0000-4000-8000-000000000001';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to authenticated,service_role;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
 create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create schema lingjing_discovery;grant usage on schema lingjing_discovery to service_role;
 create function lingjing_discovery.live_actor(p_actor jsonb) returns void language plpgsql as $$begin null;end$$;
 create function public.runtime_territory_check_actor(p_owner text,p_uid uuid,p_device text,p_session uuid) returns void language plpgsql as $$begin null;end$$;`);
for(const name of ['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql','20261025024615_lingjing_protected_save_cas.sql',
 '20261025031842_lingjing_companion_commands.sql','20261025030859_lingjing_cloud_secret_guard.sql','20261025032327_lingjing_session_revocation_ledger.sql',
 '20261025034106_lingjing_transaction_actor_guard.sql','20261025034110_lingjing_domain_actor_guard_adoption.sql'])await db.exec(readFileSync(`infra/supabase/migrations/${name}`,'utf8'));
await db.query('insert into auth.users(id) values($1)',[uid]);await db.query('insert into auth.sessions values($1,$2,null)',[sid,uid]);
async function as(role,sql,params=[]){await db.exec(`begin;set local role ${role}`);try{
 await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({sub:uid,session_id:sid,role}),JSON.stringify({'x-lingjing-device-id':device})]);
 const result=await db.query(sql,params);await db.exec('commit');return result.rows;}catch(error){await db.exec('rollback');throw error;}}
const owner=(await as('service_role',"select public.lingjing_link_auth_user($1,'guard_actor','事务检查') row",[uid]))[0].row.owner_id;
const actor=(await as('authenticated','select public.lingjing_register_device($1) row',[device]))[0].row;
const guard=()=>as('service_role','select lingjing_private.assert_service_actor($1,$2,$3,$4)',[owner,uid,device,sid]);
const wrappers=()=>[
 ()=>as('service_role','select lingjing_discovery.live_actor($1)',[actor]),
 ()=>as('service_role','select public.runtime_territory_check_actor($1,$2,$3,$4)',[owner,uid,device,sid]),
 ()=>as('service_role',"select public.lingjing_commit_companion_command($1,'INVALID',$2,$3,0)",[actor,{},{}])
];
after(()=>db.close());
test('LOCAL PGlite actual SQL: service-only definer validates fresh tuple without granting Auth table SELECT',async()=>{
 await guard();await wrappers()[0]();await wrappers()[1]();await assert.rejects(wrappers()[2](),/LJ_INVALID_REQUEST/); // Past guard, into unchanged domain validation.
 await assert.rejects(as('authenticated','select lingjing_private.assert_service_actor($1,$2,$3,$4)',[owner,uid,device,sid]),/permission denied/);
 await assert.rejects(as('service_role','select * from auth.users'),/permission denied/);await assert.rejects(as('service_role','select * from auth.sessions'),/permission denied/);
});
test('LOCAL PGlite actual SQL: missing/expired managed session, anonymous Auth, wrong UID/device are rejected',async()=>{
 await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[sid]);for(const call of [guard,...wrappers()])await assert.rejects(call(),/LJ_SESSION_REVOKED/);
 await db.query('update auth.sessions set not_after=null where id=$1',[sid]);await db.query('update auth.users set is_anonymous=true where id=$1',[uid]);for(const call of [guard,...wrappers()])await assert.rejects(call(),/LJ_AUTH_INVALID/);
 await db.query('update auth.users set is_anonymous=false where id=$1',[uid]);
 await assert.rejects(as('service_role','select lingjing_private.assert_service_actor($1,$2,$3,$4)',[owner,'10000000-0000-4000-8000-000000000002',device,sid]),/LJ_OWNER_MISMATCH/);
 await assert.rejects(as('service_role','select lingjing_private.assert_service_actor($1,$2,$3,$4)',[owner,uid,'30000000-0000-4000-8000-000000000002',sid]),/LJ_DEVICE_SESSION_REQUIRED/);
 await db.query('delete from auth.sessions where id=$1',[sid]);for(const call of [guard,...wrappers()])await assert.rejects(call(),/LJ_SESSION_REVOKED/);
 await db.query('insert into auth.sessions values($1,$2,null)',[sid,uid]);
});
test('LOCAL PGlite actual SQL: immutable ledger rejects stale worker actor even with apparently active binding',async()=>{
 await db.query("insert into lingjing_private.revoked_auth_sessions(auth_session_id,auth_user_id,owner_id,device_id,reason) values($1,$2,$3,$4,'explicit-device-revoke')",[sid,uid,owner,device]);
 for(const call of [guard,...wrappers()])await assert.rejects(call(),/LJ_SESSION_REVOKED/);
 assert.equal((await db.query('select revoked_at from public.lingjing_devices')).rows[0].revoked_at,null);
});
