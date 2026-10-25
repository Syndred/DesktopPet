import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { canonical, checksum } = createRequire(import.meta.url)('../util.cjs');
const db=new PGlite();
const uidA='10000000-0000-4000-8000-000000000001',uidB='10000000-0000-4000-8000-000000000002';
const sidA='20000000-0000-4000-8000-000000000001',sidA2='20000000-0000-4000-8000-000000000002',sidB='20000000-0000-4000-8000-000000000003';
const deviceA='30000000-0000-4000-8000-000000000001',deviceA2='30000000-0000-4000-8000-000000000002',deviceB='30000000-0000-4000-8000-000000000003';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to authenticated,service_role;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
 create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
for(const file of ['20261025020314_lingjing_identity_actor_contract.sql','20261025021755_lingjing_auth_bridge.sql','20261025021759_lingjing_protected_save_cas.sql'])await db.exec(readFileSync(`infra/supabase/migrations/${file}`,'utf8'));
await db.query('insert into auth.users(id) values($1),($2)',[uidA,uidB]);
await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5)',[sidA,uidA,sidA2,sidB,uidB]);
async function as(uid,sid,device,sql,params=[],role='authenticated'){
 await db.exec(`begin;set local role ${role};`);
 try{
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({sub:uid,session_id:sid,role}),JSON.stringify({'x-lingjing-device-id':device})]);
  const r=await db.query(sql,params);await db.exec('commit');return r.rows;
 }catch(e){await db.exec('rollback');throw e;}
}
const service=(sql,params=[])=>as(null,null,null,sql,params,'service_role');
const ownerA=(await service("select public.lingjing_link_auth_user($1,'alice','Alice') item",[uidA]))[0].item.owner_id;
const ownerB=(await service("select public.lingjing_link_auth_user($1,'bobby','Bobby') item",[uidB]))[0].item.owner_id;
for(const [uid,sid,device] of [[uidA,sidA,deviceA],[uidA,sidA2,deviceA2],[uidB,sidB,deviceB]])await as(uid,sid,device,'select public.lingjing_register_device($1)',[device]);
const seal=body=>({...body,checksum:checksum(body)});
function envelope(owner=ownerA,modules={settings:{version:1,data:{desktop:{size:1},privacy:{location:false}}}},tables={}){
 return seal({format:'lingjing-account-save',version:1,ownerAccountId:owner,identity:{provider:'runtime',subjectId:owner},provenance:{mode:'live'},createdAt:'2026-10-25T00:00:00.000Z',excluded:[],data:{modules,tables}});
}
const push=(action,base,save,sid=sidA,device=deviceA)=>as(uidA,sid,device,'select public.lingjing_push_save($1,$2,$3) item',[action,base,save]).then(r=>r[0].item);
const head=()=>as(uidA,sidA,deviceA,'select * from public.lingjing_saves').then(r=>r[0]);
after(()=>db.close());

