// LOCAL PostgreSQL/WASM only. Auth, sessions, devices and room rows below are
// explicit fixtures. This does not claim provider Auth, HTTPS or live deployment.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const candidates=readdirSync('infra/supabase/migrations').filter(name=>/^\d{14}_lingjing_battle_serial_views\.sql$/.test(name));
assert.equal(candidates.length,1,'One source migration before/after coordinator ledger promotion');
const [candidate]=candidates;
const source=name=>readFileSync('infra/supabase/migrations/'+name,'utf8');
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
  '20261025034744_lingjing_battle_jwt_rooms.sql','20261025115122_lingjing_global_pet_serials.sql'])await db.exec(source(name));
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
 const as=async(role,sql,args=[],readOnly=true)=>{
  await db.exec(`begin${readOnly?' read only':''};set local role ${role}`);
  try{const result=await value(sql,args);await db.exec('commit');return result;}
  catch(error){await db.exec('rollback');throw error;}
 };
 const actors=[];
 for(let n=1;n<=6;n++){
  const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:'serial-view-owner-'+n,
   authUserId:randomUUID(),sessionId:randomUUID(),deviceId:randomUUID()};
  await db.query('insert into auth.users(id) values($1)',[actor.authUserId]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[actor.sessionId,actor.authUserId]);
  await db.query('insert into public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username) values($1,$2,$1,$1,$3)',[actor.ownerAccountId,actor.authUserId,'本地夹具'+n]);
  await db.query('insert into public.lingjing_devices(owner_id,device_id,auth_session_id) values($1,$2,$3)',[actor.ownerAccountId,actor.deviceId,actor.sessionId]);
  actors.push(actor);
 }
 const grant=(actor,scenario='serial-view-fixture',expired=false)=>db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,$3,statement_timestamp()+$4::interval) on conflict(auth_uid,device_id) do update set scenario_id=excluded.scenario_id,expires_at=excluded.expires_at",[actor.authUserId,actor.deviceId,scenario,expired?'-1 minute':'1 hour']);
 const seedSerial=async(actor,petId,serial,namespace='live',template='animal-wood-deer')=>{
  await db.query('insert into lingjing_private.global_serial_counters(namespace,template_id,last_serial) values($1,$2,$3) on conflict(namespace,template_id) do update set last_serial=greatest(global_serial_counters.last_serial,excluded.last_serial)',[namespace,template,serial]);
  await db.query('insert into lingjing_private.global_pet_serials(namespace,template_id,global_serial,owner_id,pet_id) values($1,$2,$3,$4,$5)',[namespace,template,serial,actor.ownerAccountId,petId]);
 };
 const room=async(host,guest,hostPet='same-original-pet',guestPet=hostPet)=>{
  const id=randomUUID();
  await db.query(`insert into public.lingjing_battle_rooms(id,host_auth_uid,guest_auth_uid,host_user_id,guest_user_id,host_account,guest_account,
   host_pet_id,guest_pet_id,host_pet_name,guest_pet_name,host_resource_id,guest_resource_id,host_element,guest_element,status,revision)
   values($1,$2,$3,$4,$5,$4,$5,$6,$7,'原名字A','原名字B','builtin:wood-deer','builtin:wood-deer','wood','wood','abandoned',9007199254740993)`,
   [id,host.authUserId,guest?.authUserId||null,host.ownerAccountId,guest?.ownerAccountId||null,hostPet,guest?guestPet:null]);
  for(const [actor,side]of [[host,'host'],[guest,'guest']])if(actor)await db.query('insert into public.lingjing_battle_members(room_id,auth_uid,owner_account_id,side,active) values($1,$2,$3,$4,false)',[id,actor.authUserId,actor.ownerAccountId,side]);
  return id;
 };
 const lookup=(actor,ids,role='service_role')=>as(role,'select public.lingjing_battle_serial_views($1,$2::uuid[]) v',[actor,ids]);
 const hashes=async()=>{
  const tables=(await db.query("select schemaname||'.'||tablename name from pg_tables where schemaname in('public','lingjing_private','lingjing_discovery','auth') order by 1")).rows;
  const rows={};for(const {name}of tables)rows[name]=await value("select md5(coalesce(jsonb_agg(r order by r::text)::text,'null')) v from(select to_jsonb(t) r from "+name+' t) q');return rows;
 };
 return{db,value,as,actors,grant,seedSerial,room,lookup,hashes};
}

