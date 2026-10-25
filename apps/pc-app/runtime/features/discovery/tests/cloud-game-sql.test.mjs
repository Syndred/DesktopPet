// Local embedded PostgreSQL only. Identity fixtures and coordinates are explicit
// test inputs; this is not live Auth, physical positioning or cloud concurrency.
import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {generateKeyPairSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {BattleRuntimeService,getBattleRules} from '../../../../../../infra/supabase/functions/_shared/battle-core.js';
import {companionUnit,createCompanionInstance,listBuiltinTemplates,nearbySpawns,applyCloudCommand,emptyGarden} from '../../../../../../infra/supabase/functions/discovery/_generated/runtime.mjs';
import {createDiscoveryStore} from '../../../../../../infra/supabase/functions/discovery/store.mjs';
import {createWildAuthority} from '../../../../../../infra/supabase/functions/discovery/authority.mjs';
import {createDiscoveryHandler} from '../../../../../../infra/supabase/functions/discovery/handler.mjs';
import {awardBattle,createCapture} from '../../../../../../infra/supabase/functions/discovery/domain.mjs';
const require=createRequire(import.meta.url),{checksum}=require('../../accounts/util.cjs');
test('wild writes atomically consume proof and commit protected save, preserving history and replay across devices',async t=>{
  t.mock.method(Math,'random',()=>.5); // Unit-only deterministic NPC, never a product request.
  const db=new PGlite();
  const uid='a0000000-0000-4000-8000-000000000001',sid='b0000000-0000-4000-8000-000000000001',device='c0000000-0000-4000-8000-000000000001';
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to authenticated,service_role;
      create table auth.users(id uuid primary key,is_anonymous boolean not null default false);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
    for(const name of ['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql','20261025024615_lingjing_protected_save_cas.sql','20261025030635_lingjing_discovery_cloud_authority.sql','20261025030639_lingjing_discovery_live_actor_guard.sql','20261025034132_lingjing_discovery_wild_transactions.sql','20261025034136_lingjing_discovery_capture_scenarios.sql','20261025115122_lingjing_global_pet_serials.sql'])await db.exec(readFileSync('infra/supabase/migrations/'+name,'utf8'));
    await db.query('insert into auth.users(id) values($1)',[uid]);await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
    const owner=(await db.query("select public.lingjing_link_auth_user($1,'localgame','Local Game') v",[uid])).rows[0].v.owner_id;
    await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",[JSON.stringify({sub:uid,session_id:sid,role:'authenticated'}),JSON.stringify({'x-lingjing-device-id':device})]);
    await db.query('select public.lingjing_register_device($1)',[device]);
    const actor={authUserId:uid,ownerAccountId:owner,deviceId:device,sessionId:sid},id='d0000000-0000-4000-8000-000000000001';
    const companion=companionUnit(null,owner,Date.now());
    const pet=createCompanionInstance({ownerAccountId:owner,petId:'pet-original-001',template:listBuiltinTemplates().find(p=>p.element==='water'),input:{name:'原伙伴'},source:'adoption',createdAt:new Date().toISOString(),count:0});pet.revision=7;
    companion.tables.companion_pets.push({owner_account_id:owner,pet_id:pet.petId,template_id:pet.templateId,revision:7,data_json:JSON.stringify(pet),created_at:pet.createdAt,updated_at:pet.updatedAt});companion.tables.companion_accounts[0].revision=1;
    const garden=emptyGarden(owner);
    const initialized=applyCloudCommand({ownerAccountId:owner,data:{modules:{garden},tables:{}}},owner,'initialize',{actionId:'unit-garden-init',expectedRevision:0},Date.now(),'d'.repeat(64));
    const schemas=JSON.parse(readFileSync('infra/supabase/functions/discovery/_generated/sqlite-schemas.json','utf8'));
    const discoveryTables=Object.fromEntries(Object.entries(schemas).map(([name,schema])=>[name,{schema,rows:[]} ]));
    const historical={owner_account_id:owner,encounter_id:'encounter-historical-preserved',status:'lost',revision:8,data_json:JSON.stringify({legacy:true,petId:pet.petId}),updated_at:1};discoveryTables.discovery_encounters.rows.push(historical);
    await db.query("select public.lingjing_commit_authority($1,'unit-trusted-source-001',$2)",[owner,{companions:{module:{version:1,data:companion},petIds:[pet.petId]},garden:{module:initialized.envelope.data.modules.garden},discovery:{tables:discoveryTables}}]);
    const location=async(op,input,who=actor)=>(await db.query('select public.lingjing_discovery_location($1::jsonb,$2,$3::jsonb) v',[JSON.stringify(who),op,JSON.stringify(input)])).rows[0].v;
    const key=generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey.export({format:'jwk'});await location('register_device',{publicJwk:key,keyFingerprint:'a'.repeat(64)});
    const unitSpawn=nearbySpawns({lat:31.2,lng:121.4},Date.now()).find(value=>value.element==='fire');
    const nonce=await location('issue_nonce',{purpose:'begin',reference:unitSpawn.id});
    const proof=await location('accept_nonce',{challengeId:nonce.id,signatureHash:'a'.repeat(64),fix:{...unitSpawn.position,accuracyMeters:5,timestampMs:Date.now(),source:'os',provider:'windows-geolocator',positionSource:'WiFi',coordinateSystem:'wgs84'}});
    const engine=new BattleRuntimeService(),session={id:'battle-cloud-'+id,mode:'wild',status:'active',player:pet,enemy:{petId:unitSpawn.id,templateId:unitSpawn.templateId,element:'fire'},snapshot:engine.reset({playerElement:'water',enemyElement:'fire'}),rules:getBattleRules(),rounds:[],winner:null,revision:1,context:{origin:'discovery',cloudAuthority:'discovery',permitId:id}};
    const operation={id,actionId:'begin-game-0001',requestHash:'a'.repeat(64),petId:pet.petId,expectedPetRevision:7,locationProofId:proof.id,spawn:unitSpawn,session};
    const write=async(op,data,rev,fragments={})=>(await db.query('select public.lingjing_discovery_game_write($1::jsonb,$2,$3::jsonb,$4,$5::jsonb) v',[JSON.stringify(actor),op,JSON.stringify(data),rev,JSON.stringify(fragments)])).rows[0].v;
    const head=async()=>(await db.query('select revision,envelope from public.lingjing_saves where owner_id=$1',[owner])).rows[0];
    await db.exec('set role service_role');
    await assert.rejects(write('reserve',operation,0),/LJ_SYNC_CONFLICT/);
    assert.equal((await db.query('select count(*)::int n from lingjing_discovery.permits')).rows[0].n,0);
    assert.equal((await location('read_proof',{proofId:proof.id})).consumedAt,null);
    const permit=await write('reserve',operation,1);assert.equal(permit.id,id);assert.equal((await head()).revision,2);
    assert.deepEqual(await write('reserve',operation,0),permit);
    await assert.rejects(write('reserve',{...operation,requestHash:'b'.repeat(64)},2),/ACTION_ID_CONFLICT/);
    let next=structuredClone(session),round=engine.act('normal_attack');next.snapshot=round.state;next.rounds.push({...round.roundResult,state:round.state});next.revision++;
    const act={actionId:'act-game-0001',requestHash:'b'.repeat(64),permitId:id,expectedRevision:1,expectedRound:1,session:next,status:'active'};
    await assert.rejects(write('advance',act,1),/LJ_SYNC_CONFLICT/);
    assert.equal((await db.query('select revision from lingjing_discovery.permits')).rows[0].revision,1);
    assert.deepEqual(await write('advance',act,2),next);
    await assert.rejects(write('advance',{...act,actionId:'stale-act-0002'},3),/REVISION_CONFLICT/);
    await assert.rejects(write('claim',{actionId:'early-claim-0001',requestHash:'c'.repeat(64),permitId:id,expectedRevision:2},3),/VICTORY_REQUIRED/);
    const cancelled={...next,status:'abandoned',revision:next.revision+1};await write('cancel',{actionId:'cancel-game-001',requestHash:'c'.repeat(64),permitId:id,expectedRevision:2,session:cancelled},3);
    const saved=await head(),rows=saved.envelope.data.tables.discovery_encounters.rows;
    assert.equal(saved.revision,4);assert.equal(rows.length,2);assert.deepEqual(rows.find(r=>r.encounter_id===historical.encounter_id),historical);
    assert.equal(JSON.parse(rows.find(r=>r.encounter_id==='encounter-'+id).data_json).status,'cancelled');
    const{checksum:digest,...body}=saved.envelope;assert.equal(checksum(body),digest);
    assert.deepEqual(saved.envelope.data.modules.companions.data.tables.companion_pets[0].pet_id,pet.petId);
    // The actual server state machine, real02 constructor/growth and05 reducer
    // now exercise the complete SQL store. Only the world boundary is a local
    // stand-in: this test does not claim deployed PostGIS/region ownership.
    await db.exec(`reset role;create function public.runtime_territory_capture_context(text,double precision,double precision,text default null) returns jsonb language sql as $$select '{"territoryId":null,"captureMultiplier":1}'::jsonb$$;
      revoke all on function public.runtime_territory_capture_context(text,double precision,double precision,text) from public,anon,authenticated;
      grant execute on function public.runtime_territory_capture_context(text,double precision,double precision,text) to service_role;set role service_role;`);
    const rpcNames={lingjing_discovery_location:['p_actor','p_op','p_input'],lingjing_discovery_game_read:['p_actor','p_op','p_key'],lingjing_discovery_game_write:['p_actor','p_op','p_operation','p_expected_save_revision','p_fragments'],runtime_territory_capture_context:['p_owner','p_lat','p_lng','p_scenario_id'],lingjing_global_serial_owned:['p_actor','p_expected_revision'],lingjing_global_serial_wild_lookup:['p_actor','p_spawns'],lingjing_global_serial_wild_ensure:['p_actor','p_spawn','p_proof_id']};
    const admin={async rpc(name,args){try{const fields=rpcNames[name];assert.ok(fields);const values=fields.map(key=>typeof args[key]==='object'?JSON.stringify(args[key]):args[key]);const result=await db.query('select public.'+name+'('+fields.map((_,i)=>'$'+(i+1)).join(',')+') v',values);return{data:result.rows[0].v,error:null};}catch(e){return{data:null,error:{message:e.message}};}}};
    const userClient={from(name){assert.equal(name,'lingjing_saves');return{select(){return this;},eq(field,value){assert.equal(field,'owner_id');assert.equal(value,owner);return this;},async maybeSingle(){return{data:await head(),error:null};}};}};
    const verified={...actor,schemaVersion:1,authority:'live',authKind:'supabase',client:userClient};
    const store=createDiscoveryStore(admin,{awardBattle,createCapture}),id2='d0000000-0000-4000-8000-000000000002';
    const authority=createWildAuthority({store,uuid:()=>id2,projectRef:'explicit-local-unit'}),call=input=>authority({actor:verified,input});
    const handler=createDiscoveryHandler({requireActor:async()=>verified,store,authority});
    const http=async input=>{const response=await handler(new Request('https://explicit-local.invalid',{method:'POST',body:JSON.stringify(input)}));const body=await response.json();assert.equal(body.ok,true,JSON.stringify(body));return body.data;};
    const spawn=nearbySpawns({lat:31.2,lng:121.4},Date.now()).find(p=>p.element==='fire');assert.ok(spawn);
    const issue=async(purpose,reference)=>{const n=await location('issue_nonce',{purpose,reference});return location('accept_nonce',{challengeId:n.id,signatureHash:'d'.repeat(64),fix:{...spawn.position,accuracyMeters:5,timestampMs:Date.now(),source:'os',provider:'windows-geolocator',coordinateSystem:'wgs84',positionSource:'WiFi'}});};
    const discoverProof=await issue('discover',''),countRows=async()=>(await db.query('select count(*)::int n from lingjing_private.global_pet_serials')).rows[0].n;
    const beforeNearby=await countRows();await http({op:'nearby',proofId:discoverProof.id});assert.equal(await countRows(),beforeNearby,'nearby never allocates candidate numbers');
    const observed=await http({op:'observe',spawnId:spawn.id,proofId:discoverProof.id});assert.match(observed.globalSerial,/^[1-9][0-9]*$/);assert.equal(observed.ownerAccountId,owner);
    const afterObserve=await countRows();assert.ok(afterObserve>=beforeNearby&&afterObserve<=beforeNearby+1);
    const repeatedObserve=await http({op:'observe',spawnId:spawn.id,proofId:(await issue('discover','')).id});assert.equal(repeatedObserve.globalSerial,observed.globalSerial);assert.equal(await countRows(),afterObserve);
    const beginProof=await issue('begin',spawn.id),begin={op:'reserve',spawnId:spawn.id,petId:pet.petId,proofId:beginProof.id,actionId:'full-game-begin'};
    const reserved=await call(begin);assert.equal(reserved.id,id2);let current=await call({op:'session',permitId:id2});
    for(let n=0;n<80&&current.status==='active';n++)current=await call({op:'act',permitId:id2,actionId:'full-turn-'+n,expectedRound:current.snapshot.round+1,action:current.snapshot.player.anger>=current.rules.ultimateAnger?'ultimate':'normal_attack'});
    assert.equal(current.status,'finished');assert.equal(current.winner,'player');assert.equal(current.reward.applied,true);assert.equal(current.reward.experience,20);
    const wonHead=await head(),beforeCapture=wonHead.revision,captureProof=await issue('capture',id2);
    const counter=async()=>(await db.query('select last_serial::text value from lingjing_private.global_serial_counters where namespace=$1 and template_id=$2',[observed.namespace,spawn.templateId])).rows[0].value;
    const beforeCaptureCounter=await counter();
    // QA grants now permanently scope the whole account. Cross-world capture
    // rejection stays in cloud-authority.test.mjs; account-scope/revocation
    // behavior is covered by08's real SQL tests, using separate QA accounts.
    const confirmation={op:'confirm',permitId:id2,proofId:captureProof.id,name:'云端规范新伙伴',actionId:'full-game-capture'};
    // Failure after domain rows but before save revision must roll back proof,
    // canonical instance/registry, capture receipt and the action receipt.
    await db.exec(`reset role;create function public.unit_fail_discovery_commit() returns trigger language plpgsql as $$begin raise exception 'UNIT_INJECTED_SAVE_FAILURE';end$$;
      create trigger unit_fail_discovery_commit before update on public.lingjing_saves for each row execute function public.unit_fail_discovery_commit();set role service_role;`);
    await assert.rejects(call(confirmation),{code:'DISCOVERY_STORAGE_UNAVAILABLE'});
    assert.equal((await head()).revision,beforeCapture);assert.equal((await location('read_proof',{proofId:captureProof.id})).consumedAt,null);
    assert.equal((await db.query('select count(*)::int n from lingjing_discovery.captures')).rows[0].n,0);
    assert.equal(await counter(),beforeCaptureCounter);
    await db.exec('reset role;drop trigger unit_fail_discovery_commit on public.lingjing_saves;set role service_role');
    const capture=await call(confirmation);assert.equal(capture.petId,'pet-'+id2);assert.deepEqual(await call(confirmation),capture);
    const immutableBefore=await db.query('select (select md5(envelope::text) from public.lingjing_saves where owner_id=$1) save,(select md5(result_json::text) from lingjing_discovery.game_actions where owner_account_id=$1 and action_id=$2) action',[owner,confirmation.actionId]);
    const projectedCapture=await http(confirmation);assert.equal(projectedCapture.globalSerial,observed.globalSerial);assert.equal(projectedCapture.petId,capture.petId);
    assert.equal((await http({op:'session',permitId:id2})).enemy.globalSerial,observed.globalSerial);
    assert.equal((await http({op:'captures'}))[0].globalSerial,observed.globalSerial);
    const projectedAction=await http({op:'action',actionId:confirmation.actionId});assert.equal(projectedAction.result.globalSerial,observed.globalSerial);
    assert.deepEqual(await db.query('select (select md5(envelope::text) from public.lingjing_saves where owner_id=$1) save,(select md5(result_json::text) from lingjing_discovery.game_actions where owner_account_id=$1 and action_id=$2) action',[owner,confirmation.actionId]),immutableBefore);
    assert.equal(capture.globalSerial,undefined);assert.equal(await countRows(),afterObserve,'capture binds the observed wild number instead of allocating a new one');
    assert.equal(await counter(),beforeCaptureCounter,'capture does not increment the species counter again');
    const originalAction=await store.action(verified,confirmation.actionId);
    assert.deepEqual(await store.recordExistingCapture(verified,{actionId:confirmation.actionId,requestHash:originalAction.requestHash,permitId:id2}),capture,'A delayed concurrent confirm sees the same atomic claim receipt');
    const final=await head(),pets=final.envelope.data.modules.companions.data.tables.companion_pets;
    assert.equal(pets.length,2);assert.equal(JSON.parse(pets.find(row=>row.pet_id===pet.petId).data_json).growth.experience,20);
    assert.equal(JSON.parse(pets.find(row=>row.pet_id===capture.petId).data_json).origin.battleId,current.id);
    assert.equal(final.envelope.data.tables.discovery_memory_tags.rows.length,1);assert.equal(final.envelope.data.modules.garden.data.tables.garden_reward_receipts.length,1);
    assert.equal((await db.query('select count(*)::int n from lingjing_private.owned_pet_ids where owner_id=$1',[owner])).rows[0].n,2);
    const sqlite=new(require('better-sqlite3'))(':memory:');
    try{
      require('../migrations.cjs').migrateDiscovery(sqlite);
      for(const[name,expected]of Object.entries(schemas)){
        assert.deepEqual(sqlite.prepare('PRAGMA table_info('+name+')').all().map(({name,type,notnull,pk,dflt_value})=>({name,type,notnull,pk,dflt_value})),expected);
        const columns=expected.map(c=>c.name),insert=sqlite.prepare('INSERT INTO '+name+'('+columns.join(',')+') VALUES('+columns.map(()=>'?').join(',')+')');
        for(const row of final.envelope.data.tables[name].rows)insert.run(...columns.map(c=>row[c]));
      }
      assert.equal(sqlite.prepare('select pet_id from discovery_captures where owner_account_id=?').get(owner).pet_id,capture.petId);
      assert.equal(sqlite.prepare('select count(*) n from discovery_memory_tags where owner_account_id=? and pet_id=?').get(owner,capture.petId).n,1);
    }finally{sqlite.close();}
    for(const role of['anon','authenticated']){await db.exec('reset role;set role '+role);await assert.rejects(write('reserve',operation,4),/permission denied/);await assert.rejects(db.query("select public.lingjing_discovery_game_read($1,'permits',null)",[JSON.stringify(actor)]),/permission denied/);}
  }finally{await db.close();}
});
