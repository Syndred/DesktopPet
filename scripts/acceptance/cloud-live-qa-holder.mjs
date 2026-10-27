// Opt-in live acceptance identity preparation. Never run as a unit test.
// Credentials stay in this process and the application's normal login flow.
// No QA-marker bypass, management credentials, grant writes, or broad test commands.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,renameSync,existsSync,realpathSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,basename} from 'node:path';
import {launchPortableSession} from './portable-session.mjs';
import {pollState} from './poll-state.mjs';
import {sha256} from '../release/release-store.mjs';
const require=createRequire(import.meta.url);
const {SupabaseRemote,publicConfig,decodeProof}=require('../../apps/pc-app/runtime/features/accounts/supabase-remote.cjs');
const option=name=>process.argv.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3);
assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true','Only the authorized hosted Actions job may run this harness');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1','An uncertain registration run must not be rerun');
assert.ok(process.argv.includes('--authorized-two-live-accounts'),'Explicit opt-in required');
const expectedSource=option('source'),scenario=option('scenario'),executable=resolve(option('executable')||''),configPath=resolve(option('public-config')||'config/lingjing-cloud-public.json');
assert.match(expectedSource||'',/^[a-f0-9]{40}$/);assert.match(scenario||'',/^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,179}$/);
assert.ok(option('executable'));const config=publicConfig({env:{LINGJING_PUBLIC_CONFIG:configPath}});assert.ok(config);
const projectRef=new URL(config.url).hostname.split('.')[0];assert.equal(projectRef,option('project'),'Explicit project binding required');assert.equal(projectRef,'jbvrdmrkwpznbrvteive');assert.equal(new URL(config.url).origin,'https://jbvrdmrkwpznbrvteive.supabase.co','Exact authorized project origin required');
const output=resolve(option('output')||'artifacts/qa/live-qa-holder');mkdirSync(output,{recursive:true});
// Refuse stale evidence rather than overwriting another holder or re-registering.
for(const name of ['identity.json','identity-checkpoint.json','status.json','ready.json','final.json','finish.json'])assert.ok(!existsSync(join(output,name)),'Fresh output directory required');
const runId=randomUUID(),started=Date.now(),deadline=started+45*60_000,grantDeadline=started+30*60_000;
const models=[],roleModels={},identities=[],ownedPids=new Set();let stage='preflight',registrationAttempts=0,registrationInFlight=false,stopRequested=false,uncertainLaunch=false;
const write=(name,value)=>{const target=join(output,name),temporary=target+'.tmp';writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600});renameSync(temporary,target);};
const status=extra=>write('status.json',{format:'lingjing.live-qa-holder.status',version:1,runId,stage,updatedAt:new Date().toISOString(),registrationAttempts,...extra});
const check=()=>{if(stopRequested)throw Object.assign(Error(),{code:'STOP_REQUESTED'});if(Date.now()>=deadline)throw Object.assign(Error(),{code:'HOLDER_DEADLINE'});};
const delay=async ms=>{await new Promise(done=>setTimeout(done,ms));check();};
process.on('SIGINT',()=>{stopRequested=true;});process.on('SIGTERM',()=>{stopRequested=true;});
const safeCodes=new Set(['STOP_REQUESTED','HOLDER_DEADLINE','GRANT_TIMEOUT','GRANT_SCENARIO_MISMATCH','AUTH_INVALID','AUTH_REQUIRED','SESSION_INVALIDATED','ACCOUNT_EXISTS','AUTH_RATE_LIMITED','CLOUD_UNAVAILABLE','IDENTITY_CONFLICT','GLOBAL_SERIAL_SCOPE_REVOKED','GLOBAL_SERIAL_SCOPE_CONFLICT']);
const safeError=error=>safeCodes.has(error?.code)?error.code:'STAGE_FAILED';
function identity(entry){return {role:entry.role,ownerAccountId:entry.owner,authUserId:entry.uid,deviceId:entry.remote.deviceId};}
function checkpoint(){write('identity-checkpoint.json',{format:'lingjing.live-qa-holder.identity-checkpoint',version:1,runId,projectRef,scenarioIntent:scenario,sourceCommit:expectedSource,updatedAt:new Date().toISOString(),registrationComplete:false,devices:identities.filter(entry=>entry.owner&&entry.uid).map(entry=>({...identity(entry),registeredAt:entry.registeredAt}))});}
function verifyUser(user,entry){const proof=decodeProof(user.proof);assert.equal(user.id,proof.actor.ownerAccountId);assert.equal(user.authUserId,proof.actor.authUserId);assert.equal(proof.actor.deviceId,entry.remote.deviceId);if(entry.owner){assert.equal(user.id,entry.owner);assert.equal(user.authUserId,entry.uid);}return proof;}
async function refresh(entry){check();if(entry.proof.expiresAt<=Date.now()/1000+120){const bundle=await entry.remote.request('lingjing-auth',{op:'refresh',refreshToken:entry.proof.refreshToken,deviceLabel:'Cloud acceptance holder'});const {normalized}=require('../../apps/pc-app/runtime/features/accounts/supabase-remote.cjs');entry.proof=verifyUser(normalized(bundle),entry);}return entry.proof;}
async function policy(entry){const proof=await refresh(entry);const value=await entry.remote.request('discovery',{op:'protocol'},proof);if(value.simulatedLocationAllowed===true&&value.scenarioId!==scenario)throw Object.assign(Error(),{code:'GRANT_SCENARIO_MISMATCH'});return value.simulatedLocationAllowed===true&&value.scenarioId===scenario;}
function alive(pid){try{process.kill(pid,0);return true;}catch(error){if(error.code==='ESRCH')return false;throw error;}}
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','LANG','LC_ALL','CI','RUNNER_TRACKING_ID']);
const environment=Object.fromEntries(Object.keys(process.env).filter(key=>!systemKeys.has(key.toUpperCase())).map(key=>[key,undefined]));Object.assign(environment,{LINGJING_PUBLIC_CONFIG:configPath});
const result={format:'lingjing.live-qa-holder.result',version:1,runId,projectRef,scenario,sourceCommit:expectedSource,startedAt:new Date(started).toISOString(),scope:'Two authorized synthetic live identities / three devices; QA-scoped reviewed acceptance module. Not a complete original-98 registration case.',passed:false};
try{
 result.exeSha256=await sha256(executable);
 const reuse=JSON.parse(readFileSync('artifacts/qa/native-continuation/package-reuse.json','utf8')),build=JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json','utf8'));
 assert.equal(reuse.harnessCommit,execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim());assert.equal(reuse.packageSourceCommit,expectedSource);assert.equal(reuse.executableSha256,result.exeSha256);assert.equal(reuse.productPathsUnchanged,true);assert.equal(reuse.auditReceiptVerified,true);assert.equal(reuse.runtimeClosureVerified,true);assert.equal(build.sourceCommit,expectedSource);assert.deepEqual(build.sourceDirtyFiles,[]);assert.equal(build.compiledFingerprint,reuse.compiledFingerprint);
 result.compiledFingerprint=build.compiledFingerprint;
 const {runCloudLiveQaCases}=await import('./cloud-live-qa-cases.mjs');assert.equal(typeof runCloudLiveQaCases,'function');status();
 // Two is a hard upper bound. No account-name retries after uncertain requests.
 for(let index=0;index<2;index++){
  check();stage='registering';
  const profile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-live-holder-')));
  const entry={role:index===0?'a':'b',profile,remote:new SupabaseRemote({userData:profile,config}),account:`qa${randomBytes(10).toString('hex')}`,password:randomBytes(24).toString('base64url'),uiStarted:false};identities.push(entry);
  registrationAttempts++;assert.ok(registrationAttempts<=2);status({accountSlot:index+1});
  registrationInFlight=true;const user=await entry.remote.register(entry.account,entry.password,`云端验收${index+1}`);registrationInFlight=false;entry.proof=verifyUser(user,entry);entry.owner=user.id;entry.uid=user.authUserId;entry.registeredAt=new Date().toISOString();checkpoint();
  assert.ok(!identities.slice(0,-1).some(other=>other.owner===entry.owner||other.uid===entry.uid));
 }
 const original=identities[0],secondaryProfile=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-live-holder-')));
 const secondary={role:'a2',profile:secondaryProfile,remote:new SupabaseRemote({userData:secondaryProfile,config}),account:original.account,password:original.password,owner:original.owner,uid:original.uid,registeredAt:original.registeredAt,uiStarted:false};identities.push(secondary);
 stage='secondary-device-login';status();secondary.proof=verifyUser(await secondary.remote.login(secondary.account,secondary.password),secondary);checkpoint();
 write('identity.json',{format:'lingjing.live-qa-holder.identities',version:1,runId,projectRef,scenarioIntent:scenario,sourceCommit:expectedSource,createdAt:new Date().toISOString(),accounts:identities.filter(entry=>entry.role!=='a2').map(entry=>({ownerAccountId:entry.owner,authUserId:entry.uid,registeredAt:entry.registeredAt})),devices:identities.map(identity)});
 stage='awaiting-grant';status({grantDeadline:new Date(grantDeadline).toISOString()});
 for(;;){check();if(Date.now()>=grantDeadline)throw Object.assign(Error(),{code:'GRANT_TIMEOUT'});const grants=[];for(const entry of identities)grants.push(await policy(entry));status({grantedCount:grants.filter(Boolean).length,grantDeadline:new Date(grantDeadline).toISOString()});if(grants.every(Boolean))break;await delay(15_000);}
 stage='scoped-readback';status();
 // Snapshot can allocate missing serials. It is intentionally AFTER all three device grants.
 const scopeProof=[];
 for(const entry of identities){assert.equal(await policy(entry),true);const snapshot=await entry.remote.request('companions-sync',{op:'snapshot'},await refresh(entry));assert.equal(snapshot.ownerAccountId,entry.owner);assert.equal(snapshot.serialRegistry?.namespace,`qa:${scenario}`);assert.equal(snapshot.serialRegistry.ownerAccountId,entry.owner);assert.deepEqual(snapshot.serialRegistry.pets,[]);scopeProof.push({...identity(entry),namespace:snapshot.serialRegistry.namespace,petCount:0});}
 stage='native-login';status();
 async function launchAndLogin(entry){
  check();if(entry.proof)assert.equal(await policy(entry),true);uncertainLaunch=true;
  const model=await launchPortableSession({executable,profile:entry.profile,expectedSource,label:'live-qa-holder',environment});models.push(model);for(const pid of[model.launcherPid,model.runtime.pid])if(Number.isInteger(pid)&&pid>0)ownedPids.add(pid);uncertainLaunch=false;
  assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal(model.info.build.compiledFingerprint,result.compiledFingerprint);const before=await model.call('accounts','session');assert.equal(before.currentUser,null);assert.equal(before.defaultProvider,'runtime');assert.ok(!before.scenario);
  // Observe the application's own login instance once; never return its tokens.
  await model.main(()=>{
   const require=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
   const {SupabaseRemote}=require('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs');
   const original=SupabaseRemote.prototype.setCurrentUser;
   SupabaseRemote.prototype.setCurrentUser=function(session){
    const result=original.call(this,session);
    if(session){const remote=this;SupabaseRemote.prototype.setCurrentUser=original;
     globalThis.__liveQaScopeCheck=async()=>{if(!remote.active)throw Error('LIVE_QA_SIGNED_OUT');const proof=await remote.fresh({ownerAccountId:remote.active.actor.ownerAccountId,proof:JSON.stringify(remote.active)});const policy=await remote.request('discovery',{op:'protocol'},proof);return {ownerAccountId:proof.actor.ownerAccountId,authUserId:proof.actor.authUserId,deviceId:proof.actor.deviceId,allowed:policy.simulatedLocationAllowed===true,scenarioId:policy.scenarioId||null};};
    }return result;
   };
  });
  const actualDevice=await model.main(({app})=>{const fs=process.getBuiltinModule('node:fs'),path=process.getBuiltinModule('node:path');return JSON.parse(fs.readFileSync(path.join(app.getPath('userData'),'accounts','device.json'),'utf8')).deviceId;});assert.equal(actualDevice,entry.remote.deviceId);
  const page=model.page;await page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor();await page.locator('input[autocomplete="username"]').fill(entry.account);await page.getByLabel('密码',{exact:true}).fill(entry.password);
  for(const name of['保持登录','记住账号']){const box=page.getByRole('checkbox',{name,exact:true});if(await box.getAttribute('aria-checked')==='true')await box.click();}
  // This is normal UI input, not an additional cross-step credential handoff.
  await page.getByRole('button',{name:'登录进入 →',exact:true}).click();entry.uiStarted=true;entry.proof=null; // old device/session proof must never be refreshed now
  const session=await pollState(()=>model.call('accounts','session'),value=>Boolean(value.currentUser),{timeoutMs:45000,intervalMs:250,label:'Native login not completed'});
  assert.equal(session.currentUser.id,entry.owner);assert.equal(session.currentUser.authUserId,entry.uid);assert.equal(session.persistence,'memory');assert.ok(!session.scenario);await page.getByRole('navigation',{name:'主导航',exact:true}).waitFor();
  roleModels[entry.role]=model;return model;
 }
 async function assertActive(){check();for(const entry of identities){const model=roleModels[entry.role];if(!model)continue;const observed=await model.main(async()=>globalThis.__liveQaScopeCheck());assert.equal(observed.ownerAccountId,entry.owner);assert.equal(observed.authUserId,entry.uid);assert.equal(observed.deviceId,entry.remote.deviceId);assert.equal(observed.allowed,true);assert.equal(observed.scenarioId,scenario);}check();}
 for(const entry of identities)await launchAndLogin(entry);
 await assertActive();
 async function relaunch(role){check();const entry=identities.find(entry=>entry.role===role);assert.ok(entry);const old=roleModels[role];if(old){await old.stop();await pollState(()=>[old.launcherPid,old.runtime.pid].every(pid=>!alive(pid)),Boolean,{timeoutMs:10000,intervalMs:200,label:'Owned prior process still alive'});}const next=await launchAndLogin(entry);await assertActive();return next;}

 stage='ready-cases';write('ready.json',{format:'lingjing.live-qa-holder.ready',version:1,runId,projectRef,sourceCommit:expectedSource,scenario,readyAt:new Date().toISOString(),accounts:scopeProof,nativeLogin:true,persistence:'memory',registrationCoverage:'API preparation, not full native registration',deadline:new Date(deadline).toISOString()});status();
 stage='running-cases';status();
 const expectedActors=Object.fromEntries(identities.map(entry=>[entry.role,identity(entry)]));
 const cases=await runCloudLiveQaCases({models:roleModels,expectedActors,relaunch,assertActive,scenario,runId,output});
 assert.equal(cases?.passed,true,'Controlled cases did not complete');result.casesPassed=true;
 result.passed=true;
}catch(error){result.failedStage=stage;result.errorCode=safeError(error);process.exitCode=1;}
finally{
 stage='cleanup';status();let stopped=!uncertainLaunch;
 for(const model of models)try{await model.stop();}catch{stopped=false;}
 try{await pollState(()=>[...ownedPids].every(pid=>!alive(pid)),Boolean,{timeoutMs:10000,intervalMs:200,label:'Owned process exit uncertain'});}catch{stopped=false;}
 result.ownedProcessesStopped=stopped;result.profilesRemoved=0;
 for(const entry of identities){entry.password=null;entry.proof=null;entry.remote.dispose();if(stopped){try{assert.equal(dirname(entry.profile),realpathSync.native(tmpdir()));assert.ok(basename(entry.profile).startsWith('lingjing-live-holder-'));rmSync(entry.profile,{recursive:true,force:true});result.profilesRemoved++;}catch{result.cleanupFailed=true;}}}
 if(!stopped||result.profilesRemoved!==identities.length){result.cleanupFailed=true;result.passed=false;process.exitCode=1;}
 result.registrationAttempts=registrationAttempts;result.registrationOutcomeUncertain=registrationInFlight;result.confirmedIdentities=identities.filter(entry=>entry.owner&&entry.uid).map(identity);result.completedAt=new Date().toISOString();write('final.json',result);stage=result.passed?'completed':'failed';status({errorCode:result.errorCode||null});
}
