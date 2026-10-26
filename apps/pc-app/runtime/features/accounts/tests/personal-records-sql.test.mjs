import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { validateRecord,validateChanges,recordId } from '../../conversations/cloud-record-contract.mjs';
const db=new PGlite();
const uid='11000000-0000-4000-8000-000000000001',sid='22000000-0000-4000-8000-000000000001',device='33000000-0000-4000-8000-000000000001';
const uidB='11000000-0000-4000-8000-000000000002',sidB='22000000-0000-4000-8000-000000000002',deviceB='33000000-0000-4000-8000-000000000002';
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;grant usage on schema auth to authenticated,service_role;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
 create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
for(const name of ['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql',
 '20261025024615_lingjing_protected_save_cas.sql','20261025030859_lingjing_cloud_secret_guard.sql',
 '20261025032327_lingjing_session_revocation_ledger.sql','20261025034106_lingjing_transaction_actor_guard.sql',
 '20261026151314_lingjing_personal_record_authority.sql','20261026152758_lingjing_personal_message_order.sql'])await db.exec(readFileSync(`infra/supabase/migrations/${name}`,'utf8'));
async function as(role,actor,sql,params=[]){
 await db.exec(`begin;set local role ${role};`);
 try{
  await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({sub:actor?.uid,session_id:actor?.sid,role}),JSON.stringify({'x-lingjing-device-id':actor?.device})]);
  const result=await db.query(sql,params);await db.exec('commit');return result.rows;
 }catch(error){await db.exec('rollback');throw error;}
}
const admin=(sql,params=[])=>as('service_role',null,sql,params);
await db.query('insert into auth.users(id) values($1),($2)',[uid,uidB]);
await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)',[sid,uid,sidB,uidB]);
const owner=(await admin("select public.lingjing_link_auth_user($1,'recordalice','记录甲') item",[uid]))[0].item.owner_id;
const other=(await admin("select public.lingjing_link_auth_user($1,'recordbobby','记录乙') item",[uidB]))[0].item.owner_id;
await as('authenticated',{uid,sid,device},'select public.lingjing_register_device($1)',[device]);
await as('authenticated',{uid:uidB,sid:sidB,device:deviceB},'select public.lingjing_register_device($1)',[deviceB]);
const profile=pet=>({owner_account_id:owner,pet_id:pet,persona:'原人设',reply_style:'natural',memory_enabled:1,pause_while_chatting:1,use_override:0,revision:1,updated_at:123});
const initial=[profile('original-pet-a'),profile('original-pet-b')];
const fragments={companions:{module:{version:1,data:{pets:[{id:'original-pet-a'},{id:'original-pet-b'}]}},petIds:['original-pet-a','original-pet-b']}};
const head=(await admin("select public.lingjing_commit_authority($1,'original-record-pets',$2) item",[owner,fragments]))[0].item;
const {createRequire}=await import('node:module');const {checksum}=createRequire(import.meta.url)('../util.cjs');
const body=structuredClone(head.envelope);delete body.checksum;
body.data.modules.conversations={version:1,data:{ownerAccountId:owner,tables:{conversation_profiles:initial,conversation_connections:[],conversation_messages:[],conversation_memories:[],conversation_preferences:[]}}};
const original={...body,checksum:checksum(body)};
await as('authenticated',{uid,sid,device},'select public.lingjing_push_save($1,$2,$3) item',['initial-personal-archive',head.revision,original]);
const read=(after=0,limit=500)=>admin('select public.lingjing_read_personal_records($1,$2,$3,$4,$5,$6) item',[owner,uid,device,sid,after,limit]).then(rows=>rows[0].item);
const write=(action,changes)=>admin('select public.lingjing_write_personal_records($1,$2,$3,$4,$5,$6) item',[owner,uid,device,sid,action,changes]).then(rows=>rows[0].item);
const change=(doc,baseRevision)=>({collection:'conversation_profiles',id:recordId('conversation_profiles',doc),baseRevision,document:doc});
after(()=>db.close());

