// Fixed environment source. No legacy ticket/parent-proof/reset transport fallback.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,existsSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createPreparationState,preparationStage,preparationFailed,cleanupPreparation,preparationHolderEntered,validatePreparationNoCustody} from './preparation-state.mjs';
import {assertPlatformAdmission} from './github-environment-admission.mjs';
import {createPlatformAuthorizedVault,cleanupFailedPlatformInitialization,FIXED_IDENTITIES} from '../dpapi/authorized-vault-client.mjs';
import {prepareCompletionBeforeCredentials} from '../cloud-live-qa-completion-readiness.mjs';
import {runPreparedCloudCompletion} from '../cloud-live-qa-completion-driver.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),prepared=new WeakMap();
export const ENVIRONMENT_LIFECYCLE_SHA256='33b75b232b972c12d30b7cc4ef4adabd710a25710c33f0a0e28758a365ddbdf1'; // Exact reviewed local implementation; platform admission remains fail-closed.
const roles=Object.freeze({a:'A primary',a2:'A cold restore',a3:'A original S06',b:'B peer',c:'C new lifecycle'});
export async function prepareEnvironmentBeforeCredentials({admission,completionOptions}){
 const binding=assertPlatformAdmission(admission);const preparation=createPreparationState({run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest});try{assert.equal(binding.readOnly,false);assert.equal(process.platform,'win32');assert.equal(completionOptions.scenario,binding.scenario);assert.deepEqual(completionOptions.selectedCases,binding.caseIds);
 assert.match(ENVIRONMENT_LIFECYCLE_SHA256||'',/^[a-f0-9]{64}$/,'ENVIRONMENT_FACTORY_NOT_READY');const url=new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url);assert.equal(hash(readFileSync(url)),ENVIRONMENT_LIFECYCLE_SHA256);
 const factory=await import(url.href),completion=await prepareCompletionBeforeCredentials({...completionOptions,authorization:admission,preparation});
 preparationStage(preparation,'factory-prepare');
 const lifecycle=await factory.prepareNormalLifecycle({authorization:admission,roles,completionOptions,completionPlan:completion});const plan=Object.freeze({});prepared.set(plan,{admission,binding,factory,lifecycle,completion,completionOptions,preparation,used:false});preparationStage(preparation,'prepared');return plan;}catch(error){preparationFailed(preparation,error);cleanupPreparation(preparation);throw error;}
}
export async function runEnvironmentHolder(plan,{parentCasProvenance}){
 const p=prepared.get(plan);assert.ok(p&&!p.used,'GENUINE_ENVIRONMENT_PREPARATION_REQUIRED');p.used=true;const {admission,binding,factory,lifecycle,completion,completionOptions}=p;try{assertPlatformAdmission(admission);}catch(error){preparationFailed(p.preparation,error);cleanupPreparation(p.preparation);throw error;}
 preparationHolderEntered(p.preparation);
 let vault=null,complete=false,held=false,models={},identities={};const epochs={};
 try{
  vault=await createPlatformAuthorizedVault({admission});
  await factory.verifySupervisorCapability(lifecycle,{...binding,vault});
  // Legacy vault field insertedAtMs is this LOCAL watchdog registration time,
  // not a claimed database grant insertion timestamp. The deadline never extends.
  await vault.registerBusinessDeadline({insertedAtMs:Date.now(),expiresAtMs:binding.businessDeadline,scopeDigest:hash('platform-fixed-deadline:'+binding.requestDigest)});
  await factory.prepareHeldModels(lifecycle,{vault});held=true;
  const caps=await factory.importEnvironmentCredentials(lifecycle,{vault,provenance:parentCasProvenance});
  for(const slot of ['A','B']){const identity=await factory.verifyNormalIdentity(lifecycle,{slot,cap:caps[slot],vault,expected:FIXED_IDENTITIES[slot]});assert.deepEqual(identity,FIXED_IDENTITIES[slot]);identities[slot]={...identity,cap:caps[slot]};}
  for(const role of ['a','a2','a3','b']){models[role]=await factory.launchNormalModel(lifecycle,{role,identity:identities[role.startsWith('a')?'A':'B'],vault,expectedEpoch:1});epochs[role]=1;}
  const intentId=binding.requestDigest+':C:register';let password=randomBytes(48).toString('base64url'),cCap;
  try{cCap=await vault.sealBeforeMutation({slot:'C',credentialVersion:hash(intentId),password,operation:'register',intentId});}finally{password=null;}
  await factory.registerCThroughNormalUi(lifecycle,{slot:'C',intentId,credentialCap:cCap,vault,authorization:admission});identities.C=await factory.verifyNormalIdentity(lifecycle,{slot:'C',cap:cCap,vault,expected:FIXED_IDENTITIES.C});
  const context=await factory.getCompletionContext(lifecycle);models=context.models;assert.deepEqual(Object.keys(models).sort(),Object.keys(roles).sort());for(const role of Object.keys(roles))epochs[role]=models[role].epoch;
  const active=async()=>{assertPlatformAdmission(admission);await factory.assertSameRunGrant(lifecycle,{hardDeadline:binding.businessDeadline});assertPlatformAdmission(admission);};await active();
  const relaunch=async role=>{assert.ok(Object.hasOwn(roles,role)&&role!=='a3');await active();const prior=models[role],slot=role.startsWith('a')?'A':role.toUpperCase(),next=await factory.launchNormalModel(lifecycle,{role,prior,identity:identities[slot],vault,expectedEpoch:epochs[role]+1});assert.equal(next.profile,prior.profile);assert.equal(next.epoch,++epochs[role]);models[role]=next;await active();return next;};
  const result=await runPreparedCloudCompletion(completion,{...completionOptions,...context,models,expectedActors:Object.fromEntries(Object.entries(models).map(([role,m])=>[role,m.actor])),assertActive:active,relaunch,vault,authorization:admission});complete=result?.passed===true&&result?.globalStopped!==true;return result;
 }finally{
  delete process.env.DESKTOPPET_QA_A_PASSWORD;delete process.env.DESKTOPPET_QA_B_PASSWORD;
  try{await factory.closeOwnedModels(lifecycle,{models,preserveForReconciliation:held&&!complete});if(vault){if(complete||!held)await vault.close();}else await cleanupFailedPlatformInitialization({admission});}catch{if(vault)await vault.requestStop();throw Error('ENVIRONMENT_OWNED_CLEANUP_UNCONFIRMED');}
 }
}
// Original known terminal/readback only. Never generates or consumes credentials,
// repeats parent CAS, registers C, launches a model or enters the business driver.
export async function inspectEnvironmentOriginalIntent({admission}){
 const binding=assertPlatformAdmission(admission);assert.equal(binding.readOnly,true);const prepPath=resolve('artifacts/qa/same-run-entry-'+binding.run,'preparation-state.json');if(existsSync(prepPath)){assert.equal(lstatSync(prepPath).isSymbolicLink(),false);assert.equal(realpathSync.native(prepPath).toLowerCase(),prepPath.toLowerCase());const r=JSON.parse(readFileSync(prepPath,'utf8'));if(validatePreparationNoCustody(r,binding)){assert.equal(readdirSync(process.env.RUNNER_TEMP).some(n=>n.startsWith('dpapi-authorized-'+binding.run+'-')),false);return {reconciliationOnly:true,newIdentityMutations:false,businessExecuted:false,noRunnerIntent:true,preparationCleanupConfirmed:r.cleanupConfirmed===true,scope:'precredential-owned-cleanup'};}}const vault=await createPlatformAuthorizedVault({admission,resume:true});const intentId=binding.requestDigest+':C:register';
 const c=await vault.inspectOriginalIntent({slot:'C',operation:'register',intentId,credentialVersion:hash(intentId)});
 return {reconciliationOnly:true,newIdentityMutations:false,businessExecuted:false,A:{state:'parent-cas-external-no-runner-reset-intent'},B:{state:'parent-cas-external-no-runner-reset-intent'},C:c,requiresParentPrivateReadback:c.requiresAuthoritativeReadback===true};
}
