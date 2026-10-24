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
const {createAuthorityHandler}=require('../server-authority.cjs');
const {atomic}=require('../repository.cjs');

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
  const discovery=register(services,discoveryModule);
  const api=services.get('discovery');api.location.adapter={getPosition:async()=>({ok:true,...fixtureFix()})};
  const owner=services.session.getOwnerAccountId();
  return {directory,legacy,db,services,api,owner,close(){discovery.dispose?.();battle.dispose?.();companion.dispose?.();db.close();}};
}
async function start(f) {
  await f.api.location.locate();
  const adopted=await f.services.invoke('companions','adopt',{actionId:'adopt-test',templateId:'husky',name:'实战伙伴',showOnDesktop:false});assert.equal(adopted.ok,true);
  const petId=adopted.data.pet.petId;
  // Pick a real generated wood encounter. Coordinates remain explicitly controlled fixtures.
  let spawn=f.api.snapshot().data.spawns.find(s=>s.element==='wood'&&s.inRange);
  if(!spawn) {
    const target=nearbySpawns(fixturePosition).find(s=>s.element==='wood');assert.ok(target);
    f.api.location.adapter={getPosition:async()=>({ok:true,...fixtureFix(),...target.position})};
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
test('map provider changes only projection, never system coordinates',()=>{
  const map=new MapAdapter();const fix=fixtureFix();map.setProvider('tencent');assert.equal(map.snapshot().coordinateSystem,'gcj02');assert.equal(map.snapshot().available,false);
  assert.ok(distanceMeters(map.project(fix),fix)>100);assert.equal(fix.coordinateSystem,'wgs84');
  map.setProvider('google');assert.deepEqual(map.project(fix),fixturePosition);
});
test('generated encounters remain anchored while the user moves',()=>{
  const now=Date.now(),a=nearbySpawns(fixturePosition,now),b=nearbySpawns({lat:31.2305,lng:121.4738},now);
  const shared=a.find(s=>b.some(t=>s.id===t.id));assert.ok(shared);assert.deepEqual(shared.position,b.find(s=>s.id===shared.id).position);
});

test('actual shared SQLite + companions + battle: map to victory, confirmation, pokedex, memory, idempotency and restart',integrationOptions,async t=>{
  t.mock.method(Math,'random',()=>.4); // Reproducible NPC decisions, not a forged victory.
  const f=fixture();
  try {
    const {encounter,input,petId}=await start(f);
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
    const captured=results[0].data;assert.notEqual(captured.petId,petId);assert.equal(captured.validation,'local-os');
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
test('server authority persists random outcomes and rejects forged victories, foreign pets and action reuse',integrationOptions,async t=>{
  t.mock.method(Math,'random',()=>.4);
  const f=fixture();try {
    const {petId}=await start(f);await f.services.invoke('discovery','cancel',{encounterId:f.api.repo.list(f.owner)[0].encounterId,actionId:'cancel-for-server'});
    f.db.exec('CREATE TABLE proof_permits(id TEXT PRIMARY KEY,owner TEXT,spawn_id TEXT,data_json TEXT); CREATE TABLE proof_actions(owner TEXT,action_id TEXT,data_json TEXT,PRIMARY KEY(owner,action_id)); CREATE TABLE proof_captures(owner TEXT,permit_id TEXT,data_json TEXT,PRIMARY KEY(owner,permit_id));');
    const store={
      async ownedPet(owner,id){try{return f.services.get('companions').getPet(owner,id);}catch{return null;}},
      async findPermit(owner,spawn){const row=f.db.prepare('SELECT data_json FROM proof_permits WHERE owner=? AND spawn_id=?').get(owner,spawn);return row?JSON.parse(row.data_json):null;},
      async reserve(permit){f.db.prepare('INSERT INTO proof_permits VALUES(?,?,?,?)').run(permit.id,permit.owner,permit.spawn.id,JSON.stringify(permit));return permit;},
      async getPermit(owner,id){const row=f.db.prepare('SELECT data_json FROM proof_permits WHERE owner=? AND id=?').get(owner,id);return row?JSON.parse(row.data_json):null;},
      async getAction(owner,id){const row=f.db.prepare('SELECT data_json FROM proof_actions WHERE owner=? AND action_id=?').get(owner,id);return row?JSON.parse(row.data_json):null;},
      async advance(owner,id,actionId,action,round,battle){return atomic(f.db,()=>{const receipt={permitId:id,action,result:battle};const row=f.db.prepare('SELECT data_json FROM proof_permits WHERE owner=? AND id=?').get(owner,id),permit=JSON.parse(row.data_json);assert.equal(permit.battle.view.round+1,round);permit.battle=battle;f.db.prepare('UPDATE proof_permits SET data_json=? WHERE id=?').run(JSON.stringify(permit),id);f.db.prepare('INSERT INTO proof_actions VALUES(?,?,?)').run(owner,actionId,JSON.stringify(receipt));return battle;});},
      async getCapture(owner,id){const row=f.db.prepare('SELECT data_json FROM proof_captures WHERE owner=? AND permit_id=?').get(owner,id);return row?JSON.parse(row.data_json):null;},
      async claim(receipt){f.db.prepare('INSERT INTO proof_captures VALUES(?,?,?)').run(receipt.owner,receipt.permitId,JSON.stringify(receipt));return receipt;}
    };
    const handler=createAuthorityHandler({authenticate:async()=>f.services.session.getOwnerAccountId(),store});
    const fix=f.api.location.snapshot().fix,target=nearbySpawns(fix).find(spawn=>spawn.element==='wood'&&geofence(fix,spawn.position).ok);
    assert.ok(target);
    await assert.rejects(handler({op:'reserve',fix,spawnId:target.id,petId:'foreign-pet'}),{code:'CLOUD_PET_NOT_SYNCED'});
    const permit=await handler({op:'reserve',fix,spawnId:target.id,petId});
    await assert.rejects(handler({op:'confirm',fix,spawnId:target.id,permitId:permit.id,winner:'player',actions:Array(20).fill('ultimate')}),{code:'VICTORY_REQUIRED'});
    let battle,round=0;
    do {round++;battle=await handler({op:'act',permitId:permit.id,actionId:`server-round-${round}`,expectedRound:round,action:battle?.view.player.anger>=50?'ultimate':'normal_attack'});} while(!battle.finished&&round<60);
    assert.equal(battle.winner,'player');
    const before=battle.view.round,repeat=await handler({op:'act',permitId:permit.id,actionId:`server-round-${round}`,expectedRound:round,action:battle.rounds.at(-1).action});assert.equal(repeat.view.round,before);
    const captured=await handler({op:'confirm',fix,spawnId:target.id,permitId:permit.id});
    const again=await handler({op:'confirm',fix,spawnId:target.id,permitId:permit.id});assert.equal(again.id,captured.id);assert.equal(again.duplicate,true);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM proof_captures').get().n,1);
  } finally {f.close();}
});
