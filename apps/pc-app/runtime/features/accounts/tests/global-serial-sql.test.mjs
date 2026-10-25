// LOCAL PostgreSQL/WASM transaction and privilege checks. Auth/location/world
// inputs are explicit fixtures; this is not deployed Auth or cloud concurrency.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync,randomUUID} from 'node:crypto';
import {applyCompanionCommand,companionUnit} from '../../companions/cloud-domain.mjs';
import {createCapture} from '../../../../../../infra/supabase/functions/discovery/domain.mjs';
import {nearbySpawns} from '../../../../../../infra/supabase/functions/discovery/_generated/runtime.mjs';
const migration='20261025105253_lingjing_global_pet_serials.sql';
const source=name=>readFileSync('infra/supabase/migrations/'+name,'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema auth;grant usage on schema auth to authenticated,service_role;
  create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
  create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
  create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
  create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
 for(const name of ['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql',
  '20261025024615_lingjing_protected_save_cas.sql','20261025030635_lingjing_discovery_cloud_authority.sql',
  '20261025030639_lingjing_discovery_live_actor_guard.sql','20261025030859_lingjing_cloud_secret_guard.sql',
  '20261025031842_lingjing_companion_commands.sql','20261025032327_lingjing_session_revocation_ledger.sql',
  '20261025034106_lingjing_transaction_actor_guard.sql','20261025034110_lingjing_domain_actor_guard_adoption.sql',
  '20261025034132_lingjing_discovery_wild_transactions.sql','20261025034136_lingjing_discovery_capture_scenarios.sql'])await db.exec(source(name));
 const value=async(sql,args=[])=>(await db.query(sql,args)).rows[0]?.v;
 const as=(role,sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role '+role);return(await tx.query(sql,args)).rows[0]?.v;});
 const actors=[];
 for(let n=1;n<=5;n++){
  const uid=`10000000-0000-4000-8000-00000000000${n}`,sid=`20000000-0000-4000-8000-00000000000${n}`,device=`30000000-0000-4000-8000-00000000000${n}`;
  await db.query('insert into auth.users(id) values($1)',[uid]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
  await value('select public.lingjing_link_auth_user($1,$2,$2) v',[uid,'serial-owner-'+n]);
  await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:uid,session_id:sid,role:'authenticated'}),JSON.stringify({'x-lingjing-device-id':device})]);
  const actor=await as('authenticated','select public.lingjing_register_device($1) v',[device]);actors.push(actor);
 }
 const head=owner=>value('select jsonb_build_object(\'revision\',revision,\'envelope\',envelope) v from public.lingjing_saves where owner_id=$1',[owner]);
 const commit=(a,input,module,revision)=>as('service_role','select public.lingjing_commit_companion_command($1,\'adopt\',$2,$3,$4) v',[a,input,module,revision]);
 async function adopt(a,template='big-fish-gentle',id=randomUUID()){
  const h=await head(a.ownerAccountId),input={actionId:'adopt-'+id,templateId:template,name:'原名字',showOnDesktop:false};
  const prepared=await applyCompanionCommand(h?.envelope||null,a.ownerAccountId,'adopt',input,Date.now(),{uuid:()=>id});
  return{input,module:prepared.module,revision:h?.revision||0,receipt:await commit(a,input,prepared.module,h?.revision||0)};
 }
 const seeds=[];for(const a of actors)seeds.push(await adopt(a));
 await db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,'serial-fixture',clock_timestamp()-interval '1 minute')",[actors[2].authUserId,actors[2].deviceId]);
 // Pre-migration deleted-grant fixtures: one leaves a simulated signed-proof
 // row; another leaves only the service-written simulated permit history.
 const historic=actors[3],permitActor=actors[4];
 for(const [who,scenario]of [[historic,'serial-history'],[permitActor,'serial-permit-history']])await db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,$3,clock_timestamp()+interval '1 minute')",[who.authUserId,who.deviceId,scenario]);
 const historicalLocation=(op,input)=>as('service_role','select public.lingjing_discovery_location($1,$2,$3) v',[{...historic,allowSimulatedLocation:true,scenarioId:'serial-history'},op,input]);
 await historicalLocation('register_device',{publicJwk:generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'}),keyFingerprint:'a'.repeat(64)});
 const nonce=await historicalLocation('issue_nonce',{purpose:'discover',reference:''});
 await historicalLocation('accept_nonce',{challengeId:nonce.id,signatureHash:'a'.repeat(64),fix:{lat:31.2,lng:121.4,accuracyMeters:5,timestampMs:Date.now(),source:'simulated',provider:'qa-discovery',coordinateSystem:'wgs84',scenarioId:'serial-history'}});
 await db.query("insert into lingjing_discovery.permits(id,owner_account_id,auth_uid,pet_id,spawn_id,spawn_json,session_json,status,source,scenario_id,expires_at) values($1,$2,$3,$4,'historical-qa-spawn',$5,'{}','lost','simulated','serial-permit-history',clock_timestamp()-interval '1 minute')",[randomUUID(),permitActor.ownerAccountId,permitActor.authUserId,seeds[4].receipt.result.data.pet.petId,{id:'historical-qa-spawn',templateId:'animal-shiba'}]);
 await db.query('delete from lingjing_discovery.location_test_grants where auth_uid in($1,$2)',[historic.authUserId,permitActor.authUserId]);
 const tables=['public.lingjing_accounts','public.lingjing_saves','public.lingjing_save_actions','public.lingjing_save_archives','lingjing_private.owned_pet_ids','lingjing_private.authority_fragments','lingjing_discovery.location_proofs','lingjing_discovery.permits','lingjing_discovery.captures','lingjing_discovery.game_actions'];
 const hashes=async()=>Object.fromEntries(await Promise.all(tables.map(async name=>[name,await value('select md5(coalesce(jsonb_agg(r order by r::text)::text,\'null\')) v from (select to_jsonb(t) r from '+name+' t) q')])));
 const before=await hashes();await db.exec(source(migration));
 const owned=(a,revision=null)=>as('service_role','select public.lingjing_global_serial_owned($1,$2) v',[a,revision]);
 const location=(a,op,input)=>as('service_role','select public.lingjing_discovery_location($1,$2,$3) v',[a,op,input]);
 for(const a of actors){const jwk=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});await location(a,'register_device',{publicJwk:jwk,keyFingerprint:'a'.repeat(64)});}
 async function proof(a,purpose='discover',reference='',position={lat:31.2,lng:121.4},simulated=false){const n=await location(a,'issue_nonce',{purpose,reference});return location(a,'accept_nonce',{challengeId:n.id,signatureHash:'b'.repeat(64),fix:{...position,accuracyMeters:5,timestampMs:Date.now(),source:simulated?'simulated':'os',provider:simulated?'qa-discovery':'windows-geolocator',coordinateSystem:'wgs84',positionSource:'WiFi',...(simulated?{scenarioId:'serial-fixture'}:{})}});}
 return{db,value,as,actors,seeds,before,hashes,head,adopt,commit,owned,location,proof};
}
test('LOCAL globalSerial migration, private registry, authority hooks and proof transactions',async t=>{
 const f=await fixture(),[a,b,q]=f.actors;
 const scalar=sql=>f.value('select '+sql+' v');
 const counters=()=>f.value("select coalesce(jsonb_agg(to_jsonb(c) order by namespace,template_id),'[]') v from lingjing_private.global_serial_counters c");
 const lookup=(who,spawns)=>f.as('service_role','select public.lingjing_global_serial_wild_lookup($1,$2) v',[who,spawns]);
 const ensure=(who,spawn,p)=>f.as('service_role','select public.lingjing_global_serial_wild_ensure($1,$2,$3) v',[who,spawn,p.id]);
 try{
  await t.test('historical rows stay byte-identical; expired QA is backfilled into its server namespace',async()=>{
   assert.deepEqual(await f.hashes(),f.before);
   const first=await f.owned(a),second=await f.owned(b);assert.deepEqual([first.pets[0].globalSerial,second.pets[0].globalSerial].sort(),['1','2']);
   assert.equal(await scalar("(select global_serial::text from lingjing_private.global_pet_serials where namespace='qa:serial-fixture')"),'1');
   await assert.rejects(f.owned(q),/GLOBAL_SERIAL_SCOPE_REVOKED/);
  });
  await t.test('pre-migration deleted grants retain proof/permit QA scopes and an ungranted new device cannot escape its owner scope',async()=>{
   for(const who of f.actors.slice(3)){
    await assert.rejects(f.owned({...who,username:'plain-name',allowSimulatedLocation:false}),/SCOPE_REVOKED/);
    await assert.rejects(lookup(who,[]),/SCOPE_REVOKED/);
   }
   const sid=randomUUID(),device=randomUUID();await f.db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,q.authUserId]);
   await f.db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:q.authUserId,session_id:sid,role:'authenticated'}),JSON.stringify({'x-lingjing-device-id':device})]);
   const next=await f.as('authenticated','select public.lingjing_register_device($1) v',[device]);
   await assert.rejects(f.owned(next),/SCOPE_REVOKED/);await assert.rejects(lookup(next,[]),/SCOPE_REVOKED/);
   const before=await counters();await assert.rejects(ensure(next,{id:'new-device-cannot-allocate',templateId:'animal-shiba',position:{lat:31.2,lng:121.4}},{id:randomUUID()}),/SCOPE_REVOKED/);assert.deepEqual(await counters(),before);
   await f.db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,'serial-fixture',clock_timestamp()+interval '3 minutes')",[q.authUserId,device]);
   assert.equal((await f.owned(next)).namespace,'qa:serial-fixture');
   const historic=f.actors[3];await f.db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,'another-history',clock_timestamp()+interval '3 minutes')",[historic.authUserId,historic.deviceId]);
   await assert.rejects(f.owned(historic),/SCOPE_CONFLICT/);
  });
  await t.test('cross-owner same-type sequence, separate types, request replay and stale-CAS isolation',async()=>{
   const added=await f.adopt(b),serials=await f.owned(b);assert.equal(serials.pets.find(p=>p.petId===added.receipt.result.data.pet.petId).globalSerial,'3');
   const state=await counters(),replay=await f.commit(b,added.input,added.module,added.revision);
   assert.equal(replay.duplicate,true);assert.deepEqual(replay.envelope,added.receipt.envelope);assert.deepEqual(await counters(),state);
   await assert.rejects(f.commit(b,{...added.input,name:'不同请求'},added.module,added.revision),/ACTION_ID_REUSED/);
   const id=randomUUID(),input={...added.input,actionId:'stale-'+id},prepared=await applyCompanionCommand(added.receipt.envelope,b.ownerAccountId,'adopt',input,Date.now(),{uuid:()=>id});
   await assert.rejects(f.commit(b,input,prepared.module,0),/SYNC_CONFLICT/);assert.deepEqual(await counters(),state);
   const other=await f.adopt(a,'animal-shiba');assert.equal((await f.owned(a)).pets.find(p=>p.petId===other.receipt.result.data.pet.petId).globalSerial,'1');
  });
  await t.test('failure after counter increment rolls back the save, IDs, immutable receipt and number',async()=>{
   const id=randomUUID(),h=await f.head(a.ownerAccountId),input={actionId:'rollback-'+id,templateId:'big-fish-gentle',name:'保留',showOnDesktop:false};
   const prepared=await applyCompanionCommand(h.envelope,a.ownerAccountId,'adopt',input,Date.now(),{uuid:()=>id}),state=await counters(),hashes=await f.hashes();
   await f.db.exec("create function public.serial_fixture_failure() returns trigger language plpgsql as $$begin raise exception 'INJECTED_SERIAL_FAILURE';end$$;create trigger serial_fixture_failure before insert on lingjing_private.global_pet_serials for each row execute function public.serial_fixture_failure();");
   await assert.rejects(f.commit(a,input,prepared.module,h.revision),/INJECTED_SERIAL_FAILURE/);
   assert.deepEqual(await f.hashes(),hashes);assert.deepEqual(await counters(),state);
   await f.db.exec('drop trigger serial_fixture_failure on lingjing_private.global_pet_serials;drop function public.serial_fixture_failure()');
  });
  const spawn=nearbySpawns({lat:31.2,lng:121.4},Date.now()).find(s=>s.templateId==='animal-shiba');assert.ok(spawn);
  let observed;
  await t.test('nearby lookup allocates nothing; observe is owner-scoped, idempotent and range checked',async()=>{
   const state=await counters();assert.deepEqual(await lookup(a,[spawn]),[]);assert.deepEqual(await counters(),state);
   const p=await f.proof(a,'discover','',spawn.position);observed=await ensure(a,spawn,p);assert.equal(observed.globalSerial,'2');assert.deepEqual(await ensure(a,spawn,p),observed);
   const bp=await f.proof(b,'discover','',spawn.position),other=await ensure(b,spawn,bp);assert.equal(other.globalSerial,'3');assert.notEqual(other.ownerAccountId,observed.ownerAccountId);
   const invalid=await f.proof(a,'discover','',spawn.position),before=await counters();
   await assert.rejects(ensure(a,{...spawn,id:spawn.id+'-far',position:{lat:spawn.position.lat+1,lng:spawn.position.lng}},invalid),/OUT_OF_CAPTURE_RANGE/);
   assert.equal((await f.location(a,'read_proof',{proofId:invalid.id})).consumedAt,null);assert.deepEqual(await counters(),before);
   await assert.rejects(ensure(a,{...spawn,templateId:'big-fish-gentle'},invalid),/TEMPLATE_MISMATCH/);
  });
  await t.test('old reserve fallback and claim atomically bind the observed serial without editing receipts',async()=>{
   await f.db.exec("create function public.runtime_territory_capture_context(text,double precision,double precision,text default null) returns jsonb language sql as $$select '{\"territoryId\":null,\"captureMultiplier\":1}'::jsonb$$;revoke all on function public.runtime_territory_capture_context(text,double precision,double precision,text) from public,anon,authenticated;grant execute on function public.runtime_territory_capture_context(text,double precision,double precision,text) to service_role;");
   const h=await f.head(a.ownerAccountId),pet=JSON.parse(companionUnit(h.envelope,a.ownerAccountId,Date.now()).tables.companion_pets[0].data_json),id=randomUUID();
   const session={id:'battle-cloud-'+id,mode:'wild',status:'active',player:{...pet},enemy:{templateId:spawn.templateId},snapshot:{round:0},rounds:[],rules:{version:'fixture'},winner:null};
   const p=await f.proof(a,'begin',spawn.id,spawn.position),op={actionId:'reserve-'+id,requestHash:'c'.repeat(64),id,petId:pet.petId,expectedPetRevision:pet.revision,spawn,session,locationProofId:p.id};
   const write=(opName,operation,rev,fragments={})=>f.as('service_role','select public.lingjing_discovery_game_write($1,$2,$3,$4,$5) v',[a,opName,operation,rev,fragments]);
   const state=await counters();await assert.rejects(write('reserve',op,0),/SYNC_CONFLICT/);assert.deepEqual(await counters(),state);assert.equal((await f.location(a,'read_proof',{proofId:p.id})).consumedAt,null);
   await write('reserve',op,h.revision);assert.deepEqual(await counters(),state);assert.deepEqual(await write('reserve',op,0),await write('reserve',op,0));
   // Explicit already-won database fixture. This subtest tests capture SQL, not
   // the battle engine or a live world-region decision.
   await f.db.query("update lingjing_discovery.permits set status='won',session_json=session_json||'{\"winner\":\"player\",\"status\":\"finished\"}'::jsonb where id=$1",[id]);
   const current=await f.head(a.ownerAccountId),cp=await f.proof(a,'capture',id,spawn.position),petId='pet-'+id;
   const capture={id:'capture-'+id,ownerAccountId:a.ownerAccountId,encounterId:'encounter-'+id,battleId:session.id,petId,actionId:'discovery:encounter-'+id,name:'同号伙伴',templateId:spawn.templateId,resourceId:spawn.resourceId,element:spawn.element,capturedAtMs:Date.now(),memoryTags:[],showOnDesktop:false,validation:'cloud',scenario:'live',territoryId:null,captureMultiplier:1};
   const prepared=await createCapture({actor:a,envelope:current.envelope,capture,instance:{petId,templateId:spawn.templateId,origin:{wildPetId:spawn.id,battleId:session.id,encounterId:capture.encounterId,cloudReceiptId:capture.id,validation:'cloud',scenario:'live'}},now:Date.now()});
   const claim={actionId:'claim-'+id,requestHash:'d'.repeat(64),permitId:id,expectedRevision:1,locationProofId:cp.id,capture,expectedTerritoryContext:{territoryId:null,captureMultiplier:1}};
   const before=await f.hashes();await f.db.exec("create function public.serial_bind_failure() returns trigger language plpgsql as $$begin if old.pet_id is null and new.pet_id is not null then raise exception 'INJECTED_BIND_FAILURE';end if;return new;end$$;create trigger serial_bind_failure before update on lingjing_private.global_pet_serials for each row execute function public.serial_bind_failure();");
   await assert.rejects(write('claim',claim,current.revision,prepared.fragments),/INJECTED_BIND_FAILURE/);
   assert.deepEqual(await f.hashes(),before);assert.deepEqual(await counters(),state);assert.equal((await f.location(a,'read_proof',{proofId:cp.id})).consumedAt,null);
   await f.db.exec('drop trigger serial_bind_failure on lingjing_private.global_pet_serials;drop function public.serial_bind_failure()');
   assert.deepEqual(await write('claim',claim,current.revision,prepared.fragments),capture);assert.deepEqual(await write('claim',claim,0,prepared.fragments),capture);
   assert.equal((await f.owned(a)).pets.find(p=>p.petId===petId).globalSerial,observed.globalSerial);assert.deepEqual(await counters(),state);
   const saved=await f.head(a.ownerAccountId),savedPet=JSON.parse(companionUnit(saved.envelope,a.ownerAccountId,Date.now()).tables.companion_pets.find(p=>p.pet_id===petId).data_json);
   assert.equal(Object.hasOwn(savedPet,'globalSerial'),false);assert.equal(Object.hasOwn(capture,'globalSerial'),false);
  });
  await t.test('queued competing-owner requests cannot collide (WASM serial executor, not cloud concurrency)',async()=>{
   const results=await Promise.all([f.adopt(a,'animal-white-fox'),f.adopt(b,'animal-white-fox')]);
   const reads=await Promise.all([f.owned(a),f.owned(b)]),numbers=reads.map((read,i)=>read.pets.find(p=>p.petId===results[i].receipt.result.data.pet.petId).globalSerial);
   assert.deepEqual(numbers.sort(),['1','2']);
  });
  await t.test('ordinary roles cannot access any allocator; revocation tombstones prohibit live fallback',async()=>{
   for(const role of ['anon','authenticated']){
    await assert.rejects(f.as(role,'select public.lingjing_global_serial_owned($1,null) v',[a]),/permission denied/);
    await assert.rejects(f.as(role,'select public.lingjing_global_serial_wild_lookup($1,$2) v',[a,[]]),/permission denied/);
    await assert.rejects(f.as(role,'select public.lingjing_global_serial_wild_ensure($1,$2,$3) v',[a,spawn,randomUUID()]),/permission denied/);
    await assert.rejects(f.as(role,'select count(*) v from lingjing_private.global_pet_serials'),/permission denied/);
   }
   await f.db.query('delete from lingjing_discovery.location_test_grants where auth_uid=$1',[q.authUserId]);
   await assert.rejects(f.owned({...q,username:'normal-live',allowSimulatedLocation:false}),/SCOPE_REVOKED/);
   await f.db.query("insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at) values($1,$2,'serial-fixture',clock_timestamp()+interval '3 minutes')",[q.authUserId,q.deviceId]);
   assert.equal((await f.owned(q)).namespace,'qa:serial-fixture');
   const qa=await ensure({...q,allowSimulatedLocation:true,scenarioId:'serial-fixture'},spawn,await f.proof({...q,allowSimulatedLocation:true,scenarioId:'serial-fixture'},'discover','',spawn.position,true));assert.equal(qa.namespace,'qa:serial-fixture');assert.equal(qa.globalSerial,'1');
   await f.db.query('delete from auth.sessions where id=$1',[q.sessionId]);await assert.rejects(f.owned(q),/SESSION_REVOKED/);
  });
  await t.test('serials exceed JS safe integers as canonical strings and numbers cannot be recycled',async()=>{
   await f.db.exec("update lingjing_private.global_serial_counters set last_serial=9007199254740992 where namespace='live' and template_id='big-fish-gentle'");
   const next=await f.adopt(b),petId=next.receipt.result.data.pet.petId;assert.equal((await f.owned(b)).pets.find(p=>p.petId===petId).globalSerial,'9007199254740993');
   await assert.rejects(f.db.exec("delete from lingjing_private.global_pet_serials where owner_id='unused' or namespace='live'"),/IMMUTABLE/);
   await assert.rejects(f.db.exec("update lingjing_private.global_serial_counters set last_serial=0 where namespace='live'"),/IMMUTABLE/);
  });
 }finally{await f.db.close();}
});
