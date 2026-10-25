// Local PostgreSQL/WASM: actual migrations 23/24/25 and Auth guards; no HTTPS.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const source=name=>readFileSync('infra/supabase/migrations/'+name,'utf8');
const migration=suffix=>{const matches=readdirSync('infra/supabase/migrations').filter(name=>name.endsWith('_'+suffix+'.sql'));assert.equal(matches.length,1);return source(matches[0]);};
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to authenticated,service_role;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
 create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create schema realtime;grant usage on schema realtime to authenticated,service_role;
 create table realtime.messages(topic text,extension text);alter table realtime.messages enable row level security;
 grant select on realtime.messages to authenticated;
 create function realtime.topic() returns text language sql stable as $$select current_setting('request.topic',true)$$;`);
 for(const name of ['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql',
 '20261025024615_lingjing_protected_save_cas.sql','20261025030635_lingjing_discovery_cloud_authority.sql',
 '20261025030639_lingjing_discovery_live_actor_guard.sql','20261025030859_lingjing_cloud_secret_guard.sql',
 '20261025031842_lingjing_companion_commands.sql','20261025032327_lingjing_session_revocation_ledger.sql',
 '20261025034106_lingjing_transaction_actor_guard.sql','20261025034110_lingjing_domain_actor_guard_adoption.sql',
 '20261025034132_lingjing_discovery_wild_transactions.sql','20261025034136_lingjing_discovery_capture_scenarios.sql',
 '20261025034744_lingjing_battle_jwt_rooms.sql'])await db.exec(source(name));
 await db.exec(migration('lingjing_global_pet_serials'));
 await db.exec(migration('lingjing_battle_serial_views'));
 // Exact projected territory columns; spatial write functions are outside this
 // isolated read-only fixture. The source RPC never reads current region state.
 await db.exec(`create table public.runtime_territory_regions(id text primary key,owner_account_id text,garrison_pet_id text,defender_json jsonb);
 create table public.runtime_territory_challenges(session_id text primary key,owner_account_id text,territory_id text,territory_revision bigint,pet_id text,battle_json jsonb);
 create table public.runtime_territory_logs(id uuid primary key default gen_random_uuid(),territory_id text,actor_owner_id text,action text,old_owner_id text,new_owner_id text,session_id text);
 alter table public.runtime_territory_challenges enable row level security;alter table public.runtime_territory_logs enable row level security;
 revoke all on public.runtime_territory_regions,public.runtime_territory_challenges,public.runtime_territory_logs from public,anon,authenticated;
 grant select on public.runtime_territory_regions,public.runtime_territory_challenges,public.runtime_territory_logs to service_role;`);
 const actors=[];
 for(let index=0;index<6;index++){
  const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:'territory-view-'+index,authUserId:randomUUID(),deviceId:randomUUID(),sessionId:randomUUID()};
  await db.query('insert into auth.users(id) values($1)',[actor.authUserId]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[actor.sessionId,actor.authUserId]);
  await db.query('insert into public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username) values($1,$2,$1,$1,$1)',[actor.ownerAccountId,actor.authUserId]);
  await db.query('insert into public.lingjing_devices(owner_id,device_id,auth_session_id) values($1,$2,$3)',[actor.ownerAccountId,actor.deviceId,actor.sessionId]);actors.push(actor);
 }
 const scope=new Map();
 const grant=async(actor,name)=>{await db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,$3,statement_timestamp()+interval '1 hour')",[actor.authUserId,actor.deviceId,name]);scope.set(actor.ownerAccountId,'qa:'+name);};
 const seed=async(actor,petId,serial,explicitNamespace)=>{
  const ns=explicitNamespace||scope.get(actor.ownerAccountId)||'live';
  await db.query("insert into lingjing_private.global_serial_counters(namespace,template_id,last_serial) values($1,'animal-wood-deer',$2) on conflict(namespace,template_id) do update set last_serial=greatest(global_serial_counters.last_serial,excluded.last_serial)",[ns,serial]);
  await db.query("insert into lingjing_private.global_pet_serials(namespace,template_id,global_serial,owner_id,pet_id) values($1,'animal-wood-deer',$2,$3,$4)",[ns,serial,actor.ownerAccountId,petId]);
 };
 const battle=async(actor,guard,{sessionId='btl-'+randomUUID().replaceAll('-','').slice(0,22),enemyPetId='same-pet',log=true}={})=>{
  const territoryId='region-'+sessionId,ns=scope.get(actor.ownerAccountId)||'live';
  const value={id:sessionId,mode:'territory',player:{petId:'same-pet',globalSerial:'999999',templateId:'forged'},enemy:{petId:enemyPetId,ownerAccountId:'forged-owner',globalSerial:'888888',templateId:'forged'},context:{authority:'cloud',ownerAccountId:actor.ownerAccountId,territoryId,territoryRevision:7,locationProvenance:ns==='live'?'os':'simulated',scenarioId:ns==='live'?null:ns.slice(3)}};
  await db.query('insert into public.runtime_territory_regions values($1,$2,$3,$4)',[territoryId,guard?.ownerAccountId||null,enemyPetId,{globalSerial:'555555',ownerAccountId:'untrusted-defender-owner'}]);
  await db.query('insert into public.runtime_territory_challenges values($1,$2,$3,7,$4,$5)',[sessionId,actor.ownerAccountId,territoryId,'same-pet',value]);
  if(log)await db.query("insert into public.runtime_territory_logs(territory_id,actor_owner_id,action,old_owner_id,session_id) values($1,$2,'challenge',$3,$4)",[territoryId,actor.ownerAccountId,guard?.ownerAccountId||null,sessionId]);
  return{sessionId,territoryId,value};
 };
 const lookup=async(actor,ids,role='service_role')=>{
  await db.exec('begin read only;set local role '+role);
  try{const result=(await db.query('select public.lingjing_territory_serial_views($1,$2::jsonb) value',[actor,JSON.stringify(ids)])).rows[0].value;await db.exec('commit');return result;}
  catch(error){await db.exec('rollback');throw error;}
 };
 const hashes=async()=>{
  const tables=(await db.query("select schemaname||'.'||tablename name from pg_tables where schemaname in('public','lingjing_private','lingjing_discovery','auth') order by 1")).rows;
  const result={};for(const{name}of tables)result[name]=(await db.query("select md5(coalesce(jsonb_agg(r order by r::text)::text,'null')) value from(select to_jsonb(t) r from "+name+' t) q')).rows[0].value;return result;
 };
 return{db,actors,grant,seed,battle,lookup,hashes};
}
test('territory serial lookup uses actual read guard, historical authorization and no writes',async t=>{
 const f=await fixture(),[a,b,outsider,q,qPeer,qOther]=f.actors;
 try{
  await f.seed(a,'same-pet','900719925474099312345678901234567890');await f.seed(b,'same-pet','2');await f.seed(outsider,'same-pet','3');
  await f.grant(q,'qa-one');await f.grant(qPeer,'qa-one');await f.grant(qOther,'qa-other');
  await f.seed(q,'same-pet','1');await f.seed(qPeer,'same-pet','2');await f.seed(qOther,'same-pet','1');
  const old=await f.battle(a,b),missing=await f.battle(a,b,{enemyPetId:'unregistered'}),ambiguous=await f.battle(a,b),noLog=await f.battle(a,b,{log:false});
  const npcId='btl-npc',npc=await f.battle(a,null,{sessionId:npcId,enemyPetId:'guardian:region-'+npcId});
  const collidingId='btl-owned-collision',collisionPet='guardian:region-'+collidingId;
  await f.seed(b,collisionPet,'4');const collision=await f.battle(a,b,{sessionId:collidingId,enemyPetId:collisionPet});
  const sameQa=await f.battle(q,qPeer),crossQa=await f.battle(q,qOther),mixed=await f.battle(a,q);
  await f.db.query("insert into public.runtime_territory_logs(territory_id,actor_owner_id,action,old_owner_id,session_id) values($1,$2,'challenge',$3,$4)",[ambiguous.territoryId,a.ownerAccountId,outsider.ownerAccountId,ambiguous.sessionId]);
  await f.db.query('update public.runtime_territory_regions set owner_account_id=$1,garrison_pet_id=$2 where id=$3',[outsider.ownerAccountId,'replacement',old.territoryId]);
  await f.db.query("insert into public.lingjing_battle_commands(actor_auth_uid,action_id,owner_account_id,operation,input_json,result_json) values($1,'territory-original-command',$2,'fixture',$3,$3)",[a.authUserId,a.ownerAccountId,{originalReceipt:'原命令回执保持',globalSerial:'666666'}]);
  const before=await f.hashes();await f.db.exec(migration('lingjing_territory_serial_views'));
  await t.test('additive DDL preserves every preexisting row including registry/counters',async()=>assert.deepEqual(await f.hashes(),before));
  await t.test('READ ONLY looks up old owner and ignores forged saved metadata/changed current region',async()=>{
   const value=await f.lookup(a,[old.sessionId]);assert.equal(value.namespace,'live');
   assert.deepEqual(value.sessions[0],{sessionId:old.sessionId,player:{ownerAccountId:a.ownerAccountId,petId:'same-pet',templateId:'animal-wood-deer',globalSerial:'900719925474099312345678901234567890'},enemy:{ownerAccountId:b.ownerAccountId,petId:'same-pet',templateId:'animal-wood-deer',globalSerial:'2'},enemyKind:'instance'});
  });
  await t.test('unknown/foreign sessions and mixed batches have one whole-batch refusal',async()=>{
   for(const ids of[[old.sessionId,'btl-unknown'],['btl-unknown']])await assert.rejects(f.lookup(a,ids),/NOT_PARTICIPANT/);
   await assert.rejects(f.lookup(outsider,[old.sessionId]),/NOT_PARTICIPANT/);
  });
  await t.test('anon/authenticated cannot execute the service-only RPC or private guard',async()=>{
   for(const role of['anon','authenticated'])await assert.rejects(f.lookup(a,[old.sessionId],role),/permission denied/);
   const rows=(await f.db.query("select has_function_privilege('anon','public.lingjing_territory_serial_views(jsonb,jsonb)','execute') a,has_function_privilege('authenticated','public.lingjing_territory_serial_views(jsonb,jsonb)','execute') b")).rows;assert.deepEqual(rows,[{a:false,b:false}]);
  });
  await t.test('malformed, duplicate and oversized session batches are rejected',async()=>{
   for(const ids of[null,{},[],[old.sessionId,old.sessionId],Array(21).fill(old.sessionId),[1],['bad id'],['x'.repeat(161)]])await assert.rejects(f.lookup(a,ids),/INVALID_REQUEST/);
  });
  await t.test('actual auth/session/device guard rejects forged actor identities',async()=>{
   for(const patch of[{ownerAccountId:b.ownerAccountId},{sessionId:randomUUID()},{deviceId:randomUUID()},{schemaVersion:2},{authUserId:null}])await assert.rejects(f.lookup({...a,...patch},[old.sessionId]),/LJ_(OWNER_MISMATCH|SESSION_REVOKED|DEVICE_SESSION_REQUIRED|AUTH_REQUIRED)/);
  });
  await t.test('missing or ambiguous historical evidence stays pending without NPC guesses',async()=>{
   for(const item of[missing,ambiguous,noLog]){const row=(await f.lookup(a,[item.sessionId])).sessions[0];assert.equal(row.enemy,null);assert.equal(row.enemyKind,undefined);}
  });
  await t.test('system guardian is proven from original challenge, with owned collision taking precedence',async()=>{
   const system=(await f.lookup(a,[npc.sessionId])).sessions[0];assert.equal(system.enemy,null);assert.equal(system.enemyKind,'guardian');
   const actual=(await f.lookup(a,[collision.sessionId])).sessions[0];assert.equal(actual.enemyKind,'instance');assert.equal(actual.enemy.globalSerial,'4');
  });
  await t.test('unrelated owner and cross-scope presence or rollback removal cannot change the complete view',async()=>{
   const ids=[npc.sessionId,missing.sessionId],original=await f.lookup(a,ids);
   await f.db.exec('begin');
   try{
    await f.seed(outsider,'guardian:'+npc.territoryId,'8');
    await f.seed(qOther,'guardian:'+npc.territoryId,'9');
    await f.seed(b,'unregistered','10','qa:other-unrelated-scope');
    await f.db.exec('set local role service_role');
    const present=(await f.db.query('select public.lingjing_territory_serial_views($1,$2::jsonb) value',[a,JSON.stringify(ids)])).rows[0].value;
    assert.deepEqual(present,original);
   }finally{await f.db.exec('rollback');}
   assert.deepEqual(await f.lookup(a,ids),original);
  });
  await t.test('QA same namespace works, cross-QA/live guards stay pending',async()=>{
   assert.equal((await f.lookup(q,[sameQa.sessionId])).sessions[0].enemy.globalSerial,'2');
   for(const[actor,item]of[[q,crossQa],[a,mixed]]){const row=(await f.lookup(actor,[item.sessionId])).sessions[0];assert.equal(row.enemy,null);assert.equal(row.enemyKind,undefined);}
  });
  await t.test('deleted QA grant cannot fall back to live, and remains a pure refusal',async()=>{
   await f.db.query('delete from lingjing_discovery.location_test_grants where auth_uid=$1',[q.authUserId]);
   const state=await f.hashes();await assert.rejects(f.lookup(q,[sameQa.sessionId]),/GLOBAL_SERIAL_SCOPE_REVOKED/);assert.deepEqual(await f.hashes(),state);
   await f.db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,'qa-one',statement_timestamp()+interval '1 hour')",[q.authUserId,q.deviceId]);
  });
  // Grant expiry timestamp was intentionally changed by fixture setup, so take
  // a new baseline for repeated read-only calls and exact historical JSON bytes.
  const stable=await f.hashes();for(let index=0;index<3;index++)await f.lookup(a,[old.sessionId,npc.sessionId]);
  await t.test('repeated views preserve every row and original JSON/receipts/counters',async()=>assert.deepEqual(await f.hashes(),stable));
 }finally{await f.db.close();}
});
