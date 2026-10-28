// Prepared gate only. Installing requires a logged-out owned model; no login,
// credentials, grant, SQL write or recovery request is implemented here.
import assert from 'node:assert/strict';
import {assertPlatformAdmission} from './recovery/github-environment-admission.mjs';
import {consumePlatformGrantTransition} from './cloud-live-qa-s06-platform-transition.mjs';
import {validateS06PregrantSnapshot} from './cloud-live-qa-s06-pregrant-contract.mjs';
export function s06GateTransition(state,event){
 const next={installed:'manifest',manifest:'proof',proof:'snapshot',snapshot:'warning',warning:'grant-check','grant-check':'released'};
 assert.equal(next[state],event,'S06 gate order cannot skip parent proof, real warning or grant');return event;
}
export function validateS06GateBinding(b){assert.equal(b.role,'a3','Dedicated same-A S06 device only');assert.match(b.ownerAccountId,/^account:[a-f0-9-]{36}$/i);for(const k of['authUserId','deviceId','runId','nonce'])assert.match(b[k],/^[a-f0-9-]{36}$/i);assert.match(b.accountKey,/^qa[a-z0-9]+$/);assert.ok(b.scenario?.startsWith('cloud-acceptance-'));assert.equal(b.origin,'https://jbvrdmrkwpznbrvteive.supabase.co');return b;}
export function installS06GateInMain(_e,b){
  const req=process.getBuiltinModule('node:module').createRequire(process.resourcesPath+'/app.asar/package.json'),p=req('./apps/pc-app/runtime/features/accounts/supabase-remote.cjs').SupabaseRemote.prototype;
  if(globalThis.__s06PreloginGate)throw Error('Existing gate');const h={binding:b,phase:'installed',prototype:p,request:p.request,instances:new Map(),allowed:new Map(),loginSent:false,snapshotSent:false,snapshotReturned:false,warningReturned:false,denied:0,failed:false};globalThis.__s06PreloginGate=h;
  const ap=req('./apps/pc-app/runtime/features/accounts/service.cjs').AccountsService.prototype;h.accountsPrototype=ap;h.originalRequireActor=ap.requireCloudActor;h.accounts=null;ap.requireCloudActor=async function(...args){if(this.privateSession()?.ownerAccountId===b.ownerAccountId)h.accounts=this;return h.originalRequireActor.apply(this,args);};
  const deny=()=>{h.denied++;throw Object.assign(Error('S06 pregrant business blocked'),{code:'S06_PREGRANT_GATE_CLOSED'});};
  const actorMatches=proof=>proof?.actor?.ownerAccountId===b.ownerAccountId&&proof.actor.authUserId===b.authUserId&&proof.actor.deviceId===b.deviceId&&(!b.platformOnly||!h.sessionId||proof.actor.sessionId===h.sessionId);
  const platformCurrent=remote=>!b.platformOnly||!h.sessionId||(remote===h.originalRemote&&h.accounts?.epoch===h.sessionEpoch&&remote.active?.actor?.sessionId===h.sessionId);
  p.request=async function(name,body,proof){
   if(h.failed||this.deviceId!==b.deviceId||this.config?.url!==b.origin) return deny();
   if(!platformCurrent(this)){h.failed=true;return deny();}
   if(!h.instances.has(this)){if(this.active) {h.failed=true;return deny();}const original=this.fetcher;h.instances.set(this,original);this.fetcher=async(url,options)=>{
    // Only the exact original request currently admitted below may reach HTTP.
    // SDK REST or an unrelated direct fetch cannot use a broad endpoint allowlist.
    if(h.phase==='released')return original.call(this,url,options);
    const signature=String(url)+'\n'+String(options?.body||''),count=h.allowed.get(signature)||0;if(count!==1){h.failed=true;return deny();}h.allowed.delete(signature);return original.call(this,url,options);
   };}
   if(h.phase==='released')return h.request.call(this,name,body,proof);
   let snapshot=false,protocol=false,platformProtocol=false;
   if(name==='lingjing-auth'&&body?.op==='login'&&body.account===b.accountKey&&!h.loginSent&&!proof){h.loginSent=true;}
   else if(name==='lingjing-auth'&&['actor','refresh','logout'].includes(body?.op)&&actorMatches(proof)){}
   else if(name==='lingjing-auth'&&body?.op==='refresh'&&!proof&&this.active&&actorMatches(this.active)&&body.refreshToken===this.active.refreshToken){}
   else if(name==='companions-sync'&&body?.op==='snapshot'&&Object.keys(body).length===1&&h.phase==='snapshot'&&!h.snapshotSent&&actorMatches(proof)){snapshot=true;h.snapshotSent=true;}
   else if(b.platformOnly===true&&name==='discovery'&&body?.op==='protocol'&&Object.keys(body).length===1&&['manifest','warning'].includes(h.phase)&&actorMatches(proof)&&proof.actor.sessionId===h.sessionId){if(h.platformProtocolInFlight)return deny();h.platformProtocolInFlight=true;platformProtocol=true;}
   else if(name==='discovery'&&body?.op==='protocol'&&Object.keys(body).length===1&&h.phase==='grant-check'&&!h.protocolSent&&actorMatches(proof)){protocol=true;h.protocolSent=true;}
   else return deny();
   const signature=b.origin+'/functions/v1/'+name+'\n'+JSON.stringify(body);if(h.allowed.has(signature)){h.failed=true;return deny();}h.allowed.set(signature,1);
   try{const result=await h.request.call(this,name,body,proof);if(!platformCurrent(this)){h.failed=true;throw Error('PLATFORM_SESSION_CHANGED');}if(snapshot){h.snapshotReturned=true;h.warningReturned=result?.ownerAccountId===b.ownerAccountId&&result?.authority==='live'&&result?.serialRegistryError==='GLOBAL_SERIAL_SCOPE_REVOKED'&&!!result?.module;if(!h.warningReturned)h.failed=true;}if(platformProtocol){if(result?.protocol!=='lingjing-discovery-v2'||!Number.isSafeInteger(result?.serverTime)||(result.simulatedLocationAllowed!==undefined&&typeof result.simulatedLocationAllowed!=='boolean')||(result.simulatedLocationAllowed===true&&result.scenarioId!==b.scenario)){h.failed=true;throw Error('PLATFORM_PROTOCOL_INVALID');}h.protocolReturned=true;h.protocolValid=result.simulatedLocationAllowed===true&&result.scenarioId===b.scenario;}if(protocol){h.protocolReturned=true;h.protocolValid=result?.simulatedLocationAllowed===true&&result?.scenarioId===b.scenario;if(!h.protocolValid)h.failed=true;}return result;}
   catch(error){if(snapshot||protocol||platformProtocol)h.failed=true;throw error;}finally{h.allowed.delete(signature);if(platformProtocol)h.platformProtocolInFlight=false;}
  };
}
const branded=new WeakMap();
export async function installS06BeforeLogin({model,binding}){assert.equal(binding.platformOnly,undefined);return installGate(model,binding,null);}
export async function installPlatformS06BeforeLogin({admission,model,binding}){
 const a=assertPlatformAdmission(admission,{caseIds:['S06'],permissions:['business']});assert.equal(binding.scenario,a.scenario);assert.equal(binding.ciRunId,a.run);assert.equal(binding.nonce,a.nonce);assert.equal(binding.platformOnly,undefined);return installGate(model,{...binding,platformOnly:true},admission);
}
async function installGate(model,binding,platformAdmission){
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');validateS06GateBinding(binding);assert.equal((await model.call('accounts','session')).currentUser,null);
 await model.main(installS06GateInMain,binding);
 const ticket=Object.freeze({protocol:'s06-prelogin-gate-v1'});branded.set(ticket,{model,binding:structuredClone(binding),phase:'installed',platformAdmission});return ticket;
}
function own(ticket){const h=branded.get(ticket);assert.ok(h,'Genuine own prelogin gate ticket required');return h;}
export async function s06GateSafeManifest(ticket){const h=own(ticket);h.phase=s06GateTransition(h.phase,'manifest');const session=await h.model.call('accounts','session');assert.equal(session.currentUser?.id,h.binding.ownerAccountId);assert.equal(session.currentUser?.authUserId,h.binding.authUserId);return h.model.main((_e,b)=>{const g=globalThis.__s06PreloginGate;if(!g||g.failed||!g.loginSent||g.snapshotSent||g.allowed.size)throw Error('Gate not safely ready');const instances=[...g.instances.keys()];if(instances.length!==1||instances[0].active?.actor?.ownerAccountId!==b.ownerAccountId)throw Error('Exact session unavailable');g.sessionId=instances[0].active.actor.sessionId;if(!g.sessionId)throw Error('Session missing');if(g.binding.platformOnly){if(!g.accounts||!Number.isSafeInteger(g.accounts.epoch))throw Error('ACCOUNT_EPOCH_REQUIRED');g.sessionEpoch=g.accounts.epoch;g.originalRemote=instances[0];}g.phase='manifest';return {protocol:'s06-prelogin-gate-v1',runId:b.runId,nonce:b.nonce,ownerAccountId:b.ownerAccountId,authUserId:b.authUserId,deviceId:b.deviceId,scenario:b.scenario,businessRequestsSent:0,snapshotSent:false,deniedBeforeSend:g.denied};},h.binding);}
export async function admitS06SingleSnapshot(ticket,{parentRead,parentApproval}){
 const h=own(ticket);assert.equal(h.platformAdmission,null);assert.equal(parentApproval?.approvedSingleSnapshot,true);for(const k of['runId','nonce','deviceId'])assert.equal(parentApproval[k],h.binding[k]);validateS06PregrantSnapshot(parentRead,{...h.binding,nowMs:Date.now()});h.phase=s06GateTransition(h.phase,'proof');
 return performSingleSnapshot(h);
}
async function performSingleSnapshot(h){
 await h.model.main((_e,b)=>{const g=globalThis.__s06PreloginGate;if(!g||g.failed||g.phase!=='manifest'||g.snapshotSent||g.allowed.size||g.binding.nonce!==b.nonce)throw Error('Gate changed');g.phase='snapshot';},h.binding);h.phase=s06GateTransition(h.phase,'snapshot');
 // The only permitted original snapshot runs through production refresh/apply.
 // Concurrent automatic refresh may take this one permit; no second is issued.
 const snapshot=await h.model.call('companions','list');const observed=await h.model.main(()=>{const g=globalThis.__s06PreloginGate;return {failed:g.failed,snapshotSent:g.snapshotSent,snapshotReturned:g.snapshotReturned,warningReturned:g.warningReturned,inflight:g.allowed.size};});assert.deepEqual(observed,{failed:false,snapshotSent:true,snapshotReturned:true,warningReturned:true,inflight:0});assert.equal(snapshot.sync?.metadataError,'GLOBAL_SERIAL_SCOPE_REVOKED');h.phase=s06GateTransition(h.phase,'warning');await h.model.main(()=>{globalThis.__s06PreloginGate.phase='warning';});return {realOriginalWarningObserved:true,originalSnapshotCount:1};
}
export async function releaseS06AfterFormalGrant(ticket,{grantProof}){
 const h=own(ticket);assert.equal(h.platformAdmission,null);assert.equal(h.phase,'warning');for(const k of['ownerAccountId','authUserId','deviceId','scenario','runId','nonce'])assert.equal(grantProof[k],h.binding[k]);assert.equal(grantProof.formalInserted,true);assert.ok(grantProof.expiresAtMs>Date.now());
 h.phase=s06GateTransition(h.phase,'grant-check');
 const result=await h.model.main(async(_e,b)=>{const g=globalThis.__s06PreloginGate;if(!g||g.failed||g.phase!=='warning'||!g.warningReturned||g.allowed.size||g.binding.nonce!==b.nonce||!g.accounts)throw Error('Gate cannot check grant');g.phase='grant-check';await g.accounts.cloudInvoke('discovery',{op:'protocol'});if(g.failed||!g.protocolSent||!g.protocolReturned||!g.protocolValid||g.allowed.size)throw Error('Formal scope not verified');g.phase='released';return {normalProtocolVerified:true,scenarioMatches:true};},h.binding);h.phase=s06GateTransition(h.phase,'released');return {...result,releasedAfterFormalGrant:true,releaseDoesNotExplicitlyRefreshWarning:true,warningMayChangeThroughNormalAutomaticRefresh:true};
}
export async function assertReleasedS06Gate(ticket,{model,binding}){const h=own(ticket);assert.equal(h.model,model,'S06 original model cannot be replaced across restart');assert.equal(h.phase,'released');for(const k of ['runId','nonce','ownerAccountId','authUserId','deviceId','scenario'])assert.equal(binding[k],h.binding[k]);return model.main((_e,b)=>{const g=globalThis.__s06PreloginGate;if(!g||g.failed||g.phase!=='released'||!g.protocolValid||g.binding.nonce!==b.nonce)throw Error('Original gate unavailable');const instances=[...g.instances.keys()];if(g.binding.platformOnly&&(g.accounts?.epoch!==g.sessionEpoch||instances[0]!==g.originalRemote))throw Error('Original platform epoch changed');if(instances.length!==1||instances[0].active?.actor?.sessionId!==g.sessionId||instances[0].active?.actor?.ownerAccountId!==b.ownerAccountId)throw Error('Original session changed');return {genuineReleasedTicket:true,sameOriginalSession:true,warningMustBeIndependentlyObserved:true};},h.binding);}
export async function closeS06GateAfterOwnedProcessStopped(ticket,{ownedProcessStopped}){const h=own(ticket);assert.equal(ownedProcessStopped,true,'Unreleased gate must never be removed from a live logged-in process');branded.delete(ticket);return {closedAfterProcessStop:true,phase:h.phase};}

