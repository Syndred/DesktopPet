import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { applyCloudCommand, cloudSnapshot, digest } from './cloud-domain.mjs';
import { createGardenHandler } from '../../../../../infra/supabase/functions/garden-sync/handler.mjs';
const require = createRequire(import.meta.url);
const { GardenService } = require('./service.cjs'); const { createGardenBackupAdapter } = require('./backup.cjs'); const { CloudGardenAuthority } = require('./cloud-authority.cjs');
const companionRoot = process.env.GARDEN_COMPANIONS_DIR || resolve('apps/pc-app/runtime/features/companions');
const { CompanionsService } = require(join(companionRoot,'service.cjs')); const { migrateCompanions } = require(join(companionRoot,'migrations.cjs'));
const { PGlite } = process.env.GARDEN_PGLITE_MODULE ? await import(pathToFileURL(process.env.GARDEN_PGLITE_MODULE).href) : await import('@electric-sql/pglite');
const output = resolve(`artifacts/garden/postgres/run-${Date.now()}`); mkdirSync(output,{recursive:true});
const pg = new PGlite(resolve(output,'data'));
await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE public.runtime_accounts(id TEXT PRIMARY KEY,session_token TEXT);`);
const accountsMigration = process.env.GARDEN_ACCOUNTS_MIGRATION || resolve('infra/supabase/migrations/20261024_accounts_save_sync.sql');
await pg.exec(readFileSync(accountsMigration,'utf8'));
await pg.exec(readFileSync(resolve('infra/supabase/migrations/20261024_garden_authority.sql'),'utf8'));
const owner = 'user-cloud-garden-qa', token = 'local-postgres-qa-token';
await pg.query('INSERT INTO public.runtime_accounts VALUES ($1,$2)',[owner,token]);
const db = new DatabaseSync(resolve(output,'local.sqlite')); migrateCompanions(db);
const companions = new CompanionsService({db});
const pets = ['鱼丸','小蓝','饭团'].map((name,index)=>companions.adopt(owner,{actionId:`adopt-${index}`,templateId:'big-fish-gentle',name,showOnDesktop:false}).data.pet);
const garden = new GardenService({db,clock:()=>Date.now()-26*60_000});
garden.snapshot({ownerAccountId:owner});
assert.equal(garden.plant({ownerAccountId:owner},{actionId:'historical-rice-plant',expectedRevision:0,plotId:'plot-1',cropType:'rice'}).ok,true);
const tables = Object.fromEntries(['companion_accounts','companion_pets','companion_actions'].map(name=>[name,{rows:db.prepare(`SELECT * FROM ${name} WHERE owner_account_id=?`).all(owner),schema:db.prepare(`PRAGMA table_info(${name})`).all()}]));
const envelope = {format:'lingjing-account-save',version:1,ownerAccountId:owner,identity:{provider:'runtime',subjectId:owner},createdAt:new Date().toISOString(),data:{modules:{garden:{version:1,data:createGardenBackupAdapter(db).export(owner)}},tables},excluded:[]};
envelope.checksum=await digest(envelope);
await pg.query('SELECT public.accounts_push_save($1,$2,$3,$4,$5::jsonb)',[owner,token,'first-save:qa',0,JSON.stringify(envelope)]);
// Thin SQL transport adapter: all state, locks, CAS and transactions execute in
// actual PostgreSQL (PGlite), not Maps or mocked RPC results.
function sqlClient() {
  return {
    from(table) {
      const values=[]; const conditions=[]; let columns='*';
      const builder={select(value){columns=value;return builder;},eq(column,value){conditions.push(`"${column}"=$${values.length+1}`);values.push(value);return builder;},async maybeSingle(){try{const result=await pg.query(`SELECT ${columns} FROM public."${table}" WHERE ${conditions.join(' AND ')} LIMIT 1`,values);return {data:result.rows[0]||null,error:null};}catch(error){return {data:null,error};}}};
      return builder;
    },
    async rpc(name,payload){try{assert.equal(name,'garden_commit_operation');const result=await pg.query('SELECT public.garden_commit_operation($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) result',[payload.p_owner,payload.p_session_token,payload.p_action_id,payload.p_request_hash,payload.p_base_revision,JSON.stringify(payload.p_envelope),JSON.stringify(payload.p_result)]);return {data:result.rows[0].result,error:null};}catch(error){return {data:null,error};}}
  };
}
const handler=createGardenHandler(sqlClient);
const server=createServer(async(request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk);
  const result=await handler(new Request('http://127.0.0.1/garden-sync',{method:request.method,headers:request.headers,body:Buffer.concat(chunks)}));
  response.writeHead(result.status,Object.fromEntries(result.headers));response.end(await result.text());
});
await new Promise(done=>server.listen(0,'127.0.0.1',done)); const url=`http://127.0.0.1:${server.address().port}/garden-sync`;
const invoke=async body=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:owner,sessionToken:token,...body})});return {status:response.status,data:await response.json()};};
const online={supabaseUrl:url,client:{functions:{async invoke(_name,{body}){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();return response.ok?{data,error:null}:{data:null,error:{context:{json:async()=>data}}};}}}};
const services={db,get:name=>name==='accounts'?{privateSession:()=>({id:owner,ownerAccountId:owner,provider:'runtime',sessionToken:token})}:null,session:{getCurrentUser:()=>({id:owner}),getOwnerAccountId:()=>owner},legacy:{onlineDuelService:online},events:{emit(){}}};
const authority=new CloudGardenAuthority(services,garden); const context={ownerAccountId:owner};
const evidence={at:new Date().toISOString(),mode:'local HTTP + real PostgreSQL WASM + SQLite; not a deployed Supabase receipt',checks:[]};
try {
  await test('cloud handler authenticates runtime TEXT IDs and rejects forged ownership',async()=>{
    const denied=await invoke({op:'snapshot',userId:'another-account'});assert.equal(denied.status,401);
    const snapshot=await authority.snapshot(context);assert.equal(snapshot.ok,true);assert.equal(snapshot.data.plots[0].stage,'mature'); evidence.checks.push('verified session and server-time maturity');
  });
  await test('two devices racing one mature plot commit one PostgreSQL inventory credit',async()=>{
    const inputA={actionId:'device-a-harvest',expectedRevision:1,plotIds:['plot-1']};const inputB={...inputA,actionId:'device-b-harvest'};
    const results=await Promise.all([invoke({op:'command',command:'harvest',input:inputA}),invoke({op:'command',command:'harvest',input:inputB})]);
    assert.equal(results.filter(result=>result.data.ok).length,1);assert.equal(results.filter(result=>result.status===409).length,1);
    const winner=results[0].data.ok?inputA:inputB;const repeat=await invoke({op:'command',command:'harvest',input:winner});assert.equal(repeat.data.ok,true);assert.equal(repeat.data.data.replayed,true);
    const cloud=await invoke({op:'snapshot'});assert.equal(cloud.data.data.snapshot.items.find(item=>item.id==='rice').quantity,2);
    await authority.snapshot(context);assert.equal(garden.itemCount(owner,'rice'),2);evidence.checks.push('one credit under concurrent HTTP harvest + exact action replay');
  });
  await test('cloud craft and selected-pet feed update inventory and companion in one canonical save',async()=>{
    const craft={actionId:'cloud-craft-rice',expectedRevision:2,recipeId:'cooked_rice',quantity:1};assert.equal((await authority.command(context,'craft',craft)).ok,true);
    const before=companions.snapshot(owner).data.pets;
    const feed={actionId:'cloud-feed-fish',expectedRevision:3,expectedPetRevision:1,petId:pets[0].petId,itemId:'cooked_rice',quantity:1};
    assert.equal((await authority.command(context,'feed',feed)).ok,true);assert.equal((await authority.command(context,'feed',feed)).replayed,true);
    const after=companions.snapshot(owner).data.pets;assert.equal(after.find(p=>p.name==='鱼丸').growth.satiety,80);assert.equal(after.find(p=>p.name==='鱼丸').growth.affinity,4);
    assert.deepEqual(after.filter(p=>p.name!=='鱼丸'),before.filter(p=>p.name!=='鱼丸'));assert.equal(garden.itemCount(owner,'cooked_rice'),0);assert.equal(garden.itemCount(owner,'rice'),1);
    const canonical=(await pg.query('SELECT envelope,revision FROM public.runtime_account_saves WHERE owner_account_id=$1',[owner])).rows[0];
    assert.equal(cloudSnapshot(canonical.envelope,owner,Date.now()).pets.find(p=>p.name==='鱼丸').growth.satiety,80);
    evidence.finalCloud=canonical;evidence.finalLocal={garden:garden.snapshot(context),companions:companions.snapshot(owner)};evidence.checks.push('one food debit + fish only + PostgreSQL and SQLite readback');
  });
  await test('PostgreSQL rejects reused actions, stale account CAS and partial failed writes',async()=>{
    const reused=await invoke({op:'command',command:'craft',input:{actionId:'cloud-craft-rice',expectedRevision:4,recipeId:'cooked_rice',quantity:2}});assert.equal(reused.data.code,'ACTION_ID_REUSED');
    const saved=(await pg.query('SELECT envelope,revision FROM public.runtime_account_saves WHERE owner_account_id=$1',[owner])).rows[0];
    await assert.rejects(pg.query('SELECT garden_commit_operation($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)',[owner,token,'stale-account-action','a'.repeat(64),0,JSON.stringify(saved.envelope),JSON.stringify({ok:true})]),/SYNC_CONFLICT/);
    const failed=await invoke({op:'command',command:'craft',input:{actionId:'overspend',expectedRevision:4,recipeId:'cooked_rice',quantity:99}});assert.equal(failed.data.code,'INSUFFICIENT_ITEMS');
    assert.equal((await pg.query('SELECT revision FROM public.runtime_account_saves WHERE owner_account_id=$1',[owner])).rows[0].revision,saved.revision);evidence.checks.push('immutable action hash + account CAS + failed debit leaves cloud state unchanged');
  });
  await test('cloud seeds require a real server receipt row and cannot be claimed twice',async()=>{
    await pg.exec('CREATE TABLE public.runtime_battle_settlements(owner_account_id TEXT,room_id UUID,pet_id TEXT,won BOOLEAN,experience INTEGER);');
    const receiptId=crypto.randomUUID();
    const denied=await invoke({op:'claimReward',source:'battle',receiptId});assert.equal(denied.data.code,'UNVERIFIED_REWARD');
    await pg.query('INSERT INTO public.runtime_battle_settlements VALUES ($1,$2,$3,true,20)',[owner,receiptId,pets[0].petId]);
    const before=(await invoke({op:'snapshot'})).data.data.snapshot.items.filter(item=>item.category==='seed').reduce((sum,item)=>sum+item.quantity,0);
    const claims=await Promise.all([invoke({op:'claimReward',source:'battle',receiptId}),invoke({op:'claimReward',source:'battle',receiptId})]);assert.equal(claims.every(result=>result.data.ok),true);
    const after=(await invoke({op:'snapshot'})).data.data.snapshot.items.filter(item=>item.category==='seed').reduce((sum,item)=>sum+item.quantity,0);assert.equal(after-before,2);
    assert.equal((await invoke({op:'claimReward',source:'battle',receiptId})).data.data.alreadyClaimed,true);evidence.checks.push('server-owned reward row + concurrent receipt deduplication');
  });
  // Also validate that the pure reducer never alters its input after a failure.
  const original=JSON.stringify(envelope);assert.throws(()=>applyCloudCommand(envelope,owner,'craft',{actionId:'negative',expectedRevision:1,recipeId:'cooked_rice',quantity:-1},Date.now(),'a'.repeat(64)),{code:'INVALID_QUANTITY'});assert.equal(JSON.stringify(envelope),original);
  writeFileSync(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(`PostgreSQL evidence: ${output}`);
} finally { await new Promise(done=>server.close(done));db.close();await pg.close(); }
