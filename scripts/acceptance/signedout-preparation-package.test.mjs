// Offline isolation contracts. These are not Windows UI or cloud acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {notificationPackage,signedoutPreparationPackage,notificationRuntime,validatePinnedNotificationPackage,validatePinnedSignedoutPreparationPackage,verifyCompletionPackageBeforeCredentials,verifySignedoutPackageWithoutCredentials,assertNoIdentityEnvironment} from './cloud-live-qa-completion-package-preflight.mjs';
import {MODULES,assertPreparedCompletion,takePreparedCompletion} from './cloud-live-qa-completion-readiness.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const identityKeys=['expectedSource','expectedFingerprint','expectedExeSha256'];
test('current audited package is admitted only by the signedout identity gate',()=>{
 assert.equal(signedoutPreparationPackage.expectedSource,'735c48476d3c0efc2aab62cecc765c9ce1933adb');
 assert.equal(signedoutPreparationPackage.runId,41005729685);assert.equal(signedoutPreparationPackage.artifactId,12956066898);
 validatePinnedSignedoutPreparationPackage(signedoutPreparationPackage);
 assert.throws(()=>validatePinnedNotificationPackage(signedoutPreparationPackage),/EXACT_NEW_NOTIFICATION_PACKAGE_REQUIRED/);
 assert.equal(notificationPackage.expectedSource,'5016f1c3f7de04b4e2b322d0b47ec52248596771');validatePinnedNotificationPackage(notificationPackage);
 assert.throws(()=>validatePinnedSignedoutPreparationPackage(notificationPackage),/EXACT_SIGNEDOUT_PREPARATION_PACKAGE_REQUIRED/);
});
test('every package identity field is pinned and caller policy fields cannot bypass it',async()=>{
 for(const key of identityKeys){const forged={...signedoutPreparationPackage,[key]:'0'.repeat(key==='expectedSource'?40:64),allowLatest:true,verifier:()=>true};assert.throws(()=>validatePinnedSignedoutPreparationPackage(forged));await assert.rejects(verifySignedoutPackageWithoutCredentials(forged),/EXACT_SIGNEDOUT_PREPARATION_PACKAGE_REQUIRED/);}
 await assert.rejects(verifyCompletionPackageBeforeCredentials({...signedoutPreparationPackage,signedoutOnly:true,verifier:()=>true}),/EXACT_NEW_NOTIFICATION_PACKAGE_REQUIRED/);
});
test('identity-bearing environments are rejected before package preparation',async()=>{
 for(const key of ['GH_ENVIRONMENT_ADMISSION_TOKEN','DESKTOPPET_QA_A_PASSWORD','DESKTOPPET_QA_B_PASSWORD','DESKTOPPET_QA_CAS_PROVENANCE']){
  assert.equal(Object.hasOwn(process.env,key),false);try{process.env[key]='public-synthetic-not-a-credential';assert.throws(()=>assertNoIdentityEnvironment(),/SIGNEDOUT_PREPARATION_MUST_HAVE_NO_IDENTITY_CREDENTIALS/);await assert.rejects(verifySignedoutPackageWithoutCredentials(signedoutPreparationPackage),/SIGNEDOUT_PREPARATION_MUST_HAVE_NO_IDENTITY_CREDENTIALS/);}finally{delete process.env[key];}
 }
});
test('shared preparation wrappers cannot select a caller supplied verifier',()=>{
 const source=read('scripts/acceptance/cloud-live-qa-completion-readiness.mjs');
 assert.match(source,/export async function prepareCompletionArtifacts\(options\)\{return prepareCompletionArtifactsInternal\(options,false\);\}/);
 assert.match(source,/export async function prepareSignedoutCompletionArtifacts\(options\)\{assertNoIdentityEnvironment\(\);return prepareCompletionArtifactsInternal\(options,true\);\}/);
 assert.doesNotMatch(source,/export (?:async )?function prepareCompletionArtifactsInternal/);
 assert.match(source,/const handle=await prepareCompletionArtifacts\(\{selectedCases,runId,scenario,\.\.\.options,packageBinding,preparation\}\)/);
 for(const forged of [{},{protocol:'fixed-completion-precredential-v1',signedoutOnly:true,selftestsPassed:true,packageProof:signedoutPreparationPackage}]){assert.throws(()=>assertPreparedCompletion(forged));assert.throws(()=>takePreparedCompletion(forged));}
});
test('all reviewed module and asset pins match exact source bytes',()=>{
 let count=0;for(const spec of Object.values(MODULES))for(const entry of [spec,...spec.assets||[]]){assert.equal(sha(readFileSync(new URL(entry.file,import.meta.url))),entry.sha256,entry.file);count++;}assert.equal(count,37);
});
test('the current package notification runtime is unchanged and product reuse remains strict',()=>{
 const bytes=execFileSync('git',['show',signedoutPreparationPackage.expectedSource+':'+notificationRuntime.path]);assert.equal(sha(bytes.toString('utf8').replace(/\r\n/g,'\n')),notificationRuntime.sha256);
 const source=read('scripts/acceptance/verify-portable-reuse.mjs');assert.match(source,/Product\/dependency\/build changes require a new audited package, not reuse/);assert.match(source,/Tracked working tree must be clean before native package reuse/);
 const changes=execFileSync('git',['diff','--name-only',signedoutPreparationPackage.expectedSource,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);assert.ok(changes.every(path=>/^(?:docs\/|tests\/|scripts\/acceptance\/|\.github\/workflows\/)/.test(path)||path==='.gitignore'));
});
test('Windows no-account workflow and evidence are explicitly scoped to the current package',()=>{
 const workflow=read('.github/workflows/cloud-precredential-prepare-contract.yml'),runner=read('scripts/acceptance/recovery/preparation-windows.test.mjs');
 assert.match(workflow,/artifact-ids: '12956066898'/);assert.match(workflow,/run-id: 41005729685/);assert.match(workflow,/--source=735c48476d3c0efc2aab62cecc765c9ce1933adb/);assert.doesNotMatch(workflow,/secrets\./);assert.doesNotMatch(workflow,/environment: desktoppet/);
 assert.match(runner,/handle=await prepareSignedoutCompletionArtifacts/);assert.match(runner,/assert\.throws\(\(\)=>assertPreparedCompletion\(handle\)\)/);assert.match(runner,/assert\.throws\(\(\)=>takePreparedCompletion\(handle\)\)/);assert.match(runner,/additionalFullCasesPassed:0,liveCloud:false/);
 for(const key of identityKeys)assert.ok(runner.includes("'"+key+"'"));
});
test('real authorization, entry workflow and historical fixture bindings remain byte-for-byte unchanged',()=>{
 for(const path of ['scripts/acceptance/recovery/github-environment-admission.mjs','scripts/acceptance/recovery/same-run-request.mjs','scripts/acceptance/dpapi/authorized-vault-client.mjs','.github/workflows/cloud-environment-completion.yml','scripts/acceptance/recovery/same-run-fixture-index.mjs','scripts/acceptance/requests/same-run-next-completion.json']){
  const baseline=execFileSync('git',['show','554ea292925d0e3ebacd2ac0201138405bc325fc:'+path]);assert.equal(sha(readFileSync(new URL('../../'+path,import.meta.url))),sha(baseline),path);
 }
});
