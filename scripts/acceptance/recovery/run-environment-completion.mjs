// Fixed protected-environment entry; no command-line secrets or signed-ticket fallback.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {admitGitHubEnvironment,assertPlatformAdmission} from './github-environment-admission.mjs';
import {validateSameRunJobClock,verifySameRunTempEnvironment,sameRunCompletionOptions} from './run-same-run.mjs';
import {validatePublicCompletionIndex,resolvePrivateCompletionFixture} from './same-run-fixture-index.mjs';
import {prepareEnvironmentBeforeCredentials,runEnvironmentHolder,inspectEnvironmentOriginalIntent} from './holder-environment.mjs';
import {validateAppliedParentCredentialProvenance} from '../dpapi/authorized-vault-client.mjs';
export function parseEnvironmentEntryArgs(args){assert.ok(Array.isArray(args)&&(args.length===0||(args.length===1&&args[0]==='--reconcile-only')),'NO_ENVIRONMENT_ENTRY_ARGUMENTS');return {resume:args.length===1};}
function file(path,max){const p=resolve(path),st=lstatSync(p);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size>0&&st.size<=max);assert.equal(realpathSync.native(p).toLowerCase(),p.toLowerCase());return JSON.parse(readFileSync(p,'utf8').replace(/^\uFEFF/,''));}
export async function runEnvironmentCompletion(args=process.argv.slice(2)){
 let stage='arguments',directory,heartbeat,proof,resume=false;let statusName='environment-status.json';
 const persist=()=>{if(!directory)return;writeFileSync(join(directory,statusName+'.tmp'),JSON.stringify(proof),{mode:0o600});renameSync(join(directory,statusName+'.tmp'),join(directory,statusName));};
 try{({resume}=parseEnvironmentEntryArgs(args));statusName=resume?'environment-reconciliation-status.json':'environment-status.json';stage='temp';verifySameRunTempEnvironment();directory=resolve('artifacts/qa/same-run-entry-'+process.env.GITHUB_RUN_ID);mkdirSync(directory,{recursive:true});assert.equal(lstatSync(directory).isSymbolicLink(),false);proof={version:1,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,source:'github-environment-v1',mainCalled:true,ticks:0,stage,credentialEntryAttempted:false,passed:false,nodeExitObserved:false,requestedExitCode:null};persist();heartbeat=setInterval(()=>{proof.ticks++;persist();},1000);
 process.once('exit',()=>{proof.nodeExitObserved=true;persist();});
 const mark=value=>{stage=value;proof.stage=value;persist();};
 mark('clock');const clock=validateSameRunJobClock(file(join(process.env.RUNNER_TEMP,'same-run-job-clock-'+process.env.GITHUB_RUN_ID+'.json'),2048));
 const deadline=Number(process.env.DESKTOPPET_QA_BUSINESS_DEADLINE_MS);assert.ok(Number.isSafeInteger(deadline));
 mark('platform-admission');const admission=await admitGitHubEnvironment({clock,businessDeadline:deadline,resume}),binding=assertPlatformAdmission(admission);
 const bound={version:1,run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest};
 if(resume){assert.deepEqual(file(join(directory,'entry-binding.json'),2048),bound);mark('readback-only');const result=await inspectEnvironmentOriginalIntent({admission});writeFileSync(join(directory,'environment-reconciliation-result.json'),JSON.stringify({...bound,...result}),{flag:'wx',mode:0o600});proof.passed=true;proof.originalBusinessFailureUnchanged=true;mark('readback-only-completed');proof.requestedExitCode=0;return result;}
 writeFileSync(join(directory,'entry-binding.json'),JSON.stringify(bound),{flag:'wx',mode:0o600});
 mark('private-fixture');const input=validatePublicCompletionIndex(file('scripts/acceptance/requests/same-run-next-completion.json',32768)),fixture=resolvePrivateCompletionFixture(input),completionOptions=sameRunCompletionOptions(input,binding.run,fixture);
 // Metadata only; parent retains the independent actual CAS originals. This is
 // neither a caller-issued authority capability nor a runner-generated reset receipt.
 mark('parent-cas-metadata');let raw=process.env.DESKTOPPET_QA_CAS_PROVENANCE;assert.ok(typeof raw==='string'&&Buffer.byteLength(raw)<=4096);const provenance=JSON.parse(raw);raw=null;delete process.env.DESKTOPPET_QA_CAS_PROVENANCE;assert.deepEqual(Object.keys(provenance).sort(),['A','B']);for(const slot of ['A','B'])validateAppliedParentCredentialProvenance(provenance[slot],slot);
 mark('precredential-prepare');const plan=await prepareEnvironmentBeforeCredentials({admission,completionOptions});
 mark('holder');proof.credentialEntryAttempted=true;persist();const result=await runEnvironmentHolder(plan,{parentCasProvenance:provenance});proof.passed=result?.passed===true&&result?.globalStopped!==true;mark(proof.passed?'completed':'failed');assert.equal(proof.passed,true);proof.requestedExitCode=0;return {passed:true};
 }catch{if(proof){proof.failedAt=stage;proof.stage='failed';proof.errorCode='ENVIRONMENT_ENTRY_STOPPED';proof.requestedExitCode=1;persist();}throw Object.assign(Error('ENVIRONMENT_ENTRY_STOPPED'),{code:'ENVIRONMENT_ENTRY_STOPPED'});}
 finally{clearInterval(heartbeat);for(const key of ['DESKTOPPET_QA_A_PASSWORD','DESKTOPPET_QA_B_PASSWORD','DESKTOPPET_QA_CAS_PROVENANCE','GH_ENVIRONMENT_ADMISSION_TOKEN'])delete process.env[key];if(proof)persist();}
}
