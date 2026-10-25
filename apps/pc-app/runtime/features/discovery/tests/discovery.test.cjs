const test=require('node:test');
const assert=require('node:assert/strict');
const {join,resolve}=require('node:path');
const {mkdirSync,mkdtempSync,existsSync}=require('node:fs');
const {openDatabase,migrate}=require('../../../core/database.cjs');
const {createServices}=require('../../../core/services.cjs');
const {RuntimeDataStore}=require('../../../services/runtime-data-store.cjs');
const {LocationService}=require('../location-adapter.cjs');
const {convertPoint,distanceMeters,geofence,checkFix}=require('../coordinates.cjs');
const {MapAdapter}=require('../map-adapter.cjs');
const {nearbySpawns}=require('../spawns.cjs');
const discoveryModule=require('../index.cjs');
const {publicEncounter}=require('../service.cjs');
const {contains}=require('../territory-adapter.cjs');
const {getBattleRules}=require('../../../services/battle-runtime.cjs');

const companionRoot=process.env.LINGJING_COMPANIONS_RUNTIME || resolve(__dirname,'../../companions');
const battleRoot=process.env.LINGJING_BATTLE_RUNTIME || resolve(__dirname,'../../battle');
const hasIntegration=existsSync(join(companionRoot,'index.cjs')) && existsSync(join(battleRoot,'index.cjs'));
const integrationOptions={skip:hasIntegration ? false : 'Set LINGJING_COMPANIONS_RUNTIME and LINGJING_BATTLE_RUNTIME to the real feature source directories'};
const evidenceRoot=resolve('artifacts/discovery/native-tests');mkdirSync(evidenceRoot,{recursive:true});
const fixturePosition={lat:31.2304,lng:121.4737};
const fixtureFix=()=>({...fixturePosition,source:'os',coordinateSystem:'wgs84',accuracyMeters:12,timestampMs:Date.now(),provider:'controlled-test-fixture-not-system-evidence',positionSource:'test-fixture'});

function register(services,feature) {
  migrate(services.db,feature.id,feature.migrations);
  const registration=feature.register(services);
  for(const [name,handler] of Object.entries(registration.commands || {})) services.ipc.handle(`${feature.id}:${name}`,handler,{public:feature.publicCommands?.includes(name)});
  return registration;
}
function fixture() {
  const directory=mkdtempSync(join(evidenceRoot,'profile-'));
  const legacy=new RuntimeDataStore({filePath:join(directory,'legacy.json')});
  const registered=legacy.registerUser('discovery_test','temporary-integration-password','探索测试');assert.equal(registered.ok,true);
  const db=openDatabase(join(directory,'shared.sqlite'));
  const services=createServices({db,legacy:{runtimeDataStore:legacy},paths:{userData:directory},windows:{}});
  const companion=register(services,require(join(companionRoot,'index.cjs')));
  const battle=register(services,require(join(battleRoot,'index.cjs')));
  const garden=register(services,require('../../garden/index.cjs'));
  const discovery=register(services,discoveryModule);
  const api=services.get('discovery');api.location.adapter={scenario:'qa',getPosition:async()=>({ok:true,...fixtureFix()})};
  const owner=services.session.getOwnerAccountId();
  return {directory,legacy,db,services,api,owner,close(){discovery.dispose?.();garden.dispose?.();battle.dispose?.();companion.dispose?.();db.close();}};
}
async function start(f,preferredSpawn) {
  await f.api.location.locate();
  const adopted=await f.services.invoke('companions','adopt',{actionId:'adopt-test',templateId:'big-fish-gentle',name:'实战伙伴',showOnDesktop:false});assert.equal(adopted.ok,true);
  const petId=adopted.data.pet.petId;
  // Pick a real generated 2D encounter. Coordinates remain controlled fixtures.
  let spawn=f.api.snapshot().data.spawns.find(s=>s.inRange&&(preferredSpawn?s.id===preferredSpawn.id:s.element==='water'));
  if(!spawn) {
    const target=preferredSpawn||nearbySpawns(fixturePosition).find(s=>s.element==='water');assert.ok(target);
    f.api.location.adapter={scenario:'qa',getPosition:async()=>({ok:true,...fixtureFix(),...target.position})};
    f.api.location.fix=null;await f.api.location.locate();
    spawn=f.api.snapshot().data.spawns.find(s=>s.id===target.id);
  }
  const input={spawnId:spawn.id,petId,actionId:'begin-test',ownerAccountId:'untrusted-renderer-owner'};
  const result=await f.services.invoke('discovery','begin',input);assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.data.battle.adapter,'battle-feature');
  assert.equal(result.data.ownerAccountId,f.owner);
  return {encounter:result.data,input,petId};
}
async function win(f,encounter) {
  let current=encounter;
  for(let i=0;i<60 && current.status==='challenging';i++) {
    const action=current.battle.view.player.anger>=50?'ultimate':'normal_attack';
    const result=await f.services.invoke('discovery','act',{encounterId:current.encounterId,actionId:`round-${i}`,expectedRevision:current.revision,action});
    assert.equal(result.ok,true,JSON.stringify(result));current=result.data;
  }
  assert.equal(current.status,'won');return current;
}

