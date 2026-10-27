// Test-only loopback adapter: original production handler/RPCs over disposable PostgreSQL.
// No production Auth, keys, server endpoint, clock replacement or synthetic business outcomes.
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import {loadSharedActorGuard} from '../../apps/pc-app/runtime/features/battle/tests/shared-actor-sql.mjs';
const require=createRequire(import.meta.url);
const tables={lingjing_accounts:['owner_id','auth_user_id','account','account_key','username','status'],lingjing_battle_commands:['actor_auth_uid','action_id','owner_account_id','operation','input_json','result_json'],lingjing_battle_invites:['*','id','to_auth_uid'],lingjing_battle_members:['room_id','active'],lingjing_battle_rooms:['*','id','room_code','status','host_auth_uid','guest_auth_uid','invited_auth_uid'],lingjing_battle_rounds:['*','room_id','round_no']};
const allowedOps=new Set(['search_accounts','list_duel_requests','send_duel_request','cancel_duel_request','respond_duel_request','create_room','get_active_room']);
const safeCodes=new Set(['INVITE_CONFLICT','INVITE_EXPIRED','INVITE_FORBIDDEN','ACTION_ID_REUSED','INVALID_COMMAND','SELF_DUEL_FORBIDDEN','INVITE_ALREADY_RECEIVED','BATTLE_CLOUD_UNAVAILABLE','AUTH_REQUIRED','OWNER_MISMATCH','QA_BOUNDARY_REJECTED']);
export async function startInvitationSqlBridge({runId,token,directory}){
 assert.match(runId,/^[a-f0-9-]{36}$/);assert.ok(typeof token==='string'&&token.length>=32);
 const bundle=await build({entryPoints:[resolve('infra/supabase/functions/lingjing-battle/runtime.generated.mjs')],bundle:true,write:false,format:'esm',platform:'node',target:'node24',alias:{'npm:@supabase/supabase-js@2.98.0':require.resolve('@supabase/supabase-js')},logLevel:'silent'});
 const bundleFile=join(directory,'original-handler.mjs');writeFileSync(bundleFile,bundle.outputFiles[0].contents,{flag:'wx'});
 const {createBattleHandler}=await import(pathToFileURL(bundleFile).href),db=new PGlite(),actors=new Map(),events=[];
 let tail=Promise.resolve();const serial=fn=>{const p=tail.then(fn);tail=p.catch(()=>{});return p;};
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated,service_role;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,is_anonymous boolean NOT NULL DEFAULT false);
 CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid NOT NULL REFERENCES auth.users(id),not_after timestamptz);
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
 CREATE SCHEMA realtime; GRANT USAGE ON SCHEMA realtime TO authenticated,service_role;
 CREATE TABLE realtime.messages(topic text,extension text); ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;GRANT SELECT ON realtime.messages TO authenticated;
 CREATE FUNCTION realtime.topic() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_setting('request.topic',true)$$;`);
 const guardMigration=await loadSharedActorGuard(db);
 for(const name of ['20261025034744_lingjing_battle_jwt_rooms.sql','20261026080525_lingjing_battle_invite_expiry.sql'])await db.exec(readFileSync(resolve('infra/supabase/migrations',name),'utf8'));
 async function query(role,sql,args=[],actor){return serial(async()=>{await db.exec(`BEGIN; SET LOCAL ROLE ${role}`);try{await db.query("SELECT set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify(actor?{sub:actor.authUserId,session_id:actor.sessionId,role:'authenticated'}:{}),JSON.stringify(actor?{'x-lingjing-device-id':actor.deviceId}:{})]);const result=await db.query(sql,args);await db.exec('COMMIT');return result.rows;}catch(e){await db.exec('ROLLBACK');throw e;}});}
 function client(role,actor){return{from(table){assert.ok(Object.hasOwn(tables,table),'UNSUPPORTED_QUERY_TABLE');let columns='*',conditions=[],values=[],sort='',limit='',single=false;
 const column=c=>{assert.ok(tables[table].includes(c)&&c!=='*','UNSUPPORTED_QUERY_COLUMN');return '"'+c+'"';};
 const chain={select(text){const list=text.split(',');assert.ok(list.length&&list.every(c=>c==='*'?text==='*':tables[table].includes(c)));columns=text==='*'?'*':list.map(column).join(',');return chain;},eq(c,v){conditions.push(`${column(c)} = $${values.push(v)}`);return chain;},neq(c,v){conditions.push(`${column(c)} <> $${values.push(v)}`);return chain;},ilike(c,v){conditions.push(`${column(c)} ILIKE $${values.push(v)}`);return chain;},in(c,vs){assert.ok(Array.isArray(vs)&&vs.length>0&&vs.length<=40);conditions.push(`${column(c)} IN (${vs.map(v=>'$'+values.push(v)).join(',')})`);return chain;},order(c,o={}){sort=` ORDER BY ${column(c)} ${o.ascending===false?'DESC':'ASC'}`;return chain;},limit(n){assert.ok(Number.isSafeInteger(n)&&n>0&&n<=50);limit=` LIMIT ${n}`;return chain;},maybeSingle(){single=true;return chain;},then(ok,bad){return query(role,`SELECT ${columns} FROM public."${table}"${conditions.length?' WHERE '+conditions.join(' AND '):''}${sort}${limit}`,values,actor).then(rows=>{if(single&&rows.length>1)throw Error('NON_UNIQUE_QUERY');return{data:single?rows[0]||null:rows,error:null};}).catch(e=>({data:null,error:{message:e.message}})).then(ok,bad);}};return chain;},async rpc(name,input){
 const specs={lingjing_battle_command:['p_actor','p_owner','p_device','p_session','p_op','p_action_id','p_input'],lingjing_battle_list_invites:['p_actor','p_owner','p_device','p_session']};
 assert.ok(Object.hasOwn(specs,name),'UNSUPPORTED_RPC');const keys=specs[name];assert.deepEqual(Object.keys(input).sort(),[...keys].sort());
 const bound=[...actors.values()].find(a=>a.authUserId===input.p_actor);assert.ok(bound&&bound.ownerAccountId===input.p_owner&&bound.deviceId===input.p_device&&bound.sessionId===input.p_session,'RPC_ACTOR_MISMATCH');
 try{const rows=await query('service_role',`SELECT public.${name}(${keys.map((k,i)=>'$'+(i+1)+(k==='p_input'?'::jsonb':'')).join(',')}) value`,keys.map(k=>k==='p_input'?JSON.stringify(input[k]):input[k]),bound);return{data:rows[0].value,error:null};}catch(e){return{data:null,error:{message:e.message}};}
 }};}
 const admin=client('service_role');
 const handler=createBattleHandler({admin,resolvePet:async(actor,id)=>{const found=actors.get(actor.ownerAccountId)?.pets.get(id);assert.ok(found,'UNREGISTERED_TEST_PET');return found;},settle:async()=>{throw Error('OUT_OF_SCOPE');},training:async()=>{throw Error('OUT_OF_SCOPE');}});
 async function registerActor({owner,account,username,pet}){
 assert.ok(owner.startsWith(`qa:${runId}:`)&&!actors.has(owner)&&actors.size<2);assert.match(account,/^[A-Za-z0-9_]{3,32}$/);assert.ok(pet?.petId&&pet.ownerAccountId===owner);
 const actor={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:randomUUID(),ownerAccountId:owner,deviceId:randomUUID(),sessionId:randomUUID(),account,username,pets:new Map([[pet.petId,{ownerId:owner,petId:pet.petId,resourceId:pet.appearance2d,name:pet.petName,element:pet.element}]])};
 await serial(async()=>{await db.query('INSERT INTO auth.users(id) VALUES($1)',[actor.authUserId]);await db.query('INSERT INTO auth.sessions(id,user_id) VALUES($1,$2)',[actor.sessionId,actor.authUserId]);await db.query('INSERT INTO public.lingjing_accounts(owner_id,auth_user_id,account_key,account,username) VALUES($1,$2,$3,$4,$5)',[owner,actor.authUserId,account.toLowerCase(),account,username]);});
 await query('authenticated',"SELECT public.lingjing_register_device($1,'isolated invitation QA')",[actor.deviceId],actor);actor.client=client('authenticated',actor);actors.set(owner,actor);
 }
 async function dispatch(body){
 const actor=actors.get(body.userId);assert.ok(actor&&body.sessionToken===`qa:${runId}:${actor.ownerAccountId}`&&body.userAccount===actor.account&&body.username===actor.username,'QA_IDENTITY_REJECTED');assert.ok(allowedOps.has(body.op),'QA_OP_REJECTED');
 if(body.op==='create_room')assert.ok(typeof body.requestId==='string','NO_UNRELATED_ROOMS');
 const {userId,sessionToken,userAccount,username,...input}=body;
 const event={op:input.op,owner:actor.ownerAccountId,actionId:input.actionId||null,requestId:input.requestId||null,observedAt:Date.now()};events.push(event);
 try{const response=await handler(new Request('http://127.0.0.1/owned-test',{method:'POST',body:JSON.stringify(input)}),actor),result=await response.json();event.status=response.status;event.code='OK';return{status:response.status,value:result};}catch(e){event.code=safeCodes.has(e.code)?e.code:'QA_BOUNDARY_REJECTED';event.status=Number.isInteger(e.status)?e.status:400;return{status:event.status,value:{ok:false,code:event.code,message:event.code}};}
 }
 const server=createServer(async(req,res)=>{try{assert.equal(req.method,'POST');assert.equal(req.url,'/invitation');assert.equal(req.headers['x-qa-run'],runId);const supplied=Buffer.from(String(req.headers['x-qa-token']||'')),expected=Buffer.from(token);assert.ok(supplied.length===expected.length&&timingSafeEqual(supplied,expected));let size=0,chunks=[];for await(const c of req){size+=c.length;assert.ok(size<=16384);chunks.push(c);}const result=await dispatch(JSON.parse(Buffer.concat(chunks).toString('utf8')));res.writeHead(result.status,{'content-type':'application/json','cache-control':'no-store'});// Official QA transport expects the same unwrapped data as production OnlineDuelService.invoke.
 res.end(JSON.stringify(result.value.ok===true?{...result.value.data,ok:true}:result.value));}catch{res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({ok:false,code:'QA_BOUNDARY_REJECTED'}));}});
 await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok);});
 const sourceFiles=['infra/supabase/functions/lingjing-battle/runtime.generated.mjs','infra/supabase/functions/_shared/lingjing-auth.ts',...['20261025021620_lingjing_identity_actor_contract.sql','20261025024615_lingjing_protected_save_cas.sql','20261025032327_lingjing_session_revocation_ledger.sql',guardMigration,'20261025034744_lingjing_battle_jwt_rooms.sql','20261026080525_lingjing_battle_invite_expiry.sql'].map(n=>'infra/supabase/migrations/'+n)];
 const source=sourceFiles.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
 return{source,endpoint:`http://127.0.0.1:${server.address().port}/invitation`,registerActor,events,
 async inspect(){return serial(async()=>({clock: (await db.query('SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint now')).rows[0].now,invitations:(await db.query('SELECT * FROM public.lingjing_battle_invites ORDER BY created_at,id')).rows,counts:(await db.query('SELECT (SELECT count(*)::int FROM public.lingjing_battle_rooms) rooms,(SELECT count(*)::int FROM public.lingjing_battle_rounds) rounds,(SELECT count(*)::int FROM public.lingjing_battle_settlements) settlements')).rows[0],commands:(await db.query('SELECT operation,action_id,input_json,result_json FROM public.lingjing_battle_commands ORDER BY created_at,action_id')).rows}));},
 async close(){await new Promise((ok,bad)=>server.close(e=>e?bad(e):ok()));await tail;await db.close();}};
}
