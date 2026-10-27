import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
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
  let plays=0;const services={db,get:name=>registry.get(name),provide:(name,value)=>registry.set(name,value),session:{getOwnerAccountId:()=>owner},events:{emit(){},on:()=>()=>{}},legacy:{onlineDuelService:{onEvent:()=>()=>{},useCloudTransport(){}}}};
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
    assert.equal(f.cloud.status(owner).pending,1);
    const pending={...f.db.prepare('select * from garden_cloud_requests').get()};assert.equal(pending.status,'pending');assert.equal(f.garden.snapshot(context).data.items.find(i=>i.id==='carrot').quantity,1);
    f.db.close();f=open(path,invoke);
    assert.equal(f.cloud.status(owner).pending,1);
    const result=await f.cloud.command(context,'feed',input);assert.equal(result.ok,true);assert.equal(f.plays(),1);
    const after={...f.db.prepare('select * from garden_cloud_requests').get()};assert.equal(after.wire_input_json,pending.wire_input_json);assert.equal(after.request_hash,pending.request_hash);assert.equal(after.status,'committed');assert.equal(f.cloud.status(owner).pending,0);
    assert.equal(f.garden.snapshot(context).data.items.find(i=>i.id==='carrot').quantity,0);assert.deepEqual(createCompanionBackupAdapter(f.db).export(owner),envelope.data.modules.companions.data);assert.equal(f.db.prepare('select content from retained_chat').get().content,'原对话保持');
    await f.cloud.command(context,'feed',input);assert.equal(f.plays(),1);assert.equal(receipts.size,1);
    const view=await f.cloud.snapshot(context);assert.equal(view.data.sync.pending,0);assert.equal(view.revision,view.data.revision,'renderer mutation revision uses the public result envelope');
    assert.deepEqual(bodies.filter(b=>b.body.op==='command').map(b=>b.body),[0,1,2].map(()=>({op:'command',command:'feed',input})));
    f.companions.rename(owner,{actionId:'runtime:offline:rename',petId:data.pets[1].petId,name:'离线原名字'});const kept=createCompanionBackupAdapter(f.db).export(owner);
    assert.throws(()=>f.cloud.applyReadback(context,readback(envelope,revision)),{code:'CLOUD_LOCAL_CONFLICT'});assert.deepEqual(createCompanionBackupAdapter(f.db).export(owner),kept);
  }finally{f.db.close();rmSync(dirname(path),{recursive:true,force:true});}
});
