import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {createTerritoryService,territoryError} from '../../../infra/supabase/functions/territory-sync/handler.mjs';
const require=createRequire(import.meta.url),{createTerritorySerialViews}=require('../../../apps/pc-app/runtime/features/garden/battle-serial-views.cjs');
const {CompanionsService}=require('../../../apps/pc-app/runtime/features/companions/service.cjs');
const {migrateCompanions}=require('../../../apps/pc-app/runtime/features/companions/migrations.cjs');
const {createGlobalSerialCache}=require('../../../apps/pc-app/runtime/features/companions/global-serial-cache.cjs');
const {GardenService}=require('../../../apps/pc-app/runtime/features/garden/service.cjs');
const {BattleStore}=require('../../../apps/pc-app/runtime/features/battle/store.cjs');
const battleMigrations=require('../../../apps/pc-app/runtime/features/battle/migrations.cjs');
const owner='territory-main-owner',peer='territory-original-guard',sessionId='btl-view',petId='pet-same-pet',request={sessionId,playerPetId:petId,enemyPetId:petId};
const actor={schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId:owner,authUserId:'uid',deviceId:'device',sessionId:'actor-session'};
const answer=()=>({format:'lingjing.territory.serial-views',version:1,ownerAccountId:owner,namespace:'live',sessions:[{sessionId,player:{ownerAccountId:owner,petId,templateId:'animal-wood-deer',globalSerial:'90071992547409931234567890'},enemy:{ownerAccountId:peer,petId,templateId:'animal-wood-deer',globalSerial:'2'},enemyKind:'instance'}]});

