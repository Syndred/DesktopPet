// One bounded native Windows retry using the already restored third device.
// No simulated adapter, supplied coordinates, grants, native or HTTP replacement.
import {_electron as electron} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join,relative,isAbsolute} from 'node:path';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve('.'),output=resolve(`artifacts/cloud-discovery/native-retry-${Date.now()}`);
const profile=resolve(process.env.LINGJING_NATIVE_CLOUD_PROFILE||'artifacts/cloud-discovery/live-game-1792899947119/fresh-device-c');
const profileRelative=relative(resolve('artifacts/cloud-discovery'),profile);assert.ok(profileRelative&&!profileRelative.startsWith('..')&&!isAbsolute(profileRelative),'Only this worktree dedicated cloud-discovery test profiles may be reused');
mkdirSync(output,{recursive:true});
const evidence={at:new Date().toISOString(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',windowsHide:true}).trim(),build:JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8')),productionMain:true,registryObserverOnly:true,rawCoordinatesSaved:false,simulatedPosition:false,accuracyGateMeters:80,samples:[],errors:[],cloudProofVerified:false};
const bootstrap=join(output,'production-observer.cjs');let app;
writeFileSync(bootstrap,`const core=require(${JSON.stringify(join(root,'apps/pc-app/runtime/core/services.cjs'))}),create=core.createServices;let s;core.createServices=(...args)=>s=create(...args);
global.__nativeCloudRead=async op=>{await new Promise(setImmediate);await s.get('accounts').ready;
 if(op==='actor'){const c=await s.get('cloudActor').requireActor(),p=await c.invoke('discovery',{op:'protocol'});return{actor:c.actor,electron:process.versions.electron,qaProfile:Boolean(s.get('qaScenario')),simulatedLocationAllowed:p.simulatedLocationAllowed===true};}
 if(op==='sample'){const state=s.get('discovery').location.snapshot(),f=state.fix;return{status:state.status,permission:state.permission,watching:state.watching,source:f?.source,provider:f?.provider,accuracyMeters:f?.accuracyMeters,timestampMs:f?.timestampMs,coordinateHash:f?require('node:crypto').createHash('sha256').update(f.lat+','+f.lng).digest('hex'):null,error:state.lastError};}
 if(op==='prove'){const p=await s.get('locationProofs').prove('discover',''),nearby=await s.get('cloudActor').invoke('discovery',{op:'nearby',proofId:p.id});return{id:p.id,ownerAccountId:p.ownerAccountId,deviceId:p.deviceId,source:p.source,accuracyMeters:p.fix.accuracyMeters,nearbySource:nearby.source,nearbyCount:nearby.spawns.length};}
 throw Error('Unknown native observer operation');};require(${JSON.stringify(join(root,'apps/pc-app/dist/main/index.cjs'))});\n`);
const env={...process.env,PET_USER_DATA_DIR:profile,LINGJING_PUBLIC_CONFIG:resolve('config/lingjing-cloud-public.json')};
for(const name of['ELECTRON_RUN_AS_NODE','PET_RUNTIME_DATA_FILE','LINGJING_QA_SCENARIO','LINGJING_CONTROLLED_LOCATION','LINGJING_BATTLE_QA','LINGJING_DISCOVERY_CLOUD','LINGJING_LEGACY_AUTH'])delete env[name];
try{
 app=await electron.launch({args:[bootstrap],cwd:root,env});const page=await app.firstWindow();page.on('pageerror',e=>evidence.errors.push(e.message));await page.waitForFunction(()=>Boolean(window.lingjing));
 const read=op=>app.evaluate(async(_electron,op)=>{try{return{ok:true,data:await global.__nativeCloudRead(op)};}catch(e){return{ok:false,code:e.code,message:e.message};}},op).then(r=>{assert.equal(r.ok,true,JSON.stringify(r));return r.data;});
 const ipc=async(feature,command,payload={})=>{const r=await page.evaluate(input=>window.lingjing.invoke(input.feature,input.command,input.payload),{feature,command,payload});assert.equal(r.ok,true,JSON.stringify(r));return r.data;};
 const identity=await read('actor');assert.equal(identity.electron,'44.9.3');assert.equal(identity.qaProfile,false);assert.equal(identity.simulatedLocationAllowed,false);assert.equal(identity.actor.ownerAccountId,'account:31fa2df1-6847-4466-84ca-ed92bc4ee78f');evidence.identity=identity;
 const settings=await ipc('accounts','settingsGet');if(!settings.document.privacy.locationAllowed){settings.document.privacy.locationAllowed=true;await ipc('accounts','settingsSave',{revision:settings.revision,document:settings.document,actionId:randomUUID()});}
 await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'附近探索',exact:true}).click();await page.locator('.discovery-main-heading').waitFor({timeout:45000});
 await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.isVisible());w?.show();w?.focus();});await ipc('discovery','setExploring',{active:true});
 // The normal IPC starts the actual watch. Its cloud snapshot may be slower
 // than the OS sample, so observe the native state while the response finishes.
 await page.evaluate(()=>{window.__nativeWatchReply=null;void window.lingjing.invoke('discovery','watch').then(r=>{window.__nativeWatchReply={ok:r.ok,code:r.code};});});
 const deadline=Date.now()+35000;
 while(Date.now()<deadline){const sample=await read('sample');if(evidence.samples.at(-1)?.timestampMs!==sample.timestampMs||evidence.samples.at(-1)?.status!==sample.status)evidence.samples.push(sample);
  if(sample.status==='ready'){assert.equal(sample.source,'os');assert.equal(sample.provider,'windows-geolocator');assert.ok(sample.accuracyMeters<=80);evidence.proof=await read('prove');assert.equal(evidence.proof.source,'os');assert.equal(evidence.proof.nearbySource,'os');assert.ok(evidence.proof.nearbyCount>0);evidence.cloudProofVerified=true;break;}
  if(['denied','privacy_disabled','unavailable'].includes(sample.status))break;await page.waitForTimeout(500);
 }
 await ipc('discovery','stopWatch');const stopped=await read('sample');assert.equal(stopped.watching,false);evidence.watchStopped=true;
 evidence.nativeProviderVerified=evidence.samples.some(s=>s.source==='os'&&s.provider==='windows-geolocator'&&s.permission==='granted');evidence.outcome=evidence.cloudProofVerified?'native-os-cloud-proof-and-nearby-verified':evidence.nativeProviderVerified?'system-permission-granted-precision-still-insufficient':'native-provider-unavailable';assert.deepEqual(evidence.errors,[]);
}catch(error){evidence.error=error.message;throw error;}
finally{if(app)await app.close().catch(()=>{});writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({...evidence,output}));}
