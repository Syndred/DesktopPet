// Real deployed HTTPS + real production Electron44/main Auth + native position.
// The bootstrap only observes the unmodified production service registry. No
// Auth, location, random or network mocks; no QA profile or server grant needed.
import {_electron as electron} from 'playwright';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=resolve('.'),output=resolve(`artifacts/cloud-discovery/live-location-${Date.now()}`);
const profileBase=process.env.LINGJING_CLOUD_PROBE_RESUME?resolve(process.env.LINGJING_CLOUD_PROBE_RESUME):output;
const publicConfig=resolve(process.env.LINGJING_PUBLIC_CONFIG||'C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/cloud-upgrade/2026-10-25/public-runtime-config.json');
mkdirSync(output,{recursive:true});
const config=JSON.parse(readFileSync(publicConfig,'utf8'));
const url=config.url||config.supabaseUrl||config.supabase_url,key=config.publishableKey||config.publishable_key;
assert.equal(new URL(url).hostname,'jbvrdmrkwpznbrvteive.supabase.co');assert.ok(key.startsWith('sb_publishable_'));
const proof={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),
  productionMain:true,registryObserverOnly:true,network:'real HTTPS',projectRef:'jbvrdmrkwpznbrvteive',rawCoordinatesSaved:false,tokensSaved:false,accounts:[],checks:[],native:[],errors:[],cloudProofVerified:false};