test('coordinate conversion round-trips in China and preserves overseas positions',()=>{
  const gcj=convertPoint(fixturePosition,'wgs84','gcj02');assert.ok(distanceMeters(gcj,fixturePosition)>100);
  assert.ok(distanceMeters(convertPoint(gcj,'gcj02','wgs84'),fixturePosition)<.02);
  const london={lat:51.5074,lng:-.1278};assert.deepEqual(convertPoint(london,'wgs84','gcj02'),london);
  assert.throws(()=>convertPoint({lat:null,lng:1}),{code:'INVALID_COORDINATES'});
});
test('geofence rejects demo, stale, default OS positions, coarse accuracy and out-of-range',()=>{
  const now=Date.now(),fix=fixtureFix();assert.equal(geofence(fix,fixturePosition,100,now).ok,true);
  for(const [override,code] of [[{source:'demo'},'REAL_LOCATION_REQUIRED'],[{accuracyMeters:1000},'LOCATION_IMPRECISE'],[{timestampMs:now-60000},'LOCATION_STALE'],[{positionSource:'Default'},'LOCATION_DEFAULT_POSITION']]) assert.equal(checkFix({...fix,...override},now).code,code);
  assert.equal(geofence(fix,{lat:31.24,lng:121.48},100,now).code,'OUT_OF_CAPTURE_RANGE');
});
test('real adapter errors clear old coordinates; demo never masquerades as permission granted',async()=>{
  let denied=false;const location=new LocationService({adapter:{async getPosition(){return denied?{ok:false,code:'LOCATION_PERMISSION_DENIED',message:'denied',hresult:'0x80070005'}:{ok:true,...fixtureFix()};}}});
  await location.locate();assert.equal(location.snapshot().status,'ready');
  denied=true;await location.locate();assert.equal(location.snapshot().status,'denied');assert.equal(location.snapshot().fix,null);
  location.setDemo(true);assert.equal(location.snapshot().mode,'demo');assert.equal(location.snapshot().permission,'unknown');assert.equal(checkFix(location.snapshot().fix).ok,false);
  location.dispose();
});
test('cancelling an in-flight location request discards the late result',async()=>{
  let deliver;const location=new LocationService({adapter:{getPosition:()=>new Promise(resolve=>{deliver=resolve;})}});
  const pending=location.locate();location.setDemo(true);deliver({ok:true,...fixtureFix()});await pending;
  assert.equal(location.snapshot().mode,'demo');assert.equal(location.snapshot().fix.source,'demo');location.dispose();
});

