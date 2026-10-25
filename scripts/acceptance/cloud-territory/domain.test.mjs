import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import * as generated from '../../../infra/supabase/functions/_shared/battle-core.js';
import {digest,cloudSnapshot,cloudCompanions,applyCloudCommand} from '../../../apps/pc-app/runtime/features/garden/cloud-domain.mjs';
import {beginTerritoryBattle,advanceTerritoryBattle,ownedPet,applyTerritoryCommand,sealEnvelope} from '../../../infra/supabase/functions/territory-sync/domain.mjs';
import {createTerritoryService} from '../../../infra/supabase/functions/territory-sync/handler.mjs';
import {awardBattleResult} from '../../../apps/pc-app/runtime/features/companions/cloud-growth.mjs';
const require=createRequire(import.meta.url),canonical=require('../../../apps/pc-app/runtime/services/battle-runtime.cjs');
const {GardenService}=require('../../../apps/pc-app/runtime/features/garden/service.cjs');
const {createGardenBackupAdapter}=require('../../../apps/pc-app/runtime/features/garden/backup.cjs');
const {CompanionsService}=require('../../../apps/pc-app/runtime/features/companions/service.cjs');
const {migrateCompanions}=require('../../../apps/pc-app/runtime/features/companions/migrations.cjs');
const owner='legacy:territory-owner',other='legacy:another-owner',now=Date.now();
export async function fixture(moduleFormat=false,ownerId=owner){
  const owner=ownerId;
  const db=new DatabaseSync(':memory:');migrateCompanions(db);const companions=new CompanionsService({db});
  const pets=['alpha','beta'].map((name,index)=>companions.adopt(owner,{actionId:`adopt:${index}`,templateId:index?'animal-hat-cat':'big-fish-gentle',name,showOnDesktop:false}).data.pet);
  const garden=new GardenService({db});garden.snapshot({ownerAccountId:owner});
  const data={tables:{},modules:{garden:{version:1,data:createGardenBackupAdapter(db).export(owner)}}};
  const tables=Object.fromEntries(['companion_accounts','companion_pets','companion_actions','companion_legacy_archive','companion_interactions','companion_capture_receipts'].map(name=>[name,db.prepare(`SELECT * FROM ${name} WHERE owner_account_id=?`).all(owner)]));
  if(moduleFormat)data.modules.companions={version:1,data:{ownerAccountId:owner,tables,identityImports:[]}};
  else for(const [name,rows]of Object.entries(tables))data.tables[name]={schema:db.prepare(`PRAGMA table_info(${name})`).all(),rows};
  const envelope=await sealEnvelope(JSON.parse(JSON.stringify({format:'lingjing-account-save',version:1,ownerAccountId:owner,identity:{provider:'runtime',subjectId:owner},provenance:{mode:'live'},createdAt:new Date(now).toISOString(),data})));
  return {db,pets,envelope};
}
test('shared source matches the desktop distribution hash and all25 ordered pairs and16 action pairs',()=>{
  const hash=createHash('sha256').update(readFileSync('infra/supabase/functions/_shared/battle-core.js','utf8').replaceAll('\r\n','\n')).digest('hex');
  assert.ok(readFileSync('apps/pc-app/runtime/features/battle/core.generated.cjs','utf8').includes(`SHA256: ${hash}`));
  assert.deepEqual(generated.getBattleRules(),canonical.getBattleRules());
  let cases=0;for(const player of ['metal','wood','water','fire','earth'])for(const enemy of ['metal','wood','water','fire','earth'])for(const pa of ['normal_attack','element_attack','dodge','ultimate'])for(const ea of ['normal_attack','element_attack','dodge','ultimate']){
    const a=canonical.createSession(player,enemy),b=generated.createSession(player,enemy);a.player.anger=a.enemy.anger=b.player.anger=b.enemy.anger=100;
    assert.deepEqual(generated.executeRound(b,pa,ea),canonical.executeRound(a,pa,ea));assert.deepEqual(b,a);cases++;
  }assert.equal(cases,400);
});
test('territory sessions bind the actual pet and canonical wood guardian; resume/act keeps original identity',async()=>{
  const f=await fixture();try{
    const region={id:'territory:1:2',revision:1,ownerAccountId:null,captureMultiplier:2};
    const battle=beginTerritoryBattle(owner,f.envelope,region,{petId:f.pets[0].petId},now,'stable-test');
    assert.equal(battle.player.petId,f.pets[0].petId);assert.equal(battle.enemy.resource.resourceId,'builtin:lingjing-qingya-v1');assert.equal(battle.enemy.element,'wood');assert.equal(battle.context.authority,'cloud');
    const next=advanceTerritoryBattle(battle,{action:'normal_attack',expectedRound:1},now+1);
    assert.equal(next.snapshot.round,1);assert.equal(battle.snapshot.round,0);assert.deepEqual(next.player,battle.player);assert.deepEqual(next.context,battle.context);
    assert.throws(()=>advanceTerritoryBattle(next,{action:'element_attack',expectedRound:1},now+2),{code:'ROUND_CONFLICT'});
    assert.throws(()=>advanceTerritoryBattle(next,{action:'grant_win',expectedRound:2},now+2),{code:'INVALID_ACTION'});
    assert.throws(()=>ownedPet(f.envelope,other,f.pets[0].petId),{code:'COMPANIONS_UNAVAILABLE'});
  }finally{f.db.close();}
});
test('new companion module and retained old complete-table format give identical snapshots',async()=>{
  const f=await fixture();try{
    const modern=structuredClone(f.envelope),names=Object.keys(modern.data.tables).filter(name=>name.startsWith('companion_'));
    modern.data.modules.companions={version:1,data:{ownerAccountId:owner,tables:Object.fromEntries(names.map(name=>[name,modern.data.tables[name].rows])),identityImports:[]}};for(const name of names)delete modern.data.tables[name];
    assert.deepEqual(cloudSnapshot(f.envelope,owner,now),cloudSnapshot(modern,owner,now));
    modern.data.modules.companions.data.ownerAccountId=other;assert.throws(()=>cloudCompanions(modern,owner),{code:'INVALID_CLOUD_SAVE'});
  }finally{f.db.close();}
});
test('module-format feed consumes only one target food, preserves every unrelated pet and replays once',async()=>{
  const f=await fixture(true);try{
    const tables=f.envelope.data.modules.garden.data.tables;tables.garden_items.push({owner_account_id:owner,item_id:'carrot',quantity:1});
    const input={actionId:'feed:module',expectedRevision:0,sessionOwnerAccountId:owner,expectedPetRevision:f.pets[0].revision,petId:f.pets[0].petId,itemId:'carrot',quantity:1};
    const hash=await digest({kind:'feed',input}),result=applyCloudCommand(f.envelope,owner,'feed',input,now,hash);
    const before=cloudCompanions(f.envelope,owner).pets,after=cloudCompanions(result.envelope,owner).pets;
    assert.deepEqual(after.filter(row=>row.pet_id!==input.petId),before.filter(row=>row.pet_id!==input.petId));
    assert.equal(JSON.parse(after.find(row=>row.pet_id===input.petId).data_json).growth.satiety,f.pets[0].growth.satiety+12);
    const repeated=applyCloudCommand(result.envelope,owner,'feed',input,now+1,hash);assert.equal(repeated.changed,false);assert.equal(repeated.result.replayed,true);assert.deepEqual(repeated.envelope,result.envelope);
  }finally{f.db.close();}
});
test('garrison changes no stock or pet state; foreign territory/pet, stale revision and missing reward adapter reject',async()=>{
  const f=await fixture(true);try{
    const region={id:'territory:1:2',revision:1,ownerAccountId:owner,captureMultiplier:2},input={actionId:'guard:test',expectedRevision:0,expectedTerritoryRevision:1,territoryId:region.id,petId:f.pets[0].petId};
    const applied=await applyTerritoryCommand(f.envelope,owner,'garrison',input,now,await digest({kind:'garrison',input}),{region});
    assert.deepEqual(cloudCompanions(applied.envelope,owner),cloudCompanions(f.envelope,owner));assert.deepEqual(applied.envelope.data.modules.garden.data.tables.garden_items,f.envelope.data.modules.garden.data.tables.garden_items);
    assert.equal(applied.envelope.data.modules.garden.data.tables.garden_garrisons[0].pet_id,input.petId);
    await assert.rejects(applyTerritoryCommand(f.envelope,owner,'garrison',{...input,petId:'foreign'},now,'hash',{region}),{code:'PET_NOT_OWNED'});
    await assert.rejects(applyTerritoryCommand(f.envelope,owner,'garrison',input,now,'hash',{region:{...region,ownerAccountId:other}}),{code:'TERRITORY_NOT_OWNED'});
    await assert.rejects(applyTerritoryCommand(f.envelope,owner,'garrison',{...input,expectedRevision:3},now,'hash',{region}),{code:'REVISION_CONFLICT'});
    const neutral={...region,ownerAccountId:null},battle=beginTerritoryBattle(owner,f.envelope,neutral,{petId:f.pets[0].petId},now,'missing-growth');
    const state=generated.createSession(battle.player.element,battle.enemy.element);
    for(let i=0;i<100&&!battle.winner;i++){const round=generated.executeRound(state,'normal_attack','element_attack');battle.snapshot=structuredClone(state);battle.rounds.push({...round,state:structuredClone(state)});battle.winner=round.winner;}
    assert.equal(battle.winner,'player');battle.status='finished';
    await assert.rejects(applyTerritoryCommand(f.envelope,owner,'territorySettle',{actionId:'settle:missing-growth',sessionId:battle.id,expectedRevision:0},now,'hash',{region:neutral,battle}),{code:'COMPANIONS_AUTHORITY_REQUIRED'});
  }finally{f.db.close();}
});
test('privileged worker is never reached for actor/body authority forgery or an absent location permit',async()=>{
  const actor={schemaVersion:1,authority:'live',authKind:'supabase',authUserId:randomUUID(),ownerAccountId:owner,deviceId:randomUUID(),sessionId:randomUUID()};let called=0;
  const service=createTerritoryService({actor,worker:{rpc(){called++;throw Error('unexpected');}}});
  for(const body of [{op:'snapshot',ownerAccountId:other},{op:'act',input:{winner:'player'}},{op:'snapshot',sessionToken:'old'},{op:'snapshot',input:{sessionOwnerAccountId:other}}])await assert.rejects(service.handle(body));
  await assert.rejects(service.handle({op:'captureContext'}),{code:'INVALID_TERRITORY_COMMAND'});
  assert.equal(called,0);assert.throws(()=>createTerritoryService({actor:{...actor,authority:'simulated'},worker:{}}),{code:'ACTOR_REQUIRED'});
});