export async function admitPlatformS06SingleSnapshot(ticket,{transition}){
 const h=own(ticket);assert.ok(h.platformAdmission);assertPlatformAdmission(h.platformAdmission,{caseIds:['S06'],permissions:['business']});assert.equal(h.phase,'manifest');
 const actor=await h.model.main(async()=>{const g=globalThis.__s06PreloginGate;if(!g?.accounts||g.failed||g.phase!=='manifest'||!g.binding.platformOnly)throw Error('PLATFORM_GATE_REQUIRED');const c=await g.accounts.requireCloudActor(),a=c.actor||c;if(a.sessionId!==g.sessionId||g.accounts.epoch!==g.sessionEpoch)throw Error('SESSION_CHANGED');return {ownerAccountId:a.ownerAccountId,authUserId:a.authUserId,deviceId:a.deviceId,sessionId:a.sessionId,epoch:g.accounts.epoch};});
 const t=consumePlatformGrantTransition(transition,{model:h.model,actor,scenario:h.binding.scenario});h.businessDeadline=t.businessDeadline;h.phase=s06GateTransition(h.phase,'proof');return performSingleSnapshot(h);
}
export async function releasePlatformS06AfterFormalGrant(ticket){
 const h=own(ticket);assert.ok(h.platformAdmission);assert.equal(h.phase,'warning');assert.ok(h.businessDeadline>Date.now());
 while(Date.now()<h.businessDeadline){assertPlatformAdmission(h.platformAdmission,{caseIds:['S06'],permissions:['business']});
 const result=await h.model.main(async()=>{const g=globalThis.__s06PreloginGate;if(!g?.accounts||g.failed||g.phase!=='warning'||!g.binding.platformOnly||!g.warningReturned||g.allowed.size)throw Error('PLATFORM_WARNING_REQUIRED');const c=await g.accounts.requireCloudActor(),a=c.actor||c;if(a.sessionId!==g.sessionId||g.accounts.epoch!==g.sessionEpoch)throw Error('SESSION_CHANGED');const p=await c.invoke('discovery',{op:'protocol'});if(g.failed||g.allowed.size)throw Error('PROTOCOL_FAILED');return {allowed:p.simulatedLocationAllowed===true,scenario:p.scenarioId||null,serverTime:p.serverTime};});
 assert.ok(Number.isSafeInteger(result.serverTime)&&Math.abs(result.serverTime-Date.now())<=15000);
 if(result.allowed){assert.equal(result.scenario,h.binding.scenario);h.phase=s06GateTransition(h.phase,'grant-check');assertPlatformAdmission(h.platformAdmission,{caseIds:['S06'],permissions:['business']});assert.ok(Date.now()<h.businessDeadline);await h.model.main(async(_e,deadline)=>{const g=globalThis.__s06PreloginGate;if(g.failed||!g.protocolValid||g.phase!=='warning'||!g.warningReturned||g.allowed.size||Date.now()>=deadline)throw Error('FORMAL_GRANT_REQUIRED');const c=await g.accounts.requireCloudActor(),a=c.actor||c;if(g.accounts.epoch!==g.sessionEpoch||a.sessionId!==g.sessionId||g.originalRemote.active?.actor?.sessionId!==g.sessionId||Date.now()>=deadline)throw Error('SESSION_CHANGED');g.phase='released';},h.businessDeadline);h.phase=s06GateTransition(h.phase,'released');return {normalProtocolVerified:true,releasedAfterFormalGrant:true,releaseDoesNotExplicitlyRefreshWarning:true,warningMayChangeThroughNormalAutomaticRefresh:true};}
 await new Promise(r=>setTimeout(r,1000));
 }throw Error('S06_FORMAL_GRANT_DEADLINE');
}
