import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {applyCloudCommand,cloudSnapshot,digest} from '../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
import {beginTerritoryBattle,advanceTerritoryBattle,applyTerritoryCommand,sealEnvelope} from '../../../infra/supabase/functions/territory-sync/domain.mjs';
import {awardBattleResult} from '../../../apps/pc-app/runtime/features/companions/cloud-growth.mjs';
const require=createRequire(import.meta.url),{GardenService}=require('../../../apps/pc-app/runtime/features/garden/service.cjs'),{createGardenBackupAdapter}=require('../../../apps/pc-app/runtime/features/garden/backup.cjs'),{CloudGardenAuthority}=require('../../../apps/pc-app/runtime/features/garden/cloud-authority.cjs');
const {CompanionsService}=require('../../../apps/pc-app/runtime/features/companions/service.cjs'),{migrateCompanions}=require('../../../apps/pc-app/runtime/features/companions/migrations.cjs'),{createCompanionBackupAdapter}=require('../../../apps/pc-app/runtime/features/companions/backup.cjs');
const battleFeature=require('../../../apps/pc-app/runtime/features/battle/index.cjs'),battleMigrations=require('../../../apps/pc-app/runtime/features/battle/migrations.cjs');
const owner='legacy:runtime-bridge',context={ownerAccountId:owner};
function open(path,invoke){
  const db=new DatabaseSync(path);db.exec('PRAGMA journal_mode=WAL');migrateCompanions(db);for(const migration of battleMigrations)db.exec(migration.sql);
  const garden=new GardenService({db}),companions=new CompanionsService({db}),registry=new Map();
  const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:owner,authUserId:'591f7b3d-fefb-443f-bb54-987a48d99da5',deviceId:'a0f012bb-86dd-4970-993b-e51405d71142',sessionId:'927a6c28-1639-4e0a-9a25-333ebc509598',url:'https://jbvrdmrkwpznbrvteive.supabase.co',publishableKey:'sb_publishable_fixture',invoke};
  let plays=0;const services={db,get:name=>registry.get(name),provide:(name,value)=>registry.set(name,value),session:{getOwnerAccountId:()=>owner},events:{emit(){}},legacy:{onlineDuelService:{onEvent:()=>()=>{},useCloudTransport(){}}}};
  registry.set('accounts',{privateSession:()=>({provider:'runtime',authKind:'supabase',ownerAccountId:owner})});registry.set('cloudActor',{requireActor:async()=>actor});registry.set('companions',{playAction:()=>{plays++;}});
  const cloud=new CloudGardenAuthority(services,garden);registry.set('garden',{cloudBattles:{owns:(payload,ctx)=>cloud.ownsBattle(payload,ctx),invoke:(name,payload,ctx)=>cloud.battleCommand(name,payload,ctx)}});
  return {db,garden,companions,registry,services,cloud,plays:()=>plays};
}
async function baseline(f){
  const pets=[0,1].map(i=>f.companions.adopt(owner,{actionId:`fixture:adopt:${i}`,templateId:'big-fish-gentle',name:`原伙伴${i}`,showOnDesktop:false}).data.pet);
  f.garden.snapshot(context);f.db.prepare('insert into garden_items values(?,?,?)').run(owner,'carrot',1);
  f.db.exec('create table retained_chat(owner_account_id text primary key,content text)');f.db.prepare('insert into retained_chat values(?,?)').run(owner,'原对话保持');
  const envelope=await sealEnvelope({format:'lingjing-account-save',version:1,ownerAccountId:owner,identity:{provider:'runtime',subjectId:owner},provenance:{mode:'live'},createdAt:new Date().toISOString(),data:{tables:{},modules:{garden:{version:1,data:createGardenBackupAdapter(f.db).export(owner)},companions:{version:1,data:createCompanionBackupAdapter(f.db).export(owner)}}}});
  return {pets,envelope};
}
const readback=(envelope,revision,extra={})=>({envelope,accountRevision:revision,serverTime:Date.now(),territories:[],territoryChallenges:[],remainingInvasions:2,snapshot:{...cloudSnapshot(envelope,owner,Date.now()),territoryChallenges:[],remainingInvasions:2},...extra});