test('leaving demo clears its sample before a native request and never treats the city change as drift',async()=>{
  let finish;
  const location=new LocationService({adapter:{getPosition:()=>new Promise(resolve=>{finish=resolve;})}});
  location.setDemo(true);const pending=location.locate();
  assert.equal(location.snapshot().mode,'real');assert.equal(location.snapshot().fix,null);
  finish({ok:true,...fixtureFix(),lat:51.5074,lng:-.1278});await pending;
  assert.equal(location.snapshot().status,'ready');assert.equal(location.snapshot().fix.source,'os');assert.equal(location.snapshot().fix.lat,51.5074);
  location.dispose();
});
test('application privacy blocks native calls and discards a late fix after revocation',async()=>{
  let allowed=false,calls=0,deliver;
  const location=new LocationService({mayUseLocation:()=>allowed,adapter:{getPosition(){calls++;return new Promise(resolve=>{deliver=resolve;});}}});
  assert.equal((await location.locate()).error.code,'APP_LOCATION_DISABLED');assert.equal(calls,0);
  allowed=true;const pending=location.startWatch();assert.equal(calls,1);allowed=false;location.blockByPolicy();deliver({ok:true,...fixtureFix()});await pending;
  assert.equal(location.snapshot().status,'privacy_disabled');assert.equal(location.snapshot().fix,null);assert.equal(location.snapshot().watching,false);location.dispose();
});
test('map provider changes only projection, never system coordinates',()=>{
  const map=new MapAdapter();const fix=fixtureFix();map.setProvider('tencent');assert.equal(map.snapshot().coordinateSystem,'gcj02');assert.equal(map.snapshot().available,false);
  assert.ok(distanceMeters(map.project(fix),fix)>100);assert.equal(fix.coordinateSystem,'wgs84');
  map.setProvider('google');assert.deepEqual(map.project(fix),fixturePosition);
});
test('generated encounters remain anchored while the user moves',()=>{
  const now=Date.now(),a=nearbySpawns(fixturePosition,now),b=nearbySpawns({lat:31.2305,lng:121.4738},now);
  const shared=a.find(s=>b.some(t=>s.id===t.id));assert.ok(shared);assert.deepEqual(shared.position,b.find(s=>s.id===shared.id).position);
});

test('encounters follow canonical 2D template resources and use a new generation after rebinding',()=>{
  const templates=require('../../companions/templates.cjs').listTemplates(),now=Date.UTC(2026,9,24,4);
  const original=nearbySpawns(fixturePosition,now),frozen=structuredClone(original);
  assert.ok(original.length);
  for(const spawn of original) assert.equal(spawn.resourceId,templates.find(template=>template.templateId===spawn.templateId).resource.resourceId);
  const updated=templates.map(template=>({...template,resource:{...template.resource,resourceId:require('../../battle/assets.cjs').SHIBA_RESOURCE}}));
  const next=nearbySpawns(fixturePosition,now,450,updated);
  assert.ok(next.length);
  assert.ok(next.every(spawn=>spawn.resourceId===require('../../battle/assets.cjs').SHIBA_RESOURCE));
  assert.ok(next.every(spawn=>!original.some(previous=>previous.id===spawn.id)));
  assert.deepEqual(original,frozen);
});

test('old encounter readback exposes authoritative rules without rewriting history or leaking engine state',()=>{
  const saved={battle:{engineState:{private:'not-for-renderer'},view:{round:3},rounds:[{round:3}]},cloudPermit:{id:'private-permit'}};
  const original=structuredClone(saved),view=publicEncounter(saved);
  assert.deepEqual(view.battle.rules,getBattleRules());
  assert.equal(view.battle.engineState,undefined);assert.equal(view.cloudPermit,undefined);
  assert.deepEqual(saved,original);
});

