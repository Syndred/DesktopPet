// No production trigger, ticket signing, identity, holder, password or vault calls.
// Calls the actual fixed-URL/real-verifier waiting function; cancellation is not approval.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';import {join,resolve} from 'node:path';import {fileURLToPath} from 'node:url';
import {awaitSignedAuthorization,validateSameRunJobClock,verifySameRunTempEnvironment} from './run-same-run.mjs';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url))),env=process.env;
verifySameRunTempEnvironment();assert.equal(process.argv.length,2);assert.equal(env.GITHUB_EVENT_NAME,'push');
const output=join(root,'artifacts/qa/same-run-handshake-'+env.GITHUB_RUN_ID);mkdirSync(output,{recursive:true});
const proof={version:1,run:env.GITHUB_RUN_ID,commit:env.GITHUB_SHA,scope:'Actual fixed authorization wait with real public URL and verifier, cancelled without authorization',passed:false,phase:'START',authorizationReturned:false,expectedAbortObserved:false,syntheticCancelObserved:false,nodeExitObserved:false,http404Observed:0,http200Observed:0};
const save=()=>{const p=join(output,'handshake-evidence.json');writeFileSync(p+'.tmp',JSON.stringify(proof));renameSync(p+'.tmp',p);};save();
process.on('exit',()=>{proof.nodeExitObserved=true;proof.requestedExitCode=process.exitCode??0;try{save();}catch{}});
const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),40000);
const cancelPath=join(output,'synthetic-cancel.json');
const poll=setInterval(()=>{if(!existsSync(cancelPath))return;try{const x=JSON.parse(readFileSync(cancelPath,'utf8').replace(/^\uFEFF/,''));assert.deepEqual(x,{version:1,purpose:'cancel-real-wait-selftest-only',run:env.GITHUB_RUN_ID,commit:env.GITHUB_SHA});proof.syntheticCancelObserved=true;save();controller.abort();}catch{proof.cancelRejected=true;save();controller.abort();}},100);
try{
 const clock=validateSameRunJobClock(JSON.parse(readFileSync(join(env.RUNNER_TEMP,'same-run-job-clock-'+env.GITHUB_RUN_ID+'.json'),'utf8')));
 const publicKey=readFileSync(join(root,'scripts/acceptance/requests/same-run-next-approval-public.pem'),'utf8');
 await awaitSignedAuthorization(publicKey,output,{nonce:'00000000-0000-4000-8000-000000000002'},clock,false,{signal:controller.signal,onSafePhase:phase=>{proof.phase=phase;if(phase==='AUTHORIZATION_HTTP_404')proof.http404Observed++;if(phase==='AUTHORIZATION_HTTP_200')proof.http200Observed++;save();}});
 proof.authorizationReturned=true;proof.errorCode='UNEXPECTED_AUTHORIZATION_RETURN';
}catch(error){proof.expectedAbortObserved=error?.code==='AUTHORIZATION_WAIT_ABORTED'&&proof.syntheticCancelObserved===true;proof.passed=proof.expectedAbortObserved&&!proof.authorizationReturned&&(proof.http404Observed+proof.http200Observed)>=1;if(!proof.passed)proof.errorCode='REAL_WAIT_SELFTEST_FAILED';}
finally{clearInterval(poll);clearTimeout(deadline);save();}
if(!proof.passed)process.exitCode=1;