const bootstrap=join(output,'observe-production-main.cjs');
writeFileSync(bootstrap,`global.__cloudDiscoveryProbeRequire=require;const core=require(${JSON.stringify(join(root,'apps/pc-app/runtime/core/services.cjs'))});
const create=core.createServices;core.createServices=(...args)=>{const registry=create(...args);global.__cloudDiscoveryProbe=registry;return registry;};
require(${JSON.stringify(join(root,'apps/pc-app/dist/main/index.cjs'))});\n`);
const account=`cd03_${Date.now()}`,password=`Cloud03-${randomUUID()}!`,apps=[];
async function launch(label,credentials,register=false){
  const env={...process.env,PET_USER_DATA_DIR:join(profileBase,label),LINGJING_PUBLIC_CONFIG:publicConfig};
  for(const name of ['ELECTRON_RUN_AS_NODE','PET_RUNTIME_DATA_FILE','LINGJING_QA_SCENARIO','LINGJING_CONTROLLED_LOCATION','LINGJING_BATTLE_QA','LINGJING_DISCOVERY_CLOUD','LINGJING_LEGACY_AUTH'])delete env[name];
  const app=await electron.launch({args:[bootstrap],cwd:root,env});apps.push(app);
  const page=await app.firstWindow();page.on('pageerror',e=>proof.errors.push(e.message));await page.waitForFunction(()=>Boolean(window.lingjing));
  await app.evaluate(async()=>global.__cloudDiscoveryProbe.get('accounts').ready);
  const session=await page.evaluate(()=>window.lingjing.invoke('accounts','session'));
  if(!session.data?.currentUser){
    const response=await page.evaluate(async({credentials,register})=>window.lingjing.invoke('accounts',register?'register':'login',{provider:'runtime',...credentials,confirmPassword:credentials.password,username:'探索云端验证',rememberSession:true}),{credentials,register});
    assert.equal(response.ok,true,JSON.stringify(response));
  }
  const identity=await app.evaluate(async()=>{await new Promise(setImmediate);const s=global.__cloudDiscoveryProbe,c=await s.get('cloudActor').requireActor();return{actor:c.actor,electron:process.versions.electron,safeStorage:s.safeStorage.isEncryptionAvailable(),qaScenarioPresent:Boolean(s.get('qaScenario'))};});
  assert.equal(identity.electron,'44.9.3');assert.equal(identity.qaScenarioPresent,false);assert.equal(identity.actor.authKind,'supabase');proof.accounts.push({label,...identity});
  return{app,page,actor:identity.actor};
}
async function command(client,feature,command,payload={}){const result=await client.page.evaluate(v=>window.lingjing.invoke(v.feature,v.command,v.payload),{feature,command,payload});assert.equal(result.ok,true,JSON.stringify(result));return result.data;}
async function invoke(client,body){const result=await client.app.evaluate(async(_electron,body)=>{await new Promise(setImmediate);try{return{ok:true,data:await global.__cloudDiscoveryProbe.get('cloudActor').invoke('discovery',body)};}catch(e){return{ok:false,code:e.code,httpStatus:e.httpStatus};}},body);assert.equal(result.ok,true,JSON.stringify(result));return result.data;}
async function expectRejected(client,body,label,allowedCodes){
  const code=await client.app.evaluate(async(_electron,body)=>{await new Promise(setImmediate);try{await global.__cloudDiscoveryProbe.get('cloudActor').invoke('discovery',body);return'ACCEPTED';}catch(e){return e.code||e.message;}},body);
  assert.ok(allowedCodes.includes(code),`${label}: ${code}`);proof.checks.push({label,code,rejected:true});
}
async function enroll(client){return client.app.evaluate(async()=>{
  await new Promise(setImmediate);
  const require=global.__cloudDiscoveryProbeRequire,s=global.__cloudDiscoveryProbe,context=await s.get('cloudActor').requireActor();
  const {CloudLocationProofs}=require(require('node:path').join(process.cwd(),'apps/pc-app/runtime/features/discovery/cloud-location.cjs'));
  const signer=new CloudLocationProofs({authority:{getActor:async()=>context.actor,invoke:(op,body)=>context.invoke('discovery',{...body,op})},getFix:()=>s.get('discovery').requireFix(),safeStorage:s.safeStorage,userData:s.paths.userData});
  const key=signer.privateKey(context.actor),jwk=require('node:crypto').createPublicKey(key).export({format:'jwk'});
  const publicJwk={kty:'EC',crv:'P-256',x:jwk.x,y:jwk.y};global.__cloudDiscoveryProbeSigner=signer;
  const registered=await context.invoke('discovery',{op:'device.register',publicJwk});return{ownerAccountId:registered.ownerAccountId,publicKeyFingerprint:registered.keyFingerprint};
});}
try{
  for(const [label,token]of [['missing JWT',null],['forged JWT','e30.e30.invalid']]){
    const response=await fetch(url+'/functions/v1/discovery',{method:'POST',headers:{apikey:key,'content-type':'application/json','x-lingjing-device-id':randomUUID(),...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({op:'protocol'})});
    assert.equal(response.status,401);proof.checks.push({label,status:response.status,rejected:true});
  }
  const a=await launch('device-a',{account,password},true),b=await launch('device-b',{account,password});
  assert.equal(a.actor.ownerAccountId,b.actor.ownerAccountId);assert.notEqual(a.actor.deviceId,b.actor.deviceId);assert.notEqual(a.actor.sessionId,b.actor.sessionId);
  for(const client of[a,b]){assert.equal((await invoke(client,{op:'protocol'})).protocol,'lingjing-discovery-v2');assert.equal((await enroll(client)).ownerAccountId,client.actor.ownerAccountId);}
  proof.checks.push({label:'real Auth two same-owner device sessions, protocol and public-key registration',passed:true});
  const challenge=await invoke(a,{op:'location.challenge',purpose:'discover',reference:''});
  assert.equal(challenge.ownerAccountId,a.actor.ownerAccountId);assert.equal(challenge.deviceId,a.actor.deviceId);assert.equal(challenge.sessionId,a.actor.sessionId);
  proof.checks.push({label:'server nonce binds auth UID, preserved owner, device, session and discover purpose',passed:true,challengeId:challenge.id});
  await expectRejected(a,{op:'nearby',ownerAccountId:'forged-owner',proofId:randomUUID()},'body authority',['CLIENT_AUTHORITY_FORBIDDEN']);
  await expectRejected(b,{op:'location.prove',challengeId:challenge.id,fix:{},signature:'invalid'},'other device cannot use A nonce',['LOCATION_CHALLENGE_INVALID']);
  await expectRejected(a,{op:'location.prove',challengeId:challenge.id,fix:{},signature:'invalid'},'invalid signed coordinates',['INVALID_COORDINATES','LOCATION_SIGNATURE_INVALID']);
  const foreign=await launch('foreign-owner',{account:`cf03_${Date.now()}`,password:`Cloud03-${randomUUID()}!`},true);await enroll(foreign);
  await expectRejected(foreign,{op:'location.prove',challengeId:challenge.id,fix:{},signature:'invalid'},'cross-owner nonce denied',['LOCATION_CHALLENGE_INVALID']);
  const settings=await command(b,'accounts','settingsGet');settings.document.privacy.locationAllowed=true;
  await command(b,'accounts','settingsSave',{revision:settings.revision,document:settings.document,actionId:randomUUID()});
  await b.page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'附近探索',exact:true}).click();await b.page.locator('.discovery-main-heading').waitFor();
  await command(b,'discovery','watch');
  // Bound native wait; never supplies a fixture or relaxes the original80m gate.
  const deadline=Date.now()+32000;
  while(Date.now()<deadline){
    const sample=await b.app.evaluate(()=>{const require=global.__cloudDiscoveryProbeRequire,s=global.__cloudDiscoveryProbe.get('discovery').location.snapshot(),f=s.fix;return{status:s.status,permission:s.permission,accuracyMeters:f?.accuracyMeters,source:f?.source,provider:f?.provider,timestampMs:f?.timestampMs,coordinateHash:f?require('node:crypto').createHash('sha256').update(f.lat+','+f.lng).digest('hex'):null,error:s.lastError};});
    if(proof.native.at(-1)?.timestampMs!==sample.timestampMs||proof.native.at(-1)?.status!==sample.status)proof.native.push(sample);
    if(sample.status==='ready'){
      const verified=await b.app.evaluate(async()=>{await new Promise(setImmediate);const require=global.__cloudDiscoveryProbeRequire,s=global.__cloudDiscoveryProbe,p=await s.get('locationProofs').prove('discover','');
        const nearby=await s.get('cloudActor').invoke('discovery',{op:'nearby',proofId:p.id});
        return{proofId:p.id,ownerAccountId:p.ownerAccountId,deviceId:p.deviceId,source:p.source,accuracyMeters:p.fix.accuracyMeters,coordinateHash:require('node:crypto').createHash('sha256').update(p.fix.lat+','+p.fix.lng).digest('hex'),nearbyCount:nearby.spawns.length,nearbySource:nearby.source};});
      assert.equal(verified.source,'os');assert.ok(verified.accuracyMeters<=80);assert.ok(verified.nearbyCount>0);proof.cloudProofVerified=true;proof.verified=verified;break;
    }
    if(['denied','privacy_disabled','unavailable'].includes(sample.status))break;
    await new Promise(done=>setTimeout(done,500));
  }
  await command(b,'discovery','stopWatch');
  // Adversarial signed coarse/stale/default samples use the actual native fix,
  // never label these intentionally invalid requests as accepted real position.
  const negatives=await b.app.evaluate(async()=>{
    await new Promise(setImmediate);
    const require=global.__cloudDiscoveryProbeRequire,s=global.__cloudDiscoveryProbe,ctx=await s.get('cloudActor').requireActor(),signer=global.__cloudDiscoveryProbeSigner,raw=s.get('discovery').location.snapshot().fix;
    if(!raw)return[];
    const crypto=require('node:crypto'),canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}',out=[];
    for(const [label,change]of [['signed coarse sample',{accuracyMeters:81}],['signed stale sample',{timestampMs:Date.now()-31000}],['signed default position',{positionSource:'Default'}],['unauthorized simulated input',{source:'simulated',provider:'qa-discovery',scenarioId:'client-self-granted'}]]){
      const challenge=await ctx.invoke('discovery',{op:'location.challenge',purpose:'discover',reference:''}),fix={...raw,timestampMs:Date.now(),...change};
      const envelope={protocol:'lingjing-discovery-v2',authUserId:ctx.authUserId,ownerAccountId:ctx.ownerAccountId,deviceId:ctx.deviceId,sessionId:ctx.sessionId,challengeId:challenge.id,nonce:challenge.nonce,purpose:challenge.purpose,reference:'',fix};
      const signature=crypto.sign('sha256',Buffer.from(canonical(envelope)),{key:signer.privateKey(ctx.actor),dsaEncoding:'ieee-p1363'}).toString('base64url');
      try{await ctx.invoke('discovery',{op:'location.prove',challengeId:challenge.id,fix,signature});out.push({label,code:'ACCEPTED'});}catch(e){out.push({label,code:e.code});}
    }return out;
  });
  for(const item of negatives){assert.ok(['LOCATION_IMPRECISE','LOCATION_STALE','LOCATION_DEFAULT_POSITION','REAL_LOCATION_REQUIRED'].includes(item.code),JSON.stringify(item));proof.checks.push({...item,rejected:true});}
  const revoked=await a.app.evaluate(async()=>{await new Promise(setImmediate);const s=global.__cloudDiscoveryProbe,ctx=await s.get('cloudActor').requireActor();const r=await ctx.client.rpc('lingjing_revoke_device',{p_device_id:ctx.deviceId});if(r.error)throw new Error(r.error.code);try{await ctx.invoke('discovery',{op:'protocol'});return'ACCEPTED';}catch(e){return e.code;}});
  assert.notEqual(revoked,'ACCEPTED');assert.equal((await invoke(b,{op:'protocol'})).protocol,'lingjing-discovery-v2');proof.checks.push({label:'revoked A rejected while independent same-owner B remains active',code:revoked,passed:true});
  assert.deepEqual(proof.errors,[]);proof.passed=true;proof.fullCaptureVerified=false;
}catch(error){proof.passed=false;proof.error={message:error.message,code:error.code};throw error;}
finally{for(const app of apps.reverse())await app.close().catch(()=>{});writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2)+'\n');writeFileSync(resolve('artifacts/cloud-discovery/latest-live-location.json'),JSON.stringify({...proof,output},null,2)+'\n');console.log(JSON.stringify({passed:proof.passed,cloudProofVerified:proof.cloudProofVerified,checks:proof.checks.length,native:proof.native,output,error:proof.error}));}