test('LOCAL PGlite only: SQL canonical checksum matches actual JS Unicode and finite-number encoding',async()=>{
 const samples=[null,true,false,'quotes"\\\n汉字😀\u2028',{ '\uE000':1,'😀':2,'a':3,'10':4,'2':5 },[0,-0,1e-7,1e-6,1e20,1e21,1e23,1.2345678901234567,Number.MIN_VALUE,Number.MAX_VALUE]];
 let seed=431;for(let i=0;i<300;i++){seed=(seed*1664525+1013904223)>>>0;const buf=createHash('sha256').update(String(seed)).digest();const n=buf.readDoubleLE();if(Number.isFinite(n))samples.push(n);}
 for(const value of samples){const result=(await db.query('select lingjing_private.canonical_json($1::jsonb) value',[JSON.stringify(value)])).rows[0].value;assert.equal(result,canonical(value),`value=${JSON.stringify(value)}`);}
});
test('LOCAL PGlite only: personal CAS/action replay and same-account device conflicts are durable',async()=>{
 const save=envelope();const receipt=await push('personal-action-0001',0,save);assert.equal(receipt.revision,1);assert.equal(receipt.checksum,save.checksum);
 assert.equal((await push('personal-action-0001',0,save)).duplicate,true);
 await assert.rejects(push('personal-action-0001',0,envelope(ownerA,{settings:{version:1,data:{desktop:{size:2},privacy:{}}}})),/LJ_ACTION_ID_REUSED/);
 await assert.rejects(push('device-2-stale-action',0,save,sidA2,deviceA2),/LJ_SYNC_CONFLICT/);
 assert.equal((await head()).revision,1);
 const read=(await as(uidA,sidA2,deviceA2,"select * from public.lingjing_save_actions where action_id='personal-action-0001'"))[0];assert.equal(read.checksum,save.checksum);
});
test('LOCAL PGlite only: arbitrary gameplay writes cannot be promoted by a valid checksum',async()=>{
 for(const data of [{garden:{version:1,data:{coins:999}}},{companions:{version:1,data:{pets:[{id:'stolen'}]}}},{legacy:{version:1,data:{inventory:{coins:999}}}}])await assert.rejects(push('forged-state-'+Object.keys(data)[0],1,envelope(ownerA,data)),/LJ_PROTECTED_STATE_REQUIRES_AUTHORITY/);
 const secret=envelope(ownerA,{settings:{version:1,data:{desktop:{},privacy:{},accessToken:'hidden'}}});await assert.rejects(push('personal-secret-action',1,secret),/LJ_SAVE_CONTAINS_SECRET/);
 const broken=envelope();broken.data.modules.settings.data.desktop.size=99;await assert.rejects(push('broken-checksum-action',1,broken),/LJ_SAVE_CHECKSUM_MISMATCH/);
});
test('LOCAL PGlite only: atomic server fragments share one revision without allowing player RPC access',async()=>{
 await assert.rejects(as(uidA,sidA,deviceA,"select public.lingjing_commit_authority($1,'forged-authority-1',$2)",[ownerA,{garden:{module:{version:1,data:{coins:999}}}}]),/permission denied/);
 const fragments={garden:{module:{version:1,data:{coins:7}},tables:{}},companions:{module:{version:1,data:{pets:[{id:'original-pet-1'}]}},tables:{},petIds:['original-pet-1']}};
 const r=(await service("select public.lingjing_commit_authority($1,'server-garden-action-1',$2,1) item",[ownerA,fragments]))[0].item;assert.equal(r.revision,2);assert.equal(checksum(Object.fromEntries(Object.entries(r.envelope).filter(([k])=>k!=='checksum'))),r.checksum);
 assert.equal(r.envelope.data.modules.settings.data.desktop.size,1);
 assert.equal((await service("select public.lingjing_commit_authority($1,'server-garden-action-1',$2,1) item",[ownerA,fragments]))[0].item.duplicate,true);
 const good=structuredClone(r.envelope);good.data.modules.settings.data.desktop.size=2;const next=seal(Object.fromEntries(Object.entries(good).filter(([k])=>k!=='checksum')));assert.equal((await push('personal-after-server',2,next)).revision,3);
 const bad=structuredClone(next);bad.data.modules.garden.data.coins=888;await assert.rejects(push('override-server-state',3,seal(Object.fromEntries(Object.entries(bad).filter(([k])=>k!=='checksum')))),/LJ_PROTECTED_STATE_REQUIRES_AUTHORITY/);
 const drop=structuredClone(next);delete drop.data.modules.companions;await assert.rejects(push('drop-server-fragment',3,seal(Object.fromEntries(Object.entries(drop).filter(([k])=>k!=='checksum')))),/LJ_PROTECTED_STATE_MISMATCH/);
 const legacyB=(await service("select public.lingjing_commit_authority($1,'original-owner-b-pet',$2) item",[ownerB,{companions:{module:{version:1,data:{pets:[{id:'original-pet-1',name:'B original'}]}},petIds:['original-pet-1','exclusive-owner-b-pet']}}]))[0].item;
 assert.equal(legacyB.envelope.data.modules.companions.data.pets[0].id,'original-pet-1');
 assert.equal((await head()).envelope.data.modules.companions.data.pets[0].id,'original-pet-1');
 const registrations=(await db.query("select owner_id,pet_id from lingjing_private.owned_pet_ids where pet_id='original-pet-1'")).rows;assert.equal(registrations.length,2);
});
test('LOCAL PGlite only: personal pet references, direct writes and cross-account reads are denied',async()=>{
 const current=(await head()).envelope;
 for(const pet of ['original-pet-1','exclusive-owner-b-pet']){
  const copy=structuredClone(current);copy.data.modules.conversations={version:1,data:{ownerAccountId:ownerA,tables:{conversation_messages:[{owner_account_id:ownerA,pet_id:pet,id:'message1'}]}}};const doc=seal(Object.fromEntries(Object.entries(copy).filter(([k])=>k!=='checksum')));
  if(pet==='original-pet-1')assert.equal((await push('owned-chat-pet-action',3,doc)).revision,4);else await assert.rejects(push('foreign-chat-pet-action',4,doc),/LJ_PET_OWNER_MISMATCH/);
 }
 assert.equal((await as(uidB,sidB,deviceB,'select * from public.lingjing_saves where owner_id=$1',[ownerA])).length,0);
 const ownB=(await as(uidB,sidB,deviceB,'select * from public.lingjing_saves'))[0];assert.equal(ownB.envelope.data.modules.companions.data.pets[0].name,'B original');
 await assert.rejects(as(uidA,sidA,deviceA,'select * from lingjing_private.owned_pet_ids'),/permission denied/);
 await assert.rejects(as(uidA,sidA,deviceA,'delete from public.lingjing_saves'),/permission denied/);
 await assert.rejects(as(null,null,null,'select * from public.lingjing_saves',[],'anon'),/permission denied/);
});
test('LOCAL PGlite only: legacy archive retains untrusted local data without changing cloud inventory',async()=>{
 const old=envelope(ownerA,{garden:{version:1,data:{coins:999999}},legacy:{version:1,data:{petId:'historic-pet',inventory:42}}});
 const archive=(await as(uidA,sidA,deviceA,"select public.lingjing_archive_save('archive-original-local','unverified-local',$1) item",[old]))[0].item;assert.equal(archive.promoted,false);
 assert.equal((await head()).envelope.data.modules.garden.data.coins,7);
 const again=(await as(uidA,sidA,deviceA,"select public.lingjing_archive_save('archive-original-local','unverified-local',$1) item",[old]))[0].item;assert.equal(again.id,archive.id);
});
