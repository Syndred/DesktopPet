const {test}=require('node:test');
const assert=require('node:assert/strict');
const {mkdtempSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');
const {readQaScenario,MARKER}=require('../../core/qa-scenario.cjs');
const {createQaTerritoryLocation}=require('./qa-location.cjs');
const {validFix}=require('./territories.cjs');

test('ordinary services never gain a simulated territory location',()=>{
  assert.equal(createQaTerritoryLocation({get:()=>undefined}),null);
  assert.throws(()=>validFix({source:'simulated',coordinateSystem:'wgs84',lat:31.233,lng:121.473,accuracyMeters:5,timestampMs:Date.now()},Date.now()),{code:'REAL_LOCATION_REQUIRED'});
});
test('verified independent QA marker enables a labelled location while retaining common quality checks',()=>{
  const profile=mkdtempSync(join(tmpdir(),'garden-unified-qa-')),runId=randomUUID();
  writeFileSync(join(profile,MARKER),JSON.stringify({schemaVersion:1,application:'lingjing',scenario:'unified-battle',isolated:true,runId,profilePath:profile}));
  const scene=readQaScenario({env:{LINGJING_QA_SCENARIO:'unified-battle',PET_USER_DATA_DIR:profile},userData:profile});
  const adapter=createQaTerritoryLocation({get:()=>scene,paths:{userData:profile}},()=>100000);
  const fix=adapter.fix();assert.equal(fix.source,'simulated');assert.equal(adapter.validate(fix),fix);
  assert.equal(adapter.descriptor.mode,'simulated');
  assert.throws(()=>adapter.validate({...fix,scenarioId:randomUUID()}),{code:'QA_LOCATION_MISMATCH'});
  assert.throws(()=>adapter.validate({...fix,timestampMs:1}),{code:'LOCATION_STALE'});
  assert.throws(()=>adapter.validate({...fix,accuracyMeters:200}),{code:'LOCATION_IMPRECISE'});
  assert.throws(()=>createQaTerritoryLocation({get:()=>scene,paths:{userData:join(profile,'different')}}),{code:'QA_PROFILE_REQUIRED'});
});
