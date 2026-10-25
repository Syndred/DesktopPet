import {test,after} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {readFileSync} from 'node:fs';
const db=new PGlite(),uid='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const old='20000000-0000-4000-8000-000000000001',current='20000000-0000-4000-8000-000000000002',second='20000000-0000-4000-8000-000000000003',unrelated='20000000-0000-4000-8000-000000000004';
const device='30000000-0000-4000-8000-000000000001',device2='30000000-0000-4000-8000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to authenticated,service_role;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
 create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
for(const file of ['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql'])await db.exec(readFileSync(`infra/supabase/migrations/${file}`,'utf8'));
async function as(sid,dev,sql,params=[],role='authenticated'){
 await db.exec(`begin;set local role ${role}`);try{await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[
  JSON.stringify({sub:uid,session_id:sid,role}),JSON.stringify({'x-lingjing-device-id':dev})]);const r=await db.query(sql,params);await db.exec('commit');return r.rows;
 }catch(e){await db.exec('rollback');throw e;}
}
await db.query('insert into auth.users(id) values($1),($2)',[uid,other]);await db.query('insert into auth.sessions values($1,$2,null),($3,$2,null),($4,$2,null),($5,$6,null)',[old,uid,current,second,unrelated,other]);
await as(null,null,"select public.lingjing_link_auth_user($1,'upgrade_fixture','升级测试')",[uid],'service_role');
await as(old,device,'select public.lingjing_register_device($1)',[device]);
await as(current,device,'select public.lingjing_register_device($1)',[device]); // Reproduce overwritten history before the fix.
await as(second,device2,'select public.lingjing_register_device($1)',[device2]);
await db.exec(readFileSync('infra/supabase/migrations/20261025032327_lingjing_session_revocation_ledger.sql','utf8'));
after(()=>db.close());
test('LOCAL PGlite upgrade only: backfill retires overwritten SID but keeps both live devices and unrelated Auth users',async()=>{
 await assert.rejects(as(old,device,'select public.lingjing_register_device($1)',[device]),/LJ_SESSION_REVOKED/);
 assert.equal((await as(current,device,'select public.lingjing_actor_context($1) actor',[device]))[0].actor.sessionId,current);
 assert.equal((await as(second,device2,'select public.lingjing_actor_context($1) actor',[device2]))[0].actor.sessionId,second);
 const ledger=(await db.query('select auth_session_id,reason from lingjing_private.revoked_auth_sessions')).rows;assert.deepEqual(ledger,[{auth_session_id:old,reason:'pre-upgrade-unbound'}]);
 assert.equal((await db.query('select count(*) n from auth.sessions')).rows[0].n,4);
 await assert.rejects(as(null,null,'select * from auth.users',[],'service_role'),/permission denied/);
});
