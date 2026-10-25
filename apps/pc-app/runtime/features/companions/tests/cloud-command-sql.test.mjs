import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import {applyCompanionCommand} from '../cloud-domain.mjs';

// LOCAL PostgreSQL/WASM permission/transaction checks. Auth rows are fixtures;
// these tests do not claim deployed Auth, concurrency or cloud success.
const uids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'];
const sessions=['20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003'];
const devices=['30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003'];
const now=1792897200000,uuid='00000000-0000-4000-8000-000000000099';
async function fixture(){
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to authenticated,service_role;
      create table auth.users(id uuid primary key,is_anonymous boolean not null default false);create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
    for(const name of['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql','20261025024615_lingjing_protected_save_cas.sql','20261025031842_lingjing_companion_commands.sql'])await db.exec(readFileSync('infra/supabase/migrations/'+name,'utf8'));
    await db.query('insert into auth.users(id) values($1),($2)',uids);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5)',[sessions[0],uids[0],sessions[1],sessions[2],uids[1]]);
    async function as(role,sql,params=[],identity){
      await db.exec(`begin;set local role ${role}`);
      try{if(identity)await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({sub:identity.uid,session_id:identity.sid,role}),JSON.stringify({'x-lingjing-device-id':identity.device})]);const result=await db.query(sql,params);await db.exec('commit');return result.rows;}catch(error){await db.exec('rollback');throw error;}
    }
    const service=(sql,params=[])=>as('service_role',sql,params);
    const owners=[];for(const[index,uid]of uids.entries())owners.push((await service('select public.lingjing_link_auth_user($1,$2,$3) item',[uid,'owner'+index,'原账号'+index]))[0].item.owner_id);
    const identities=[{uid:uids[0],sid:sessions[0],device:devices[0]},{uid:uids[0],sid:sessions[1],device:devices[1]},{uid:uids[1],sid:sessions[2],device:devices[2]}],actors=[];
    for(const identity of identities)actors.push((await as('authenticated','select public.lingjing_register_device($1) item',[identity.device],identity))[0].item);
    const commit=(actor,command,input,module,base)=>service('select public.lingjing_commit_companion_command($1,$2,$3,$4,$5) item',[actor,command,input,module,base]).then(rows=>rows[0].item);
    return{db,as,service,owners,actors,identities,commit};
  }catch(error){await db.close();throw error;}
}
const adoptInput={actionId:'cloud-adopt-action-0001',templateId:'big-fish-gentle',name:'原鱼丸',showOnDesktop:false};
test('LOCAL PGlite: controlled adoption registers compound ownership, same-request races replay the original generated pet, stale writes conflict',async()=>{
  const f=await fixture();try{
    const prepared=await applyCompanionCommand(null,f.owners[0],'adopt',adoptInput,now,{uuid:()=>uuid});
    const first=await f.commit(f.actors[0],'adopt',adoptInput,prepared.module,0);assert.equal(first.revision,1);assert.equal(first.result.data.pet.petId,'pet-'+uuid);
    const otherWorker=await applyCompanionCommand(null,f.owners[0],'adopt',adoptInput,now+1,{uuid:()=>crypto.randomUUID()});
    const duplicate=await f.commit(f.actors[1],'adopt',adoptInput,otherWorker.module,0);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.result.data.pet.petId,first.result.data.pet.petId);assert.equal(duplicate.revision,1);
    const changed={...adoptInput,name:'不同内容'};const changedModule=await applyCompanionCommand(null,f.owners[0],'adopt',changed,now,{uuid:()=>uuid});await assert.rejects(()=>f.commit(f.actors[0],'adopt',changed,changedModule.module,0),/LJ_ACTION_ID_REUSED/);
    const stale={...adoptInput,actionId:'cloud-stale-action-0002'},staleModule=await applyCompanionCommand(null,f.owners[0],'adopt',stale,now,{uuid:()=>crypto.randomUUID()});await assert.rejects(()=>f.commit(f.actors[1],'adopt',stale,staleModule.module,0),/LJ_SYNC_CONFLICT/);
    const second=await applyCompanionCommand(null,f.owners[1],'adopt',adoptInput,now,{uuid:()=>uuid});await f.commit(f.actors[2],'adopt',adoptInput,second.module,0);
    assert.equal((await f.db.query('select count(*)::int n from lingjing_private.owned_pet_ids where pet_id=$1',['pet-'+uuid])).rows[0].n,2);
    assert.equal((await f.db.query('select count(*)::int n from public.lingjing_save_actions')).rows[0].n,2);
  }finally{await f.db.close();}
});
test('LOCAL PGlite: ordinary users cannot call the worker or write growth; foreign owner/device/revoked session is rejected without adding Auth table grants',async()=>{
  const f=await fixture();try{
    const prepared=await applyCompanionCommand(null,f.owners[0],'adopt',adoptInput,now,{uuid:()=>uuid});
    const args=[f.actors[0],'adopt',adoptInput,prepared.module,0],sql='select public.lingjing_commit_companion_command($1,$2,$3,$4,$5)';
    await assert.rejects(()=>f.as('authenticated',sql,args,f.identities[0]),/permission denied/);
    await assert.rejects(()=>f.as('anon',sql,args),/permission denied/);
    await assert.rejects(()=>f.commit({...f.actors[0],authUserId:uids[1]},'adopt',adoptInput,prepared.module,0),/LJ_OWNER_MISMATCH/);
    await assert.rejects(()=>f.commit({...f.actors[0],deviceId:devices[2]},'adopt',adoptInput,prepared.module,0),/LJ_DEVICE_SESSION_REQUIRED/);
    await f.as('authenticated','select public.lingjing_revoke_device($1)',[devices[0]],f.identities[0]);
    await assert.rejects(()=>f.commit(f.actors[0],'adopt',adoptInput,prepared.module,0),/LJ_DEVICE_SESSION_REQUIRED/);
    await f.commit(f.actors[1],'adopt',adoptInput,prepared.module,0);
    await assert.rejects(()=>f.service('select * from auth.users'),/permission denied/);
    await f.db.query('delete from auth.sessions where id=$1',[sessions[1]]);
    await assert.rejects(()=>f.commit(f.actors[1],'adopt',adoptInput,prepared.module,0),/LJ_SESSION_REVOKED/);
  }finally{await f.db.close();}
});
test('LOCAL PGlite: later transaction failure rolls back companion, shared save, pet registry and immutable receipt together',async()=>{
  const f=await fixture();try{
    const prepared=await applyCompanionCommand(null,f.owners[0],'adopt',adoptInput,now,{uuid:()=>uuid});
    await f.db.exec('begin;set local role service_role');await f.db.query('select public.lingjing_commit_companion_command($1,$2,$3,$4,$5)',[f.actors[0],'adopt',adoptInput,prepared.module,0]);
    await assert.rejects(()=>f.db.query('select 1/0'),/division by zero/);await f.db.exec('rollback');
    for(const name of['public.lingjing_saves','public.lingjing_save_actions','lingjing_private.owned_pet_ids','lingjing_private.authority_fragments'])assert.equal((await f.db.query('select count(*)::int n from '+name)).rows[0].n,0);
  }finally{await f.db.close();}
});
