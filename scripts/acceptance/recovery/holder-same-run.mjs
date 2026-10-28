// New same-run custody integration. NOT the old recovery entry and not a workflow.
// Missing production adapters fail BEFORE random password generation or cloud IO.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {verifySameRunAuthorization,assertSameRunAuthorization,createAuthorizedVault,assertAuthorizedVault,FIXED_IDENTITIES} from '../dpapi/authorized-vault-client.mjs';
import {prepareCompletionBeforeCredentials} from '../cloud-live-qa-completion-readiness.mjs';
import {runPreparedCloudCompletion} from '../cloud-live-qa-completion-driver.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
// Must be implemented, statically reviewed, independently tested and then pinned.
// No caller booleans/callbacks or alternate module paths can fill these holes.
export const NORMAL_LIFECYCLE_FACTORY_SHA256='fc5849de679820eccf26d05e376f88b226bd577f7c85a05a5d4585571fabb6cd';
const factoryPath=new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url);
const requiredExports=['prepareNormalLifecycle','prepareReconciliationLifecycle','verifySupervisorCapability','prepareHeldModels','assertSameRunGrant','reconcileOriginalIntent','resetKnownViaApprovedParentReceipt','registerCThroughNormalUi','verifyNormalIdentity','launchNormalModel','closeOwnedModels','persistSafeIdentityManifest','getCompletionContext'];
const prepared=new WeakMap();
export const FIXED_DEVICE_ROLES=Object.freeze({a:'A primary normal business',a2:'A cold restore peer only',a3:'A original prelogin S06 model only',b:'B normal peer',c:'C first-login/auth lifecycle'});
export async function prepareSameRunBeforeCredentials({ticket,publicKeyPem,completionOptions,resume=false}){
 assert.equal(process.platform,'win32');
 const authorization=await verifySameRunAuthorization({ticket,publicKeyPem});const binding=assertSameRunAuthorization(authorization);
 assert.match(NORMAL_LIFECYCLE_FACTORY_SHA256||'',/^[a-f0-9]{64}$/,'NORMAL_LIFECYCLE_FACTORY_NOT_IMPLEMENTED');
 assert.equal(sha(readFileSync(factoryPath)),NORMAL_LIFECYCLE_FACTORY_SHA256);
 const factory=await import(factoryPath.href);for(const key of requiredExports)assert.equal(typeof factory[key],'function',`MISSING_FIXED_FACTORY_${key}`);
 assert.equal(typeof resume,'boolean');
 if(resume){const lifecycle=await factory.prepareReconciliationLifecycle({authorization});const plan=Object.freeze({});prepared.set(plan,{authorization,binding,factory,lifecycle,completionOptions:null,completion:null,mode:'reconcile-only',used:false});return plan;}
 assert.deepEqual(completionOptions.selectedCases,binding.caseIds,'No silently filtered execution subset');
 // This imports every case, validates real package/ASAR/native API, and rejects
 // deployment pin=null or unimplemented selected cases before credential creation.
 const completion=await prepareCompletionBeforeCredentials({...completionOptions,authorization});
 const lifecycle=await factory.prepareNormalLifecycle({authorization,roles:FIXED_DEVICE_ROLES,completionOptions,completionPlan:completion});
 const plan=Object.freeze({});prepared.set(plan,{authorization,binding,completion,factory,lifecycle,completionOptions,mode:'fresh',used:false});return plan;
}
export async function runSameRunHolder(plan,{resume=false}={}){
 const p=prepared.get(plan);assert.ok(p&&!p.used,'GENUINE_SINGLE_USE_PREPARED_PLAN_REQUIRED');assert.equal(resume,p.mode==='reconcile-only','PREPARED_MODE_MISMATCH');p.used=true;
 const {factory,lifecycle,binding,authorization,completionOptions}=p;
 assertSameRunAuthorization(authorization);
 const vault=await createAuthorizedVault({authorization,resume});assertAuthorizedVault(vault);
 // Lease initialization contains no credential. Start/verify the actual independent
 // watchdog against that protected lease BEFORE the first password generation.
 try{await factory.verifySupervisorCapability(lifecycle,{...binding,vault});}catch(error){if(!resume)await vault.close();throw error;}
 if(resume){
  // Reconciliation ONLY: no reset, registration, fresh login, model launch or driver
  // replay. Existing output/profile and original intent IDs remain untouched.
  const results={},output=resolve('artifacts/qa/same-run-'+binding.run);
  assert.equal(lstatSync(output).isSymbolicLink(),false);assert.equal(realpathSync.native(output),output);
  const checkpoint=(slot,value)=>writeFileSync(join(output,`reconciliation-${slot}-result.json`),JSON.stringify({version:1,run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest,slot,...value}),{mode:0o600,flag:'wx'});
  for(const slot of ['A','B','C']){
   const operation=slot==='C'?'register':'reset',intentId=`${binding.requestDigest}:${slot}:${operation}`,credentialVersion=sha(intentId);
   let prior;try{prior=await vault.inspectOriginalIntent({slot,credentialVersion,operation,intentId});}catch{prior={state:'unknown-local-evidence',requiresAuthoritativeReadback:true,mayBlindRetry:false};}
   if(prior.requiresAuthoritativeReadback===false){results[slot]={skipped:true,reason:prior.state,noNewIdentityMutation:true};checkpoint(slot,results[slot]);continue;}
   results[slot]=await factory.reconcileOriginalIntent(lifecycle,{slot,operation,intentId,prior,mode:'readback-only',noLogin:true});
   assertSameRunAuthorization(authorization);checkpoint(slot,{confirmed:results[slot].confirmed===true,noNewIdentityMutation:true});
  }
  return {reconciliationOnly:true,businessExecuted:false,newIdentityMutations:false,credentialsRetainedUntilOriginalDeadline:true,results};
 }
 // All five audited signed-out models and protected owned profile/PID records
 // must work before generating any password or asking for a parent CAS.
 try{await factory.prepareHeldModels(lifecycle,{vault});}catch(error){try{await factory.closeOwnedModels(lifecycle,{preserveForReconciliation:false});}catch{await vault.requestStop();throw Error('PRE_CREDENTIAL_OWNED_CLEANUP_PENDING');}await vault.close();throw error;}
 const identities={},epochs={a:0,a2:0,a3:0,b:0,c:0};let models={};let complete=false;
 const active=async()=>{assertSameRunAuthorization(authorization);await factory.assertSameRunGrant(lifecycle,{identities,hardDeadline:binding.expiresAt});assertSameRunAuthorization(authorization);};
 async function identity(slot){
  const operation=slot==='C'?'register':'reset',intentId=`${binding.requestDigest}:${slot}:${operation}`,credentialVersion=sha(intentId);let cap,priorState;
  if(resume){
   cap=await vault.resumeKnownCredential({slot,credentialVersion,operation,intentId});
   const prior=await vault.readbackIntent(cap);priorState=prior;
   // Never infer absence from a transport error or register/reset again on resume.
   const reconciled=await factory.reconcileOriginalIntent(lifecycle,{slot,operation,intentId,prior});
   assert.equal(reconciled.confirmed,true,'UNKNOWN_ORIGINAL_INTENT_REQUIRES_PARENT_READBACK');
  }else{
   let password=randomBytes(48).toString('base64url');
   try{cap=await vault.sealBeforeMutation({slot,credentialVersion,password,operation,intentId});}finally{password=null;}
   // C's exact reviewed A06 lifecycle owns its pre-send claim; do not claim it
   // twice or register through a second route. A/B parent reset is claimed here.
   if(slot!=='C')await vault.claimBeforeSend(cap);
   const call=slot==='C'?factory.registerCThroughNormalUi:factory.resetKnownViaApprovedParentReceipt;
   // Fixed factory opens only short private credential callbacks for form entry
   // or hash creation; receipt/grant waits hold the opaque capability, not plaintext.
   await call(lifecycle,{slot,intentId,credentialCap:cap,authorization,vault});
  }
  const observed=await factory.verifyNormalIdentity(lifecycle,{slot,cap,vault,expected:FIXED_IDENTITIES[slot]});
  assert.equal(observed.accountKey,FIXED_IDENTITIES[slot].accountKey);
  if(slot!=='C'){assert.equal(observed.owner,FIXED_IDENTITIES[slot].owner);assert.equal(observed.authUid,FIXED_IDENTITIES[slot].authUid);}
  else {assert.match(observed.owner,/^account:[a-f0-9-]{36}$/);assert.match(observed.authUid,/^[a-f0-9-]{36}$/);}
  const safeIdentity={accountKey:observed.accountKey,owner:observed.owner,authUid:observed.authUid};
  if(slot!=='C'){const journal=await vault.readbackIntent(cap);if(journal.requiresAuthoritativeReadback)await vault.recordReadback(cap,{outcome:'confirmed',digest:sha(JSON.stringify(safeIdentity))});}
  // C API already records the registration and holds its own genuine bound login
  // capability. Never duplicate CreateNew receipts or login using the old pre-reg cap.
  identities[slot]=slot==='C'?safeIdentity:{...safeIdentity,cap};await factory.persistSafeIdentityManifest(lifecycle,{identities,roles:FIXED_DEVICE_ROLES});
 }
 async function relaunch(role){
  assert.ok(Object.hasOwn(FIXED_DEVICE_ROLES,role));assert.notEqual(role,'a3','Original S06 prelogin gate cannot migrate to a relaunched model');await active();
  const slot=role.startsWith('a')?'A':role.toUpperCase(),prior=models[role];
  const next=await factory.launchNormalModel(lifecycle,{role,prior,identity:identities[slot],vault,expectedEpoch:epochs[role]+1});
  assert.ok(next&&next.main&&next.page&&next.profile);if(prior)assert.equal(next.profile,prior.profile,'same-role same original profile only');
  assert.equal(next.epoch,epochs[role]+1);models[role]=next;epochs[role]=next.epoch;await active();return next;
 }
 try{
  for(const slot of ['A','B'])await identity(slot);
  // Factory must install exact prelogin gate before normal A3 login and preserve
  // the cold A2 profile reserved by the native readiness ticket.
  for(const role of ['a','a2','a3','b']){
   const slot=role.startsWith('a')?'A':role.toUpperCase();models[role]=await factory.launchNormalModel(lifecycle,{role,identity:identities[slot],vault,expectedEpoch:1});assert.equal(models[role].epoch,1);epochs[role]=1;
  }
  // C normal UI registration is the SAME A06 lifecycle instance later continued
  // by the driver. Four existing held devices are already in the safe manifest.
  await identity('C');
  models.c=await factory.launchNormalModel(lifecycle,{role:'c',identity:identities.C,vault,expectedEpoch:1});assert.equal(models.c.epoch,1);epochs.c=1;
  await active();
  const runtimeContext=await factory.getCompletionContext(lifecycle);assert.ok(Number.isSafeInteger(runtimeContext.businessDeadline)&&runtimeContext.businessDeadline>Date.now()&&runtimeContext.businessDeadline<=binding.expiresAt,'ACTUAL_SIGNED_SCOPE_DEADLINE_REQUIRED');
  assert.deepEqual(Object.keys(runtimeContext.models).sort(),Object.keys(FIXED_DEVICE_ROLES).sort(),'EXACT_SHARED_MODEL_REGISTRY_REQUIRED');
  for(const role of Object.keys(FIXED_DEVICE_ROLES)){assert.equal(runtimeContext.models[role],models[role],'FACTORY_MODEL_IDENTITY_MISMATCH');assert.ok(Number.isSafeInteger(runtimeContext.models[role].epoch)&&runtimeContext.models[role].epoch>=1);epochs[role]=runtimeContext.models[role].epoch;}
  models=runtimeContext.models;
  const result=await runPreparedCloudCompletion(p.completion,{...completionOptions,...runtimeContext,models,expectedActors:Object.fromEntries(Object.entries(models).map(([r,m])=>[r,m.actor])),assertActive:active,relaunch,businessDeadline:runtimeContext.businessDeadline,vault,authorization});
  // Driver success is necessary, not merely a returned object. Unknown/global-stop
  // keeps original profiles and custody available to the same-job reconciliation.
  complete=result?.passed===true&&result?.globalStopped!==true;return result;
 }finally{
  // Unexpected/unknown business outcomes keep same-job custody until supervisor's
  // hard deadline for an explicitly reviewed reconciliation phase; no auto rerun.
  await factory.closeOwnedModels(lifecycle,{models,preserveForReconciliation:!complete});
  if(complete)await vault.close();
 }
}
