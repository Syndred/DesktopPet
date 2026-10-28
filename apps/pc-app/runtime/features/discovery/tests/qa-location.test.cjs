const test=require('node:test'),assert=require('node:assert/strict');
const {resolve}=require('node:path');
const {createQaLocationAdapter}=require('../qa-location.cjs');
const {LocationService}=require('../location-adapter.cjs');
const {geofence}=require('../coordinates.cjs');
function fixture() {
  let clock=1792854000000;
  const scene={id:'unified-battle',runId:'test-qa-run',provenance:'simulated',isolated:true,profilePath:resolve('artifacts/qa/unit-profile'),requireIdentity:()=>({authority:'simulated',scenarioId:'unified-battle',runId:'test-qa-run',ownerAccountId:'qa:test-owner'})};
  let selected=scene;
  const services={paths:{userData:scene.profilePath},session:{getOwnerAccountId:()=> 'qa:test-owner'},get:key=>key==='qaScenario'?selected:null};
  return {scene,services,now:()=>clock,advance:ms=>clock+=ms,remove:()=>{selected=null;}};
}
test('QA adapter requires the verified isolated scenario and matching current identity',async()=>{
  assert.equal(createQaLocationAdapter({get:()=>null}),null);
  const f=fixture();f.services.paths.userData=resolve('artifacts/qa/other-profile');assert.throws(()=>createQaLocationAdapter(f.services),{code:'QA_PROFILE_REQUIRED'});
  f.services.paths.userData=f.scene.profilePath;
  const adapter=createQaLocationAdapter(f.services,f.now);assert.equal(adapter.allowed(),true);
  f.scene.requireIdentity=()=>({authority:'simulated',scenarioId:'unified-battle',runId:'wrong-run',ownerAccountId:'qa:test-owner'});
  assert.equal(adapter.allowed(),false);await assert.rejects(adapter.getPosition(),{code:'QA_IDENTITY_MISMATCH'});
});
test('simulated fixes keep their source and cannot pass the native geofence without the explicit QA adapter',async()=>{
  const f=fixture(),adapter=createQaLocationAdapter(f.services,f.now),location=new LocationService({adapter,now:f.now,mayUseLocation:()=>adapter.allowed()});
  try {
    const result=await location.locate();assert.equal(result.ok,true);
    const state=location.snapshot(),fix=state.fix;
    assert.equal(state.status,'ready');assert.equal(state.permission,'unknown');assert.equal(fix.source,'simulated');assert.equal(fix.scenarioId,f.scene.runId);
    assert.equal(geofence(fix,fix,100,f.now()).code,'REAL_LOCATION_REQUIRED');
    assert.equal(geofence(location.metricFix(fix),fix,100,f.now()).ok,true);assert.equal(location.snapshot().fix.source,'simulated');
    assert.equal(location.quality({...fix,scenarioId:'foreign'}).code,'QA_LOCATION_MISMATCH');
    f.advance(31000);assert.equal(location.snapshot().status,'stale');
    f.remove();assert.equal((await location.locate()).error.code,'APP_LOCATION_DISABLED');assert.equal(location.snapshot().fix,null);
  } finally {location.dispose();}
});
test('an ordinary location service never promotes a simulated adapter result to OS permission',async()=>{
  const location=new LocationService({adapter:{getPosition:async()=>({ok:true,source:'simulated',scenarioId:'unverified',lat:31.2,lng:121.4,accuracyMeters:5,timestampMs:Date.now()})}});
  try {const result=await location.locate();assert.equal(result.ok,false);assert.equal(result.error.code,'QA_PROFILE_REQUIRED');assert.equal(location.snapshot().permission,'unknown');assert.equal(location.snapshot().fix,null);}finally{location.dispose();}
});
test('explicit QA coordinate fixture accepts only finite WGS84 coordinates and never a clock or authority override',async()=>{
  const f=fixture(),adapter=createQaLocationAdapter(f.services,f.now);
  for(const input of [null,{}, {lat:'31',lng:121},{lat:NaN,lng:121},{lat:91,lng:0},{lat:0,lng:181},{lat:31,lng:121,timestampMs:0},{lat:31,lng:121,source:'os'}])assert.throws(()=>adapter.selectPosition(input),{code:'INVALID_COORDINATES'});
  const selected=adapter.selectPosition({lat:31.11,lng:121.235});assert.equal(selected.source,'simulated');
  const location=new LocationService({adapter,now:f.now,mayUseLocation:()=>adapter.allowed()});
  try{assert.equal(location.snapshot().fix,null);assert.equal((await location.locate()).ok,true);const fix=location.snapshot().fix;assert.equal(fix.lat,31.11);assert.equal(fix.lng,121.235);assert.equal(fix.timestampMs,f.now());assert.equal(fix.source,'simulated');assert.equal(location.snapshot().permission,'unknown');assert.equal(geofence(fix,fix,100,f.now()).code,'REAL_LOCATION_REQUIRED');}finally{location.dispose();}
});
test('coordinate fixture rechecks current scenario and identity before every selection',()=>{
  const f=fixture(),adapter=createQaLocationAdapter(f.services,f.now);f.scene.requireIdentity=()=>({authority:'supabase',scenarioId:f.scene.id,runId:f.scene.runId,ownerAccountId:'qa:test-owner'});assert.throws(()=>adapter.selectPosition({lat:31,lng:121}),{code:'QA_IDENTITY_MISMATCH'});
  f.remove();assert.throws(()=>adapter.selectPosition({lat:31,lng:121}),{code:'QA_SCENARIO_CHANGED'});
  assert.equal(createQaLocationAdapter({get:()=>null}),null);
});
