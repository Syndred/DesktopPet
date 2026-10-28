// Fixed preauthorization startup check. No ticket, account, package or credential.
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';import {join} from 'node:path';
assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');assert.match(process.env.GITHUB_RUN_ID||'',/^\d+$/);
const env=process.env,dir=join(process.cwd(),'artifacts/qa/same-run-entry-'+env.GITHUB_RUN_ID),output=join(process.cwd(),'artifacts/qa/same-run-bootstrap-contract');mkdirSync(output,{recursive:true});
const proof={version:1,scope:'Actual fixed Windows CLI startup and preauthorization rejection only; no real identity',run:env.GITHUB_RUN_ID,commit:env.GITHUB_SHA,passed:false,stage:'SELFTEST',checks:[],cleanupConfirmed:false};
const save=()=>writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));
function ps(action){const p=spawnSync(join(env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','scripts/acceptance/recovery/same-run-process.ps1','-Action',action],{encoding:'utf8',windowsHide:true,timeout:45000,maxBuffer:65536});return {status:p.status,timedOut:p.error?.code==='ETIMEDOUT',stdout:p.stdout||'',stderr:p.stderr||''};}
let failed=false;
try{
 // Ordinary source push must be rejected by the unchanged exact-trigger guard.
 const {validateSameRunRequest}=await import('./same-run-request.mjs');let denied=false;try{validateSameRunRequest();}catch{denied=true;}assert.equal(denied,true,'REAL_TRIGGER_NOT_ALLOWED_IN_STARTUP_CONTRACT');
 save();assert.equal(ps('selftest').status,0);proof.checks.push('exact-owned-timer-selftest');proof.stage='START';save();assert.equal(ps('start').status,0);proof.stage='EXPECT_REQUEST_REJECTION';save();
 const wait=ps('authorization');assert.equal(wait.timedOut,false);assert.notEqual(wait.status,0);assert.equal(wait.stderr.includes('ENTRY_STOPPED_BEFORE_FIXED_PHASE'),true); // classify only; never persist raw stderr
 const b=JSON.parse(readFileSync(join(dir,'entry-bootstrap.json'),'utf8'));assert.equal(b.run,env.GITHUB_RUN_ID);assert.equal(b.commit,env.GITHUB_SHA);assert.equal(b.started,true);assert.equal(b.mainCalled,true);assert.equal(b.phase,'REQUEST');assert.equal(b.credentialOperationsStarted,false);assert.equal(b.nodeExitObserved,true);assert.equal(b.requestedExitCode,1);assert.equal(b.actualExitCode,null);assert.equal(b.errorCode,'PRE_CREDENTIAL_NOT_READY');
 for(const name of ['entry-binding.json','authorization-request.json'])assert.equal(existsSync(join(dir,name)),false);assert.equal(readdirSync(env.RUNNER_TEMP).some(n=>n.startsWith('dpapi-authorized-'+env.GITHUB_RUN_ID+'-')),false);
 proof.checks.push('actual-fixed-bootstrap-main-called','unchanged-exact-request-rejected-before-auth','no-binding-authrequest-vault-registry');proof.stage='STOP';save();
}catch{failed=true;proof.errorCode='FIXED_STARTUP_CONTRACT_FAILED';}
finally{
 try{assert.equal(ps('stop').status,0);const terminal=JSON.parse(readFileSync(join(dir,'terminal-cleanup.json'),'utf8').replace(/^\uFEFF/,''));assert.equal(terminal.scope,'precredential-no-custody');assert.equal(terminal.run,env.GITHUB_RUN_ID);assert.equal(terminal.commit,env.GITHUB_SHA);assert.equal(terminal.bindingAbsent,true);assert.equal(terminal.thisRunVaultAndRegistryAbsent,true);assert.equal(terminal.holderExited,true);assert.equal(terminal.registeredProfileCleanupNotClaimed,true);proof.cleanupConfirmed=true;proof.checks.push('exact-precredential-no-custody-not-global-cleanup');}catch{failed=true;proof.cleanupErrorCode='PREAUTH_CUSTODY_NOT_CONFIRMED';}
 proof.passed=!failed;save();
}
console.log(proof.passed?'FIXED_STARTUP_CONTRACT_PASSED':'FIXED_STARTUP_CONTRACT_FAILED');if(!proof.passed)process.exitCode=1;
