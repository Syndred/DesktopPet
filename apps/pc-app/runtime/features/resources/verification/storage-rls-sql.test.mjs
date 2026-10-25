// LOCAL PostgreSQL/WASM fixtures, not real Supabase/JWT/Storage evidence.
import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
const require=createRequire(path.resolve('artifacts/resources/cloud-sql-tools/package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const identityFile='infra/supabase/migrations/20261025020314_lingjing_identity_actor_contract.sql';
// Until integration, consume the committed 08 contract from the shared Git object database.
const identitySql=existsSync(identityFile)?readFileSync(identityFile,'utf8'):execFileSync('git',['show','ee36030ad37614ac321b94ae4ee4169d705f1165:'+identityFile],{encoding:'utf8'});
const uidA='10000000-0000-4000-8000-000000000001',uidB='10000000-0000-4000-8000-000000000002';
const sessionA='20000000-0000-4000-8000-000000000001',sessionA2='20000000-0000-4000-8000-000000000002',sessionB='20000000-0000-4000-8000-000000000003';
const deviceA='30000000-0000-4000-8000-000000000001',deviceA2='30000000-0000-4000-8000-000000000002',deviceB='30000000-0000-4000-8000-000000000003';
const resourceId='40000000-0000-4000-8000-000000000001',sha='a'.repeat(64),objectPath=`${uidA}/${resourceId}/${sha}/manifest.json`;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create schema auth;grant usage on schema auth to authenticated,service_role;
create table auth.users(id uuid primary key,is_anonymous boolean not null default false);
create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
create schema storage;grant usage on schema storage to authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner_id text,unique(bucket_id,name));
create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
grant select,insert,update,delete on storage.objects to authenticated;
alter table storage.objects enable row level security;
create table public.legacy_fixture(id text primary key,data jsonb);insert into public.legacy_fixture values('untouched','{"history":true}');`);
await db.exec(identitySql);
await db.exec(readFileSync('infra/supabase/migrations/20261025021759_lingjing_protected_save_cas.sql','utf8'));
const revocationFile='infra/supabase/migrations/20261025031842_lingjing_session_revocation_ledger.sql';
await db.exec(existsSync(revocationFile)?readFileSync(revocationFile,'utf8'):execFileSync('git',['show','b21410e:'+revocationFile],{encoding:'utf8'}));
const guardFile=process.env.LINGJING_ACTOR_GUARD_SQL||'infra/supabase/migrations/20261025033602_lingjing_transaction_actor_guard.sql';
await db.exec(readFileSync(guardFile,'utf8'));
await db.exec(readFileSync('infra/supabase/migrations/20261025020942_lingjing_private_resource_storage.sql','utf8'));
await db.exec(readFileSync('infra/supabase/migrations/20261025024855_lingjing_verified_resource_authority.sql','utf8'));
await db.query('insert into auth.users(id) values($1),($2)',[uidA,uidB]);
await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5)',[sessionA,uidA,sessionA2,sessionB,uidB]);
async function as(uid,session,device,sql,args=[],role='authenticated'){
  await db.exec(`begin;set local role ${role}`);
  try{await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({sub:uid,session_id:session,role,is_anonymous:false}),JSON.stringify({'x-lingjing-device-id':device})]);const result=await db.query(sql,args);await db.exec('commit');return result.rows;}
  catch(error){await db.exec('rollback');throw error;}
}
const ownerA=(await as(null,null,null,"select public.lingjing_link_auth_user($1,'alice','Alice') actor",[uidA],'service_role'))[0].actor.owner_id;
const ownerB=(await as(null,null,null,"select public.lingjing_link_auth_user($1,'bobby','Bobby') actor",[uidB],'service_role'))[0].actor.owner_id;
await as(uidA,sessionA,deviceA,'select public.lingjing_register_device($1,\'A\')',[deviceA]);
await as(uidA,sessionA2,deviceA2,'select public.lingjing_register_device($1,\'A2\')',[deviceA2]);
await as(uidB,sessionB,deviceB,'select public.lingjing_register_device($1,\'B\')',[deviceB]);
after(()=>db.close());
test('LOCAL SQL: private bucket and immutable index permit same-account separate sessions only',async()=>{
  assert.equal((await db.query("select public from storage.buckets where id='lingjing-resources-v1'")).rows[0].public,false);
  await as(uidA,sessionA,deviceA,"insert into storage.objects(bucket_id,name,owner_id) values('lingjing-resources-v1',$1,$2)",[objectPath,uidA]);
  await as(uidA,sessionA,deviceA,"insert into public.lingjing_resource_packages(auth_user_id,resource_id,owner_account_id,manifest_sha256,content_hash,manifest_path,manifest_bytes,total_bytes,resource_kind) values($1,$2,$3,$4,$4,$5,100,1000,'spritesheet')",[uidA,resourceId,ownerA,sha,objectPath]);
  assert.equal((await as(uidA,sessionA2,deviceA2,'select * from storage.objects')).length,1);
  assert.equal((await as(uidA,sessionA2,deviceA2,'select * from public.lingjing_resource_packages')).length,1);
  assert.equal((await as(uidB,sessionB,deviceB,'select * from storage.objects')).length,0);
  assert.equal((await as(uidB,sessionB,deviceB,'select * from public.lingjing_resource_packages')).length,0);
});
test('LOCAL SQL: spoofed owner/UID/path and oversized index are rejected',async()=>{
  await assert.rejects(as(uidB,sessionB,deviceB,"insert into storage.objects(bucket_id,name,owner_id) values('lingjing-resources-v1',$1,$2)",[objectPath+'x',uidB]),/row-level security/);
  await assert.rejects(as(uidA,sessionA,deviceA,"insert into storage.objects(bucket_id,name,owner_id) values('lingjing-resources-v1',$1,$2)",[objectPath,uidB]),/row-level security|duplicate/);
  await assert.rejects(as(uidA,sessionA,deviceA,"insert into public.lingjing_resource_packages(auth_user_id,resource_id,owner_account_id,manifest_sha256,content_hash,manifest_path,manifest_bytes,total_bytes,resource_kind) values($1,$2,$3,$4,$4,$5,100,1000,'spritesheet')",[uidA,resourceId,ownerB,'b'.repeat(64),`${uidA}/${resourceId}/${'b'.repeat(64)}/manifest.json`]),/row-level security/);
  await assert.rejects(as(uidA,sessionA,deviceA,"insert into public.lingjing_resource_packages(auth_user_id,resource_id,owner_account_id,manifest_sha256,content_hash,manifest_path,manifest_bytes,total_bytes,resource_kind) values($1,$2,$3,$4,$4,$5,1048577,1000,'spritesheet')",[uidA,resourceId,ownerA,'b'.repeat(64),`${uidA}/${resourceId}/${'b'.repeat(64)}/manifest.json`]),/check constraint/);
});
test('LOCAL SQL: anonymous, missing/revoked sessions and wrong device are denied',async()=>{
  await assert.rejects(as(null,null,null,'select * from public.lingjing_resource_packages',[],'anon'),/permission denied/);
  await assert.rejects(as(null,null,null,'select * from storage.objects',[],'anon'),/permission denied/);
  await assert.rejects(as(uidA,'20000000-0000-4000-8000-000000000099',deviceA,'select * from storage.objects'),/LJ_SESSION_REVOKED/);
  await assert.rejects(as(uidA,sessionA,deviceA2,'select * from public.lingjing_resource_packages'),/LJ_DEVICE_SESSION_REQUIRED/);
});
test('LOCAL SQL: immutable objects/index cannot be replaced or deleted through client permissions',async()=>{
  assert.equal((await as(uidA,sessionA,deviceA,"update storage.objects set name=name||'x' returning *")).length,0);
  assert.equal((await as(uidA,sessionA,deviceA,'delete from storage.objects returning *')).length,0);
  await assert.rejects(as(uidA,sessionA,deviceA,'update public.lingjing_resource_packages set manifest_bytes=20'),/permission denied/);
  await assert.rejects(as(uidA,sessionA,deviceA,'delete from public.lingjing_resource_packages'),/permission denied/);
});
test('LOCAL SQL: only service-verified receipts can register protected resource references atomically',async()=>{
  await assert.rejects(as(uidA,sessionA,deviceA,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6)',[ownerA,uidA,resourceId,sha,deviceA,sessionA]),/permission denied/);
  const receipt=(await as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6) receipt',[ownerA,uidA,resourceId,sha,deviceA,sessionA],'service_role'))[0].receipt;
  assert.equal(receipt.revision,1);assert.equal(receipt.duplicate,false);
  const replay=(await as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6) receipt',[ownerA,uidA,resourceId,sha,deviceA,sessionA],'service_role'))[0].receipt;
  assert.equal(replay.revision,1);assert.equal(replay.duplicate,true);
  const head=(await db.query('select revision,envelope from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0];
  assert.equal(head.revision,1);assert.equal(head.envelope.data.modules['character-resources'].version,2);assert.equal(head.envelope.data.modules['character-resources'].data.references[0].resourceId,resourceId);
  assert.equal((await as(uidA,sessionA2,deviceA2,'select * from public.lingjing_resource_references')).length,1);
  assert.equal((await as(uidB,sessionB,deviceB,'select * from public.lingjing_resource_references')).length,0);
  await assert.rejects(as(uidA,sessionA,deviceA,'delete from public.lingjing_resource_references'),/permission denied/);
});
test('LOCAL SQL: personal CAS cannot invent a private resource reference; a failed ledger write rolls back the save too',async()=>{
  const head=(await db.query('select envelope from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0].envelope;
  const forged=structuredClone(head);delete forged.checksum;forged.data.modules['character-resources'].data.references[0].resourceId='40000000-0000-4000-8000-000000000099';
  const sealed=(await db.query('select lingjing_private.seal_save($1::jsonb) envelope',[JSON.stringify(forged)])).rows[0].envelope;
  await assert.rejects(as(uidA,sessionA,deviceA,'select public.lingjing_push_save($1,1,$2::jsonb)',['forged-resource-action',JSON.stringify(sealed)]),/LJ_PROTECTED_STATE_REQUIRES_AUTHORITY/);
  const id='40000000-0000-4000-8000-000000000002',digest='b'.repeat(64),target=`${uidA}/${id}/${digest}/manifest.json`;
  await as(uidA,sessionA,deviceA,"insert into public.lingjing_resource_packages(auth_user_id,resource_id,owner_account_id,manifest_sha256,content_hash,manifest_path,manifest_bytes,total_bytes,resource_kind) values($1,$2,$3,$4,$4,$5,100,1000,'spritesheet')",[uidA,id,ownerA,digest,target]);
  await db.exec("create function public.fixture_ref_failure() returns trigger language plpgsql as $$begin raise exception 'fixture ledger failure';end$$; create trigger fixture_ref_failure before insert on public.lingjing_resource_references for each row execute function public.fixture_ref_failure();");
  await assert.rejects(as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6)',[ownerA,uidA,id,digest,deviceA,sessionA],'service_role'),/fixture ledger failure/);
  assert.equal((await db.query('select revision from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0].revision,1);
  assert.equal((await db.query('select * from public.lingjing_resource_references where resource_id=$1',[id])).rows.length,0);
  await db.exec('drop trigger fixture_ref_failure on public.lingjing_resource_references;drop function public.fixture_ref_failure();');
  const committed=(await as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6) receipt',[ownerA,uidA,id,digest,deviceA,sessionA],'service_role'))[0].receipt;
  assert.equal(committed.revision,2);
  const all=(await db.query('select envelope from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0].envelope.data.modules['character-resources'].data.references;assert.equal(all.length,2);
  const replay=(await as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6) receipt',[ownerA,uidA,resourceId,sha,deviceA,sessionA],'service_role'))[0].receipt;assert.equal(replay.revision,1);assert.equal((await db.query('select revision from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0].revision,2);
});
test('LOCAL SQL: privileged registration rechecks real session, expiry, anonymous status and exact device before replay',async()=>{
  const before=(await db.query('select revision,envelope from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0];
  const register=(uid,device,sid)=>as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6)',[ownerA,uid,resourceId,sha,device,sid],'service_role');
  await assert.rejects(register(uidB,deviceA,sessionA),/ACTOR|OWNER|SESSION/);
  await assert.rejects(register(uidA,deviceA2,sessionA),/ACTOR|DEVICE|SESSION/);
  await assert.rejects(register(uidA,deviceA,'20000000-0000-4000-8000-000000000099'),/ACTOR|DEVICE|SESSION/);
  await db.query("update auth.sessions set not_after=now()-interval '1 minute' where id=$1",[sessionA]);
  await assert.rejects(register(uidA,deviceA,sessionA),/ACTOR|SESSION/);
  await db.query('update auth.sessions set not_after=null where id=$1',[sessionA]);
  await db.query('update auth.users set is_anonymous=true where id=$1',[uidA]);
  await assert.rejects(register(uidA,deviceA,sessionA),/LJ_AUTH_INVALID/);
  await db.query('update auth.users set is_anonymous=false where id=$1',[uidA]);
  assert.deepEqual((await db.query('select revision,envelope from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0],before);
});
test('LOCAL SQL: single-device revocation blocks both Storage/index while other same-account device survives',async()=>{
  const before=(await db.query('select revision,envelope from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0];
  const actions=(await db.query('select count(*) n from public.lingjing_save_actions where owner_id=$1',[ownerA])).rows[0].n;
  await as(uidA,sessionA,deviceA,'select public.lingjing_revoke_device($1)',[deviceA]);
  await assert.rejects(as(uidA,sessionA,deviceA,'select * from storage.objects'),/LJ_SESSION_REVOKED|LJ_DEVICE_SESSION_REQUIRED/);
  await assert.rejects(as(uidA,sessionA,deviceA,'select * from public.lingjing_resource_packages'),/LJ_SESSION_REVOKED|LJ_DEVICE_SESSION_REQUIRED/);
  await assert.rejects(as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6)',[ownerA,uidA,resourceId,sha,deviceA,sessionA],'service_role'),/REVOKED|ACTOR|DEVICE|SESSION/);
  assert.equal((await as(uidA,sessionA2,deviceA2,'select * from storage.objects')).length,1);
  await db.query('delete from auth.sessions where id=$1',[sessionA2]);
  await assert.rejects(as(uidA,sessionA2,deviceA2,'select * from storage.objects'),/LJ_SESSION_REVOKED/);
  await assert.rejects(as(null,null,null,'select public.lingjing_register_resource_receipt($1,$2,$3,$4,$5,$6)',[ownerA,uidA,resourceId,sha,deviceA2,sessionA2],'service_role'),/REVOKED|ACTOR|DEVICE|SESSION/);
  assert.deepEqual((await db.query('select revision,envelope from public.lingjing_saves where owner_id=$1',[ownerA])).rows[0],before);
  assert.equal((await db.query('select count(*) n from public.lingjing_save_actions where owner_id=$1',[ownerA])).rows[0].n,actions);
  assert.equal((await db.query('select count(*) n from public.lingjing_resource_references where owner_account_id=$1',[ownerA])).rows[0].n,2);
  assert.deepEqual((await db.query('select data from public.legacy_fixture')).rows,[{data:{history:true}}]);
});