test('runtime fixture: persisted original request survives SQLite reopen after lost reply, preserving whole companion unit and chat',async()=>{
  const path=join(mkdtempSync(join(tmpdir(),'garden-cloud-bridge-')),'client.sqlite');let f,envelope,revision=1,lost=true;const receipts=new Map(),bodies=[];
  const invoke=async(name,body)=>{
    bodies.push({name,body:structuredClone(body)});assert.ok(!Object.hasOwn(body,'userId')&&!Object.hasOwn(body,'sessionToken'));
    if(body.op==='snapshot')return readback(envelope,revision);
    const {command:kind,input}=body,hash=await digest({kind,input});let receipt=receipts.get(input.actionId);
    if(!receipt){const result=applyCloudCommand(envelope,owner,kind,input,Date.now(),hash);envelope=await sealEnvelope(result.envelope);revision++;receipt={actionId:input.actionId,requestHash:hash,accountRevision:revision,result:result.result,readback:readback(envelope,revision)};receipts.set(input.actionId,receipt);}
    if(lost){lost=false;throw Object.assign(new Error('Injected fixture response loss'),{code:'CLOUD_UNAVAILABLE'});}return {...receipt,replayed:true};
  };
  f=open(path,invoke);const data=await baseline(f);envelope=data.envelope;
  const input={actionId:'runtime:feed:original',sessionOwnerAccountId:owner,expectedRevision:0,petId:data.pets[0].petId,expectedPetRevision:1,itemId:'carrot',quantity:1};
  try{
    await assert.rejects(f.cloud.command(context,'feed',input),{code:'GARDEN_CLOUD_UNAVAILABLE'});
    const pending={...f.db.prepare('select * from garden_cloud_requests').get()};assert.equal(pending.status,'pending');assert.equal(f.garden.snapshot(context).data.items.find(i=>i.id==='carrot').quantity,1);
    f.db.close();f=open(path,invoke);
    const result=await f.cloud.command(context,'feed',input);assert.equal(result.ok,true);assert.equal(f.plays(),1);
    const after={...f.db.prepare('select * from garden_cloud_requests').get()};assert.equal(after.wire_input_json,pending.wire_input_json);assert.equal(after.request_hash,pending.request_hash);assert.equal(after.status,'committed');
    assert.equal(f.garden.snapshot(context).data.items.find(i=>i.id==='carrot').quantity,0);assert.deepEqual(createCompanionBackupAdapter(f.db).export(owner),envelope.data.modules.companions.data);assert.equal(f.db.prepare('select content from retained_chat').get().content,'原对话保持');
    await f.cloud.command(context,'feed',input);assert.equal(f.plays(),1);assert.equal(receipts.size,1);
    assert.deepEqual(bodies.filter(b=>b.body.op==='command').map(b=>b.body),[0,1,2].map(()=>({op:'command',command:'feed',input})));
    f.companions.rename(owner,{actionId:'runtime:offline:rename',petId:data.pets[1].petId,name:'离线原名字'});const kept=createCompanionBackupAdapter(f.db).export(owner);
    assert.throws(()=>f.cloud.applyReadback(context,readback(envelope,revision)),{code:'CLOUD_LOCAL_CONFLICT'});assert.deepEqual(createCompanionBackupAdapter(f.db).export(owner),kept);
  }finally{f.db.close();}
});