test('LOCAL service-only member-bound serial views are pure SELECT, private and byte-preserving',async t=>{
 const f=await fixture(),[a,b,outsider,q,qPeer,otherQa]=f.actors,checks=[];
 const check=async(name,fn)=>t.test(name,async()=>{await fn();checks.push(name);});
 try{
  await f.seedSerial(a,'same-original-pet','900719925474099312345678901234567890');
  await f.seedSerial(b,'same-original-pet','2');
  await f.seedSerial(outsider,'same-original-pet','3');
  for(const actor of[q,qPeer])await f.grant(actor);
  await f.grant(otherQa,'other-fixture');
  await f.seedSerial(q,'same-original-pet','1','qa:serial-view-fixture');
  await f.seedSerial(qPeer,'same-original-pet','2','qa:serial-view-fixture');
  await f.seedSerial(otherQa,'same-original-pet','1','qa:other-fixture');
  const ab=await f.room(a,b),empty=await f.room(a,b,'unregistered-pet'),waiting=await f.room(a,null),
   qa=await f.room(q,qPeer),mixed=await f.room(a,q),crossQa=await f.room(q,otherQa);
  // Immutable command and report JSON deliberately include an untrusted fake
  // number. The lookup must derive neither identity nor numbering from it.
  await f.db.query("insert into public.lingjing_battle_commands(actor_auth_uid,action_id,owner_account_id,operation,input_json,result_json) values($1,'historical-command',$2,'fixture',$3,$3)",[a.authUserId,a.ownerAccountId,{petId:'same-original-pet',globalSerial:'999999',ownerAccountId:b.ownerAccountId}]);
  await f.db.query("insert into public.lingjing_battle_rounds(room_id,round_no,host_action,guest_action,round_result) values($1,1,'dodge','dodge',$2)",[ab,{unchanged:'旧回合',globalSerial:'8888'}]);
  const before=await f.hashes();await f.db.exec(source(candidate));
  await check('candidate DDL changes no preexisting table rows, JSON, counters or receipts',async()=>assert.deepEqual(await f.hashes(),before));
  await check('READ ONLY service lookup binds both owners even with identical petIds and preserves arbitrary precision',async()=>{
   const actual=await f.lookup(a,[ab]);
   assert.deepEqual(actual,{format:'lingjing.battle.serial-views',version:1,ownerAccountId:a.ownerAccountId,namespace:'live',rooms:[{roomId:ab,roomRevision:'9007199254740993',participants:[
    {side:'host',ownerAccountId:a.ownerAccountId,petId:'same-original-pet',templateId:'animal-wood-deer',globalSerial:'900719925474099312345678901234567890'},
    {side:'guest',ownerAccountId:b.ownerAccountId,petId:'same-original-pet',templateId:'animal-wood-deer',globalSerial:'2'},
   ]}]});
   assert.equal((await f.lookup(b,[ab])).ownerAccountId,b.ownerAccountId);
   const json=JSON.stringify(actual);for(const forbidden of['authUserId','auth_uid','sessionId','deviceId','spawnId','client','999999','8888',outsider.ownerAccountId])assert.ok(!json.includes(forbidden));
  });
  await check('unknown, outsiders, invitation-only access and mismatched membership reject the whole batch identically',async()=>{
   for(const ids of[[randomUUID()],[ab,randomUUID()]])await assert.rejects(f.lookup(a,ids),/LJ_ROOM_FORBIDDEN/);
   await assert.rejects(f.lookup(outsider,[ab]),/LJ_ROOM_FORBIDDEN/);
   await f.db.query('update public.lingjing_battle_rooms set invited_auth_uid=$1,invited_user_id=$2 where id=$3',[outsider.authUserId,outsider.ownerAccountId,waiting]);
   await assert.rejects(f.lookup(outsider,[waiting]),/LJ_ROOM_FORBIDDEN/);
   await f.db.query('update public.lingjing_battle_members set owner_account_id=$1 where room_id=$2 and side=\'host\'',[b.ownerAccountId,empty]);
   await assert.rejects(f.lookup(a,[empty]),/LJ_ROOM_FORBIDDEN/);
   await f.db.query('update public.lingjing_battle_members set owner_account_id=$1 where room_id=$2 and side=\'host\'',[a.ownerAccountId,empty]);
  });
  await check('missing registry, absent guest, different QA scope and live/QA mixing are omitted without allocation',async()=>{
   assert.deepEqual((await f.lookup(a,[empty])).rooms[0].participants,[]);
   assert.equal((await f.lookup(a,[waiting])).rooms[0].participants.length,1);
   assert.deepEqual((await f.lookup(a,[mixed])).rooms[0].participants.map(p=>p.ownerAccountId),[a.ownerAccountId]);
   assert.deepEqual((await f.lookup(q,[mixed])).rooms[0].participants.map(p=>p.ownerAccountId),[q.ownerAccountId]);
   assert.equal((await f.lookup(q,[qa])).rooms[0].participants.length,2);
   assert.deepEqual((await f.lookup(q,[crossQa])).rooms[0].participants.map(p=>p.ownerAccountId),[q.ownerAccountId]);
   // A peer's expired grant does not revoke an original member's historical
   // read: only its retained server scope and immutable sidecar are exposed.
   await f.grant(qPeer,'serial-view-fixture',true);
   assert.equal((await f.lookup(q,[qa])).rooms[0].participants.length,2);
  });
  await check('1..20 unique UUID rooms are bounded, ordered and historical inactive membership remains readable',async()=>{
   for(const ids of[null,[],[ab,ab],[null],Array.from({length:21},()=>randomUUID())])await assert.rejects(f.lookup(a,ids),/LJ_INVALID_COMMAND/);
   const rooms=[ab,waiting];for(let n=2;n<20;n++)rooms.push(await f.room(a,b));
   assert.deepEqual((await f.lookup(a,rooms)).rooms.map(r=>r.roomId),rooms);
   assert.deepEqual((await f.lookup(a,[waiting,ab])).rooms.map(r=>r.roomId),[waiting,ab]);
  });
  await check('canonical actor validation matches current Auth/session/device and revocation refusal conditions',async()=>{
   const deny=async(actor,pattern)=>{
    await assert.rejects(f.lookup(actor,[ab]),pattern);
    await assert.rejects(f.as('service_role','select lingjing_discovery.live_actor($1) v',[actor],false),pattern);
   };
   for(const patch of[{authUserId:b.authUserId},{ownerAccountId:b.ownerAccountId}])await deny({...a,...patch},/LJ_OWNER_MISMATCH/);
   for(const patch of[{deviceId:randomUUID()},{sessionId:b.sessionId}])await deny({...a,...patch},/LJ_(DEVICE_SESSION_REQUIRED|SESSION_REVOKED)/);
   for(const invalid of[null,{}, {...a,schemaVersion:'1'}, {...a,authority:'local'},{...a,authKind:'fake'},{...a,sessionId:null},{...a,deviceId:'not-uuid'}])await assert.rejects(f.lookup(invalid,[ab]),/LJ_AUTH_REQUIRED/);
   await f.db.query("update public.lingjing_accounts set status='locked' where owner_id=$1",[a.ownerAccountId]);await deny(a,/LJ_OWNER_MISMATCH/);
   await f.db.query("update public.lingjing_accounts set status='active' where owner_id=$1",[a.ownerAccountId]);
   await f.db.query('update auth.users set is_anonymous=true where id=$1',[a.authUserId]);await deny(a,/LJ_AUTH_INVALID/);
   await f.db.query('update auth.users set is_anonymous=false where id=$1',[a.authUserId]);
   await f.db.query("update auth.sessions set not_after=statement_timestamp()-interval '1 second' where id=$1",[a.sessionId]);await deny(a,/LJ_SESSION_REVOKED/);
   await f.db.query('update auth.sessions set not_after=null where id=$1',[a.sessionId]);
   await f.db.query('update public.lingjing_devices set revoked_at=statement_timestamp() where owner_id=$1',[a.ownerAccountId]);await deny(a,/LJ_DEVICE_SESSION_REQUIRED/);
   await f.db.query('update public.lingjing_devices set revoked_at=null where owner_id=$1',[a.ownerAccountId]);
   const retired={...a,sessionId:randomUUID(),deviceId:randomUUID()};
   await f.db.query('insert into auth.sessions(id,user_id) values($1,$2)',[retired.sessionId,a.authUserId]);
   await f.db.query('insert into public.lingjing_devices(owner_id,device_id,auth_session_id) values($1,$2,$3)',[a.ownerAccountId,retired.deviceId,retired.sessionId]);
   await f.db.query("insert into lingjing_private.revoked_auth_sessions(auth_session_id,auth_user_id,owner_id,device_id,reason) values($1,$2,$3,$4,'explicit-device-revoke')",[retired.sessionId,a.authUserId,a.ownerAccountId,retired.deviceId]);
   await deny(retired,/LJ_SESSION_REVOKED/);
   await f.db.query('delete from auth.sessions where id=$1',[retired.sessionId]);await deny(retired,/LJ_SESSION_REVOKED/);
  });
  await check('QA tombstones survive grant expiry/deletion and a new ungranted device cannot fall back to live',async()=>{
   await f.grant(q,'serial-view-fixture',true);await assert.rejects(f.lookup(q,[qa]),/SCOPE_REVOKED/);
   await f.db.query('delete from lingjing_discovery.location_test_grants where auth_uid=$1',[q.authUserId]);await assert.rejects(f.lookup(q,[qa]),/SCOPE_REVOKED/);
   const next={...q,deviceId:randomUUID(),sessionId:randomUUID()};
   await f.db.query('insert into auth.sessions(id,user_id) values($1,$2)',[next.sessionId,q.authUserId]);
   await f.db.query('insert into public.lingjing_devices(owner_id,device_id,auth_session_id) values($1,$2,$3)',[q.ownerAccountId,next.deviceId,next.sessionId]);
   await assert.rejects(f.lookup(next,[qa]),/SCOPE_REVOKED/);
   await f.grant(q);assert.equal((await f.lookup(q,[qa])).namespace,'qa:serial-view-fixture');
   await assert.rejects(f.lookup({...a,allowSimulatedLocation:true},[ab]),/SCOPE_REVOKED/);
   await f.grant(next,'conflicting-scope');await assert.rejects(f.lookup(q,[qa]),/SCOPE_CONFLICT/);
   await assert.rejects(f.lookup(next,[qa]),/SCOPE_CONFLICT/);
   // Display names and scenario-shaped client fields cannot change live scope.
   assert.equal((await f.lookup({...a,scenarioId:'serial-view-fixture',username:'qa:any',namespace:'qa:serial-view-fixture'},[ab])).namespace,'live');
  });
  await check('caller expiry uses current statement time even inside a preexisting transaction',async()=>{
   await f.db.exec('begin read only;set local role service_role');
   try{
    const expires=await f.value("select statement_timestamp()+interval '1500 milliseconds' v");
    const expired={...a,sessionId:randomUUID(),deviceId:randomUUID()};
    await f.db.exec('rollback');
    await f.db.query('insert into auth.sessions(id,user_id,not_after) values($1,$2,$3)',[expired.sessionId,a.authUserId,expires]);
    await f.db.query('insert into public.lingjing_devices(owner_id,device_id,auth_session_id) values($1,$2,$3)',[a.ownerAccountId,expired.deviceId,expired.sessionId]);
    await f.db.exec('begin read only;set local role service_role');
    await f.db.query('select public.lingjing_battle_serial_views($1,$2::uuid[])',[expired,[ab]]);
    await new Promise(resolve=>setTimeout(resolve,1600));
    await assert.rejects(f.db.query('select public.lingjing_battle_serial_views($1,$2::uuid[])',[expired,[ab]]),/SESSION_REVOKED/);
   }finally{await f.db.exec('rollback');}
  });
  await check('only service_role executes invoker RPC/private STABLE guard, without new Auth table privileges',async()=>{
   for(const role of['anon','authenticated']){
    await assert.rejects(f.lookup(a,[ab],role),/permission denied/);
    await assert.rejects(f.as(role,'select lingjing_private.global_serial_read_actor_namespace($1) v',[a]),/permission denied/);
    await assert.rejects(f.as(role,'select count(*) v from lingjing_private.global_pet_serials'),/permission denied/);
   }
   for(const name of['users','sessions'])await assert.rejects(f.as('service_role',`select count(*) v from auth.${name}`),/permission denied/);
   const acl=(await f.db.query("select n.nspname,p.proname,p.prosecdef,p.provolatile,p.proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') service from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in('lingjing_battle_serial_views','global_serial_read_actor_namespace') order by p.proname")).rows;
   assert.equal(acl.length,2);for(const row of acl){assert.equal(row.provolatile,'s');assert.ok(row.proconfig.includes('search_path=""'));assert.equal(row.anon,false);assert.equal(row.authenticated,false);assert.equal(row.service,true);assert.equal(row.prosecdef,row.nspname==='lingjing_private');}
   // Static closure check supplements READ ONLY execution: no callable allocator
   // or write/row-lock statement can hide in either new function body.
   const bodies=(await f.db.query("select prosrc from pg_proc where proname in('lingjing_battle_serial_views','global_serial_read_actor_namespace')")).rows;
   for(const {prosrc}of bodies){const body=prosrc.replace(/--[^\n]*/g,'');assert.ok(!/\b(insert|update|delete|merge|truncate|ensure|register|backfill)\b|for\s+(share|update)|global_serial_actor_namespace|assert_service_actor/i.test(body));}
  });
  await check('all successful lookups leave every existing row and counter untouched',async()=>{
   const unchanged=await f.hashes();await f.lookup(a,[ab,waiting,mixed]);await f.lookup(b,[ab]);assert.deepEqual(await f.hashes(),unchanged);
  });
  mkdirSync('artifacts/battle/cloud',{recursive:true});writeFileSync('artifacts/battle/cloud/serial-views-sql-evidence.json',JSON.stringify({at:new Date().toISOString(),provenance:'local-PostgreSQL-WASM-fixtures',realCloudVerified:false,candidate,checks,passed:true},null,2)+'\n');
 }finally{await f.db.close();}
});