test('LOCAL PostgreSQL fixture: first record read imports cloud IDs and data while keeping old full-save history',async()=>{
 const result=await read();assert.equal(result.records.length,2);assert.deepEqual(result.records.map(row=>row.document),initial);
 assert.equal(result.records[0].revision,1);assert.equal(result.ownerAccountId,owner);
 assert.equal((await db.query('select envelope from public.lingjing_saves where owner_id=$1',[owner])).rows[0].envelope.checksum,original.checksum);
 assert.equal((await db.query('select count(*) count from public.lingjing_save_actions where owner_id=$1',[owner])).rows[0].count,2);
 await assert.rejects(as('authenticated',{uid,sid,device},'select public.lingjing_push_save($1,$2,$3)',['stale-complete-upload',2,original]),/LJ_RECORD_API_REQUIRED/);
});
test('LOCAL PostgreSQL fixture: independent personal records have independent revisions and do not change gameplay head',async()=>{
 const a={...initial[0],persona:'甲的新内容',revision:2},b={...initial[1],persona:'乙的新内容',revision:2};
 assert.equal((await write('record-change-a',[change(a,1)])).records[0].revision,2);
 assert.equal((await write('record-change-b',[change(b,1)])).records[0].revision,2);
 await assert.rejects(write('record-stale-a',[change({...a,persona:'旧基线修改'},1)]),/LJ_RECORD_CONFLICT/);
 assert.equal((await db.query('select revision from public.lingjing_saves where owner_id=$1',[owner])).rows[0].revision,2,'personal edits do not create unrelated gameplay conflicts');
 const repeated=await write('record-change-a',[change(a,1)]);assert.equal(repeated.duplicate,true);assert.equal(repeated.records[0].revision,2);
 await assert.rejects(write('record-change-a',[change({...a,persona:'换了内容'},1)]),/LJ_ACTION_ID_REUSED/);
});
test('LOCAL PostgreSQL fixture: a stale record rolls back its whole small operation, then another record can still save',async()=>{
 await assert.rejects(write('record-atomic-conflict',[change({...initial[0],persona:'不应落盘'},2),change({...initial[1],persona:'旧版本'},1)]),/LJ_RECORD_CONFLICT/);
 assert.equal((await read()).records.find(row=>row.document.pet_id==='original-pet-a').document.persona,'甲的新内容');
 assert.equal((await write('record-next-a',[change({...initial[0],persona:'可以继续',revision:3},2)])).records[0].revision,3);
});
test('LOCAL PostgreSQL fixture: deletes are durable tombstones, replay once, and appear in paged changes',async()=>{
 const before=await read(),target=before.records.find(row=>row.document.pet_id==='original-pet-b');
 const changes=[{collection:target.collection,id:target.id,baseRevision:target.revision,document:null}];
 const deleted=await write('record-delete-b',changes);assert.equal(deleted.records[0].deleted,true);
 assert.equal((await write('record-delete-b',changes)).duplicate,true);
 const delta=await read(before.cursor,1);assert.equal(delta.records.length,1);assert.equal(delta.records[0].deleted,true);assert.equal(delta.hasMore,false);
 assert.equal(delta.records[0].document.persona,'乙的新内容','deleted original content remains in the owner history');
});
test('LOCAL PostgreSQL fixture: message pairs keep their IDs, order and unique turn identity across updates',async()=>{
 const message={owner_account_id:owner,pet_id:'original-pet-a',action_id:'original-chat-turn',role:'user',content:'问题',status:'complete',error_code:null,provider:null,model:null,attempt:1,created_at:10,updated_at:10};
 const user={...message,id:'original-user-message'},assistant={...message,id:'original-assistant-message',role:'assistant',content:'',status:'pending'};
 const changes=[user,assistant].map(document=>({collection:'conversation_messages',id:recordId('conversation_messages',document),baseRevision:0,document}));
 validateChanges(owner,changes);const result=await write('record-chat-pair',changes);assert.ok(result.records[0].position<result.records[1].position);
 const finish={...changes[1],baseRevision:1,document:{...assistant,content:'回复',status:'complete',updated_at:11}};
 assert.equal((await write('record-chat-finish',[finish])).records[0].revision,2);assert.equal((await write('record-chat-finish',[finish])).duplicate,true);
 const duplicate={...assistant,id:'another-assistant-id'};
 await assert.rejects(write('record-forged-turn',[{...changes[1],id:recordId('conversation_messages',duplicate),document:duplicate}]),/LJ_RECORD_ID_REUSED/);
 const rebound={...assistant,pet_id:'original-pet-b'};
 await assert.rejects(write('record-forged-rebind',[{...changes[1],baseRevision:2,document:rebound}]),/LJ_RECORD_ID_REUSED/);
});
test('LOCAL PostgreSQL fixture: an imported message prefix precedes its known anchor and replay never inserts twice',async()=>{
 const before=await read(),anchor=before.records.find(row=>row.document.id==='original-user-message');
 const document={...anchor.document,id:'earlier-original-message',action_id:'earlier-original-turn',content:'原来的前缀',created_at:1,updated_at:1};
 const changes=[{collection:'conversation_messages',id:recordId('conversation_messages',document),baseRevision:0,document,beforeId:anchor.id}];
 validateChanges(owner,changes);const result=await write('record-historical-prefix',changes);
 assert.equal((await write('record-historical-prefix',changes)).duplicate,true);
 const delta=await read(before.cursor),current=await read(),messages=current.records.filter(row=>row.collection==='conversation_messages'&&!row.deleted).sort((a,b)=>a.position-b.position);
 assert.deepEqual(messages.map(row=>row.document.id),['earlier-original-message','original-user-message','original-assistant-message']);
 assert.equal(delta.records.find(row=>row.id===anchor.id).revision,anchor.revision,'order metadata does not fabricate a content edit');
 assert.ok(delta.records.some(row=>row.id===anchor.id),'other devices receive the shifted anchor');
 assert.equal(messages[0].document.created_at,1);assert.equal(result.records[0].revision,1);
 const bad={...document,id:'invalid-ordered-message',action_id:'invalid-ordered-turn'};
 await assert.rejects(write('record-missing-order-anchor',[{...changes[0],id:recordId('conversation_messages',bad),document:bad,beforeId:'["not-an-anchor"]'}]),/LJ_RECORD_CONFLICT/);
});