test('actual shared SQLite + companions + battle: map to victory, confirmation, pokedex, memory, idempotency and restart',integrationOptions,async t=>{
  t.mock.method(Math,'random',()=>.4); // Reproducible NPC decisions, not a forged victory.
  const f=fixture();
  try {
    const {encounter,input,petId}=await start(f);
    assert.deepEqual(encounter.battle.rules,f.services.get('battle').getRules());
    assert.equal(encounter.battle.view.player.maxHp,encounter.battle.rules.maxHp);
    const linked=f.services.get('battle').getOutcome({ownerAccountId:f.owner,sessionId:encounter.battle.battleId}).session;
    assert.equal(linked.context.origin,'discovery');assert.equal(linked.context.encounterId,encounter.encounterId);
    assert.equal(linked.context.scenario,'qa');
    assert.equal(linked.context.returnPath,`/discovery/encounter/${encounter.encounterId}`);
    assert.notEqual(f.services.get('companions').getPet(f.owner,petId).growth.stats.hp,encounter.battle.rules.maxHp);
    const repeated=await f.services.invoke('discovery','begin',input);assert.equal(repeated.ok,true);assert.equal(repeated.duplicate,true);assert.equal(repeated.data.encounterId,encounter.encounterId);
    const premature=await f.services.invoke('discovery','confirm',{encounterId:encounter.encounterId,actionId:'premature'});assert.equal(premature.code,'VICTORY_REQUIRED');
    const firstInput={encounterId:encounter.encounterId,action:'element_attack',actionId:'first-round',expectedRevision:encounter.revision};
    const first=await f.services.invoke('discovery','act',firstInput),retry=await f.services.invoke('discovery','act',firstInput);
    assert.equal(first.ok,true);assert.equal(retry.duplicate,true);assert.equal(retry.data.battle.view.round,1);
    const victory=await win(f,first.data);
    const before=f.services.get('companions').listPets(f.owner).length;
    const command={encounterId:victory.encounterId,expectedRevision:victory.revision,actionId:'confirm-test',name:'相遇的新伙伴',showOnDesktop:false};
    const results=await Promise.all([f.services.invoke('discovery','confirm',command),f.services.invoke('discovery','confirm',command)]);
    assert.equal(results[0].ok,true,JSON.stringify(results));assert.equal(results[1].ok,true);assert.equal(results[0].data.petId,results[1].data.petId);
    const captured=results[0].data;assert.notEqual(captured.petId,petId);assert.equal(captured.validation,'simulated');assert.equal(captured.scenario,'qa');
    const pets=f.services.get('companions').listPets(f.owner);assert.equal(pets.length,before+1);assert.equal(pets.find(p=>p.petId===captured.petId).origin.memoryTags.length,1);
    assert.equal(pets.find(p=>p.petId===captured.petId).resource.resourceId,encounter.spawn.resourceId);
    assert.equal(f.api.repo.captures(f.owner).length,1);assert.equal(f.api.memories({petId:captured.petId}).data.length,1);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM battle_reports_v2 WHERE owner_account_id=?').get(f.owner).n,1);
    const saved=f.api.repo.get(f.owner,victory.encounterId);assert.equal(saved.status,'captured');
    const path=f.directory;f.close();
    const reopened=openDatabase(join(path,'shared.sqlite'));
    assert.equal(reopened.prepare('SELECT pet_id FROM discovery_captures WHERE owner_account_id=?').get(saved.ownerAccountId).pet_id,captured.petId);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM companion_pets WHERE owner_account_id=? AND pet_id=?').get(saved.ownerAccountId,captured.petId).n,1);reopened.close();
  } finally {if(f.db.open) f.close();}
});
test('shared battle commands finish the linked wild session and confirmation reads that authority',integrationOptions,async t=>{
  t.mock.method(Math,'random',()=>.4);
  const f=fixture();try {
    const {encounter}=await start(f),sessionId=encounter.battle.battleId;
    let session=f.services.get('battle').getOutcome({ownerAccountId:f.owner,sessionId}).session;
    for(let turn=0;turn<60&&session.status==='active';turn++) {
      const action=session.snapshot.player.anger>=session.rules.ultimateAnger?'ultimate':turn===0?'element_attack':'normal_attack';
      const result=await f.services.invoke('battle','act',{sessionId,action,actionId:`shared-wild-${turn}`,expectedRound:session.snapshot.round+1});
      assert.equal(result.ok,true,result.message);session=result.data;
    }
    assert.equal(session.winner,'player');assert.equal(session.status,'finished');
    assert.equal(f.api.repo.get(f.owner,encounter.encounterId).status,'challenging','Discovery does not run or settle a second battle');
    const context=f.api.getBattleContext({ownerAccountId:f.owner,sessionId});assert.equal(context.action,'capture');assert.equal(context.returnTo,'/discovery');
    const result=await f.api.settleBattleContext({ownerAccountId:f.owner,sessionId,actionId:'shared-confirm',name:'共享战场伙伴'});
    assert.equal(result.ok,true,result.message);assert.equal(f.api.repo.get(f.owner,encounter.encounterId).status,'captured');
    assert.equal(result.data.resultPath,`/discovery/result/${encounter.encounterId}`);assert.equal(result.data.scenario,'qa');
    const replay=await f.api.settleBattleContext({ownerAccountId:f.owner,sessionId,actionId:'shared-confirm',name:'共享战场伙伴'});assert.equal(replay.data.petId,result.data.petId);
    assert.equal(f.api.getBattleContext({ownerAccountId:f.owner,sessionId}).settled,true);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM battle_reports_v2 WHERE owner_account_id=?').get(f.owner).n,1);
    assert.equal(f.api.repo.captures(f.owner).length,1);assert.equal(f.api.repo.memories(f.owner,result.data.petId).length,1);
  } finally {f.close();}
});

