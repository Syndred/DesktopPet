const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const {readQaScenario,MARKER}=require('../../core/qa-scenario.cjs');
const {createQaLocationAdapter}=require('../discovery/qa-location.cjs');
const {LocationService}=require('../discovery/location-adapter.cjs');
const {listTemplates}=require('../companions/templates.cjs');
const {createQaTerritoryLocation}=require('./qa-location.cjs');
const {validFix}=require('./territories.cjs');
const {GardenService}=require('./service.cjs');

test('ordinary services never gain a simulated territory location',()=>{
  assert.equal(createQaTerritoryLocation({get:()=>undefined}),null);
  assert.throws(()=>validFix({source:'simulated',coordinateSystem:'wgs84',lat:31.233,lng:121.473,accuracyMeters:5,timestampMs:Date.now()},Date.now()),{code:'REAL_LOCATION_REQUIRED'});
});
test('verified independent QA marker reuses discovery location and its identity and quality checks',async()=>{
  const profile=mkdtempSync(join(tmpdir(),'garden-unified-qa-')),runId=randomUUID();
  writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:'unified-battle',isolated:true,runId,profilePath:profile}));
  const verified=readQaScenario({env:{LINGJING_QA_SCENARIO:'unified-battle',PET_USER_DATA_DIR:profile},userData:profile});
  const owner=`qa:${runId}:local-${randomUUID()}`;
  const scene={...verified,requireIdentity:()=>({authority:'simulated',runId,scenarioId:verified.id,ownerAccountId:owner})};
  let location;
  const services={get:name=>name==='qaScenario'?scene:name==='discovery'?{location}:name==='companions'?{listTemplates}:undefined,paths:{userData:profile},session:{getOwnerAccountId:()=>owner}};
  const shared=createQaLocationAdapter(services,()=>100000);
  location=new LocationService({adapter:shared,now:()=>100000,mayUseLocation:()=>shared.allowed()});
  assert.equal((await location.locate()).ok,true);
  const adapter=createQaTerritoryLocation(services);
  const fix=adapter.fix();assert.equal(fix.source,'simulated');assert.equal(adapter.validate(fix),fix);
  assert.deepEqual(fix,location.snapshot().fix);
  assert.equal(fix.provider,'qa-discovery');
  assert.equal(adapter.descriptor.mode,'simulated');
  assert.throws(()=>adapter.validate({...fix,scenarioId:randomUUID()}),{code:'QA_LOCATION_MISMATCH'});
  assert.throws(()=>adapter.validate({...fix,timestampMs:1}),{code:'LOCATION_STALE'});
  let staleFailure;
  try{adapter.validate({...fix,timestampMs:1});}catch(error){staleFailure=GardenService.prototype.failure(error);}
  assert.equal(staleFailure?.code,'LOCATION_STALE');
  assert.equal(staleFailure?.message,'位置已过期，请重新定位');
  assert.equal(GardenService.prototype.failure(new Error('internal detail')).message,'菜园暂时不可用，请稍后重试');
  assert.throws(()=>adapter.validate({...fix,accuracyMeters:200}),{code:'LOCATION_IMPRECISE'});
  assert.throws(()=>adapter.validate({...fix,provider:'qa-territory'}),{code:'QA_LOCATION_MISMATCH'});
  assert.throws(()=>createQaTerritoryLocation({...services,paths:{userData:join(profile,'different')}}),{code:'QA_PROFILE_REQUIRED'});
  services.session.getOwnerAccountId=()=>`qa:${randomUUID()}:local-${randomUUID()}`;
  assert.throws(()=>adapter.validate(fix),{code:'QA_IDENTITY_MISMATCH'});
});
