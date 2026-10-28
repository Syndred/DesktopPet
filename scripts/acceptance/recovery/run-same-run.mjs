// Local entry contract. This file does not enable a workflow or fill approval pins.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validatePublicCompletionIndex,resolvePrivateCompletionFixture,readPrivateCompletionFixture} from './same-run-fixture-index.mjs';
import {validateSameRunRequest} from './same-run-request.mjs';
import {DEFAULT_REQUESTED_CASES} from '../cloud-live-qa-completion-readiness.mjs';
import {notificationPackage} from '../cloud-live-qa-completion-package-preflight.mjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
export const SAME_RUN_ENTRY_FILES=Object.freeze({authorization:'scripts/acceptance/requests/same-run-next-authorization.json',approvalPublic:'scripts/acceptance/requests/same-run-next-approval-public.pem',completion:'scripts/acceptance/requests/same-run-next-completion.json'});
export function parseSameRunEntryArgs(args){assert.ok(Array.isArray(args));assert.ok(args.length===0||(args.length===1&&args[0]==='--reconcile-only'),'NO_ARBITRARY_ENTRY_ARGUMENTS');return {resume:args[0]==='--reconcile-only'};}
export function validateSameRunEntryOptions(input){return validatePublicCompletionIndex(input);}
function fixedFile(key,max){const p=join(root,SAME_RUN_ENTRY_FILES[key]),st=lstatSync(p);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size>0&&st.size<=max);const normalize=x=>process.platform==='win32'?x.toLowerCase():x;assert.equal(normalize(realpathSync.native(p)),normalize(p),'FIXED_CANONICAL_REQUEST_FILE_REQUIRED');return readFileSync(p,'utf8');}
export function verifySameRunTempEnvironment(env=process.env){assert.equal(process.platform,'win32');assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_REPOSITORY,'Syndred/DesktopPet');assert.equal(env.GITHUB_REF,'refs/heads/codex/cloud-authority-convergence');assert.match(env.GITHUB_RUN_ID||'',/^\d+$/);assert.ok(env.RUNNER_TEMP&&env.TEMP&&env.TMP);const expected=realpathSync.native(env.RUNNER_TEMP).toLowerCase();for(const k of['TEMP','TMP'])assert.equal(realpathSync.native(env[k]).toLowerCase(),expected,'TEMP_AND_TMP_MUST_EQUAL_RUNNER_TEMP_BEFORE_PROFILE_ALLOCATION');return true;}
export function sameRunCompletionOptions(input,ciRunId,privateFixture){validateSameRunEntryOptions(input);assert.match(ciRunId,/^\d+$/);const fields=readPrivateCompletionFixture(privateFixture,input);return {selectedCases:[...DEFAULT_REQUESTED_CASES],runId:input.runId,scenario:'cloud-acceptance-20261027-8be246d1',existingRecordFixture:fields.existingRecordFixture,friendPetIds:fields.friendPetIds,domainFixturePlan:fields.domainFixturePlan,realtimeMode:'account-notifications-v1',notificationDeploymentProofPath:join(root,'scripts/acceptance/requests/same-run-next-notification-deployment.json'),priorConcurrent:{runId:40607080843,artifactId:12783353029,path:join(root,'artifacts/qa/same-run-prior/live-qa-recovery/live-discovery-evidence.json'),reusePath:join(root,'artifacts/qa/same-run-prior/native-continuation/package-reuse.json')},packageBinding:{expectedSource:notificationPackage.expectedSource,expectedFingerprint:notificationPackage.expectedFingerprint,expectedExeSha256:notificationPackage.expectedExeSha256,manifestPath:join(root,'apps/pc-app/dist/build-manifest.json'),auditPath:join(root,'artifacts/foundation/cloud-engineering/package-audit.json'),closurePath:join(root,'apps/pc-app/dist/runtime-closure.json'),executable:join(root,'artifacts/pc-cloud-upgrade/Lingjing-0.1.8-portable-x64.exe')},output:join(root,'artifacts/qa/same-run-'+ciRunId,'completion')};}
export function validateSameRunJobClock(value,env=process.env,now=Date.now()){
 assert.deepEqual(Object.keys(value).sort(),['version','run','commit','startedAtMs','hardEndMs'].sort());assert.equal(value.version,1);assert.equal(value.run,env.GITHUB_RUN_ID);assert.equal(value.commit,env.GITHUB_SHA);assert.ok(Number.isSafeInteger(value.startedAtMs)&&Number.isSafeInteger(value.hardEndMs));assert.equal(value.hardEndMs-value.startedAtMs,320*60000);assert.ok(value.startedAtMs<=now&&now<value.hardEndMs);return value;
}
function readJobClock(){const p=join(process.env.RUNNER_TEMP,'same-run-job-clock-'+process.env.GITHUB_RUN_ID+'.json'),st=lstatSync(p);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size<2048);assert.equal(realpathSync.native(p).toLowerCase(),p.toLowerCase());return validateSameRunJobClock(JSON.parse(readFileSync(p,'utf8')));}
export const SAME_RUN_AUTHORIZATION_URL='https://raw.githubusercontent.com/Syndred/DesktopPet/refs/heads/codex/cloud-authority-convergence/'+SAME_RUN_ENTRY_FILES.authorization;
export function parseAuthorizationEnvelope(bytes){assert.ok(Buffer.byteLength(bytes)<=65536);const request=JSON.parse(bytes);assert.deepEqual(Object.keys(request),['ticket']);assert.ok(typeof request.ticket==='string'&&request.ticket.length>0&&request.ticket.length<=60000);return request;}
async function awaitSignedAuthorization(publicKeyPem,statusRoot,trigger,clock,resume=false){
 const {APPROVAL_KEY_SHA256,verifySameRunAuthorization,assertSameRunAuthorization}=await import('../dpapi/authorized-vault-client.mjs');
 assert.match(APPROVAL_KEY_SHA256||'',/^[a-f0-9]{64}$/,'PRE_CREDENTIAL_NOT_READY');assert.equal(process.env.GITHUB_EVENT_NAME,'push','MANUAL_PREPARATION_IS_NOT_IDENTITY_AUTHORIZATION');
 const deadline=Math.min(clock.hardEndMs,Date.now()+20*60000);
 if(!resume)writeFileSync(join(statusRoot,'authorization-request.json'),JSON.stringify({version:1,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,nonce:trigger.nonce,hardEndMs:clock.hardEndMs,requestedAt:new Date().toISOString(),waitDeadline:new Date(deadline).toISOString()}),{mode:0o600,flag:'wx'});
 while(Date.now()<deadline){
  const response=await fetch(SAME_RUN_AUTHORIZATION_URL,{credentials:'omit',redirect:'error',headers:{Accept:'application/json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(Math.min(10000,deadline-Date.now()))});
  if(response.status===404){await response.body?.cancel();await new Promise(r=>setTimeout(r,2000));continue;}assert.equal(response.status,200);
  const length=response.headers.get('content-length');if(length!==null)assert.ok(/^\d+$/.test(length)&&Number(length)<=65536);
  assert.ok(response.body);const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;assert.ok(size<=65536);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const request=parseAuthorizationEnvelope(Buffer.concat(chunks).toString('utf8'));
  // A previous fixed-file ticket may be cached. It never authorizes this run;
  // only the real verifier may admit a matching signed run/trigger commit/TTL.
  try{const authorization=await verifySameRunAuthorization({ticket:request.ticket,publicKeyPem});const binding=assertSameRunAuthorization(authorization);assert.equal(binding.nonce,trigger.nonce,'SIGNED_TRIGGER_NONCE_MISMATCH');assert.ok(binding.expiresAt<=clock.hardEndMs,'LEASE_MUST_END_BEFORE_JOB_CLEANUP_RESERVE');return {request,binding};}catch{await new Promise(r=>setTimeout(r,2000));}
 }
 throw Error('PRE_CREDENTIAL_NOT_READY');
}
export async function runSameRunEntry(args=process.argv.slice(2),onSafePhase=()=>{}){
 let phase='PRE_CREDENTIAL_NOT_READY',statusPath,resumeMode=false;
 try{onSafePhase('ARGUMENTS');const {resume}=parseSameRunEntryArgs(args);resumeMode=resume;onSafePhase('TEMP');verifySameRunTempEnvironment();onSafePhase('REQUEST');const trigger=validateSameRunRequest({reconciliation:resume});onSafePhase('JOB_CLOCK');const clock=readJobClock();
  const statusRoot=join(root,'artifacts/qa/same-run-entry-'+process.env.GITHUB_RUN_ID);mkdirSync(statusRoot,{recursive:true});statusPath=join(statusRoot,resume?'reconciliation-status.json':'entry-status.json');
  const write=value=>{writeFileSync(statusPath+'.tmp',JSON.stringify(value,null,2),{mode:0o600});renameSync(statusPath+'.tmp',statusPath);};
  onSafePhase('PUBLIC_INPUT');const publicKeyPem=fixedFile('approvalPublic',8192);assert.ok(publicKeyPem.startsWith('-----BEGIN PUBLIC KEY-----'));const input=validateSameRunEntryOptions(JSON.parse(fixedFile('completion',32768)));onSafePhase('PRIVATE_FIXTURE');const privateFixture=resume?null:resolvePrivateCompletionFixture(input);
  onSafePhase('AWAIT_SIGNED_AUTHORIZATION');const {request,binding}=await awaitSignedAuthorization(publicKeyPem,statusRoot,trigger,clock,resume);
  const bindingPath=join(statusRoot,'entry-binding.json'),safeBinding={version:1,run:binding.run,commit:binding.commit,requestDigest:binding.requestDigest};
  if(resume){const stat=lstatSync(bindingPath);assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<2048);assert.equal(realpathSync.native(bindingPath).toLowerCase(),bindingPath.toLowerCase());assert.deepEqual(JSON.parse(readFileSync(bindingPath,'utf8')),safeBinding,'ORIGINAL_SAME_RUN_BINDING_REQUIRED');}
  else writeFileSync(bindingPath,JSON.stringify(safeBinding),{mode:0o600,flag:'wx'});
  onSafePhase('BOUND_AUTHORIZATION');const {prepareSameRunBeforeCredentials,runSameRunHolder}=await import('./holder-same-run.mjs');
  write({version:1,state:'precredential-checks',credentialOperationsStarted:false,resume});onSafePhase('PREPARE_HOLDER');const prepared=await prepareSameRunBeforeCredentials({ticket:request.ticket,publicKeyPem,completionOptions:resume?undefined:sameRunCompletionOptions(input,process.env.GITHUB_RUN_ID,privateFixture),resume});
  phase='SAME_RUN_STOPPED_CHECK_SAFE_CHECKPOINT';write({version:1,state:'prepared-starting-holder',credentialOperationsStarted:false,resume});onSafePhase('RUN_HOLDER');const result=await runSameRunHolder(prepared,{resume});
  if(resume)writeFileSync(join(statusRoot,'reconciliation-result.json'),JSON.stringify(result,null,2),{mode:0o600,flag:'wx'});
  const passed=resume?result.reconciliationOnly===true&&result.businessExecuted===false:result.passed===true&&result.globalStopped!==true;write({version:1,state:passed?'completed':'stopped',credentialOperationsStarted:!resume,reconciliationOnly:resume,passed});assert.equal(passed,true);return {passed,reconciliationOnly:resume};
 }catch{if(statusPath){writeFileSync(statusPath+'.tmp',JSON.stringify({version:1,state:'stopped',errorCode:phase,credentialOperationsStarted:!resumeMode&&phase!=='PRE_CREDENTIAL_NOT_READY',reconciliationOnly:resumeMode}),{mode:0o600});renameSync(statusPath+'.tmp',statusPath);}throw Object.assign(Error(phase),{code:phase});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)runSameRunEntry().then(()=>console.log('SAME_RUN_ENTRY_COMPLETED')).catch(error=>{console.error(error.code==='PRE_CREDENTIAL_NOT_READY'?'PRE_CREDENTIAL_NOT_READY':'SAME_RUN_STOPPED_CHECK_SAFE_CHECKPOINT');process.exitCode=1;});
