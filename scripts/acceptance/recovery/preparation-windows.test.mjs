// Executes the SAME artifact/package/native preparation as the real entry, no authority mint.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {validatePublicCompletionIndex,resolvePrivateCompletionFixture} from './same-run-fixture-index.mjs';
import {sameRunCompletionOptions,verifySameRunTempEnvironment} from './run-same-run.mjs';
import {prepareCompletionArtifacts,inspectCompletionArtifacts,disposeCompletionArtifacts,assertPreparedCompletion} from '../cloud-live-qa-completion-readiness.mjs';
import {createPreparationState,preparationSnapshot,preparationFailed,cleanupPreparation,safePreparationError} from './preparation-state.mjs';
assert.equal(process.platform,'win32');verifySameRunTempEnvironment();for(const k of ['GH_ENVIRONMENT_ADMISSION_TOKEN','DESKTOPPET_QA_A_PASSWORD','DESKTOPPET_QA_B_PASSWORD','DESKTOPPET_QA_CAS_PROVENANCE'])assert.equal(process.env[k],undefined);
const run=process.env.GITHUB_RUN_ID,commit=process.env.GITHUB_SHA,output=resolve('artifacts/qa/precredential-prepare-contract');mkdirSync(output,{recursive:true});const proof={version:1,run,commit,scope:'real-shared-preparation-no-auth-no-login',passed:false};let preparation,handle;
try{
 preparation=createPreparationState({run,commit,requestDigest:createHash('sha256').update('no-authority-preparation:'+run+':'+commit).digest('hex')});
 const input=validatePublicCompletionIndex(JSON.parse(readFileSync('scripts/acceptance/requests/same-run-next-completion.json','utf8'))),fixture=resolvePrivateCompletionFixture(input),options=sameRunCompletionOptions(input,run,fixture);
 handle=await prepareCompletionArtifacts({...options,preparation});assert.throws(()=>assertPreparedCompletion(handle));proof.prepared=inspectCompletionArtifacts(handle);assert.deepEqual(proof.prepared,{profiles:5,allProfilesEmpty:true,a2Empty:true,packageSignedoutVerified:true});proof.noBusinessPlanMinted=true;proof.passed=true;
}catch(error){if(preparation)preparationFailed(preparation,error);proof.error=safePreparationError(error);}
finally{if(preparation){try{proof.cleanup=handle?disposeCompletionArtifacts(handle,preparation):cleanupPreparation(preparation);if(!proof.cleanup.cleanupConfirmed)proof.passed=false;}catch{proof.passed=false;proof.cleanup={cleanupConfirmed:false};}proof.preparation=preparationSnapshot(preparation);}writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));}
console.log(JSON.stringify({passed:proof.passed,stage:proof.preparation?.failedAt||proof.preparation?.stage||'before-observer',cleanupConfirmed:proof.cleanup?.cleanupConfirmed===true,noIdentityOperation:true}));if(!proof.passed)process.exitCode=1;
