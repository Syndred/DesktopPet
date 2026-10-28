// LOCAL synthetic identities only. New migration is never sent to a service.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {PGlite} from '@electric-sql/pglite';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{AccountsService}=require('../../apps/pc-app/runtime/features/accounts/service.cjs');
test('proposed metadata-only path preserves HTTP guards and per-event session/device/owner isolation',async()=>{
 const fullPlatform=process.env.DESKTOPPET_LOCAL_NOTIFICATION_CONTRACT==='1';
 let db;if(fullPlatform){assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.RUNNER_OS,'Linux');const path=await import('node:path');assert.ok(path.resolve(process.env.DESKTOPPET_LOCAL_DB_TOOLS).startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep));const {Client,types}=require(path.join(process.env.DESKTOPPET_LOCAL_DB_TOOLS,'node_modules','pg'));types.setTypeParser(20,Number);const client=new Client({host:'127.0.0.1',port:54322,user:'postgres',password:'postgres',database:'postgres',ssl:false,connectionTimeoutMillis:5000});await client.connect();db={query:(...args)=>client.query(...args),exec:sql=>client.query(sql),close:()=>client.end()};}else db=new PGlite();try{
 if(!fullPlatform){
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;grant usage on schema auth to authenticated,service_role;
 create table auth.users(id uuid primary key,is_anonymous boolean not null default false);create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id),not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;`);
 for(const name of ['20261025021620_lingjing_identity_actor_contract.sql','20261025022918_lingjing_auth_bridge.sql','20261025024615_lingjing_protected_save_cas.sql','20261025030859_lingjing_cloud_secret_guard.sql','20261025032327_lingjing_session_revocation_ledger.sql','20261025034106_lingjing_transaction_actor_guard.sql','20261026151314_lingjing_personal_record_authority.sql','20261026152758_lingjing_personal_message_order.sql'])await db.exec(readFileSync('infra/supabase/migrations/'+name,'utf8'));
 const originalGuard=(await db.query("select pg_get_functiondef('lingjing_private.actor_owner()'::regprocedure) d")).rows[0].d;
 await db.exec('alter default privileges in schema public grant all on tables to service_role');
 await db.exec(readFileSync('infra/supabase/migrations/20261028012527_lingjing_account_realtime_notifications.sql','utf8'));
 assert.equal((await db.query("select pg_get_functiondef('lingjing_private.actor_owner()'::regprocedure) d")).rows[0].d,originalGuard);
 }
 const a={uid:'11000000-0000-4000-8000-000000000001',sid:'22000000-0000-4000-8000-000000000001',device:'33000000-0000-4000-8000-000000000001',owner:'local-notification-a'},b={uid:'11000000-0000-4000-8000-000000000002',sid:'22000000-0000-4000-8000-000000000002',device:'33000000-0000-4000-8000-000000000002',owner:'local-notification-b'},a2={...a,sid:'22000000-0000-4000-8000-000000000003',device:'33000000-0000-4000-8000-000000000003'};
 for(const x of [a,b]){await db.query('insert into auth.users(id) values($1)',[x.uid]);await db.query('insert into public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username) values($1,$2,$3,$3,$4)',[x.owner,x.uid,x.owner,'本地测试']);}
 for(const x of [a,b,a2])await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[x.sid,x.uid]);
 async function as(actor,headers,sql,args=[],role='authenticated'){await db.exec(`begin;set local role ${role};`);try{await db.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify(actor?{sub:actor.uid,session_id:actor.sid,role,user_metadata:actor.user_metadata}:{}),headers?JSON.stringify(headers):'']);const out=await db.query(sql,args);await db.exec('commit');return out.rows;}catch(e){await db.exec('rollback');throw e;}}
 const header=x=>({'x-lingjing-device-id':x.device});for(const x of[a,b,a2])await as(x,header(x),'select public.lingjing_register_device($1)',[x.device]);
 await db.query("insert into public.lingjing_personal_records(owner_id,collection,record_id,revision,document) values($1,'conversation_memories','fixture-record',1,'{}')",[a.owner]);
 const select='select * from public.lingjing_account_notifications where owner_id=$1';
 const rows=await as(a,null,select,[a.owner]);assert.equal(rows.length,1);assert.deepEqual(Object.keys(rows[0]).sort(),['domain','owner_id','revision']);assert.equal(rows[0].domain,'records');assert.equal((await as(a2,null,select,[a.owner])).length,1);assert.equal((await as(b,null,select,[a.owner])).length,0);
 await assert.rejects(as(a,null,'select * from public.lingjing_personal_records where owner_id=$1',[a.owner]),/LJ_DEVICE_REQUIRED/);
 assert.equal((await as(a,header(a),'select * from public.lingjing_personal_records where owner_id=$1',[a.owner])).length,1);
 await assert.rejects(as(null,null,select,[a.owner],'anon'),/permission denied/);await assert.rejects(as({...a,sid:undefined},null,select,[a.owner]),/LJ_AUTH_REQUIRED/);
 assert.equal((await as({...b,user_metadata:{ownerAccountId:a.owner,deviceId:a.device}},null,select,[a.owner])).length,0);
 await assert.rejects(as({...a,sid:b.sid},null,select,[a.owner]),/LJ_SESSION_REVOKED/);
 await assert.rejects(as(a,null,"update public.lingjing_account_notifications set revision=99 where owner_id=$1",[a.owner]),/permission denied/);
 await assert.rejects(as(a,null,"insert into public.lingjing_account_notifications values($1,'save',99)",[a.owner]),/permission denied/);
 await assert.rejects(as(a,null,'delete from public.lingjing_account_notifications where owner_id=$1',[a.owner]),/permission denied/);await assert.rejects(as(null,null,'delete from public.lingjing_account_notifications where owner_id=$1',[a.owner],'service_role'),/permission denied/);await assert.rejects(as(null,null,'truncate public.lingjing_account_notifications',[],'service_role'),/permission denied/);
 // Missing/anonymous identities and absent or ambiguous server bindings fail closed.
 await assert.rejects(as({...a,uid:undefined},null,select,[a.owner]),/LJ_AUTH_REQUIRED/);
 await db.query('update auth.users set is_anonymous=true where id=$1',[a.uid]);await assert.rejects(as(a,null,select,[a.owner]),/LJ_SESSION_REVOKED/);await db.query('update auth.users set is_anonymous=false where id=$1',[a.uid]);
 const unbound={...a,sid:'22000000-0000-4000-8000-000000000004'};await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[unbound.sid,unbound.uid]);await assert.rejects(as(unbound,null,select,[a.owner]),/LJ_DEVICE_SESSION_REQUIRED/);
 // Production unique index already forbids ambiguity. Transaction-only corruption
 // injection proves defense in depth; rollback restores the unchanged index/data.
 await db.exec('begin;drop index public.lingjing_devices_session_unique');
 await db.query('update public.lingjing_devices set auth_session_id=$1 where device_id=$2',[a.sid,a2.device]);
 await db.exec('set local role authenticated');await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.uid,session_id:a.sid,role:'authenticated'})]);
 await assert.rejects(db.query(select,[a.owner]),/LJ_DEVICE_SESSION_REQUIRED/);await db.exec('rollback');
 // Actual unchanged authority RPC publishes save invalidations, including the
 // companions/garden fragments used by ordinary domain commits.
 const fragment={companions:{module:{version:1,data:{pets:[{id:'pet'}]}},petIds:['pet']},garden:{module:{version:1,data:{coins:0}}}};
 const saveSql="select public.lingjing_commit_authority($1,'notification-authority-intent',$2) item";
 await as(null,null,saveSql,[a.owner,fragment],'service_role');
 const saveNotice=(await as(a,null,select,[a.owner])).find(x=>x.domain==='save');assert.ok(saveNotice.revision>0);
 await as(null,null,saveSql,[a.owner,fragment],'service_role');assert.deepEqual((await as(a,null,select,[a.owner])).find(x=>x.domain==='save'),saveNotice);
 // A transaction failure cannot leave a notification or a business mutation.
 const beforeRollback=await as(a,null,select,[a.owner]);await db.exec('begin');await db.query('update public.lingjing_saves set revision=revision+1 where owner_id=$1',[a.owner]);await db.exec('rollback');assert.deepEqual(await as(a,null,select,[a.owner]),beforeRollback);
 await assert.rejects(as(a,null,'select * from public.lingjing_saves where owner_id=$1',[a.owner]),/LJ_DEVICE_REQUIRED/);
 // Actual original service-only record RPC creates the notification in its own transaction.
 const doc={owner_account_id:a.owner,pet_id:'pet',id:'memory',content:'local fixture',source:'manual',created_at:1,updated_at:1,revision:1};
 await as(null,null,'select public.lingjing_write_personal_records($1,$2,$3,$4,$5,$6)',[a.owner,a.uid,a.device,a.sid,'notification-original-intent',JSON.stringify([{collection:'conversation_memories',id:'["pet","memory"]',baseRevision:0,document:doc}])],'service_role');
 const after=(await as(a,null,select,[a.owner])).find(x=>x.domain==='records');assert.ok(after.revision>rows[0].revision);
 await as(null,null,'select public.lingjing_write_personal_records($1,$2,$3,$4,$5,$6)',[a.owner,a.uid,a.device,a.sid,'notification-original-intent',JSON.stringify([{collection:'conversation_memories',id:'["pet","memory"]',baseRevision:0,document:doc}])],'service_role');assert.deepEqual((await as(a,null,select,[a.owner])).find(x=>x.domain==='records'),after);
 await db.query("update public.lingjing_accounts set status='locked' where owner_id=$1",[a.owner]);await assert.rejects(as(a,null,select,[a.owner]),/LJ_IDENTITY_REQUIRED/);await db.query("update public.lingjing_accounts set status='active' where owner_id=$1",[a.owner]);
 await db.query('update public.lingjing_devices set revoked_at=now() where owner_id=$1 and device_id=$2',[a.owner,a.device]);await assert.rejects(as(a,null,select,[a.owner]),/LJ_DEVICE_SESSION_REQUIRED/);assert.equal((await as(a2,null,select,[a.owner])).length,2);
 await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[a2.sid]);await assert.rejects(as(a2,null,select,[a.owner]),/LJ_SESSION_REVOKED/);
 await db.query('insert into lingjing_private.revoked_auth_sessions(auth_session_id,auth_user_id,owner_id,device_id,reason) values($1,$2,$3,$4,$5)',[b.sid,b.uid,b.owner,b.device,'explicit-device-revoke']);await assert.rejects(as(b,null,select,[a.owner]),/LJ_SESSION_REVOKED/);
 }finally{await db.close();}
});
test('runtime notification subscription ignores invalid/duplicate/old-session events and clears caches on same-owner relogin',async()=>{
 const subscriptions=[],removed=[];let refreshes=0;
 const client={channel(name){const c={name,on(_type,filter,fn){(c.filters??=[]).push(filter);c.filter=filter;c.callback=fn;return c;},subscribe(){return c;}};subscriptions.push(c);return c;},async removeChannel(c){removed.push(c);return 'ok';}};
 const service=Object.create(AccountsService.prototype);Object.assign(service,{epoch:1,current:{authKind:'supabase',ownerAccountId:'owner-a'},realtimeEnabled:true,requireCloudActor:async()=>({client,deviceId:'fixture-device'}),runAutomaticSync:async()=>{refreshes++;return{verified:true};}});
 await service.watchCloud();const first=subscriptions[0];assert.equal(first.filter.table,'lingjing_account_notifications');assert.deepEqual(first.filters.map(f=>f.event),['INSERT','UPDATE']);
 const event=(owner,domain,revision)=>({new:{owner_id:owner,domain,revision}});
 first.callback(event('owner-b','records',1));first.callback(event('owner-a','unknown',1));first.callback(event('owner-a','records',0));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,0);
 first.callback(event('owner-a','records',2));first.callback(event('owner-a','records',2));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,1);
 first.callback(event('owner-a','records',3));service.epoch++;await service.watchCloud();assert.deepEqual(removed,[first]);first.callback(event('owner-a','records',999));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,1);
 subscriptions[1].callback(event('owner-a','records',2));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,2,'new session uses fresh bounded revision cache');
 let fail=true;service.runAutomaticSync=async()=>{refreshes++;if(fail)throw new Error('local-read-failure');return{verified:true};};
 subscriptions[1].callback(event('owner-a','save',5));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,3);fail=false;
 subscriptions[1].callback(event('owner-a','save',5));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,4,'same revision retried after failed normal read');
 service.runAutomaticSync=async()=>{refreshes++;return{skipped:true};};subscriptions[1].callback(event('owner-a','save',6));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,5);
 service.runAutomaticSync=async()=>{refreshes++;return{verified:true};};subscriptions[1].callback(event('owner-a','save',6));await new Promise(r=>setTimeout(r,230));assert.equal(refreshes,6,'same revision retried after busy normal sync');
 service.stopCloudWatch();assert.equal(service.cloudChannel,null);
});
