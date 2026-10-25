import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {createGardenService} from '../../../infra/supabase/functions/garden-sync/handler.mjs';
import {applyCloudCommand,digest} from '../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
import {sealEnvelope} from '../../../infra/supabase/functions/territory-sync/domain.mjs';
const require=createRequire(import.meta.url),{CompanionsService}=require('../../../apps/pc-app/runtime/features/companions/service.cjs'),{migrateCompanions}=require('../../../apps/pc-app/runtime/features/companions/migrations.cjs');

// Local PostgreSQL execution of the REAL08 identity/CAS and05 non-spatial
// commit. Auth platform fixtures below do not verify live Auth/JWT. PostGIS is
// neither replaced nor simulated; its separate live acceptance stays required.
async function setup(){
  const db=new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,is_anonymous boolean);
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
    create function auth.uid() returns uuid language sql as $$select (auth.jwt()->>'sub')::uuid$$;
    grant usage on schema auth to authenticated,service_role;grant execute on all functions in schema auth to authenticated,service_role;`);
  await db.exec(await readFile('infra/supabase/migrations/20261025020314_lingjing_identity_actor_contract.sql','utf8'));
  await db.exec(await readFile('infra/supabase/migrations/20261025021759_lingjing_protected_save_cas.sql','utf8'));
  const sql=await readFile('infra/supabase/migrations/20261025024617_lingjing_territory_authority.sql','utf8');
  assert.ok(!/entry level|runtime_account_saves|runtime_accounts/.test(sql));
  await db.exec(sql.slice(sql.indexOf('create or replace function public.runtime_territory_check_actor'),sql.indexOf('create or replace function public.runtime_territory_read')));
  const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:'legacy:cas-check',authUserId:randomUUID(),deviceId:randomUUID(),sessionId:randomUUID()};
  await db.query('insert into auth.users(id,is_anonymous) values($1,false)',[actor.authUserId]);
  await db.query('insert into public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username) values($1,$2,$3,$3,$4)',[actor.ownerAccountId,actor.authUserId,'cascheck','菜园核验']);
  await db.query('insert into public.lingjing_devices(owner_id,device_id,auth_session_id) values($1,$2,$3)',[actor.ownerAccountId,actor.deviceId,actor.sessionId]);
  await db.exec('set role service_role');
  const from=table=>{
    assert.ok(['lingjing_saves','lingjing_garden_operations'].includes(table));const filters=[];
    const query={select(){return query;},eq(key,value){assert.ok(['owner_id','owner_account_id','action_id'].includes(key));filters.push([key,value]);return query;},async maybeSingle(){try{
      const result=await db.query(`select * from public.${table} where ${filters.map(([key],i)=>`${key}=$${i+1}`).join(' and ')}`,filters.map(([,value])=>value));return {data:result.rows[0]||null,error:null};
    }catch(error){return {error};}}};return query;
  };
  const worker={from,async rpc(name,p){assert.equal(name,'runtime_garden_commit_authoritative');try{
    const {rows}=await db.query('select public.runtime_garden_commit_authoritative($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[p.p_owner,p.p_actor_uid,p.p_device_id,p.p_actor_session,p.p_action_id,p.p_request_hash,p.p_base_revision,p.p_envelope,p.p_result]);return {data:rows[0].result};
  }catch(error){return {error};}}};
  return {db,actor,worker,service:createGardenService({actor,worker})};
}

test('real unified CAS: bootstrap, canonical planting, lost-response replay, stale revision and forbidden role',async()=>{
  const f=await setup();try{
    const initial=await f.service.handle({op:'snapshot'});assert.equal(initial.accountRevision,1);assert.equal(initial.snapshot.plots.length,6);assert.equal(initial.snapshot.items.find(item=>item.id==='seed:carrot').quantity,2);
    const body={op:'command',command:'plant',input:{actionId:'cas:plant:one',expectedRevision:1,plotId:'plot-1',cropType:'carrot'}};
    const planted=await f.service.handle(body);assert.equal(planted.accountRevision,2);assert.equal(planted.readback.snapshot.items.find(item=>item.id==='seed:carrot').quantity,1);
    const repeated=await f.service.handle(body);assert.equal(repeated.replayed,true);assert.equal(repeated.accountRevision,2);assert.deepEqual(repeated.readback.envelope,planted.readback.envelope);
    await assert.rejects(f.service.handle({...body,input:{...body.input,plotId:'plot-2'}}),{code:'ACTION_ID_REUSED'});
    await assert.rejects(f.service.handle({...body,input:{...body.input,actionId:'cas:plant:stale',plotId:'plot-2'}}),{code:'REVISION_CONFLICT'});
    const before=planted.readback.envelope;
    const input={actionId:'cas:bad:unrelated',expectedRevision:2,plotId:'plot-2',cropType:'carrot'},hash=await digest({kind:'plant',input});
    const changed=applyCloudCommand(before,f.actor.ownerAccountId,'plant',input,Date.now(),hash);changed.envelope.data.modules.settings={version:1,data:{desktop:{changed:true},privacy:{}}};await sealEnvelope(changed.envelope);
    const denied=await f.worker.rpc('runtime_garden_commit_authoritative',{p_owner:f.actor.ownerAccountId,p_actor_uid:f.actor.authUserId,p_device_id:f.actor.deviceId,p_actor_session:f.actor.sessionId,p_action_id:input.actionId,p_request_hash:hash,p_base_revision:2,p_envelope:changed.envelope,p_result:changed.result});assert.match(denied.error.message,/UNRELATED_SAVE_CHANGED/);
    assert.deepEqual((await f.service.handle({op:'snapshot'})).envelope,before);
    await f.db.exec('set role authenticated');
    await assert.rejects(f.db.query('select public.runtime_garden_commit_authoritative(null,null,null,null,null,null,null,null,null)'),/permission denied/);
  }finally{await f.db.close();}
});

test('unified CAS atomically changes existing food and one02 companion, preserving unrelated protected modules',async()=>{
  const f=await setup(),local=new DatabaseSync(':memory:');try{
    const initial=await f.service.handle({op:'snapshot'});migrateCompanions(local);
    const companions=new CompanionsService({db:local}),owner=f.actor.ownerAccountId;
    const pets=[0,1].map(i=>companions.adopt(owner,{actionId:`cas:adopt:${i}`,templateId:'big-fish-gentle',name:`伙伴${i}`,showOnDesktop:false}).data.pet);
    const names=['companion_accounts','companion_pets','companion_actions','companion_legacy_archive','companion_interactions','companion_capture_receipts'];
    const unit={version:1,data:{ownerAccountId:owner,identityImports:[],tables:Object.fromEntries(names.map(name=>[name,local.prepare(`select * from ${name} where owner_account_id=?`).all(owner)]))}};
    const garden=structuredClone(initial.envelope.data.modules.garden);garden.data.tables.garden_items.push({owner_account_id:owner,item_id:'carrot',quantity:1});
    // Trusted02/catalog fixture, not a garden admission or client import path.
    const fragments=JSON.parse(JSON.stringify({companions:{module:unit,petIds:pets.map(p=>p.petId)},garden:{module:garden},resources:{module:{version:1,data:{retainedHistory:['original-resource']}}}}));
    await f.db.query('select lingjing_private.commit_authority($1,$2,$3,$4)',[owner,'fixture:canonical-pets',fragments,1]);
    const before=await f.service.handle({op:'snapshot'}),other=before.envelope.data.modules.companions.data.tables.companion_pets.find(row=>row.pet_id===pets[1].petId);
    const input={actionId:'cas:feed:canonical',expectedRevision:before.snapshot.revision,petId:pets[0].petId,expectedPetRevision:pets[0].revision,itemId:'carrot',quantity:1};
    const fed=await f.service.handle({op:'command',command:'feed',input});
    assert.equal(fed.accountRevision,before.accountRevision+1);assert.equal(fed.readback.snapshot.items.find(row=>row.id==='carrot').quantity,0);
    assert.equal(fed.readback.snapshot.pets.find(p=>p.petId===pets[0].petId).revision,pets[0].revision+1);
    assert.deepEqual(fed.readback.envelope.data.modules.resources,before.envelope.data.modules.resources);
    assert.deepEqual(fed.readback.envelope.data.modules.companions.data.tables.companion_pets.find(row=>row.pet_id===pets[1].petId),other);
    const repeated=await f.service.handle({op:'command',command:'feed',input});assert.equal(repeated.replayed,true);assert.equal(repeated.accountRevision,fed.accountRevision);
    const registry=await f.db.query('select pet_id from lingjing_private.owned_pet_ids where owner_id=$1',[owner]);assert.equal(registry.rows.length,2);
  }finally{local.close();await f.db.close();}
});

test('actor is rechecked inside commit, and actor rejection rolls back before economy',async()=>{
  const f=await setup();try{
    const initial=await f.service.handle({op:'snapshot'});
    await f.db.query('update public.lingjing_devices set revoked_at=now() where owner_id=$1',[f.actor.ownerAccountId]);
    await assert.rejects(f.service.handle({op:'command',command:'plant',input:{actionId:'cas:revoked',expectedRevision:initial.snapshot.revision,plotId:'plot-1',cropType:'carrot'}}),{code:'ACTOR_OWNER_MISMATCH'});
    const {rows}=await f.db.query('select revision,envelope from public.lingjing_saves where owner_id=$1',[f.actor.ownerAccountId]);assert.equal(rows[0].revision,initial.accountRevision);assert.deepEqual(rows[0].envelope,initial.envelope);
  }finally{await f.db.close();}
});
