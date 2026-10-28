// LOCAL PGlite only. Executes untouched checked-in migrations and RPC, real auth
// actor/device fixture. No deployed SQL, clock rewrite, fake RPC response or grant.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {applyCompanionCommand} from '../../apps/pc-app/runtime/features/companions/cloud-domain.mjs';
import {validateS06PregrantSnapshot,assertOriginalScopeOrdering} from './cloud-live-qa-s06-pregrant-contract.mjs';
const migration='20261025115122_lingjing_global_pet_serials.sql',source=n=>readFileSync(new URL('../../infra/supabase/migrations/'+n,import.meta.url),'utf8');
const binding={role:'a',ownerAccountId:'account:11111111-1111-4111-8111-111111111111',authUserId:'22222222-2222-4222-8222-222222222222',deviceId:'33333333-3333-4333-8333-333333333333',scenario:'original-scope',runId:'synthetic-run',nonce:'synthetic-nonce',nowMs:100000};
const valid=()=>({...binding,observedAtMs:99999,accountActive:true,deviceExists:true,deviceRevoked:false,ownerNamespaces:['qa:original-scope'],liveSerialCount:0,otherNamespaceSerialCount:0,newDeviceGrantCount:0,ownerCompanionModulePresent:true,ownerPetCount:1,ownerMappingMatches:true,actorGuardBeforeRegistration:true,deployedSourceMatchesReviewed:true});
test('preflight refuses C/live/multi-scope/missing device/module/stale parent read',()=>{validateS06PregrantSnapshot(valid(),binding);assert.throws(()=>validateS06PregrantSnapshot(valid(),{...binding,role:'c'}));for(const change of[{ownerNamespaces:['live']},{ownerNamespaces:['qa:original-scope','qa:other']},{liveSerialCount:1},{newDeviceGrantCount:1},{ownerCompanionModulePresent:false},{ownerPetCount:0},{deviceRevoked:true},{observedAtMs:0},{deployedSourceMatchesReviewed:false},{deviceId:randomUUID()}])assert.throws(()=>validateS06PregrantSnapshot({...valid(),...change},binding));});
test('actual production owned RPC guards namespace before registration',()=>assertOriginalScopeOrdering(source(migration)));
test('actual SQL: permanent same-owner QA + ungranted new device returns scope rejection and changes zero rows',async()=>{
 const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to authenticated,service_role;create table auth.users(id uuid primary key,is_anonymous boolean not null default false);create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
  for(const n of['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql','20261025024615_lingjing_protected_save_cas.sql','20261025030635_lingjing_discovery_cloud_authority.sql','20261025030639_lingjing_discovery_live_actor_guard.sql','20261025030859_lingjing_cloud_secret_guard.sql','20261025031842_lingjing_companion_commands.sql','20261025032327_lingjing_session_revocation_ledger.sql','20261025034106_lingjing_transaction_actor_guard.sql','20261025034110_lingjing_domain_actor_guard_adoption.sql','20261025034132_lingjing_discovery_wild_transactions.sql','20261025034136_lingjing_discovery_capture_scenarios.sql'])await db.exec(source(n));
  const scalar=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
  const as=(role,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);return(await tx.query(sql,args)).rows[0]?.v;});
  const uid=randomUUID();await db.query('insert into auth.users(id) values($1)',[uid]);await scalar('select public.lingjing_link_auth_user($1,$2,$2) v',[uid,'s06-local-fixture']);
  async function device(){const sid=randomUUID(),id=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:uid,session_id:sid,role:'authenticated'}),JSON.stringify({'x-lingjing-device-id':id})]);return as('authenticated','select public.lingjing_register_device($1) v',[id]);}
  const a=await device(),input={actionId:'s06-fixture-original-adopt',templateId:'animal-wood-deer',name:'本地合同夹具',showOnDesktop:false},prepared=await applyCompanionCommand(null,a.ownerAccountId,'adopt',input,Date.now(),{uuid:randomUUID});
  await as('service_role',"select public.lingjing_commit_companion_command($1,'adopt',$2,$3,0) v",[a,input,prepared.module]);
  await db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,'original-scope',clock_timestamp()-interval '1 second')",[uid,a.deviceId]);
  await db.exec(source(migration));const next=await device();
  const tables=['public.lingjing_accounts','public.lingjing_devices','public.lingjing_saves','public.lingjing_save_actions','public.lingjing_save_archives','lingjing_private.global_pet_serials','lingjing_private.global_serial_counters','lingjing_private.global_serial_qa_scopes','lingjing_private.owned_pet_ids','lingjing_private.authority_fragments','lingjing_discovery.location_test_grants','lingjing_discovery.location_proofs','lingjing_discovery.permits','lingjing_discovery.captures','lingjing_discovery.game_actions'];
  const snapshot=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>[table,await scalar(`select md5(coalesce(jsonb_agg(r order by r::text)::text,'null')) v from (select to_jsonb(t) r from ${table} t) q`)])));
  assert.equal(await scalar("select count(*)::int v from lingjing_private.global_pet_serials where namespace='live'"),0);assert.equal(await scalar('select count(*)::int v from lingjing_discovery.location_test_grants where auth_uid=$1 and device_id=$2',[uid,next.deviceId]),0);
  assert.equal(await as('service_role','select lingjing_private.global_serial_owner_namespace($1,true) v',[a.ownerAccountId]),'qa:original-scope');const before=await snapshot();
  await assert.rejects(as('service_role','select public.lingjing_global_serial_owned($1,null) v',[next]),/LJ_GLOBAL_SERIAL_SCOPE_REVOKED/);assert.deepEqual(await snapshot(),before);
  // Negative multiscope setup is confined to this disposable SQL fixture.
  await db.query("insert into lingjing_private.global_serial_qa_scopes values($1,$2,'qa:other-scope')",[uid,a.deviceId]);const multi=await snapshot();await assert.rejects(as('service_role','select public.lingjing_global_serial_owned($1,null) v',[next]),/LJ_GLOBAL_SERIAL_SCOPE_CONFLICT/);assert.deepEqual(await snapshot(),multi);
  assert.match(createHash('sha256').update(source(migration)).digest('hex'),/^[a-f0-9]{64}$/);
 }finally{await db.close();}
});
