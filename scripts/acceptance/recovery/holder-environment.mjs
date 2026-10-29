// Fixed environment source. No legacy ticket/parent-proof/reset transport fallback.
import assert from 'node:assert/strict';
import {getVaultIoDiagnostic} from '../dpapi/vault-io-diagnostic.mjs';
import {createHash,randomBytes} from 'node:crypto';
import {readFileSync,writeFileSync,renameSync,existsSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createPreparationState,preparationStage,preparationFailed,cleanupPreparation,preparationHolderEntered,validatePreparationNoCustody} from './preparation-state.mjs';
import {assertPlatformAdmission} from './github-environment-admission.mjs';
import {createPlatformAuthorizedVault,cleanupFailedPlatformInitialization,FIXED_IDENTITIES} from '../dpapi/authorized-vault-client.mjs';
import {prepareCompletionBeforeCredentials} from '../cloud-live-qa-completion-readiness.mjs';
import {runPreparedCloudCompletion} from '../cloud-live-qa-completion-driver.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),prepared=new WeakMap();
export const ENVIRONMENT_LIFECYCLE_SHA256='2f88880662dc897962a8cf0aa689ab0cf1249b8da52924fac594a9973564f5ae'; // Exact reviewed local implementation; platform admission remains fail-closed.
const roles=Object.freeze({a:'A primary',a2:'A cold restore',a3:'A original S06',b:'B peer',c:'C new lifecycle'});
const holderErrorCodes=new Set(['ERR_ASSERTION','AUTHORIZED_VAULT_IO_FAILED','OWNED_VAULT_IO_UNCONFIRMED','VAULT_CHILD_NOT_STARTED','ENOENT','EACCES','EPERM','ETIMEDOUT','SUPERVISOR_NOT_READY','SUPERVISOR_START_FAILED','SUPERVISOR_OUTPUT_INVALID','ACCOUNT_CAPTURE_MISSING','NORMAL_FRESH_ACCOUNT_REQUIRED','PROFILE_MISMATCH']);
function holderSafeError(error){return {code:holderErrorCodes.has(error?.code??error?.message)?(error.code??error.message):'HOLDER_STAGE_FAILED',type:error?.name==='AssertionError'?'assertion':'error',vaultIo:getVaultIoDiagnostic(error)};}
function holderObservation(binding){const directory=resolve('artifacts/qa/same-run-'+binding.run);assert.equal(lstatSync(directory).isSymbolicLink(),false);assert.equal(realpathSync.native(directory).toLowerCase(),directory.toLowerCase());const file=join(directory,'holder-preimport-state.json'),proof={version:1,run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest,stage:'holder-entered',vaultCreated:false,supervisorReady:false,deadlineRegistered:false,heldReady:false,credentialImportStarted:false,businessCompleted:false,ownedCleanup:null,vaultClose:null,requestStop:null};assert.equal(existsSync(file),false);const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(proof),{mode:0o600});renameSync(file+'.tmp',file);};save();return {proof,save,stage(value){assert.ok(['vault-create','supervisor','business-deadline','held-models','credential-import','normal-identities','C-registration','completion','cleanup','finished'].includes(value));proof.stage=value;save();}};}