test('LOCAL PostgreSQL fixture: other owners, stale sessions, public RPC callers and direct writes are rejected',async()=>{
 await assert.rejects(admin('select public.lingjing_read_personal_records($1,$2,$3,$4)',[owner,uidB,deviceB,sidB]),/LJ_OWNER_MISMATCH/);
 await assert.rejects(write('forged-other-pet',[change({...initial[0],pet_id:'not-owned'},0)]),/LJ_PET_OWNER_MISMATCH/);
 await assert.rejects(as('authenticated',{uid,sid,device},'select public.lingjing_read_personal_records($1,$2,$3,$4)',[owner,uid,device,sid]),/permission denied/);
 await assert.rejects(as('authenticated',{uid,sid,device},'delete from public.lingjing_personal_records where owner_id=$1',[owner]),/permission denied/);
 assert.equal((await as('authenticated',{uid:uidB,sid:sidB,device:deviceB},'select * from public.lingjing_personal_records')).length,0);
 await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[sid]);
 await assert.rejects(read(),/LJ_SESSION_REVOKED/);
 assert.equal((await db.query('select count(*) count from public.lingjing_personal_record_accounts where owner_id=$1',[other])).rows[0].count,0);
});
test('shared worker contract rejects credential fields, forged owners and duplicate record edits',()=>{
 const doc=initial[0],id=recordId('conversation_profiles',doc);assert.equal(validateRecord(owner,'conversation_profiles',id,doc),doc);
 assert.throws(()=>validateRecord(owner,'conversation_profiles',id,{...doc,encrypted_key:'must-not-leave-device'}),{code:'RECORD_INVALID'});
 assert.throws(()=>validateRecord('other','conversation_profiles',id,doc),{code:'RECORD_INVALID'});
 assert.throws(()=>validateChanges(owner,[change(doc,1),change(doc,1)]),{code:'RECORD_INVALID'});
});