test('runtime fixture: existing battle command wrapper routes cloud sessions remotely and only confirmation applies canonical rewards',async()=>{
  let f,envelope,revision=1,battle,challengeStatus='active';const receipts=new Map(),proofs=[];
  const region={id:'qa:bridge:territory:1:2',name:'测试庭院',worldMode:'simulated',scenarioId:'bridge',revision:1,ownerAccountId:null,captureMultiplier:2,boundary:[{lat:1,lng:2},{lat:1.006,lng:2},{lat:1.006,lng:2.006},{lat:1,lng:2.006}]};
  const current=()=>readback(envelope,revision,{session:battle,territory:region,challenge:battle?{battle_json:battle,status:challengeStatus}:null,context:{action:'territory',settled:challengeStatus==='settled',returnTo:'/garden',resultPath:'/garden'}});
  const invoke=async(name,body)=>{
    if(['session','snapshot'].includes(body.op))return current();const {input}=body,kind={challenge:'territoryChallenge',act:'territoryAct',settle:'territorySettle'}[body.op],hash=await digest({kind,input});
    if(receipts.has(input.actionId))return {...receipts.get(input.actionId),replayed:true,readback:current()};
    let response;
    if(body.op==='challenge'){battle=beginTerritoryBattle(owner,envelope,region,input,Date.now());response={ok:true,data:{sessionId:battle.id,territoryId:region.id},battle};}
    if(body.op==='act'){battle=advanceTerritoryBattle(battle,input,Date.now());challengeStatus=battle.status;response={ok:true,data:battle};}
    if(body.op==='settle'){const applied=await applyTerritoryCommand(envelope,owner,kind,input,Date.now(),hash,{battle,region},{awardBattleResult});envelope=applied.envelope;battle=applied.settledBattle;revision++;challengeStatus='settled';response={ok:true,data:applied.result.data,battle};}
    response={...response,actionId:input.actionId,requestHash:hash,readback:current()};receipts.set(input.actionId,response);return response;
  };
  f=open(':memory:',invoke);const data=await baseline(f);envelope=data.envelope;
  f.registry.set('locationProofs',{prove:async(purpose,reference)=>{proofs.push({purpose,reference});return{id:randomUUID()};}});
  const feature=battleFeature.register(f.services);
  try{
    const input={actionId:'runtime:challenge',sessionOwnerAccountId:owner,petId:data.pets[0].petId,territoryId:region.id,expectedTerritoryRevision:1,expectedRevision:0};
    const start=await f.cloud.command(context,'territoryChallenge',input);assert.equal(start.ok,true);assert.equal(proofs[0].purpose,'territory:challenge');assert.equal(proofs[0].reference,region.id);
    const originalSession=structuredClone(battle);
    await f.cloud.command(context,'territoryChallenge',input);assert.equal(proofs.length,1);
    const originalGrowth=JSON.stringify(data.pets.map(p=>p.growth));
    for(let i=0;i<150&&battle.status==='active';i++){
      const response=await feature.commands.act({sessionId:battle.id,actionId:`runtime:act:${i}`,expectedRound:battle.snapshot.round+1,action:battle.snapshot.player.anger>=50?'ultimate':'normal_attack'},context);assert.equal(response.ok,true);assert.equal(response.data.context.authority,'cloud');
    }
    assert.equal(battle.status,'finished');assert.equal(f.db.prepare('select count(*) count from battle_reward_receipts').get().count,0);assert.equal(JSON.stringify(f.companions.snapshot(owner).data.pets.map(p=>p.growth)),originalGrowth);
    assert.equal(f.cloud.cache(context,originalSession,'active').snapshot.round,battle.snapshot.round,'an earlier concurrent read cannot roll back committed server rounds');
    const final=await feature.commands.settleContext({sessionId:battle.id,actionId:'runtime:confirm'},context);assert.equal(final.ok,true);assert.equal(final.data.resultPath,'/garden');assert.equal(proofs.length,battle.winner==='player'?2:1);
    assert.equal(f.db.prepare('select count(*) count from garden_reward_receipts').get().count,1);assert.equal(f.db.prepare('select count(*) count from battle_reward_receipts').get().count,0);
    const updated=JSON.stringify(createCompanionBackupAdapter(f.db).export(owner));await feature.commands.settleContext({sessionId:battle.id,actionId:'runtime:confirm'},context);assert.equal(JSON.stringify(createCompanionBackupAdapter(f.db).export(owner)),updated);
    const view=await feature.commands.context({sessionId:battle.id},context);assert.equal(view.data.settled,true);
  }finally{feature.dispose();f.db.close();}
});