test('actual02 growth adapter settles the same pet and garden once, with160-character legacy owner',async()=>{
  const legacyOwner='legacy:'+('x'.repeat(153)),f=await fixture(true,legacyOwner);
  try{
    const region={id:'territory:1:2',revision:1,ownerAccountId:null,captureMultiplier:2};
    const battle=beginTerritoryBattle(legacyOwner,f.envelope,region,{petId:f.pets[0].petId},now);
    assert.equal(battle.id.length,26);assert.ok(`battle:${battle.id}:${legacyOwner}`.length<=200);
    const state=generated.createSession(battle.player.element,battle.enemy.element);
    for(let i=0;i<100&&!battle.winner;i++){const round=generated.executeRound(state,'normal_attack','element_attack');battle.snapshot=structuredClone(state);battle.rounds.push({...round,state:structuredClone(state)});battle.winner=round.winner;}
    battle.status='finished';assert.equal(battle.winner,'player');
    const input={actionId:'settle:canonical',sessionId:battle.id,expectedRevision:0},hash=await digest({kind:'territorySettle',input});
    const applied=await applyTerritoryCommand(f.envelope,legacyOwner,'territorySettle',input,now,hash,{region,battle},{awardBattleResult});
    const rows=applied.envelope.data.modules.companions.data.tables.companion_pets;
    assert.equal(JSON.parse(rows.find(row=>row.pet_id===f.pets[0].petId).data_json).growth.experience,f.pets[0].growth.experience+20);
    assert.deepEqual(rows.find(row=>row.pet_id===f.pets[1].petId),f.envelope.data.modules.companions.data.tables.companion_pets.find(row=>row.pet_id===f.pets[1].petId));
    assert.equal(applied.envelope.data.modules.garden.data.tables.garden_reward_receipts.length,1);
    const replay=await applyTerritoryCommand(applied.envelope,legacyOwner,'territorySettle',input,now+1,hash,{region,battle},{awardBattleResult});
    assert.equal(replay.changed,false);assert.deepEqual(replay.envelope,applied.envelope);
  }finally{f.db.close();}
});