test('capture rolls back companion, pokedex and memory together when SQLite rejects the tag',integrationOptions,async t=>{
  t.mock.method(Math,'random',()=>.4);
  const f=fixture();try {
    const {encounter}=await start(f),victory=await win(f,encounter),before=f.services.get('companions').listPets(f.owner).length;
    f.db.exec("CREATE TEMP TRIGGER reject_test_memory BEFORE INSERT ON discovery_memory_tags BEGIN SELECT RAISE(ABORT,'controlled test fault'); END;");
    const command={encounterId:victory.encounterId,actionId:'rollback-confirm',name:'事务测试'};
    const rejected=await f.services.invoke('discovery','confirm',command);assert.equal(rejected.ok,false);
    assert.equal(f.services.get('companions').listPets(f.owner).length,before);assert.equal(f.api.repo.captures(f.owner).length,0);assert.equal(f.api.repo.get(f.owner,victory.encounterId).status,'won');
    f.db.exec('DROP TRIGGER reject_test_memory');
    const retry=await f.services.invoke('discovery','confirm',command);assert.equal(retry.ok,true);assert.equal(f.services.get('companions').listPets(f.owner).length,before+1);
  } finally {f.close();}
});
test('ownership, action conflicts, cancellation, precise-location and demo boundaries use real services',integrationOptions,async()=>{
  const f=fixture();try {
    const {encounter}=await start(f);
    const conflict=await f.services.invoke('discovery','begin',{actionId:'begin-test',spawnId:'another',petId:encounter.petId});assert.equal(conflict.code,'ACTION_ID_CONFLICT');
    const cancelled=await f.services.invoke('discovery','cancel',{encounterId:encounter.encounterId,actionId:'cancel-test'});assert.equal(cancelled.data.status,'cancelled');
    assert.equal((await f.services.invoke('discovery','confirm',{encounterId:encounter.encounterId,actionId:'cancelled-confirm'})).code,'VICTORY_REQUIRED');
    f.api.location.setDemo(true);assert.equal((await f.services.invoke('discovery','begin',{spawnId:encounter.spawn.id,petId:encounter.petId,actionId:'demo-start'})).code,'REAL_LOCATION_REQUIRED');
    const second=f.legacy.registerUser('second_test','temporary-integration-password','第二账号');assert.equal(second.ok,true);
    assert.equal(f.api.snapshot().data.encounters.length,0);assert.equal((await f.services.invoke('discovery','cancel',{encounterId:encounter.encounterId,ownerAccountId:f.owner,actionId:'foreign-owner'})).code,'ENCOUNTER_NOT_FOUND');
  } finally {f.close();}
});
test('real territory battle ownership feeds the discovery map and capture provenance without changing combat stats',integrationOptions,async t=>{
  t.mock.method(Math,'random',()=>.4);
  const f=fixture();try {
    await f.api.location.locate();
    const pet=await f.services.invoke('companions','adopt',{actionId:'territory-pet',templateId:'big-fish-gentle',name:'领地伙伴',showOnDesktop:false});assert.equal(pet.ok,true,JSON.stringify(pet));
    const locate=await f.services.invoke('garden','territoryLocate',{sessionOwnerAccountId:f.owner,actionId:'territory-locate',expectedRevision:f.services.get('garden').service.revision(f.owner)});assert.equal(locate.ok,true,JSON.stringify(locate));
    const territory=locate.data;
    const begun=await f.services.invoke('garden','territoryChallenge',{sessionOwnerAccountId:f.owner,actionId:'territory-challenge',expectedRevision:f.services.get('garden').service.revision(f.owner),petId:pet.data.pet.petId,territoryId:territory.id,expectedTerritoryRevision:territory.revision});assert.equal(begun.ok,true,JSON.stringify(begun));
    let battle=f.services.get('battle').getOutcome({ownerAccountId:f.owner,sessionId:begun.data.sessionId}).session;
    for(let i=0;i<60 && battle.status==='active';i++) {
      const result=await f.services.invoke('battle','act',{sessionId:battle.id,actionId:`territory-round-${i}`,expectedRound:battle.snapshot.round+1,action:battle.snapshot.player.anger>=50?'ultimate':'normal_attack'});assert.equal(result.ok,true);battle=result.data;
    }
    assert.equal(battle.winner,'player');
    const settled=await f.services.invoke('garden','territorySettle',{sessionOwnerAccountId:f.owner,actionId:'territory-settle',expectedRevision:f.services.get('garden').service.revision(f.owner),sessionId:battle.id});assert.equal(settled.ok,true,JSON.stringify(settled));
    const overlay=f.api.snapshot().data.territories.find(item=>item.territoryId===territory.id);assert.ok(overlay);assert.equal(overlay.owned,true);assert.equal(overlay.bonusMultiplier,2);assert.equal(overlay.mapBoundary.length,4);
    // Hourly spawns can move the generic water-target helper over a cell edge.
    // This case asserts an owned-region bonus, so select a real generated water
    // point inside that exact region rather than assuming the helper stays in it.
    const center=territory.boundary.reduce((p,v)=>({lat:p.lat+v.lat/territory.boundary.length,lng:p.lng+v.lng/territory.boundary.length}),{lat:0,lng:0});
    const target=nearbySpawns(center).find(spawn=>spawn.element==='water'&&contains(spawn.position,territory.boundary));assert.ok(target,'Owned region must contain the chosen canonical fixture spawn');
    const {encounter}=await start(f,target);assert.equal(contains(f.api.location.snapshot().fix,territory.boundary),true);assert.equal(f.api.territories.captureContext(f.owner,f.api.location.snapshot().fix).territoryId,territory.id);
    const won=await win(f,encounter);
    const captured=await f.services.invoke('discovery','confirm',{encounterId:won.encounterId,actionId:'territory-capture'});assert.equal(captured.ok,true,JSON.stringify(captured));assert.equal(captured.data.territoryId,territory.id);assert.equal(captured.data.captureMultiplier,2);
    const owned=f.services.get('companions').getPet(f.owner,captured.data.petId);assert.equal(owned.growth.stats.hp,124);assert.equal(owned.origin.territoryId,territory.id);
    const outside={...f.api.location.snapshot().fix,lat:Math.min(...territory.boundary.map(p=>p.lat))-.001,lng:center.lng};assert.equal(f.api.territories.captureContext(f.owner,outside).territoryId,null,'An outside position must keep the ordinary no-territory result');
  } finally {f.close();}
});
