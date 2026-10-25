// Embedded PostgreSQL security checks; no real Auth or HTTPS success claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
test('location policy and consumption recheck canonical owner/device/session revocation',async()=>{
  const db=new PGlite();
  const actor={authUserId:'dfb705bf-90f6-45ca-83f6-a4c3fc3cb46e',ownerAccountId:'runtime:original-owner',deviceId:'16d30c3c-4b79-49fd-92d9-758c65f86720',sessionId:'0cb89dc7-a2a1-4799-b8ab-d795f7be59b1'};
  const call=async(who=actor)=>(await db.query("select public.lingjing_discovery_location($1::jsonb,'policy','{}') v",[JSON.stringify(who)])).rows[0].v;
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);
      create table public.lingjing_accounts(owner_id text primary key,auth_user_id uuid,status text);create table public.lingjing_devices(owner_id text,device_id uuid,auth_session_id uuid,revoked_at timestamptz);
      grant select,update on public.lingjing_accounts,public.lingjing_devices to service_role;
      insert into auth.users values('${actor.authUserId}');insert into public.lingjing_accounts values('${actor.ownerAccountId}','${actor.authUserId}','active');
      insert into public.lingjing_devices values('${actor.ownerAccountId}','${actor.deviceId}','${actor.sessionId}',null);`);
    for(const file of ['20261025030635_lingjing_discovery_cloud_authority.sql','20261025030639_lingjing_discovery_live_actor_guard.sql'])await db.exec(readFileSync('infra/supabase/migrations/'+file,'utf8'));
    await db.exec('set role service_role');assert.deepEqual(await call(),{allowSimulatedLocation:false});
    for(const override of [{ownerAccountId:'foreign'},{deviceId:'not-a-uuid'},{sessionId:'d37552dd-bbdd-4877-8d2c-89f5e77c47e8'}])await assert.rejects(call({...actor,...override}),/AUTH_REQUIRED/);
    await db.exec("reset role;update public.lingjing_devices set revoked_at=now();set role service_role");await assert.rejects(call(),/AUTH_REQUIRED/);
    await assert.rejects(db.query("select public.lingjing_discovery_take_location($1::jsonb,'ca6d0111-e3e8-407c-82a2-6409124f226f','begin','spawn','permit')",[JSON.stringify(actor)]),/AUTH_REQUIRED/);
    for(const role of ['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(call(),/permission denied/);}
  }finally{await db.close();}
});
