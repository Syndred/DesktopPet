// Acceptance-only main-process capability; never registered as product IPC.
// Caller must supply the independently verified holder/grant capability reader.
// No Boolean authorization, global LocationService prototype, secrets or network stubs.
const {realpathSync}=require('node:fs');
const {resolve}=require('node:path');
const {createHash}=require('node:crypto');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const installedLocations=new WeakMap();
const keys=['ciRunId','runId','nonce','sourceCommit','ownerAccountId','authUserId','deviceId','sessionId','scenarioId'];
function point(input){if(!input||Object.keys(input).sort().join(',')!=='lat,lng'||typeof input.lat!=='number'||typeof input.lng!=='number'||!Number.isFinite(input.lat)||!Number.isFinite(input.lng)||Math.abs(input.lat)>90||Math.abs(input.lng)>180)fail('INVALID_COORDINATES');return {lat:input.lat,lng:input.lng};}
function samePath(a,b){const normalize=p=>process.platform==='win32'?p.toLowerCase():p;return normalize(realpathSync(resolve(a)))===normalize(realpathSync(resolve(b)));}
async function installCloudQaUiLocationFixture({accounts,expected,assertHolderCapability,position}){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_RUN_ATTEMPT!=='1')fail('QA_RUNNER_REQUIRED');
 if(typeof assertHolderCapability!=='function'||!accounts?.services||typeof accounts.requireCloudActor!=='function')fail('QA_CAPABILITY_REQUIRED');
 for(const key of keys)if(typeof expected?.[key]!=='string'||!expected[key])fail('QA_BINDING_REQUIRED');
 if(expected.ciRunId!==process.env.GITHUB_RUN_ID)fail('QA_RUN_BINDING_MISMATCH');
 if(!expected.profilePath||!samePath(expected.profilePath,accounts.services.paths.userData))fail('QA_PROFILE_MISMATCH');
 const services=accounts.services,discovery=services.get('discovery'),location=discovery?.location;
 if(services.get('qaScenario')||!location||!discovery.authority||!discovery.cloudRuntime||typeof location.reset!=='function'||typeof services.events?.on!=='function')fail('QA_NORMAL_CLOUD_REQUIRED');
 const initialPoint=point(position);
 if(installedLocations.has(location))fail('QA_ALREADY_INSTALLED');const lease={};installedLocations.set(location,lease);
 const bindingDigest=createHash('sha256').update(JSON.stringify(Object.fromEntries([...keys,'profilePath'].sort().map(key=>[key,expected[key]])))).digest('hex');
 const epoch=accounts.epoch,original=location.adapter,installedAt=Date.now();let current=initialPoint,active=true,installed=false,off=null,timer=null,lastFix=null;
 function capability(){
  if(location.adapter!==(installed?adapter:original))fail('QA_ADAPTER_CHANGED');
  if(installedLocations.get(location)!==lease)fail('QA_CAPABILITY_CHANGED');
  if(!active||accounts.epoch!==epoch||services.get('discovery')!==discovery||discovery.location!==location||services.session.getOwnerAccountId()!==expected.ownerAccountId)fail('QA_SESSION_CHANGED');
  if(!samePath(expected.profilePath,services.paths.userData))fail('QA_PROFILE_MISMATCH');
  const cap=assertHolderCapability();if(!cap||typeof cap!=='object'||typeof cap.then==='function'||cap.businessHoldReleased!==true||cap.preloginGateVerified!==true)fail('QA_CAPABILITY_REQUIRED');
  for(const key of keys)if(cap[key]!==expected[key])fail('QA_BINDING_MISMATCH');
  if(!samePath(cap.profilePath,expected.profilePath)||!Number.isFinite(cap.expiresAt)||cap.expiresAt<=Date.now()||cap.expiresAt>installedAt+330*60000)fail('QA_CAPABILITY_EXPIRED');
  return cap;
 }
 async function gate(){
  capability();const context=await accounts.requireCloudActor();capability();const actor=context.actor||context;
  if(actor.authKind!=='supabase'||actor.authority!=='live')fail('QA_NORMAL_CLOUD_REQUIRED');
  for(const key of ['ownerAccountId','authUserId','deviceId','sessionId'])if(actor[key]!==expected[key])fail('QA_ACTOR_MISMATCH');
  if(context.url!=='https://jbvrdmrkwpznbrvteive.supabase.co'||typeof context.invoke!=='function')fail('QA_PROJECT_MISMATCH');
  const protocol=await context.invoke('discovery',{op:'protocol'});capability();
  if(protocol.simulatedLocationAllowed!==true||protocol.scenarioId!==expected.scenarioId)fail('GLOBAL_SERIAL_SCOPE_REVOKED');
 }
 function dispose(){if(!active)return;active=false;clearInterval(timer);off?.();lastFix=null;const wasInstalled=installed;installed=false;if(installedLocations.get(location)===lease)installedLocations.delete(location);if(wasInstalled){if(location.adapter!==adapter)fail('QA_ADAPTER_CHANGED');try{location.reset();}finally{if(location.adapter===adapter)location.adapter=original;}}}
 const adapter={scenario:'qa',scenarioId:expected.scenarioId,
  async getPosition({signal}={}){try{if(signal?.aborted)fail('LOCATION_CANCELLED');await gate();if(signal?.aborted)fail('LOCATION_CANCELLED');capability();lastFix={...current,timestampMs:Date.now()};return {ok:true,...lastFix,accuracyMeters:5,coordinateSystem:'wgs84',source:'simulated',provider:'controlled-test-fixture',positionSource:'Scenario',scenarioId:expected.scenarioId};}catch(error){dispose();throw error;}},
  metricFix(fix){capability();if(!lastFix||fix?.source!=='simulated'||fix.provider!=='controlled-test-fixture'||fix.scenarioId!==expected.scenarioId||fix.timestampMs!==lastFix.timestampMs||fix.lat!==lastFix.lat||fix.lng!==lastFix.lng)fail('QA_FIX_MISMATCH');return {...fix,source:'os'};}
 };
 try{await gate();capability();location.reset();capability();location.adapter=adapter;installed=true;off=services.events.on('accounts:session-changed',dispose);timer=setInterval(()=>{try{capability();}catch{try{dispose();}catch{}}},500);timer.unref?.();}
 catch(error){dispose();throw error;}
 return Object.freeze({
  // Main-process function only; never forwarded through window.lingjing.
  setPosition(input){capability();current=point(input);lastFix=null;location.reset();},
  status(){capability();return {active,bindingDigest,source:'simulated',scenarioId:expected.scenarioId,normalCloudAuthority:true};},
  dispose
 });
}
module.exports={installCloudQaUiLocationFixture};
