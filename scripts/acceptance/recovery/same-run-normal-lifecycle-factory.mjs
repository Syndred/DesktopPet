// Same-run normal product lifecycle. Importing never logs in, generates a secret,
// resets an account, creates a profile, or calls a network service.
import assert from 'node:assert/strict';
import {createHash,randomUUID,randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,renameSync,realpathSync,existsSync,rmSync,lstatSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,basename} from 'node:path';
import {compactVerify,importSPKI} from 'jose';
import {assertCompletionAuthorization,assertAuthorizedVault,vaultChildEnvironment,FIXED_IDENTITIES} from '../dpapi/authorized-vault-client.mjs';
import {hashNewPassword,sealHash,validateBinding,verifyAppliedReceipt} from './protocol.mjs';
import {readAppliedReceipt} from './transport.mjs';
import {launchPortableSession} from '../portable-session.mjs';
import {pollState} from '../poll-state.mjs';
import {createPlatformCellRequest} from '../cloud-live-qa-s02-platform-cell.mjs';
import {observePlatformFourGrantTransition} from '../cloud-live-qa-s06-platform-transition.mjs';
import {installPlatformS06BeforeLogin,admitPlatformS06SingleSnapshot,releasePlatformS06AfterFormalGrant,installS06BeforeLogin,s06GateSafeManifest,admitS06SingleSnapshot,releaseS06AfterFormalGrant,closeS06GateAfterOwnedProcessStopped} from '../cloud-live-qa-s06-prelogin-gate.mjs';
import {createNewCUiLifecycle} from '../cloud-new-c-ui-lifecycle.mjs';
import {assertPreparedCompletion} from '../cloud-live-qa-completion-readiness.mjs';
const require=createRequire(import.meta.url),sha=x=>createHash('sha256').update(x).digest('hex');
const states=new WeakMap(),roles=['a','a2','a3','b','c'];
const origin='https://jbvrdmrkwpznbrvteive.supabase.co';
const scenario='cloud-acceptance-20261027-8be246d1';
const proofPurposes=new Set(['grant-manifest','s06-pregrant','s02-empty-cell','c-absent','reconcile-A','reconcile-B','reconcile-C']);
const exact=(o,keys)=>assert.deepEqual(Object.keys(o).sort(),[...keys].sort());
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const slotFor=role=>role.startsWith('a')?'A':role.toUpperCase();
function own(cap){const s=states.get(cap);assert.ok(s,'REAL_LIFECYCLE_CAPABILITY_REQUIRED');assertCompletionAuthorization(s.authorization);return s;}
function safeWrite(s,name,value){assert.match(name,/^[a-z0-9-]+\.json$/);const file=join(s.output,name);writeFileSync(file+'.tmp',JSON.stringify(value,null,2),{mode:0o600});renameSync(file+'.tmp',file);}
function live(pid){try{process.kill(pid,0);return true;}catch(e){if(e.code==='ESRCH')return false;throw e;}}
export function parentProofUrl(nonce,purpose){assert.match(nonce,/^[a-f0-9-]{36}$/);assert.ok(proofPurposes.has(purpose));return `https://raw.githubusercontent.com/Syndred/DesktopPet/refs/heads/codex/cloud-authority-convergence/scripts/acceptance/requests/same-run-${nonce}-${purpose}.json`;}
export function validateParentProofClaims(p,a,purpose,now=Date.now()){
 exact(p,['version','purpose','nonce','run','commit','requestDigest','sequence','issuedAt','expiresAt','payload']);
 assert.equal(p.version,1);assert.equal(p.purpose,purpose);for(const k of ['nonce','run','commit','requestDigest'])assert.equal(p[k],a[k]);
 assert.ok(Number.isSafeInteger(p.sequence)&&p.sequence>0);assert.ok(Number.isSafeInteger(p.issuedAt)&&Number.isSafeInteger(p.expiresAt));
 assert.ok(p.issuedAt<=now&&p.expiresAt>now&&p.expiresAt<=a.expiresAt&&p.expiresAt-p.issuedAt<=120000);
 assert.ok(p.payload&&typeof p.payload==='object'&&!Array.isArray(p.payload));return p;
}
async function freshParentProof(cap,purpose,expected){
 const s=own(cap),a=s.binding,deadline=Math.min(a.expiresAt,Date.now()+20*60000);assert.ok(proofPurposes.has(purpose));
 safeWrite(s,'awaiting-parent-proof.json',{run:a.run,nonce:a.nonce,purpose,requestedAt:new Date().toISOString(),expected});
 while(Date.now()<deadline){own(cap);const response=await fetch(parentProofUrl(a.nonce,purpose),{credentials:'omit',redirect:'error',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(Math.min(10000,deadline-Date.now()))});
  if(response.status===404){await response.body?.cancel();await pause(2000);continue;}assert.equal(response.status,200,'FIXED_PARENT_PROOF_TRANSPORT_FAILED');
  let size=0;const chunks=[];for await(const b of response.body){size+=b.length;assert.ok(size<=32768);chunks.push(b);}const envelope=JSON.parse(Buffer.concat(chunks));exact(envelope,['jws']);assert.equal(typeof envelope.jws,'string');
  const {payload,protectedHeader}=await compactVerify(envelope.jws,await importSPKI(a.recovery.signingPublicPem,'EdDSA'),{algorithms:['EdDSA']});
  exact(protectedHeader,['alg','typ','kid']);assert.equal(protectedHeader.typ,'lingjing-same-run-parent-proof-v1');assert.equal(protectedHeader.kid,a.recovery.signingKeySha256);
  const proof=validateParentProofClaims(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload)),a,purpose);
  if(proof.sequence<=(s.proofSequences.get(purpose)||0)){await pause(2000);continue;}
  for(const [k,v] of Object.entries(expected))assert.deepEqual(proof.payload[k],v,'EXACT_PARENT_PROOF_BINDING');s.proofSequences.set(purpose,proof.sequence);return proof.payload;
 }throw Error('PARENT_PROOF_WAIT_EXPIRED');
}
// This function is serialized only into the exact newly launched main process.
// Capture one real AccountsService instance; restore the prototype immediately.
export function captureAccountsForLifecycle(_e,b){
 const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
 const p=req('./apps/pc-app/runtime/features/accounts/service.cjs').AccountsService.prototype;
 if(globalThis.__qaUiCaseContext||globalThis.__sameRunAccountCapture)throw Error('EXISTING_CONTEXT');
 const original=p.session,state={p,original,b};globalThis.__sameRunAccountCapture=state;
 p.session=function(...args){const result=original.apply(this,args);if(state.accounts&&state.accounts!==this)throw Error('AMBIGUOUS_ACCOUNTS');state.accounts=this;p.session=original;return result;};
}
export function installNormalPreloginHold(_e,b){
 const capture=globalThis.__sameRunAccountCapture,a=capture?.accounts;
 if(!a||a.current||a.qaScenario||a.remote?.authKind!=='supabase'||a.remote.config.url!==b.origin)throw Error('NORMAL_FRESH_ACCOUNT_REQUIRED');
 const fs=process.getBuiltinModule('node:fs');if(fs.realpathSync(a.services.paths.userData).toLowerCase()!==fs.realpathSync(b.profile).toLowerCase())throw Error('PROFILE_MISMATCH');
 if(capture.p.session!==capture.original)throw Error('CAPTURE_NOT_RESTORED');delete globalThis.__sameRunAccountCapture;
 const remote=a.remote,originalRequest=remote.request,originalFetch=remote.fetcher,allowed=new Map();
 const h={accounts:a,binding:b,bindingDigest:null,epoch:null,released:false,loginFrozen:false,requestCount:0,registerCount:0,loginCount:0,originalRequest,originalFetch};
 const deny=()=>{throw Object.assign(Error('Business held before exact formal grant'),{code:'SAME_RUN_PREGRANT_HOLD'});};
 remote.fetcher=async function(url,options){if(h.released)return originalFetch.call(this,url,options);const sig=String(url)+'\n'+String(options?.body||'');if(allowed.get(sig)!==1)return deny();allowed.delete(sig);return originalFetch.call(this,url,options);};
 remote.request=async function(name,body,proof){
  if(this!==remote||this.deviceId!==b.deviceId||this.config.url!==b.origin)return deny();
  if(h.released){if(h.loginFrozen&&name==='lingjing-auth'&&['login','register','refresh'].includes(body?.op))return deny();return originalRequest.call(this,name,body,proof);}
  let admitted=false;
  if(name==='lingjing-auth'&&body?.account===b.accountKey&&!proof&&body.op==='login'&&!h.loginCount&&!h.loginFrozen){h.loginCount++;admitted=true;}
  else if(name==='lingjing-auth'&&body?.account===b.accountKey&&!proof&&body.op==='register'&&b.role==='c'&&!h.registerCount&&!h.loginFrozen){h.registerCount++;admitted=true;}
  else if(name==='lingjing-auth'&&['actor','refresh','logout'].includes(body?.op)&&((proof?.actor?.deviceId===b.deviceId&&(!b.owner||proof.actor.ownerAccountId===b.owner))||(!proof&&this.active?.actor?.deviceId===b.deviceId&&body.refreshToken===this.active.refreshToken)))admitted=true;
  else if(name==='discovery'&&body?.op==='protocol'&&Object.keys(body).length===1&&proof?.actor?.deviceId===b.deviceId)admitted=true;
  if(!admitted)return deny();const sig=b.origin+'/functions/v1/'+name+'\n'+JSON.stringify(body);if(allowed.has(sig))return deny();allowed.set(sig,1);h.requestCount++;
  try{return await originalRequest.call(this,name,body,proof);}finally{allowed.delete(sig);}
 };
 h.safe=async()=>{const context=await a.requireCloudActor(),actor=context.actor||context;if(actor.authKind!=='supabase'||actor.authority!=='live'||actor.deviceId!==b.deviceId||context.url!==b.origin)throw Error('NORMAL_ACTOR_MISMATCH');if(b.owner&&actor.ownerAccountId!==b.owner)throw Error('OWNER_MISMATCH');return {ownerAccountId:actor.ownerAccountId,authUserId:actor.authUserId,deviceId:actor.deviceId,sessionId:actor.sessionId,epoch:a.epoch};};
 h.scope=async()=>{const actor=await h.safe(),context=await a.requireCloudActor(),p=await context.invoke('discovery',{op:'protocol'});return {...actor,allowed:p.simulatedLocationAllowed===true,scenario:p.scenarioId||null};};
 h.release=async grant=>{const p=await h.scope();for(const k of ['ownerAccountId','authUserId','deviceId'])if(p[k]!==grant[k])throw Error('GRANT_BINDING_MISMATCH');if(!p.allowed||p.scenario!==b.scenario||grant.expiresAtMs<=Date.now())throw Error('FORMAL_GRANT_REQUIRED');h.epoch=a.epoch;h.expiresAt=Math.min(grant.expiresAtMs,b.expiresAt);h.released=true;return {released:true};};
 globalThis.__qaUiCaseContext=h;return {captured:true,deviceId:remote.deviceId,held:true};
}
export function installRestoredCAuthGuard(_e,b){
 const capture=globalThis.__sameRunAccountCapture,a=capture?.accounts;if(!a||a.qaScenario||a.current?.authKind!=='supabase')throw Error('NORMAL_PERSISTENT_RESTORE_REQUIRED');delete globalThis.__sameRunAccountCapture;
 const remote=a.remote,original=remote.request,h={accounts:a,binding:b,released:true,epoch:a.epoch,expiresAt:b.expiresAt,loginFrozen:false};
 remote.request=async function(name,body,proof){
  if(this!==remote||globalThis.__qaUiCaseContext!==h||Date.now()>=h.expiresAt||(h.loginFrozen&&a.epoch!==h.epoch))throw Error('C_SESSION_CHANGED');
  if(!h.loginFrozen)h.epoch=a.epoch;
  if(h.loginFrozen&&name==='lingjing-auth'&&['login','register'].includes(body?.op))throw Error('C_AUTH_FROZEN');
  const frozenRefresh=h.loginFrozen&&name==='lingjing-auth'&&body?.op==='refresh';
  if(frozenRefresh){if(!h.frozenActor||proof||body.refreshToken!==remote.active?.refreshToken)throw Error('C_REFRESH_BINDING_CHANGED');for(const key of ['ownerAccountId','authUserId','deviceId','sessionId'])if(remote.active?.actor?.[key]!==h.frozenActor[key])throw Error('C_REFRESH_BINDING_CHANGED');}
  // Preserve original failures: the product turns a genuine refresh 401 into
  // SESSION_INVALIDATED and emits its original session invalidation listener.
  const result=await original.call(this,name,body,proof);
  if(frozenRefresh){if(a.epoch!==h.epoch)throw Error('C_SESSION_CHANGED');for(const key of ['ownerAccountId','authUserId','deviceId','sessionId'])if(result?.actor?.[key]!==h.frozenActor[key])throw Error('C_REFRESH_BINDING_CHANGED');}
  return result;
 };
 globalThis.__qaUiCaseContext=h;
}

