// Offline isolation contracts. These are not Windows UI or cloud acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {notificationPackage,signedoutPreparationPackage,notificationRuntime,validatePinnedNotificationPackage,validatePinnedSignedoutPreparationPackage,verifyCompletionPackageBeforeCredentials,verifySignedoutPackageWithoutCredentials,assertNoIdentityEnvironment} from './cloud-live-qa-completion-package-preflight.mjs';
import {MODULES,assertPreparedCompletion,takePreparedCompletion} from './cloud-live-qa-completion-readiness.mjs';
import {assertPlatformAdmission} from './recovery/github-environment-admission.mjs';
import {assertCompletionAuthorization} from './dpapi/authorized-vault-client.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const migrationBase='b6378f4d70e703505f5f103765279b1aa88cf46b';
const baseline=path=>execFileSync('git',['show',migrationBase+':'+path]);
const identityKeys=['expectedSource','expectedFingerprint','expectedExeSha256'];
const previousPackage={expectedSource:'5016f1c3f7de04b4e2b322d0b47ec52248596771',expectedFingerprint:'25d17ddda4a5526a6e9e63503f4fd3def1816935b97a96a5c1d0a19795a21387',expectedExeSha256:'a88f61364810291e6ca79ff1b9030680831d7382e65137b9ace9607e3e65fafc'};
test('audited bytes align while signedout and live preparation remain separate fixed gates',()=>{
 assert.equal(signedoutPreparationPackage.expectedSource,'735c48476d3c0efc2aab62cecc765c9ce1933adb');
 assert.equal(signedoutPreparationPackage.runId,41005729685);assert.equal(signedoutPreparationPackage.artifactId,12956066898);
 assert.deepEqual(notificationPackage,signedoutPreparationPackage);assert.notEqual(notificationPackage,signedoutPreparationPackage);
 validatePinnedSignedoutPreparationPackage(signedoutPreparationPackage);validatePinnedNotificationPackage(notificationPackage);
 assert.throws(()=>validatePinnedNotificationPackage(previousPackage),/EXACT_NEW_NOTIFICATION_PACKAGE_REQUIRED/);
 assert.throws(()=>validatePinnedSignedoutPreparationPackage(previousPackage),/EXACT_SIGNEDOUT_PREPARATION_PACKAGE_REQUIRED/);
});
test('every package identity field is pinned and caller policy fields cannot bypass either gate',async()=>{
 for(const key of identityKeys){const forged={...signedoutPreparationPackage,[key]:'0'.repeat(key==='expectedSource'?40:64),allowLatest:true,verifier:()=>true};assert.throws(()=>validatePinnedSignedoutPreparationPackage(forged));assert.throws(()=>validatePinnedNotificationPackage(forged));await assert.rejects(verifySignedoutPackageWithoutCredentials(forged),/EXACT_SIGNEDOUT_PREPARATION_PACKAGE_REQUIRED/);await assert.rejects(verifyCompletionPackageBeforeCredentials(forged),/EXACT_NEW_NOTIFICATION_PACKAGE_REQUIRED/);}
 await assert.rejects(verifyCompletionPackageBeforeCredentials({...previousPackage,signedoutOnly:true,verifier:()=>true}),/EXACT_NEW_NOTIFICATION_PACKAGE_REQUIRED/);
});
test('identity-bearing environments are rejected before signedout package preparation',async()=>{
 for(const key of ['GH_ENVIRONMENT_ADMISSION_TOKEN','DESKTOPPET_QA_A_PASSWORD','DESKTOPPET_QA_B_PASSWORD','DESKTOPPET_QA_CAS_PROVENANCE']){
  assert.equal(Object.hasOwn(process.env,key),false);try{process.env[key]='public-synthetic-not-a-credential';assert.throws(()=>assertNoIdentityEnvironment(),/SIGNEDOUT_PREPARATION_MUST_HAVE_NO_IDENTITY_CREDENTIALS/);await assert.rejects(verifySignedoutPackageWithoutCredentials(signedoutPreparationPackage),/SIGNEDOUT_PREPARATION_MUST_HAVE_NO_IDENTITY_CREDENTIALS/);}finally{delete process.env[key];}
 }
});
test('a valid current package and caller approval are never platform or business capabilities',()=>{
 for(const forged of [notificationPackage,signedoutPreparationPackage,{}, {approved:true,packageSource:notificationPackage.expectedSource,executableSha256:notificationPackage.expectedExeSha256},{protocol:'fixed-completion-precredential-v1',signedoutOnly:true,selftestsPassed:true,packageProof:signedoutPreparationPackage}]){
  assert.throws(()=>assertPlatformAdmission(forged));assert.throws(()=>assertCompletionAuthorization(forged));assert.throws(()=>assertPreparedCompletion(forged));assert.throws(()=>takePreparedCompletion(forged));
 }
});
test('shared preparation wrappers cannot select a caller supplied verifier or mint a business plan',()=>{
 const source=read('scripts/acceptance/cloud-live-qa-completion-readiness.mjs');
 assert.match(source,/export async function prepareCompletionArtifacts\(options\)\{return prepareCompletionArtifactsInternal\(options,false\);\}/);
 assert.match(source,/export async function prepareSignedoutCompletionArtifacts\(options\)\{assertNoIdentityEnvironment\(\);return prepareCompletionArtifactsInternal\(options,true\);\}/);
 assert.doesNotMatch(source,/export (?:async )?function prepareCompletionArtifactsInternal/);
 assert.match(source,/const handle=await prepareCompletionArtifacts\(\{selectedCases,runId,scenario,\.\.\.options,packageBinding,preparation\}\)/);
 assert.match(source,/assertCompletionAuthorization\(authorization,\{caseIds:selectedCases\}\)/);
});
test('all reviewed module and asset pins match exact source bytes',()=>{
 let count=0;for(const spec of Object.values(MODULES))for(const entry of [spec,...spec.assets||[]]){assert.equal(sha(readFileSync(new URL(entry.file,import.meta.url))),entry.sha256,entry.file);count++;}assert.equal(count,37);
});
test('the current package notification runtime is unchanged and product reuse remains strict',()=>{
 const bytes=execFileSync('git',['show',signedoutPreparationPackage.expectedSource+':'+notificationRuntime.path]);assert.equal(sha(bytes.toString('utf8').replace(/\r\n/g,'\n')),notificationRuntime.sha256);
 const source=read('scripts/acceptance/verify-portable-reuse.mjs');assert.match(source,/Product\/dependency\/build changes require a new audited package, not reuse/);assert.match(source,/Tracked working tree must be clean before native package reuse/);
 const changes=execFileSync('git',['diff','--name-only',signedoutPreparationPackage.expectedSource,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);assert.ok(changes.every(path=>/^(?:docs\/|tests\/|scripts\/acceptance\/|\.github\/workflows\/)/.test(path)||path==='.gitignore'));
});
test('Windows no-account workflows and evidence stay scoped to the current package',()=>{
 const workflow=read('.github/workflows/cloud-precredential-prepare-contract.yml'),held=read('.github/workflows/cloud-held-prelude-contract.yml'),runner=read('scripts/acceptance/recovery/preparation-windows.test.mjs');
 for(const source of [workflow,held]){assert.match(source,/artifact-ids: '12956066898'/);assert.match(source,/run-id: 41005729685/);assert.match(source,/--source=735c48476d3c0efc2aab62cecc765c9ce1933adb/);assert.doesNotMatch(source,/secrets\./);assert.doesNotMatch(source,/environment: desktoppet/);}
 assert.match(runner,/handle=await prepareSignedoutCompletionArtifacts/);assert.match(runner,/assert\.throws\(\(\)=>assertPreparedCompletion\(handle\)\)/);assert.match(runner,/assert\.throws\(\(\)=>takePreparedCompletion\(handle\)\)/);assert.match(runner,/additionalFullCasesPassed:0,liveCloud:false/);
 for(const key of identityKeys)assert.ok(runner.includes("'"+key+"'"));
 for(const file of ['recovery/environment-adapter-windows.test.mjs','recovery/held-prelude-windows.test.mjs']){const source=read('scripts/acceptance/'+file);assert.ok(source.includes("packageSource:'"+notificationPackage.expectedSource+"'"));assert.ok(source.includes('assert.throws(()=>originalAssert(admission))'));}
});
test('active authorization guards change only the exact reviewed package bindings',()=>{
 const mappings={
  'scripts/acceptance/recovery/same-run-request.mjs':[[previousPackage.expectedSource,notificationPackage.expectedSource]],
  'scripts/acceptance/recovery/github-environment-admission.mjs':[[previousPackage.expectedSource,notificationPackage.expectedSource],[previousPackage.expectedExeSha256,notificationPackage.expectedExeSha256]],
  '.github/workflows/cloud-environment-completion.yml':[[previousPackage.expectedSource,notificationPackage.expectedSource],["artifact-ids: '12786865736'","artifact-ids: '12956066898'"],['run-id: 40618386720','run-id: 41005729685'],['Strict audited actual 5016 package reuse','Strict audited actual 735 package reuse']]
 };
 for(const [path,replacements] of Object.entries(mappings)){let expected=baseline(path).toString('utf8').replace(/\r\n/g,'\n');for(const [before,after] of replacements){assert.equal(expected.split(before).length,2,path+': exact one binding');expected=expected.replace(before,after);}assert.equal(read(path),expected,path+': no guard relaxation');}
});
test('legacy credentials, custody, live lifecycle, grants and historical fixture code remain byte-for-byte unchanged',()=>{
 for(const path of ['scripts/acceptance/dpapi/authorized-vault-client.mjs','.github/workflows/cloud-same-run-completion-prepare.yml','scripts/acceptance/recovery/run-environment-completion.mjs','scripts/acceptance/recovery/environment-bootstrap.mjs','scripts/acceptance/recovery/environment-process.ps1','scripts/acceptance/recovery/holder-environment.mjs','scripts/acceptance/recovery/same-run-normal-lifecycle-factory.mjs','scripts/acceptance/cloud-live-qa-s06-platform-transition.mjs','scripts/acceptance/cloud-live-qa-s06-prelogin-gate.mjs','scripts/acceptance/recovery/same-run-fixture-index.mjs','scripts/acceptance/requests/same-run-next-completion.json']){
  assert.equal(sha(readFileSync(new URL('../../'+path,import.meta.url))),sha(baseline(path)),path);
 }
});
