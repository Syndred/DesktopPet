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
import { createAccountsHandler } from '../../../../../infra/supabase/functions/accounts-sync/handler.ts';
const require = createRequire(import.meta.url);
const { GardenService } = require('./service.cjs'); const { createGardenBackupAdapter } = require('./backup.cjs'); const { CloudGardenAuthority } = require('./cloud-authority.cjs');
const { BackupManager } = require('../accounts/backups.cjs');
const { AccountSync } = require('../accounts/sync.cjs');
const { createServices } = require('../../core/services.cjs');
const { ResourcesService } = require('../resources/service.cjs');
const { registerRoster } = require('../resources/roster.cjs');
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
const db = new DatabaseSync(resolve(output,'local.sqlite'));
for(const migration of require('../accounts/schema.cjs').migrations)db.exec(migration.sql);
migrateCompanions(db);
for(const migration of require('../resources/repository.cjs').migrations)db.exec(migration.sql);
const resources=new ResourcesService({db,storageRoot:resolve(output,'resources'),seedBuiltin:false});
await resources.seed();await registerRoster(resources);
function addIdentity(who){db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(who,'runtime',who,who,who,'云端联合验收','2026-10-24','2026-10-24');}
addIdentity(owner);
db.exec('CREATE TABLE test_notes(owner_account_id TEXT PRIMARY KEY,note TEXT)');db.prepare('INSERT INTO test_notes VALUES(?,?)').run(owner,'已有回忆');
const companions = new CompanionsService({db});
const pets = ['鱼丸','小蓝','饭团'].map((name,index)=>companions.adopt(owner,{actionId:`adopt-${index}`,templateId:'big-fish-gentle',name,showOnDesktop:false}).data.pet);
const garden = new GardenService({db,clock:()=>Date.now()-26*60_000});
garden.snapshot({ownerAccountId:owner});
assert.equal(garden.plant({ownerAccountId:owner},{actionId:'historical-rice-plant',expectedRevision:0,plotId:'plot-1',cropType:'rice'}).ok,true);
const backups=new BackupManager({db,directory:resolve(output,'backups'),getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});
backups.register(createGardenBackupAdapter(db));
const envelope=backups.snapshot(owner);
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
    async rpc(name,payload){try{
      let result;
      if(name==='garden_commit_operation')result=await pg.query('SELECT public.garden_commit_operation($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) result',[payload.p_owner,payload.p_session_token,payload.p_action_id,payload.p_request_hash,payload.p_base_revision,JSON.stringify(payload.p_envelope),JSON.stringify(payload.p_result)]);
      else{assert.equal(name,'accounts_push_save');result=await pg.query('SELECT public.accounts_push_save($1,$2,$3,$4,$5::jsonb) result',[payload.p_user_id,payload.p_session_token,payload.p_action_id,payload.p_base_revision,JSON.stringify(payload.p_envelope)]);}
      return {data:result.rows[0].result,error:null};
    }catch(error){return {data:null,error};}}
  };
}
const handler=createGardenHandler(sqlClient);
const accountsHandler=createAccountsHandler(sqlClient);
const dropAfterCommit=new Set();
const server=createServer(async(request,response)=>{
  const chunks=[];for await(const chunk of request)chunks.push(chunk);
  const selected=request.url==='/accounts-sync'?accountsHandler:handler;
  const result=await selected(new Request(`http://127.0.0.1${request.url}`,{method:request.method,headers:request.headers,body:Buffer.concat(chunks)}));
  const actionId=JSON.parse(Buffer.concat(chunks).toString()).input?.actionId;
  if(dropAfterCommit.delete(actionId)){response.destroy();return;}
  response.writeHead(result.status,Object.fromEntries(result.headers));response.end(await result.text());
});
await new Promise(done=>server.listen(0,'127.0.0.1',done)); const url=`http://127.0.0.1:${server.address().port}/garden-sync`;
const invoke=async body=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({userId:owner,sessionToken:token,...body})});return {status:response.status,data:await response.json()};};
const online={supabaseUrl:url,client:{functions:{async invoke(_name,{body}){const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json();return response.ok?{data,error:null}:{data:null,error:{context:{json:async()=>data}}};}}}};
const session={id:owner,ownerAccountId:owner,provider:'runtime',sessionToken:token};
const accountRemote={enabled:true,async cloudSave(op,current,payload={}){
  const response=await fetch(url.replace('/garden-sync','/accounts-sync'),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...payload,op,userId:current.id,sessionToken:current.sessionToken})});const result=await response.json();
  if(!result.ok)throw Object.assign(new Error(result.message),{code:result.code});return result.data;
}};
const sync=new AccountSync({db,backups,remote:accountRemote,getSession:()=>session,getSettings:()=>({document:{sync:{enabled:true}}})});
const firstReadback=await accountRemote.cloudSave('read',session);sync.acceptAuthoritativeReadback(owner,{envelope:firstReadback.envelope,cloudRevision:firstReadback.revision});
const services=createServices({db,legacy:{onlineDuelService:online},paths:{userData:output},windows:{}});
services.session.setAdapter({getCurrentUser:()=>({id:owner})});
services.provide('accounts',{privateSession:()=>session,sync,identity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});
services.provide('resources',resources);
const companionRegistration=require(join(companionRoot,'index.cjs')).register(services);
const playbackEvents=[];services.events.on('companions:action',event=>playbackEvents.push(event));
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
    const concurrentFeeds=await Promise.all([authority.command(context,'feed',feed),authority.command(context,'feed',feed)]);
    assert.ok(concurrentFeeds.every(result=>result.ok));assert.equal((await authority.command(context,'feed',feed)).replayed,true);
    assert.equal(playbackEvents.length,1);assert.equal(playbackEvents[0].ownerAccountId,owner);assert.equal(playbackEvents[0].petId,feed.petId);assert.equal(playbackEvents[0].action,'eat');assert.equal(playbackEvents[0].resourceId,pets[0].resource.resourceId);
    const after=companions.snapshot(owner).data.pets;assert.equal(after.find(p=>p.name==='鱼丸').growth.satiety,80);assert.equal(after.find(p=>p.name==='鱼丸').growth.affinity,4);
    assert.deepEqual(after.filter(p=>p.name!=='鱼丸'),before.filter(p=>p.name!=='鱼丸'));assert.equal(garden.itemCount(owner,'cooked_rice'),0);assert.equal(garden.itemCount(owner,'rice'),1);
    const canonical=(await pg.query('SELECT envelope,revision FROM public.runtime_account_saves WHERE owner_account_id=$1',[owner])).rows[0];
    assert.equal(cloudSnapshot(canonical.envelope,owner,Date.now()).pets.find(p=>p.name==='鱼丸').growth.satiety,80);
    evidence.finalCloud=canonical;evidence.finalLocal={garden:garden.snapshot(context),companions:companions.snapshot(owner)};evidence.checks.push('one food debit + fish only + PostgreSQL and SQLite readback');
    evidence.cloudPlayback={realCompanionProvider:true,realResourceResolution:true,events:playbackEvents.slice(),oneEventAfterExactReplay:true};
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
  await test('first cloud open grants starters once on PostgreSQL and cannot mint a local fallback',async()=>{
    const freshOwner='user-first-cloud-garden',freshToken='fresh-local-qa-session';
    await pg.query('INSERT INTO public.runtime_accounts VALUES ($1,$2)',[freshOwner,freshToken]);
    addIdentity(freshOwner);const fresh=backups.snapshot(freshOwner);
    await pg.query('SELECT public.accounts_push_save($1,$2,$3,$4,$5::jsonb)',[freshOwner,freshToken,'first-empty-save:qa',0,JSON.stringify(fresh)]);
    let activeToken='invalid-session';const providers=new Map();
    const freshServices={...services,get:name=>name==='accounts'?{privateSession:()=>({id:freshOwner,ownerAccountId:freshOwner,provider:'runtime',sessionToken:activeToken})}:providers.get(name),provide:(name,value)=>providers.set(name,value),session:{getCurrentUser:()=>({id:freshOwner}),getOwnerAccountId:()=>freshOwner}};
    const registered=require('./index.cjs').register(freshServices),freshContext={ownerAccountId:freshOwner};
    try{
      const denied=await registered.commands.snapshot(undefined,freshContext);assert.equal(denied.code,'SESSION_INVALIDATED');
      assert.equal(db.prepare('SELECT 1 FROM garden_accounts WHERE owner_account_id=?').get(freshOwner),undefined);
      activeToken=freshToken;
      const simultaneous=await Promise.all([invoke({op:'snapshot',userId:freshOwner,sessionToken:freshToken}),invoke({op:'snapshot',userId:freshOwner,sessionToken:freshToken})]);
      assert.equal(simultaneous.every(result=>result.data.ok),true);
      const result=await registered.commands.snapshot(undefined,freshContext);assert.equal(result.ok,true);assert.equal(result.data.sync.mode,'cloud');
      assert.equal(result.data.plots.length,6);assert.equal(result.data.items.filter(item=>item.category==='seed').reduce((sum,item)=>sum+item.quantity,0),8);
      const receipts=(await pg.query('SELECT COUNT(*) n FROM public.runtime_garden_operations WHERE owner_account_id=$1',[freshOwner])).rows[0];assert.equal(Number(receipts.n),1);
      assert.equal(db.prepare("SELECT COUNT(*) n FROM garden_events WHERE owner_account_id=? AND kind='starter'").get(freshOwner).n,4);
      evidence.checks.push('concurrent first cloud open -> one PostgreSQL starter receipt; rejected session creates no local garden');
    }finally{registered.dispose();}
  });
  await test('an HTTP disconnect after PostgreSQL commit retries the exact craft once',async()=>{
    const before=await authority.snapshot(context),input={actionId:'craft-lost-http-reply',expectedRevision:before.revision,recipeId:'cooked_rice',quantity:1};
    dropAfterCommit.add(input.actionId);
    await assert.rejects(authority.command(context,'craft',input),{code:'GARDEN_CLOUD_UNAVAILABLE'});
    const committed=(await pg.query('SELECT COUNT(*) n FROM public.runtime_garden_operations WHERE owner_account_id=$1 AND action_id=$2',[owner,input.actionId])).rows[0];assert.equal(Number(committed.n),1);
    const retry=await authority.command(context,'craft',input);assert.equal(retry.ok,true);assert.equal(retry.replayed,true);
    assert.equal(garden.itemCount(owner,'rice'),0);assert.equal(garden.itemCount(owner,'cooked_rice'),1);
    const again=await authority.command(context,'craft',input);assert.equal(again.replayed,true);assert.equal(garden.itemCount(owner,'cooked_rice'),1);
    evidence.checks.push('real HTTP socket disconnect after PostgreSQL commit -> exact action replay -> one craft debit and one output after SQLite readback');
  });
  await test('only the service role can read garden receipts or execute settlement RPC',async()=>{
    await pg.exec('ALTER ROLE service_role BYPASSRLS; BEGIN; SET LOCAL ROLE service_role;');
    try {assert.ok((await pg.query('SELECT action_id FROM public.runtime_garden_operations')).rows.length>0);}
    finally {await pg.exec('ROLLBACK');}
    for(const role of ['anon','authenticated']){
      await pg.exec(`BEGIN; SET LOCAL ROLE ${role};`);
      try {await assert.rejects(pg.query('SELECT action_id FROM public.runtime_garden_operations'),/permission denied/);}
      finally {await pg.exec('ROLLBACK');}
      const privilege=(await pg.query("SELECT has_function_privilege($1,'public.garden_commit_operation(text,text,text,text,bigint,jsonb,jsonb)','EXECUTE') allowed",[role])).rows[0];assert.equal(privilege.allowed,false);
    }
    evidence.checks.push('actual SQL roles: service receipt read allowed; anon/authenticated receipt read and settlement execution denied');
  });
  await test('garden readback advances actual accounts CAS before the next full-save HTTP push',async()=>{
    await authority.snapshot(context);
    const cloudBefore=(await pg.query('SELECT revision,envelope FROM public.runtime_account_saves WHERE owner_account_id=$1',[owner])).rows[0],base=Number(cloudBefore.revision);
    assert.equal(sync.status(owner).cloudRevision,base);assert.equal(sync.status(owner).localChanged,false);
    const inventoryBefore=garden.snapshot(context).data.items;
    sync.enqueue(owner,'full-save-after-garden');assert.equal(db.prepare('SELECT base_revision FROM account_sync_outbox WHERE owner_account_id=?').get(owner).base_revision,base);
    const pushed=await sync.flush(owner,true);assert.equal(pushed.verified,true);assert.equal(pushed.revision,base+1);
    assert.equal(sync.status(owner).localChanged,false);await authority.snapshot(context);assert.deepEqual(garden.snapshot(context).data.items,inventoryBefore);
    evidence.accountCoordination={realAccountsHandler:true,realPostgreSql:true,beforeRevision:base,nextFullSaveRevision:pushed.revision,exactInventory:true};
    evidence.checks.push('garden HTTP readback -> actual AccountSync checkpoint -> next full-save HTTP CAS push/readback succeeds with exact inventory');
  });
  await test('unsynced notes stop checkpoint adoption without losing local data or duplicating server inventory',async()=>{
    const before=await authority.snapshot(context),revisionBefore=sync.status(owner).cloudRevision;
    db.prepare('UPDATE test_notes SET note=? WHERE owner_account_id=?').run('离线新回忆',owner);
    const input={actionId:'plant-with-offline-notes',expectedRevision:before.revision,plotId:'plot-2',cropType:'carrot'};
    await assert.rejects(authority.command(context,'plant',input),{code:'CLOUD_APPLY_PENDING'});
    await assert.rejects(authority.command(context,'plant',input),{code:'CLOUD_APPLY_PENDING'});
    assert.equal(db.prepare('SELECT note FROM test_notes WHERE owner_account_id=?').get(owner).note,'离线新回忆');assert.equal(sync.status(owner).cloudRevision,revisionBefore);
    assert.deepEqual(garden.snapshot(context).data.items,before.data.items);assert.equal(garden.snapshot(context).data.plots.find(plot=>plot.plotId==='plot-2').cropType,null);
    const cloud=await invoke({op:'snapshot'});assert.equal(cloud.data.data.snapshot.plots.find(plot=>plot.plotId==='plot-2').cropType,'carrot');
    assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM public.runtime_garden_operations WHERE owner_account_id=$1 AND action_id=$2',[owner,input.actionId])).rows[0].n),1);
    evidence.checks.push('unrelated offline notes preserved; local garden/checkpoint rollback; exact pending action replay never duplicates the committed server plant');
  });
  await test('a pending cloud meal only animates after verified local readback and never on a repeat',async()=>{
    const cloudBefore=(await invoke({op:'snapshot'})).data.data;
    // The lost-reply craft above left one real meal in the canonical save.
    assert.equal(cloudBefore.snapshot.items.find(item=>item.id==='cooked_rice').quantity,1);
    const target=cloudBefore.snapshot.pets.find(pet=>pet.petId===pets[0].petId);
    const input={actionId:'feed-with-pending-readback',expectedRevision:cloudBefore.envelope.data.modules.garden.data.tables.garden_accounts[0].revision,expectedPetRevision:target.revision,petId:target.petId,itemId:'cooked_rice',quantity:1};
    const eventsBefore=playbackEvents.length,stockBefore=garden.snapshot(context).data.items;
    await assert.rejects(authority.command(context,'feed',input),{code:'CLOUD_APPLY_PENDING'});
    await assert.rejects(authority.command(context,'feed',input),{code:'CLOUD_APPLY_PENDING'});
    assert.equal(playbackEvents.length,eventsBefore);assert.deepEqual(garden.snapshot(context).data.items,stockBefore);
    assert.equal(Number((await pg.query('SELECT COUNT(*) n FROM public.runtime_garden_operations WHERE owner_account_id=$1 AND action_id=$2',[owner,input.actionId])).rows[0].n),1);
    // Resolve only the deliberately edited QA note. The original cloud snapshot
    // then matches all other local domains, allowing the public checkpoint gate.
    db.prepare('UPDATE test_notes SET note=? WHERE owner_account_id=?').run('已有回忆',owner);
    const saved=(await pg.query('SELECT envelope FROM public.runtime_account_saves WHERE owner_account_id=$1',[owner])).rows[0].envelope;
    const missing=structuredClone(saved);
    missing.data.modules.garden.data.tables.garden_actions=missing.data.modules.garden.data.tables.garden_actions.filter(row=>row.action_id!==input.actionId);
    const {checksum:ignored,...wrongDocument}=missing;void ignored;missing.checksum=await digest(wrongDocument);
    // Fault injection: a valid-checksum, current-version readback still must
    // carry this exact action receipt before any local state or animation applies.
    await pg.query('UPDATE public.runtime_account_saves SET envelope=$2::jsonb WHERE owner_account_id=$1',[owner,JSON.stringify(missing)]);
    try{await assert.rejects(authority.command(context,'feed',input),{code:'CLOUD_APPLY_PENDING'});assert.equal(playbackEvents.length,eventsBefore);assert.deepEqual(garden.snapshot(context).data.items,stockBefore);}
    finally{await pg.query('UPDATE public.runtime_account_saves SET envelope=$2::jsonb WHERE owner_account_id=$1',[owner,JSON.stringify(saved)]);}
    assert.equal((await authority.command(context,'feed',input)).replayed,true);assert.equal(playbackEvents.length,eventsBefore+1);
    assert.equal((await authority.command(context,'feed',input)).replayed,true);assert.equal(playbackEvents.length,eventsBefore+1);
    assert.equal(companions.requirePet(owner,target.petId).growth.satiety,100);assert.equal(garden.itemCount(owner,'cooked_rice'),0);
    evidence.cloudPlayback.pendingReadback={noActionWhilePending:true,oneServerReceipt:true,matchingReadbackReceiptRequired:true,oneEventAfterVerifiedRetry:true,noEventOnReplay:true};
    evidence.checks.push('actual public playback resolves canonical eat clip once under concurrent feeds; pending readback never animates, verified retry animates once without another debit');
  });
  // Also validate that the pure reducer never alters its input after a failure.
  const original=JSON.stringify(envelope);assert.throws(()=>applyCloudCommand(envelope,owner,'craft',{actionId:'negative',expectedRevision:1,recipeId:'cooked_rice',quantity:-1},Date.now(),'a'.repeat(64)),{code:'INVALID_QUANTITY'});assert.equal(JSON.stringify(envelope),original);
  evidence.finalCloud=(await pg.query('SELECT revision,envelope FROM public.runtime_account_saves WHERE owner_account_id=$1',[owner])).rows[0];
  writeFileSync(resolve(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(`PostgreSQL evidence: ${output}`);
} finally { companionRegistration.dispose();await new Promise(done=>server.close(done));db.close();await pg.close(); }