export async function prepareNormalLifecycle({authorization,roles:roleLabels,completionOptions,completionPlan}){
 const a=assertCompletionAuthorization(authorization);assertPreparedCompletion(completionPlan);assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.deepEqual(Object.keys(roleLabels),roles);assert.ok(process.env.RUNNER_TEMP);assert.equal(realpathSync.native(tmpdir()).toLowerCase(),realpathSync.native(process.env.RUNNER_TEMP).toLowerCase(),'PRIVATE_PROFILE_TEMP_ROOT_REQUIRED');
 assert.equal(completionOptions.scenario,scenario);assert.equal(completionPlan.runId,completionOptions.runId);assert.equal(completionPlan.packageProof?.sourceCommit,a.packageSource);assert.equal(completionPlan.packageProof?.exeSha256,a.executableSha256);
 const output=resolve('artifacts/qa/same-run-'+a.run);assert.ok(!existsSync(output),'ONE_FRESH_LIFECYCLE_ONLY');mkdirSync(dirname(output),{recursive:true});mkdirSync(output,{recursive:false});
 const profiles={...completionPlan.launchProfiles};for(const role of roles)if(!profiles[role])profiles[role]=realpathSync.native(mkdtempSync(join(tmpdir(),'lingjing-live-holder-')));
 const cap=Object.freeze({});states.set(cap,{authorization,binding:a,completionOptions,completionPlan,profiles,profileRoots:Object.freeze(Object.fromEntries(Object.entries(profiles).map(([r,p])=>{const st=lstatSync(p);assert.equal(st.isSymbolicLink(),false);const canonical=realpathSync.native(p);assert.match(basename(canonical),/^lingjing-live-holder-/);assert.equal(dirname(canonical).toLowerCase(),realpathSync.native(tmpdir()).toLowerCase());return [r,Object.freeze({canonical,dev:st.dev,ino:st.ino})];}))),output,models:{},identities:{},proofSequences:new Map(),resetResults:{},scopeGrants:new Map(),roleLabels,supervisor:null,revoked:new Set()});return cap;
}
export async function prepareReconciliationLifecycle({authorization}){
 const binding=assertCompletionAuthorization(authorization);assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');
 const output=resolve('artifacts/qa/same-run-'+binding.run);assert.ok(existsSync(output),'ORIGINAL_LIFECYCLE_DIRECTORY_REQUIRED');assert.equal(lstatSync(output).isSymbolicLink(),false);assert.equal(realpathSync.native(output),output);
 const cap=Object.freeze({});states.set(cap,{authorization,binding,output,models:{},identities:{},proofSequences:new Map(),resetResults:{},scopeGrants:new Map(),supervisor:null,reconciliationOnly:true});return cap;
}
export function assertOwnedProfileRoot(path,ticket){
 assert.ok(ticket&&typeof ticket.canonical==='string');assert.equal(lstatSync(path).isSymbolicLink(),false,'OWNED_PROFILE_REPARSE_REJECTED');const canonical=realpathSync.native(path),st=lstatSync(path);
 assert.equal(canonical,ticket.canonical,'OWNED_CANONICAL_PROFILE_CHANGED');assert.equal(st.dev,ticket.dev);assert.equal(st.ino,ticket.ino);assert.match(basename(canonical),/^lingjing-live-holder-/);assert.equal(dirname(canonical).toLowerCase(),realpathSync.native(tmpdir()).toLowerCase());return canonical;
}
const systemKeys=new Set(['PATH','PATHEXT','SYSTEMROOT','SYSTEMDRIVE','WINDIR','COMSPEC','TEMP','TMP','TMPDIR','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMW6432','PROGRAMDATA','PSMODULEPATH']);
export function appEnvironment(){const env=Object.fromEntries(Object.keys(process.env).filter(k=>k.toUpperCase()!=='PET_USER_DATA_DIR').map(k=>[k,systemKeys.has(k.toUpperCase())?process.env[k]:undefined]));return {...env,GITHUB_ACTIONS:'true',GITHUB_RUN_ATTEMPT:'1',GITHUB_RUN_ID:process.env.GITHUB_RUN_ID};}
function processIdentity(pid){
 assert.ok(Number.isInteger(pid)&&pid>0);const script=`$ErrorActionPreference='Stop'; $p=[Diagnostics.Process]::GetProcessById(${pid}); [Console]::Out.WriteLine((@{pid=$p.Id;startTicks=$p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture);image=$p.MainModule.FileName}|ConvertTo-Json -Compress))`;
 const bytes=execFileSync(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:10000,maxBuffer:4096,windowsHide:true,stdio:['ignore','pipe','ignore'],env:vaultChildEnvironment()});
 const value=JSON.parse(bytes);exact(value,['pid','startTicks','image']);assert.equal(value.pid,pid);assert.match(value.startTicks,/^[0-9]{1,19}$/);assert.ok(value.image);return value;
}
export async function verifySupervisorCapability(cap,{vault,...binding}){
 const s=own(cap);assertAuthorizedVault(vault);for(const k of ['run','commit','requestDigest','expiresAt'])assert.equal(binding[k],s.binding[k]);
 for(const fn of ['bindHolder','registerOwnedModel','registerSupervisor','registerBusinessDeadline','verifyRegistry'])assert.equal(typeof vault[fn],'function','REAL_SUPERVISOR_REGISTRY_REQUIRED');
 const holder=processIdentity(process.pid);await vault.bindHolder(holder);s.vault=vault;
 if(s.supervisor){assert.equal(s.supervisor.closed,false);return {ready:true};}
 // A second factory in a resumed holder must find an independently registered
 // watchdog, never assume a predecessor process or start a competing mutex owner.
 const registry=await vault.verifyRegistry();assert.equal(registry.records.filter(r=>r.kind==='holder').at(-1)?.process.pid,process.pid);
 const priorWatchdog=registry.records.filter(r=>r.kind==='supervisor');assert.ok(priorWatchdog.length<=1);
 if(priorWatchdog.length){const expected=priorWatchdog[0].process;assert.deepEqual(processIdentity(expected.pid),expected,'Original watchdog must still be alive');s.supervisor={ready:true,closed:false,existingProcess:expected};return {ready:true,sameVmOnly:true,resumedOriginalWatchdog:true};}
 const child=spawn(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',resolve('scripts/acceptance/dpapi/holder-supervisor.ps1'),'-RequestDigest',binding.requestDigest,'-HolderPid',String(holder.pid),'-HolderStartTicks',holder.startTicks,'-HolderImage',holder.image],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:vaultChildEnvironment()});
 const watcher={child,closed:false,ready:false};s.supervisor=watcher;child.stderr.on('data',()=>{});child.on('exit',()=>{watcher.closed=true;});
 await new Promise((ok,fail)=>{let buf='';const timer=setTimeout(()=>fail(Error('SUPERVISOR_NOT_READY')),10000);child.once('error',()=>{clearTimeout(timer);fail(Error('SUPERVISOR_START_FAILED'));});child.stdout.on('data',b=>{buf+=b;if(buf.length>4096){clearTimeout(timer);fail(Error('SUPERVISOR_OUTPUT_INVALID'));return;}const line=buf.split(/\r?\n/).find(x=>x);if(!line)return;try{const r=JSON.parse(line);assert.equal(r.ready,true);assert.equal(r.sameRunOnly,true);watcher.ready=true;clearTimeout(timer);ok();}catch{clearTimeout(timer);fail(Error('SUPERVISOR_NOT_READY'));}});});
 assert.ok(watcher.ready&&!watcher.closed);await vault.registerSupervisor(processIdentity(child.pid));return {ready:true,sameVmOnly:true};
}
async function captureModel(s,model,role){
 const account=FIXED_IDENTITIES[slotFor(role)];assert.deepEqual(model.info.build.sourceDirtyFiles,[]);assert.equal(model.info.build.sourceCommit,s.binding.packageSource);assert.equal(model.info.build.compiledFingerprint,s.completionPlan.packageProof.compiledFingerprint);
 await model.main(captureAccountsForLifecycle,{});await model.call('accounts','session');
 const deviceId=await model.main(()=>{const a=globalThis.__sameRunAccountCapture?.accounts;if(!a||a.remote.authKind!=='supabase')throw Error('ACCOUNT_CAPTURE_MISSING');return a.remote.deviceId;});
 const binding={role,accountKey:account.accountKey,owner:slotFor(role)==='C'?null:account.owner,origin,profile:model.profile,deviceId,scenario,expiresAt:s.binding.expiresAt};
 if(role==='a3'){
  model.s06Ticket=await (s.binding.source==='github-environment-v1'?installPlatformS06BeforeLogin:installS06BeforeLogin)({...(s.binding.source==='github-environment-v1'?{admission:s.authorization}:{}),model,binding:{ciRunId:s.binding.run,role,ownerAccountId:account.owner,authUserId:account.authUid,deviceId,accountKey:account.accountKey,origin,scenario,runId:s.completionOptions.runId,nonce:s.binding.nonce}});
  await model.main((_e,b)=>{const capture=globalThis.__sameRunAccountCapture,a=capture?.accounts;if(!a)throw Error('CAPTURE_MISSING');delete globalThis.__sameRunAccountCapture;globalThis.__qaUiCaseContext={accounts:a,binding:b,epoch:null,released:false};},binding);
 }else await model.main(installNormalPreloginHold,binding);
 model.expectedDeviceId=deviceId;
}
async function startModel(cap,role,expectedEpoch=1){
 const s=own(cap);assert.ok(roles.includes(role));assert.ok(s.supervisor?.ready&&!s.supervisor.closed);assertAuthorizedVault(s.vault);
 const model=await launchPortableSession({executable:s.completionOptions.packageBinding.executable,expectedSource:s.binding.packageSource,profile:s.profiles[role],label:'same-run-'+role,environment:appEnvironment()});
 model.epoch=expectedEpoch;s.models[role]=model;
 const launcher=processIdentity(model.launcherPid),runtime=processIdentity(model.runtime.pid);await s.vault.registerOwnedModel({role,profile:model.profile,launcher,runtime});
 const session=await model.call('accounts','session');assert.equal(session.currentUser,null,'Fresh role must not inherit another session');assert.equal(session.defaultProvider,'runtime');assert.ok(!session.scenario);await captureModel(s,model,role);return model;
}
export async function prepareHeldModels(cap,{vault}){
 const s=own(cap);assert.equal(vault,s.vault);assert.equal(s.heldPrepared,undefined);assert.deepEqual(Object.keys(s.models),[]);s.heldPrepared=false;
 for(const role of roles){const model=await startModel(cap,role);const held=await model.main(()=>{const h=globalThis.__qaUiCaseContext;return !!h&&!h.released&&!h.accounts.current;});assert.equal(held,true,'EXACT_SIGNED_OUT_HOLD_REQUIRED');assert.equal((await model.call('accounts','session')).currentUser,null);if(role==='a3')assert.ok(model.s06Ticket);}
 const registry=await vault.verifyRegistry(),records=registry.records.filter(r=>r.kind==='model');assert.equal(records.length,5);assert.deepEqual(records.map(r=>r.role).sort(),[...roles].sort());
 for(const role of roles){const record=records.find(r=>r.role===role),model=s.models[role];assert.equal(realpathSync.native(record.profile),s.profileRoots[role].canonical);assert.equal(record.launcher.pid,model.launcherPid);assert.equal(record.runtime.pid,model.runtime.pid);}
 s.heldPrepared=true;safeWrite(s,'precredential-model-readiness.json',{allFiveSignedOut:true,ownedRegistryConfirmed:true,allPreloginHoldsInstalled:true,noIdentityMutation:true});return {prepared:true};
}
async function safeActor(model){return model.main(async()=>{const h=globalThis.__qaUiCaseContext;if(!h?.accounts)throw Error('NORMAL_CONTEXT_REQUIRED');const context=await h.accounts.requireCloudActor(),a=context.actor||context;if(a.authKind!=='supabase'||a.authority!=='live')throw Error('NORMAL_ACTOR_REQUIRED');return {ownerAccountId:a.ownerAccountId,authUserId:a.authUserId,deviceId:a.deviceId,sessionId:a.sessionId,epoch:h.accounts.epoch};});}
async function normalLogin(cap,role,credentialCap){
 const s=own(cap),m=s.models[role]||await startModel(cap,role),account=FIXED_IDENTITIES[slotFor(role)];assertCompletionAuthorization(s.authorization,{permissions:['login-'+slotFor(role)]});
 await m.page.getByRole('heading',{name:'欢迎回来',exact:true}).waitFor({timeout:20000});
 await s.vault.withCredential(credentialCap,async secret=>{assert.equal(secret.accountKey,account.accountKey);await m.page.locator('input[autocomplete="username"]').fill(secret.accountKey);await m.page.getByLabel('密码',{exact:true}).fill(secret.password);
  for(const name of ['保持登录','记住账号']){const box=m.page.getByRole('checkbox',{name,exact:true});if(await box.getAttribute('aria-checked')==='true')await box.click();}
  await m.page.getByRole('button',{name:'登录进入 →',exact:true}).click();return {ok:true};});
 const session=await pollState(()=>m.call('accounts','session'),v=>!!v.currentUser,{timeoutMs:45000,intervalMs:250,label:'NORMAL_UI_LOGIN_REQUIRED'});assert.equal(session.currentUser.id,account.owner);assert.equal(session.currentUser.authUserId,account.authUid);assert.equal(session.persistence,'memory');
 const actor=await safeActor(m);assert.equal(actor.deviceId,m.expectedDeviceId);m.actor={ownerAccountId:actor.ownerAccountId,authUserId:actor.authUserId,deviceId:actor.deviceId};m.sessionEpoch=actor.epoch;s.identities[slotFor(role)]={owner:actor.ownerAccountId,authUid:actor.authUserId,accountKey:account.accountKey};return m;
}
export async function resetKnownViaApprovedParentReceipt(cap,{slot,intentId,credentialCap,vault,authorization}){
 const s=own(cap);assert.equal(s.heldPrepared,true,'ALL_MODELS_READY_BEFORE_RESET');assert.equal(authorization,s.authorization);assert.equal(vault,s.vault);assert.ok(['A','B'].includes(slot));assertCompletionAuthorization(authorization,{permissions:['reset-'+slot]});const a=s.binding,target=FIXED_IDENTITIES[slot];assert.equal(intentId,`${a.requestDigest}:${slot}:reset`);
 const now=Math.floor(Date.now()/1000),binding=validateBinding({version:1,projectRef:'jbvrdmrkwpznbrvteive',account:target.accountKey,owner:target.owner,authUserId:target.authUid,expectedUpdatedAt:a.recovery.expectedUpdatedAt[slot],nonce:a.recovery.resetNonces[slot],ciRunId:a.run,ciRunAttempt:1,harnessCommit:a.commit,packageSource:a.packageSource,encryptionKeySha256:a.recovery.encryptionKeySha256,signingKeySha256:a.recovery.signingKeySha256,issuedAt:now,expiresAt:Math.min(Math.floor(a.expiresAt/1000),now+1800)});
 assert.ok(!s.resetResults[slot],'NO_RESET_REPLAY');let capsule;await vault.withCredential(credentialCap,async credential=>{assert.equal(credential.accountKey,target.accountKey);let hash=await hashNewPassword(credential.password);try{capsule=await sealHash(hash,binding,a.recovery.encryptionPublicPem);}finally{hash=null;}return {ok:true};});
 safeWrite(s,'reset-'+slot.toLowerCase()+'-capsule.json',capsule);safeWrite(s,'awaiting-reset.json',{slot,run:a.run,nonce:binding.nonce,capsuleSha256:capsule.requestSha256});
 while(Date.now()<binding.expiresAt*1000){own(cap);const token=await readAppliedReceipt(binding.nonce,{deadline:binding.expiresAt*1000});if(token){const receipt=await verifyAppliedReceipt(token,{binding,requestSha256:capsule.requestSha256,signingPublicPem:a.recovery.signingPublicPem});s.resetResults[slot]={confirmed:true,receipt};return {confirmed:true};}await pause(2000);}throw Error('RESET_RECEIPT_NOT_CONFIRMED');
}
export async function verifyNormalIdentity(cap,{slot,cap:credentialCap,vault,expected}){
 const s=own(cap);assert.equal(vault,s.vault);assert.deepEqual(expected,FIXED_IDENTITIES[slot]);
 if(slot==='C'){assert.ok(s.cApi&&s.identities.C,'C_NORMAL_UI_REGISTRATION_NOT_CONFIRMED');return {...s.identities.C};}
 const m=await normalLogin(cap,slot.toLowerCase(),credentialCap),a=m.actor;return {accountKey:expected.accountKey,owner:a.ownerAccountId,authUid:a.authUserId};
}
export async function reconcileOriginalIntent(cap,{slot,operation,intentId,prior}){
 const s=own(cap);assert.ok(['A','B','C'].includes(slot));assert.equal(operation,slot==='C'?'register':'reset');assert.equal(intentId,`${s.binding.requestDigest}:${slot}:${operation}`);
 assert.equal(prior.mayBlindRetry,false);const p=await freshParentProof(cap,'reconcile-'+slot,{slot,intentDigest:sha(intentId),accountKey:FIXED_IDENTITIES[slot].accountKey});assert.equal(p.confirmed,true);return {confirmed:true};
}
export async function persistSafeIdentityManifest(cap){const s=own(cap);safeWrite(s,'identity-manifest.json',{version:1,run:s.binding.run,commit:s.binding.commit,requestDigest:s.binding.requestDigest,scenario,createdAt:new Date().toISOString(),devices:Object.entries(s.models).filter(([,m])=>m.actor).map(([role,m])=>({role,...m.actor})),registrationConfirmed:Boolean(s.identities.C)});}
async function stopModel(model){let timer;try{await Promise.race([model.stop(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_STOP_TIMEOUT')),15000);})]);}finally{clearTimeout(timer);}await pollState(()=>[model.launcherPid,model.runtime.pid].every(p=>!live(p)),Boolean,{timeoutMs:10000,intervalMs:200,label:'OWNED_EXIT_REQUIRED'});}
export async function launchNormalModel(cap,{role,prior,identity,vault,expectedEpoch}){
 const s=own(cap);assert.equal(vault,s.vault);assert.ok(roles.includes(role));assert.equal(identity.accountKey,FIXED_IDENTITIES[slotFor(role)].accountKey);
 if(!prior&&s.models[role]?.actor){assert.equal(s.models[role].epoch,expectedEpoch);return s.models[role];}
 if(prior){assert.equal(s.models[role],prior);assert.notEqual(role,'a3');await assertSameRunGrant(cap,{hardDeadline:s.binding.expiresAt});await stopModel(prior);}
 let model;
 if(role==='c'&&prior){
  // The normal product restores its own DPAPI session. No token is exported,
  // injected or copied. This already-granted same device is never a cold peer.
  const grant=s.scopeGrants.get('c');assert.ok(grant?.expiresAtMs>Date.now()+60000);
  model=await launchPortableSession({executable:s.completionOptions.packageBinding.executable,profile:s.profiles.c,expectedSource:s.binding.packageSource,label:'same-run-c-secure-restart',environment:appEnvironment()});model.epoch=expectedEpoch;s.models.c=model;
  await s.vault.registerOwnedModel({role,profile:model.profile,launcher:processIdentity(model.launcherPid),runtime:processIdentity(model.runtime.pid)});
  await model.main(captureAccountsForLifecycle,{});await model.call('accounts','session');
  await model.main(installRestoredCAuthGuard,{role:'c',origin,profile:model.profile,scenario,expiresAt:Math.min(grant.expiresAtMs,s.binding.expiresAt)});
  const actor=await safeActor(model);for(const k of ['ownerAccountId','authUserId','deviceId'])assert.equal(actor[k],grant[k]);model.actor={ownerAccountId:actor.ownerAccountId,authUserId:actor.authUserId,deviceId:actor.deviceId};model.expectedDeviceId=actor.deviceId;model.sessionEpoch=actor.epoch;
 }else{model=!prior&&s.models[role]?s.models[role]:await startModel(cap,role,expectedEpoch);assert.equal(model.epoch,expectedEpoch);await normalLogin(cap,role,identity.cap);}
 assert.equal(model.epoch,expectedEpoch);
 if(role==='a3'){
  const manifest=await s06GateSafeManifest(model.s06Ticket);await persistSafeIdentityManifest(cap);
  if(s.binding.source!=='github-environment-v1'){const read=await freshParentProof(cap,'s06-pregrant',{runId:s.completionOptions.runId,nonce:s.binding.nonce,ownerAccountId:model.actor.ownerAccountId,authUserId:model.actor.authUserId,deviceId:model.actor.deviceId,scenario});
  await admitS06SingleSnapshot(model.s06Ticket,{parentRead:read,parentApproval:{approvedSingleSnapshot:true,runId:s.completionOptions.runId,nonce:s.binding.nonce,deviceId:model.actor.deviceId}});}
  s.s06Manifest={...manifest,role:'a3'};
 }else if(prior){const grant=s.scopeGrants.get(role);assert.ok(grant?.expiresAtMs>Date.now());if(role!=='c')await model.main(async(_e,g)=>globalThis.__qaUiCaseContext.release(g),grant);}
 await persistSafeIdentityManifest(cap);return model;
}
async function releaseAllKnownGrants(cap,registeredLoginCredential){
 const s=own(cap);await persistSafeIdentityManifest(cap);assert.equal(Object.keys(s.models).length,5);assert.ok(roles.every(r=>s.models[r].actor));
 if(s.binding.source==='github-environment-v1')return releasePlatformGrants(cap,registeredLoginCredential);
 const proof=await freshParentProof(cap,'grant-manifest',{scenario,runId:s.completionOptions.runId});assert.ok(Array.isArray(proof.devices)&&proof.devices.length===5);assert.deepEqual(proof.devices.map(x=>x.role).sort(),[...roles].sort());
 for(const role of roles){const model=s.models[role],grant=proof.devices.find(x=>x.role===role);for(const k of ['ownerAccountId','authUserId','deviceId'])assert.equal(grant[k],model.actor[k]);assert.equal(grant.scenario,scenario);assert.equal(grant.formalInserted,true);assert.ok(Number.isSafeInteger(grant.expiresAtMs)&&grant.expiresAtMs>Date.now()&&grant.expiresAtMs<=proof.insertedAtMs+7200000);s.scopeGrants.set(role,grant);}
 await s.vault.registerBusinessDeadline({insertedAtMs:proof.insertedAtMs,expiresAtMs:Math.min(s.binding.expiresAt,...[...s.scopeGrants.values()].map(g=>g.expiresAtMs)),scopeDigest:sha(JSON.stringify(proof))});
 for(const role of roles){const model=s.models[role],grant=s.scopeGrants.get(role);if(role==='a3')await releaseS06AfterFormalGrant(model.s06Ticket,{grantProof:{...grant,runId:s.completionOptions.runId,nonce:s.binding.nonce}});else await model.main(async(_e,g)=>globalThis.__qaUiCaseContext.release(g),grant);}
 s.grantsReleased=true;await assertSameRunGrant(cap,{hardDeadline:s.binding.expiresAt});
}
export async function assertSameRunGrant(cap,{hardDeadline}){
 const s=own(cap);assert.ok(Number.isSafeInteger(hardDeadline)&&hardDeadline<=s.binding.expiresAt&&Date.now()<hardDeadline);assert.ok(s.supervisor?.ready&&!s.supervisor.closed,'OWNED_WATCHDOG_REQUIRED');assert.equal(s.grantsReleased,true,'ALL_FORMAL_GRANTS_REQUIRED');
 if(s.supervisor.existingProcess)assert.deepEqual(processIdentity(s.supervisor.existingProcess.pid),s.supervisor.existingProcess);
 for(const [role,m] of Object.entries(s.models)){if(s.revoked.has(role)){assert.equal(role,'c');assert.equal((await m.call('accounts','session')).currentUser,null);continue;}const g=s.scopeGrants.get(role);assert.ok(g&&g.expiresAtMs>Date.now(),'QA_SCOPE_EXPIRED');const a=await safeActor(m);for(const k of ['ownerAccountId','authUserId','deviceId'])assert.equal(a[k],g[k]);const p=await m.main(async()=>{const a=globalThis.__qaUiCaseContext.accounts,c=await a.requireCloudActor();return c.invoke('discovery',{op:'protocol'});});assert.equal(p.simulatedLocationAllowed,true);assert.equal(p.scenarioId,scenario);}
}
async function installLocationBridge(cap,role,position){
 const s=own(cap),m=s.models[role];assert.ok(m&&role==='a');await assertSameRunGrant(cap,{hardDeadline:s.binding.expiresAt});const actor=await safeActor(m);
 const path=resolve('scripts/acceptance/cloud-qa-ui-location-fixture.cjs'),digest=sha(readFileSync(path));assert.equal(digest,'2fced8c5b05ac0fe2fe4b1e34e4692d0821e3cd3b1d4bdfa2d6587a836832094');
 const expected={ciRunId:s.binding.run,runId:s.completionOptions.runId,nonce:s.binding.nonce,sourceCommit:s.binding.packageSource,profilePath:m.profile,...actor,scenarioId:scenario};delete expected.epoch;
 const result=await m.main(async(_e,{path,digest,expected,position,expiresAt})=>{
  const fs=process.getBuiltinModule('node:fs'),crypto=process.getBuiltinModule('node:crypto'),req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json');
  if(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')!==digest)throw Error('FIXTURE_MODULE_CHANGED');const h=globalThis.__qaUiCaseContext;if(!h?.accounts||!h.released||h.accounts.epoch!==h.epoch)throw Error('CURRENT_HELD_CONTEXT_REQUIRED');
  h.locationFixture?.dispose();const epoch=h.accounts.epoch,lease=Object.freeze({...expected,expiresAt,businessHoldReleased:true,preloginGateVerified:true});
  const controller=await req(path).installCloudQaUiLocationFixture({accounts:h.accounts,expected,position,assertHolderCapability:()=>{if(globalThis.__qaUiCaseContext!==h||h.accounts.epoch!==epoch||!h.released||Date.now()>=lease.expiresAt)throw Error('LIVE_CAPABILITY_EXPIRED');return lease;}});
  h.locationFixture=controller;h.bindingDigest=controller.status().bindingDigest;globalThis.__qaUiLocationFixture=controller;return {bindingDigest:h.bindingDigest};
 },{path,digest,expected,position,expiresAt:Math.min(s.binding.expiresAt,s.scopeGrants.get(role).expiresAtMs)});
 const binding={...expected,bindingDigest:result.bindingDigest};s.uiBinding=binding;return binding;
}
export async function awaitFreshS02TerritoryBinding(cap,{runId,scenario:expectedScenario,ownerAccountId,petId}){
 const s=own(cap);assert.equal(runId,s.completionOptions.runId);assert.equal(expectedScenario,scenario);assert.equal(ownerAccountId,s.models.a.actor.ownerAccountId);assert.equal(typeof petId,'string');await assertSameRunGrant(cap,{hardDeadline:s.binding.expiresAt});
 if(s.binding.source==='github-environment-v1'){const position={lat:45.3001,lng:70.1001};const binding=await installLocationBridge(cap,'a',position),actor=await safeActor(s.models.a);const platformCellRequest=createPlatformCellRequest({admission:s.authorization,model:s.models.a,actor,position,runId});return {position,platformCellRequest,nonce:s.binding.nonce,locationBindingDigest:binding.bindingDigest};}
 const proof=await freshParentProof(cap,'s02-empty-cell',{runId,nonce:s.binding.nonce,scenario,ownerAccountId});assert.ok(Date.now()-proof.observedAtMs<=60000&&Date.now()>=proof.observedAtMs);assert.equal(proof.ownerAccountIdAtCell,null);assert.equal(proof.otherOwnerCount,0);assert.equal(proof.exactCellVerified,true);
 const binding=await installLocationBridge(cap,'a',proof.position);return {position:proof.position,parentEmptyCell:proof,nonce:s.binding.nonce,locationBindingDigest:binding.bindingDigest};
}
export async function registerCThroughNormalUi(cap,{slot,intentId,credentialCap,vault,authorization}){
 const s=own(cap);assert.equal(slot,'C');assert.equal(vault,s.vault);assert.equal(authorization,s.authorization);assert.equal(intentId,`${s.binding.requestDigest}:C:register`);assert.ok(!s.cApi,'NO_C_REGISTRATION_REPLAY');
 assert.ok(['a','a2','a3','b'].every(role=>s.models[role]?.actor),'FOUR_HELD_DEVICES_BEFORE_C');
 assert.equal(s.heldPrepared,true);const model=s.models.c;assert.ok(model&&!model.actor);assert.equal((await model.call('accounts','session')).currentUser,null);s.cState={credentialCap,knownIdentity:null,loginFrozen:false};
 const identity=async m=>{const a=await safeActor(m);assert.equal(a.deviceId,m.expectedDeviceId);return a;};
 const deps={accountKey:FIXED_IDENTITIES.C.accountKey,role:'c',authorization,vault,
  async assertAuthorization(){assertCompletionAuthorization(authorization,{permissions:['register-C','login-C','remember-C','password-change-C','revoke-C','business']});assert.ok(s.supervisor?.ready&&!s.supervisor.closed);},
  async assertPersistentProfile(){assert.equal(realpathSync.native(s.models.c.profile),realpathSync.native(s.profiles.c));assert.equal((await s.models.c.call('accounts','session')).secureStorageAvailable,true);await vault.verifyRegistry();},
  async assertExactAbsence(){if(s.binding.source==='github-environment-v1'){assert.equal(FIXED_IDENTITIES.C.accountKey,'qa20261028c8be246d1');assert.equal((await s.models.c.call('accounts','session')).currentUser,null);s.cState.absence={observedAtMs:Date.now(),source:'normal-register-atomic-uniqueness',notDatabaseAbsenceProof:true};return;}const p=await freshParentProof(cap,'c-absent',{accountKey:FIXED_IDENTITIES.C.accountKey});assert.equal(p.accountAbsent,true);assert.equal(p.directoryAbsent,true);assert.ok(Number.isSafeInteger(p.observedAtMs)&&Date.now()-p.observedAtMs<=60000&&Date.now()>=p.observedAtMs);s.cState.absence=p;},
  async assertPreloginHold(){assert.ok(s.cState.absence&&Date.now()-s.cState.absence.observedAtMs<=60000);const held=await s.models.c.main(()=>{const h=globalThis.__qaUiCaseContext;return !!h&&!h.released&&!h.accounts.current&&h.registerCount===0;});assert.equal(held,true);},
  async verifyIdentity(m){const a=await identity(m);s.cState.knownIdentity={owner:a.ownerAccountId,authUid:a.authUserId,accountKey:FIXED_IDENTITIES.C.accountKey};s.identities.C=s.cState.knownIdentity;m.actor={ownerAccountId:a.ownerAccountId,authUserId:a.authUserId,deviceId:a.deviceId};m.sessionEpoch=a.epoch;if(s.binding.source==='github-environment-v1')await persistSafeIdentityManifest(cap);return a;},
  async prepareNextCredential(a){
   const known={accountKey:FIXED_IDENTITIES.C.accountKey,owner:a.ownerAccountId,authUid:a.authUserId},intentId=s.binding.requestDigest+':C:password-change';let password=randomBytes(48).toString('base64url');
   try{s.cState.nextCap=await vault.sealBeforeMutation({slot:'C',credentialVersion:sha(intentId),password,operation:'password-change',intentId,identity:known});return s.cState.nextCap;}finally{password=null;}
  },
  async awaitGrantAndRelease(_identity,capabilities){await releaseAllKnownGrants(cap,capabilities?.registeredLoginCredential);},
  async assertGrant(){await assertSameRunGrant(cap,{hardDeadline:s.binding.expiresAt});},
  async relaunch(role,{logout}){assert.equal(role,'c');assert.equal(logout,false);return launchNormalModel(cap,{role,prior:s.models.c,identity:s.identities.C,vault,expectedEpoch:s.models.c.epoch+1});},
  async freezeCLogin(){s.cState.loginFrozen=true;await s.models.c.main(()=>{const h=globalThis.__qaUiCaseContext;if(!h?.accounts)throw Error('EXACT_C_CONTEXT_REQUIRED');const actor=h.accounts.remote.active?.actor;if(!actor||actor.authKind!=='supabase')throw Error('C_ACTIVE_SESSION_REQUIRED');h.frozenActor=Object.freeze(Object.fromEntries(['ownerAccountId','authUserId','deviceId','sessionId'].map(k=>[k,actor[k]])));h.epoch=h.accounts.epoch;h.loginFrozen=true;});},
  async assertExactRevokeTarget(m){assert.equal(s.cState.loginFrozen,true);assert.equal(m,s.models.c);const a=await identity(m);const digest=sha(JSON.stringify({requestDigest:s.binding.requestDigest,role:'c',...a}));
   await m.main((_e,{a,digest})=>{const h=globalThis.__qaUiCaseContext;if(!h?.accounts||h.accounts.epoch!==a.epoch)throw Error('C_SESSION_CHANGED');h.bindingDigest=digest;}, {a,digest});
   return {ownerAccountId:a.ownerAccountId,authUserId:a.authUserId,deviceId:a.deviceId,sessionId:a.sessionId,bindingDigest:digest};
  }
 };
 const output=join(s.output,'new-c');mkdirSync(output,{recursive:false});s.cApi=await createNewCUiLifecycle({models:s.models,dependencies:deps,initialCredential:credentialCap,output,runId:s.completionOptions.runId});
 await s.cApi.register();assert.ok(s.identities.C);await persistSafeIdentityManifest(cap);return {confirmed:true};
}
export async function runAuthorizedNewCLifecycle(cap,{output}){
 const s=own(cap);assertCompletionAuthorization(s.authorization,{caseIds:['A06','A13','A15','A12']});assert.ok(s.cApi&&s.identities.C&&s.grantsReleased);assert.equal(s.cFinished,undefined,'C_LIFECYCLE_NO_REPLAY');s.cFinished=false;
 try{
  await s.cApi.firstAdoptionGuidance();await s.cApi.persistentRestart('before-password-change');await s.cApi.passwordNegatives();await s.cApi.changePassword();await s.cApi.persistentRestart('after-password-change');await s.cApi.verifyOldRejectedNewAccepted();await s.cApi.persistentRestart('after-new-login');await s.cApi.revokeCurrentSession();
  assert.equal((await s.models.c.call('accounts','session')).currentUser,null);s.revoked.add('c');const result=await s.cApi.close();assert.equal(result.passed,true);s.cFinished=true;
  // Return only the module's bounded evidence, not model/context/custody objects.
  if(output){mkdirSync(output,{recursive:true});writeFileSync(join(output,'new-c-ui-lifecycle-evidence.json'),JSON.stringify(result,null,2));}return result;
 }catch{try{const failed=await s.cApi.close();if(output){mkdirSync(output,{recursive:true});writeFileSync(join(output,'new-c-ui-lifecycle-evidence.json'),JSON.stringify(failed,null,2));}}catch{}throw Error('NEW_C_LIFECYCLE_STOPPED');}
}
export async function prepareDiscoveryUiBinding(cap){const s=own(cap);if(!s.uiBinding)await installLocationBridge(cap,'a',{lat:45.3001,lng:70.1001});const model=s.models.a;const current=await safeActor(model);for(const k of ['ownerAccountId','authUserId','deviceId','sessionId'])assert.equal(current[k],s.uiBinding[k]);return {model,binding:s.uiBinding};}
export async function getCompletionContext(cap){const s=own(cap);const deadlines=[...s.scopeGrants.values()].map(g=>g.expiresAtMs);assert.equal(deadlines.length,5,'ALL_SCOPE_DEADLINES_REQUIRED');return {businessDeadline:Math.min(s.binding.expiresAt,...deadlines),lifecycleCapability:cap,models:s.models,expectedActors:Object.fromEntries(Object.entries(s.models).map(([role,m])=>[role,m.actor])),s06GateTicket:s.models.a3?.s06Ticket,s06Binding:s.s06Manifest};}
export async function closeOwnedModels(cap,{models,preserveForReconciliation=false}){
 const s=states.get(cap);assert.ok(s,'REAL_LIFECYCLE_CAPABILITY_REQUIRED');let failed=false;
 for(const role of [...roles].reverse()){const m=s.models[role];if(!m)continue;try{await stopModel(m);if(role==='a3'&&m.s06Ticket)await closeS06GateAfterOwnedProcessStopped(m.s06Ticket,{ownedProcessStopped:true});}catch{failed=true;}}
 if(failed)throw Error('OWNED_PROFILE_CLEANUP_UNCONFIRMED');
 if(!preserveForReconciliation){const noLinks=p=>{const st=lstatSync(p);assert.equal(st.isSymbolicLink(),false,'OWNED_PROFILE_REPARSE_REJECTED');if(st.isDirectory())for(const name of readdirSync(p))noLinks(join(p,name));};for(const role of roles){const path=assertOwnedProfileRoot(s.profiles[role],s.profileRoots[role]);assert.ok(!Object.values(s.models).some(m=>m.profile===path&&[m.launcherPid,m.runtime.pid].some(live)));noLinks(path);rmSync(path,{recursive:true,force:true});}}
 safeWrite(s,'lifecycle-cleanup.json',{ownedProcessesStopped:true,profilesRemoved:!preserveForReconciliation,preservedOnlyUntilHardDeadline:preserveForReconciliation,expiresAt:s.binding.expiresAt});
}

export async function importEnvironmentCredentials(cap,{vault,provenance}){
 const s=own(cap);assert.equal(s.binding.source,'github-environment-v1');assert.equal(s.heldPrepared,true);assert.equal(vault,s.vault);assert.equal(s.environmentImported,undefined);s.environmentImported=false;const result={};
 const names={A:'DESKTOPPET_QA_A_PASSWORD',B:'DESKTOPPET_QA_B_PASSWORD'};
 try{for(const slot of ['A','B']){let password=process.env[names[slot]];try{result[slot]=await vault.importAppliedParentCredential({slot,password,provenance:provenance[slot]});}finally{password=null;delete process.env[names[slot]];}}s.environmentImported=true;safeWrite(s,'environment-custody.json',{version:1,source:'github-environment-v1',aImported:true,bImported:true,parentCasNotPerformedByRunner:true,resetReceiptNotSynthesized:true,environmentNamesRemoved:true});return result;}
 finally{for(const name of Object.values(names))delete process.env[name];}
}
async function releasePlatformGrants(cap,cCredential){
 const s=own(cap);assert.equal(s.binding.source,'github-environment-v1');assert.equal(s.grantsReleased,undefined);const actors={};for(const role of roles)actors[role]=await safeActor(s.models[role]);
 // Internal same-job orchestration barrier only: uploaded identity is visible to
 // parent before the one 60-second baseline window. This never authorizes a grant.
 const barrier=join(s.output,'identity-upload-complete.json');while(!existsSync(barrier)){own(cap);assert.ok(Date.now()<s.binding.businessDeadline);await pause(250);}assert.equal(lstatSync(barrier).isSymbolicLink(),false);const scheduled=JSON.parse(readFileSync(barrier,'utf8').replace(/^\uFEFF/,''));assert.deepEqual(scheduled,{version:1,run:s.binding.run,commit:s.binding.commit,requestDigest:s.binding.requestDigest,purpose:'identity-upload-complete-no-authority'});
 const transition=await observePlatformFourGrantTransition({admission:s.authorization,models:s.models,actors,scenario,vault:s.vault,cCredential});
 await admitPlatformS06SingleSnapshot(s.models.a3.s06Ticket,{transition});
 safeWrite(s,'s06-platform-warning.json',{version:1,run:s.binding.run,commit:s.binding.commit,requestDigest:s.binding.requestDigest,realOriginalWarningObserved:true,originalSnapshotCount:1,deadline:s.binding.businessDeadline});
 await releasePlatformS06AfterFormalGrant(s.models.a3.s06Ticket);
 for(const role of roles){const actor=await safeActor(s.models[role]);for(const key of ['ownerAccountId','authUserId','deviceId','sessionId','epoch'])assert.equal(actor[key],actors[role][key]);s.scopeGrants.set(role,{...actor,role,scenario,expiresAtMs:s.binding.businessDeadline,deadlineSource:'fixed-platform-admission',protocolDoesNotReturnExpiry:true});}
 for(const role of roles.filter(r=>r!=='a3'))await s.models[role].main(async(_e,g)=>globalThis.__qaUiCaseContext.release(g),s.scopeGrants.get(role));s.grantsReleased=true;await assertSameRunGrant(cap,{hardDeadline:s.binding.businessDeadline});
}