test('Edge pure read branch is bounded and calls only its actor-bound RPC',async()=>{
 const calls=[],service=createTerritoryService({actor,worker:{rpc:async(name,args)=>{calls.push({name,args});return{data:answer()};},from(){throw new Error('Read must not access action journals');}}});
 assert.deepEqual(await service.handle({op:'serial-views',input:{sessionIds:[sessionId]}}),answer());
 assert.deepEqual(calls,[{name:'lingjing_territory_serial_views',args:{p_actor:actor,p_session_ids:[sessionId]}}]);
 for(const ids of[[],[1],['bad id'],Array(21).fill(sessionId),[sessionId,sessionId]])await assert.rejects(service.handle({op:'serial-views',input:{sessionIds:ids}}),{code:'INVALID_REQUEST'});
 for(const input of[{sessionIds:[sessionId],ownerAccountId:peer},{sessionIds:[sessionId],actionId:'must-not-journal'},{sessionIds:[sessionId],globalSerial:'999'}])await assert.rejects(service.handle({op:'serial-views',input}),{code:'UNTRUSTED_AUTHORITY_FIELD'});
 assert.equal(calls.length,1);
});
test('Edge read failures preserve permission errors and unavailable-provider compatibility',async()=>{
 for(const[message,status]of[['LJ_NOT_PARTICIPANT',403],['LJ_GLOBAL_SERIAL_SCOPE_REVOKED',403],['LJ_DEVICE_SESSION_REQUIRED',403],['function does not exist',503]]){
  const service=createTerritoryService({actor,worker:{rpc:async()=>({error:{message}})}});
  try{await service.handle({op:'serial-views',input:{sessionIds:[sessionId]}});assert.fail('Must deny');}catch(error){assert.equal(territoryError(error).status,status);}
 }
});
function fixture(){
 const db=new DatabaseSync(':memory:');migrateCompanions(db);new GardenService({db});for(const migration of battleMigrations)db.exec(migration.sql);
 const cache=createGlobalSerialCache(),companions=new CompanionsService({db,uuid:()=> 'same-pet',projectIdentity:cache.project});
 for(const who of[owner,peer]){
  companions.adopt(who,{actionId:'original-adopt',templateId:'animal-wood-deer',name:'原名字',showOnDesktop:false});
  const row=db.prepare('SELECT * FROM companion_pets WHERE owner_account_id=?').get(who),pet=JSON.parse(row.data_json);
  db.prepare('UPDATE companion_pets SET data_json=? WHERE owner_account_id=?').run(JSON.stringify({...pet,globalSerial:'999999'}),who);
  cache.accept(who,{format:'lingjing.global-serial.readback',version:1,ownerAccountId:who,namespace:'live',revision:1,pets:[{ownerAccountId:who,petId,templateId:pet.templateId,namespace:'live',globalSerial:who===owner?'90071992547409931234567890':'2'}]},[row],1);
 }
 const battles=new BattleStore(db),original={id:sessionId,mode:'territory',status:'finished',player:{petId,globalSerial:'888888'},enemy:{petId,ownerAccountId:'wrong-raw-owner',globalSerial:'777777'},context:{authority:'local',territoryId:'region-original',territoryRevision:7},snapshot:{round:1},rounds:[],winner:'player'};
 battles.save(owner,original);battles.saveReport(owner,{...original,sessionId,endedAt:'2026-10-25'});
 db.prepare('INSERT INTO garden_territory_challenges(owner_account_id,battle_id,territory_id,territory_revision) VALUES(?,?,?,?)').run(owner,sessionId,'region-original',7);
 db.prepare("INSERT INTO garden_territory_logs(territory_id,owner_account_id,action,old_owner_id,new_owner_id,battle_id,created_at) VALUES(?,?,'invade',?,?,?,0)").run('region-original',owner,peer,peer,sessionId);
 let current=owner,isCloud=false,reply=async()=>answer();const calls=[];
 const registry=new Map([['companions',{getPet(){throw new Error('Lazy mutating API is forbidden');},readIdentityPet:(who,id)=>companions.readPet(who,id)}]]);
 const services={db,get:name=>registry.get(name),provide:(name,value)=>registry.set(name,value),session:{getOwnerAccountId:()=>current},events:{emit(){},on:()=>()=>{}}};
 const cloud={battles,isCloud:()=>isCloud,request:async(...args)=>{calls.push(args);return reply();}};
 const views=createTerritorySerialViews(services,cloud);
 const hashes=()=>Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({name})=>[name,JSON.stringify(db.prepare('SELECT * FROM '+name).all())]));
 db.exec('PRAGMA query_only=ON');
 return{db,battles,views,registry,services,hashes,calls,setCurrent:value=>current=value,setCloud:value=>isCloud=value,setReply:value=>reply=value};
}
test('Main local projection uses persistent identities, pure DTOs and preserves original SQLite bytes',async()=>{
 const f=fixture();try{
  const before=f.hashes(),view=await f.views.read({ownerAccountId:owner,sessions:[request]});
  assert.equal(view.namespace,null);assert.equal(view.sessions[0].player,null);
  assert.equal(view.sessions[0].enemy,null,'Peer namespace is unproven even though a cached serial exists');
  assert.equal(view.sessions[0].enemyKind,undefined);assert.deepEqual(f.hashes(),before);assert.equal(f.calls.length,0);
  assert.equal((await f.views.read({ownerAccountId:owner,sessions:[{...request,enemyPetId:'another-pet'}]})).sessions[0].player,null);
  f.registry.set('companions',{});assert.equal((await f.views.read({ownerAccountId:owner,sessions:[request]})).sessions[0].player,null);
  assert.deepEqual(f.hashes(),before);
 }finally{f.db.close();}
});
test('Main unknown/ambiguous local history never applies a current guard or saved serial',async()=>{
 const f=fixture();try{
  f.db.exec('PRAGMA query_only=OFF');
  f.db.prepare("INSERT INTO garden_territory_logs(territory_id,owner_account_id,action,old_owner_id,new_owner_id,battle_id,created_at) VALUES(?,?,'invade',?,?,?,1)").run('region-original',owner,'changed-current-owner','changed-current-owner',sessionId);
  f.db.exec('PRAGMA query_only=ON');
  const before=f.hashes(),row=(await f.views.read({ownerAccountId:owner,sessions:[request]})).sessions[0];
  assert.equal(row.enemy,null);assert.equal(row.enemyKind,undefined);assert.deepEqual(f.hashes(),before);
  assert.equal((await f.views.read({ownerAccountId:owner,sessions:[{...request,sessionId:'missing-session'}]})).sessions[0].player,null);
 }finally{f.db.close();}
});
test('Main local NPC view is unchanged by unrelated owner insertion/deletion or fake namespace metadata',async()=>{
 const f=fixture();try{
  const npcId='guardian:region-original';f.db.exec('PRAGMA query_only=OFF');
  const old=f.battles.session(owner,sessionId);f.battles.save(owner,{...old,enemy:{...old.enemy,petId:npcId}});
  f.db.prepare('UPDATE garden_territory_logs SET old_owner_id=NULL WHERE battle_id=?').run(sessionId);
  f.db.exec('PRAGMA query_only=ON');
  const input={ownerAccountId:owner,sessions:[{...request,enemyPetId:npcId}]},before=f.hashes();
  const npc=(await f.views.read(input)).sessions[0];assert.deepEqual(npc,{sessionId,player:null,enemy:null,enemyKind:'guardian'});assert.deepEqual(f.hashes(),before);
  f.db.exec('PRAGMA query_only=OFF');
  const original=f.db.prepare('SELECT * FROM companion_pets WHERE owner_account_id=?').get(peer),columns=Object.keys(original),unrelated={...original,pet_id:npcId,data_json:JSON.stringify({petId:npcId,ownerAccountId:peer,namespace:'qa:unrelated',globalSerial:'666666'})};
  const insert='INSERT INTO companion_pets('+columns.map(name=>'"'+name+'"').join(',')+') VALUES('+columns.map(()=>'?').join(',')+')';
  f.db.prepare(insert).run(...columns.map(name=>unrelated[name]));f.db.exec('PRAGMA query_only=ON');
  assert.deepEqual((await f.views.read(input)).sessions[0],npc);
  f.db.exec('PRAGMA query_only=OFF');f.db.prepare('DELETE FROM companion_pets WHERE owner_account_id=? AND pet_id=?').run(peer,npcId);f.db.exec('PRAGMA query_only=ON');
  assert.deepEqual((await f.views.read(input)).sessions[0],npc);assert.deepEqual(f.hashes(),before);
  f.db.exec('PRAGMA query_only=OFF');f.db.prepare('UPDATE garden_territory_logs SET old_owner_id=? WHERE battle_id=?').run(peer,sessionId);f.db.exec('PRAGMA query_only=ON');
  assert.equal((await f.views.read(input)).sessions[0].enemyKind,undefined,'Unproven cross-owner scope never creates an instance oracle');
 }finally{f.db.close();}
});
test('Main cloud views bind owner/session/side/pet and never apply a save or journal',async()=>{
 const f=fixture();try{
  f.setCloud(true);const before=f.hashes();assert.deepEqual(await f.views.read({ownerAccountId:owner,sessions:[request]}),answer());
  assert.deepEqual(f.calls[0],['territory-sync',{op:'serial-views',input:{sessionIds:[sessionId]}},{ownerAccountId:owner}]);
  assert.deepEqual(f.hashes(),before);
  for(const mutate of[
   value=>value.ownerAccountId=peer,value=>value.namespace='local',value=>value.namespace=null,value=>value.sessions[0].sessionId='foreign',
   value=>value.sessions.push(value.sessions[0]),value=>value.sessions[0].player.ownerAccountId=peer,
   value=>value.sessions[0].enemy.petId='foreign-pet',value=>value.sessions[0].enemy.globalSerial='01',
   value=>value.sessions[0].enemy.globalSerial=2,value=>value.sessions[0].enemyKind='guardian',
   value=>value.sessions[0].enemy.extra='untrusted',
  ]){const bad=answer();mutate(bad);f.setReply(async()=>bad);await assert.rejects(f.views.read({ownerAccountId:owner,sessions:[request]}),{code:'TERRITORY_SERIAL_VIEW_INVALID'});}
  assert.deepEqual(f.hashes(),before);
 }finally{f.db.close();}
});
test('Main fails closed on unavailable authority and account switching without live namespace fallback',async()=>{
 const f=fixture();try{
  f.setCloud(true);const before=f.hashes();
  f.setReply(async()=>{throw Object.assign(new Error('Not deployed yet'),{code:'TERRITORY_CLOUD_UNAVAILABLE'});});
  await assert.rejects(f.views.read({ownerAccountId:owner,sessions:[request]}),{code:'TERRITORY_CLOUD_UNAVAILABLE'});
  let release;f.setReply(()=>new Promise(resolve=>release=resolve));const pending=f.views.read({ownerAccountId:owner,sessions:[request]});
  f.setCurrent(peer);release(answer());await assert.rejects(pending,{code:'SESSION_CHANGED'});assert.deepEqual(f.hashes(),before);
 }finally{f.db.close();}
});
test('Main internal input is bounded and accepts no caller-supplied target identities',async()=>{
 const f=fixture();try{
  for(const sessions of[[],Array(21).fill(request),[request,request],[{...request,ownerAccountId:peer}]])await assert.rejects(f.views.read({ownerAccountId:owner,sessions}),{code:'INVALID_REQUEST'});
  assert.equal(f.calls.length,0);
 }finally{f.db.close();}
});
test('garden registration exposes the internal provider without any renderer command',async()=>{
 const f=fixture();let feature;try{
  f.db.exec('PRAGMA query_only=OFF');feature=require('../../../apps/pc-app/runtime/features/garden/index.cjs').register(f.services);f.db.exec('PRAGMA query_only=ON');
  const before=f.hashes(),api=f.registry.get('garden');assert.equal(typeof api.getBattleSerialViews,'function');
  assert.equal(Object.hasOwn(feature.commands,'getBattleSerialViews'),false);assert.equal(Object.hasOwn(feature.commands,'serial-views'),false);
  const value=await api.getBattleSerialViews({ownerAccountId:owner,sessions:[request]});assert.equal(value.namespace,null);assert.equal(value.sessions[0].enemyKind,undefined);assert.deepEqual(f.hashes(),before);
 }finally{feature?.dispose();f.db.close();}
});