export async function prepareEnvironmentBeforeCredentials({admission,completionOptions}){
 const binding=assertPlatformAdmission(admission);const preparation=createPreparationState({run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest});try{assert.equal(binding.readOnly,false);assert.equal(process.platform,'win32');assert.equal(completionOptions.scenario,binding.scenario);assert.deepEqual(completionOptions.selectedCases,binding.caseIds);
 assert.match(ENVIRONMENT_LIFECYCLE_SHA256||'',/^[a-f0-9]{64}$/,'ENVIRONMENT_FACTORY_NOT_READY');const url=new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url);assert.equal(hash(readFileSync(url)),ENVIRONMENT_LIFECYCLE_SHA256);
 const factory=await import(url.href),completion=await prepareCompletionBeforeCredentials({...completionOptions,authorization:admission,preparation});
 preparationStage(preparation,'factory-prepare');
 const lifecycle=await factory.prepareNormalLifecycle({authorization:admission,roles,completionOptions,completionPlan:completion});const plan=Object.freeze({});prepared.set(plan,{admission,binding,factory,lifecycle,completion,completionOptions,preparation,used:false});preparationStage(preparation,'prepared');return plan;}catch(error){preparationFailed(preparation,error);cleanupPreparation(preparation);throw error;}
}
export async function runEnvironmentHolder(plan,{parentCasProvenance}){
 const p=prepared.get(plan);assert.ok(p&&!p.used,'GENUINE_ENVIRONMENT_PREPARATION_REQUIRED');p.used=true;const {admission,binding,factory,lifecycle,completion,completionOptions}=p;try{assertPlatformAdmission(admission);}catch(error){preparationFailed(p.preparation,error);cleanupPreparation(p.preparation);throw error;}
 let observation;try{observation=holderObservation(binding);}catch(error){preparationFailed(p.preparation,error);cleanupPreparation(p.preparation);throw error;}
 preparationHolderEntered(p.preparation);
 let vault=null,complete=false,held=false,models={},identities={},originalError=null;const epochs={};
 try{
  observation.stage('vault-create');vault=await createPlatformAuthorizedVault({admission});observation.proof.vaultCreated=true;observation.save();
  observation.stage('supervisor');await factory.verifySupervisorCapability(lifecycle,{...binding,vault});observation.proof.supervisorReady=true;observation.save();
  // Legacy vault field insertedAtMs is this LOCAL watchdog registration time,
  // not a claimed database grant insertion timestamp. The deadline never extends.
  observation.stage('business-deadline');await vault.registerBusinessDeadline({insertedAtMs:Date.now(),expiresAtMs:binding.businessDeadline,scopeDigest:hash('platform-fixed-deadline:'+binding.requestDigest)});observation.proof.deadlineRegistered=true;observation.save();
  observation.stage('held-models');await factory.prepareHeldModels(lifecycle,{vault});held=true;observation.proof.heldReady=true;observation.save();
  observation.stage('credential-import');observation.proof.credentialImportStarted=true;observation.save();const caps=await factory.importEnvironmentCredentials(lifecycle,{vault,provenance:parentCasProvenance});
  observation.stage('normal-identities');for(const slot of ['A','B']){const identity=await factory.verifyNormalIdentity(lifecycle,{slot,cap:caps[slot],vault,expected:FIXED_IDENTITIES[slot]});assert.deepEqual(identity,FIXED_IDENTITIES[slot]);identities[slot]={...identity,cap:caps[slot]};}
  for(const role of ['a','a2','a3','b']){models[role]=await factory.launchNormalModel(lifecycle,{role,identity:identities[role.startsWith('a')?'A':'B'],vault,expectedEpoch:1});epochs[role]=1;}
  observation.stage('C-registration');const intentId=binding.requestDigest+':C:register';let password=randomBytes(48).toString('base64url'),cCap;
  try{cCap=await vault.sealBeforeMutation({slot:'C',credentialVersion:hash(intentId),password,operation:'register',intentId});}finally{password=null;}
  await factory.registerCThroughNormalUi(lifecycle,{slot:'C',intentId,credentialCap:cCap,vault,authorization:admission});identities.C=await factory.verifyNormalIdentity(lifecycle,{slot:'C',cap:cCap,vault,expected:FIXED_IDENTITIES.C});
  const context=await factory.getCompletionContext(lifecycle);models=context.models;assert.deepEqual(Object.keys(models).sort(),Object.keys(roles).sort());for(const role of Object.keys(roles))epochs[role]=models[role].epoch;
  const active=async()=>{assertPlatformAdmission(admission);await factory.assertSameRunGrant(lifecycle,{hardDeadline:binding.businessDeadline});assertPlatformAdmission(admission);};await active();
  const relaunch=async role=>{assert.ok(Object.hasOwn(roles,role)&&role!=='a3');await active();const prior=models[role],slot=role.startsWith('a')?'A':role.toUpperCase(),next=await factory.launchNormalModel(lifecycle,{role,prior,identity:identities[slot],vault,expectedEpoch:epochs[role]+1});assert.equal(next.profile,prior.profile);assert.equal(next.epoch,++epochs[role]);models[role]=next;await active();return next;};
  observation.stage('completion');const result=await runPreparedCloudCompletion(completion,{...completionOptions,...context,models,expectedActors:Object.fromEntries(Object.entries(models).map(([role,m])=>[role,m.actor])),assertActive:active,relaunch,vault,authorization:admission});complete=result?.passed===true&&result?.globalStopped!==true;observation.proof.businessCompleted=complete;observation.save();return result;
 }catch(error){originalError=error;observation.proof.failedAt=observation.proof.stage;observation.proof.originalError=holderSafeError(error);try{observation.save();}catch{}throw error;}finally{
  delete process.env.DESKTOPPET_QA_A_PASSWORD;delete process.env.DESKTOPPET_QA_B_PASSWORD;
  let cleanupError=null;const persistCleanup=()=>{try{observation.save();}catch(error){cleanupError??=error;}};observation.proof.stage='cleanup';persistCleanup();
  try{await factory.closeOwnedModels(lifecycle,{models,preserveForReconciliation:held&&!complete});observation.proof.ownedCleanup=true;}catch(error){cleanupError=error;observation.proof.ownedCleanup=false;observation.proof.ownedCleanupError=holderSafeError(error);}persistCleanup();
  try{if(observation.proof.ownedCleanup!==true){observation.proof.vaultPreservedForUnconfirmedCleanup=true;}else if(vault){if(complete||!held){await vault.close();observation.proof.vaultClose=true;}else observation.proof.vaultPreservedForReadback=true;}else{await cleanupFailedPlatformInitialization({admission});observation.proof.vaultClose=true;}}catch(error){cleanupError??=error;observation.proof.vaultClose=false;observation.proof.vaultCloseError=holderSafeError(error);}persistCleanup();
  if(cleanupError&&vault){try{await vault.requestStop();observation.proof.requestStop=true;}catch(error){observation.proof.requestStop=false;observation.proof.requestStopError=holderSafeError(error);}persistCleanup();}
  observation.proof.stage='finished';persistCleanup();if(cleanupError&&!originalError)throw Error('ENVIRONMENT_OWNED_CLEANUP_UNCONFIRMED');
 }
}
// Original known terminal/readback only. Never generates or consumes credentials,
// repeats parent CAS, registers C, launches a model or enters the business driver.
export async function inspectEnvironmentOriginalIntent({admission}){
 const binding=assertPlatformAdmission(admission);assert.equal(binding.readOnly,true);const prepPath=resolve('artifacts/qa/same-run-entry-'+binding.run,'preparation-state.json');if(existsSync(prepPath)){assert.equal(lstatSync(prepPath).isSymbolicLink(),false);assert.equal(realpathSync.native(prepPath).toLowerCase(),prepPath.toLowerCase());const r=JSON.parse(readFileSync(prepPath,'utf8'));if(validatePreparationNoCustody(r,binding)){assert.equal(readdirSync(process.env.RUNNER_TEMP).some(n=>n.startsWith('dpapi-authorized-'+binding.run+'-')),false);return {reconciliationOnly:true,newIdentityMutations:false,businessExecuted:false,noRunnerIntent:true,preparationCleanupConfirmed:r.cleanupConfirmed===true,scope:'precredential-owned-cleanup'};}}const vault=await createPlatformAuthorizedVault({admission,resume:true});const intentId=binding.requestDigest+':C:register';
 const c=await vault.inspectOriginalIntent({slot:'C',operation:'register',intentId,credentialVersion:hash(intentId)});
 return {reconciliationOnly:true,newIdentityMutations:false,businessExecuted:false,A:{state:'parent-cas-external-no-runner-reset-intent'},B:{state:'parent-cas-external-no-runner-reset-intent'},C:c,requiresParentPrivateReadback:c.requiresAuthoritativeReadback===true};
}
