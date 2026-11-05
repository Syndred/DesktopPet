// No credentials or login: verify the actual new portable before identity recovery.
import assert from 'node:assert/strict';
import {preparationStage,preparationExternalStart,preparationExternalDone,preparationDirectory,preparationPids,preparationFailed} from './recovery/preparation-state.mjs';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {platformChildEnvironment} from './recovery/github-environment-admission.mjs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const notificationPackage=Object.freeze({runId:41005729685,artifactId:12956066898,zipSha256:'a7d88111f2d2b22cc3575e7fe53a9ea91a85416df2bb8fafb1c6bbf778aa286f',expectedSource:'735c48476d3c0efc2aab62cecc765c9ce1933adb',expectedFingerprint:'8ba8990339c420c3dc8d64282d536f4ceddc76c45c24808f524b22f81daa58c6',expectedExeSha256:'88ed00e1a94df58d7df80df3978798f9bf67c76c43c6d808df5eccc00d7aa79c'});
// Signed-out preparation retains a separate fixed gate even when its audited
// package bytes match the live package. It never creates a business capability.
// ZIP digest verified by GitHub download in run 41966230309; this offline
// binding migration does not claim a new Windows run or real-session approval.
export const signedoutPreparationPackage=Object.freeze({runId:41005729685,artifactId:12956066898,zipSha256:'a7d88111f2d2b22cc3575e7fe53a9ea91a85416df2bb8fafb1c6bbf778aa286f',expectedSource:'735c48476d3c0efc2aab62cecc765c9ce1933adb',expectedFingerprint:'8ba8990339c420c3dc8d64282d536f4ceddc76c45c24808f524b22f81daa58c6',expectedExeSha256:'88ed00e1a94df58d7df80df3978798f9bf67c76c43c6d808df5eccc00d7aa79c'});
export function validatePinnedSignedoutPreparationPackage(binding){for(const k of ['expectedSource','expectedFingerprint','expectedExeSha256'])assert.equal(binding?.[k],signedoutPreparationPackage[k],'EXACT_SIGNEDOUT_PREPARATION_PACKAGE_REQUIRED');}
export function assertNoIdentityEnvironment(){for(const k of ['GH_ENVIRONMENT_ADMISSION_TOKEN','DESKTOPPET_QA_A_PASSWORD','DESKTOPPET_QA_B_PASSWORD','DESKTOPPET_QA_CAS_PROVENANCE'])assert.equal(Object.hasOwn(process.env,k),false,'SIGNEDOUT_PREPARATION_MUST_HAVE_NO_IDENTITY_CREDENTIALS');}
export function validatePinnedNotificationPackage(binding){for(const k of ['expectedSource','expectedFingerprint','expectedExeSha256'])assert.equal(binding?.[k],notificationPackage[k],'EXACT_NEW_NOTIFICATION_PACKAGE_REQUIRED');}
const root=fileURLToPath(new URL('../../',import.meta.url));
export const notificationRuntime=Object.freeze({path:'apps/pc-app/runtime/features/accounts/service.cjs',sha256:'87ca4aca07957a8269346e86acae17fded7e3792e88ce0433e3fc0c224dca172'});
const sha=b=>createHash('sha256').update(b).digest('hex');
export const normalizedSourceHash=b=>sha(b.toString('utf8').replace(/\r\n/g,'\n'));
export function verifyCompletionPackageDocuments({manifest,audit,closureBytes,exeBytes,sourceBytes,sourceTree},binding){
 assert.match(binding.expectedSource,/^[a-f0-9]{40}$/);assert.equal(normalizedSourceHash(sourceBytes),notificationRuntime.sha256,'NEW_NOTIFICATION_RUNTIME_REQUIRED_OLD_PACKAGE_REJECTED');
 assert.equal(manifest.sourceCommit,binding.expectedSource);assert.equal(manifest.sourceTree,sourceTree);assert.deepEqual(manifest.sourceDirtyFiles,[]);assert.equal(manifest.compiledFingerprint,binding.expectedFingerprint);
 assert.equal(audit.passed,true);assert.equal(audit.runtimeDependencies?.passed,true);assert.deepEqual(audit.runtimeDependencies.errors,[]);assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.forbidden,[]);assert.deepEqual(audit.build,manifest);assert.equal(audit.sourceCommit,binding.expectedSource);
 assert.equal(sha(exeBytes),binding.expectedExeSha256);assert.equal(audit.sha256,binding.expectedExeSha256);assert.equal(audit.bytes,exeBytes.length);assert.equal(sha(closureBytes),audit.runtimeClosure.sha256);
 const closure=JSON.parse(closureBytes);const rows=closure.files.filter(x=>x.path===notificationRuntime.path);assert.equal(rows.length,1);assert.equal(rows[0].sha256,sha(sourceBytes));
 return {sourceCommit:binding.expectedSource,compiledFingerprint:binding.expectedFingerprint,exeSha256:binding.expectedExeSha256,notificationRuntimeSha256:notificationRuntime.sha256,closureSha256:sha(closureBytes)};
}
export async function verifyCompletionPackageBeforeCredentials(binding,{preparation}={}){
 validatePinnedNotificationPackage(binding);
 return verifyPinnedSignedoutPackage(binding,{preparation});
}
export async function verifySignedoutPackageWithoutCredentials(binding,{preparation}={}){
 assertNoIdentityEnvironment();validatePinnedSignedoutPreparationPackage(binding);
 return verifyPinnedSignedoutPackage(binding,{preparation});
}
async function verifyPinnedSignedoutPackage(binding,{preparation}){
 preparationStage(preparation,'package-docs');
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
 assert.match(binding?.expectedSource||'',/^[a-f0-9]{40}$/);for(const k of ['expectedFingerprint','expectedExeSha256'])assert.match(binding[k]||'',/^[a-f0-9]{64}$/);
 for(const k of ['manifestPath','auditPath','closurePath','executable'])assert.equal(typeof binding[k],'string');
 const sourceBytes=execFileSync('git',['show',binding.expectedSource+':'+notificationRuntime.path],{cwd:root,maxBuffer:1024*1024,env:platformChildEnvironment()});
 // Git stores LF, while audited Windows checkout/ASAR may use CRLF. Closure
 // must identify exactly one of those byte-equivalent source representations.
 const closureBytes=readFileSync(binding.closurePath),closure=JSON.parse(closureBytes);const row=closure.files.find(x=>x.path===notificationRuntime.path);let packagedSource=sourceBytes;
 if(row?.sha256!==sha(sourceBytes)){packagedSource=Buffer.from(sourceBytes.toString('utf8').replace(/\r?\n/g,'\r\n'));assert.equal(row?.sha256,sha(packagedSource));}
 const result=verifyCompletionPackageDocuments({manifest:JSON.parse(readFileSync(binding.manifestPath)),audit:JSON.parse(readFileSync(binding.auditPath)),closureBytes,exeBytes:readFileSync(binding.executable),sourceBytes:packagedSource,sourceTree:execFileSync('git',['rev-parse',binding.expectedSource+'^{tree}'],{cwd:root,encoding:'utf8',env:platformChildEnvironment()}).trim()},binding);
 preparationStage(preparation,'package-allocation');preparationExternalStart(preparation,'package');
 const profile=mkdtempSync(join(tmpdir(),'lingjing-precredential-package-')),standard=new Set(['SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','PROGRAMDATA','PROGRAMFILES','PROGRAMFILES(X86)','COMMONPROGRAMFILES','COMMONPROGRAMFILES(X86)','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','PSMODULEPATH']);
 const environment=Object.fromEntries(Object.entries(process.env).filter(([k])=>k.toUpperCase()!=='PET_USER_DATA_DIR').map(([k,v])=>[k,standard.has(k.toUpperCase())?v:undefined]));let model,launchAttempted=false;
 preparationDirectory(preparation,profile,{kind:'package'});
 try{preparationStage(preparation,'package-launch');const {launchPortableSession}=await import('./portable-session.mjs');launchAttempted=true;model=await launchPortableSession({executable:binding.executable,expectedSource:binding.expectedSource,profile,label:'signedout-notification-package-preflight',environment});
  preparationPids(preparation,profile,[model.runtime.pid,model.launcherPid]);
  assert.equal((await model.call('accounts','session')).currentUser,null);assert.equal(model.info.build.compiledFingerprint,binding.expectedFingerprint);assert.deepEqual(model.info.build.sourceDirtyFiles,[]);
  const actual=await model.main((_e,path)=>{const fs=process.getBuiltinModule('node:fs'),crypto=process.getBuiltinModule('node:crypto');const bytes=fs.readFileSync(process.resourcesPath+'/app.asar/'+path);return crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');},notificationRuntime.path);assert.equal(actual,notificationRuntime.sha256);
  result.actualSignedoutAsarRuntimeVerified=true;
 }catch(error){preparationFailed(preparation,error);throw error;}finally{preparationStage(preparation,'package-cleanup');const cleanup={stopCompleted:!launchAttempted,allOwnedProcessesStopped:!launchAttempted||Boolean(model),profileRemoved:false};if(model){let timer;try{await Promise.race([model.stop(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('OWNED_STOP_TIMEOUT')),15000);})]);cleanup.stopCompleted=true;}catch{cleanup.stopCompleted=false;}finally{clearTimeout(timer);}for(const pid of new Set([model.runtime.pid,model.launcherPid])){let alive=true;try{process.kill(pid,0);}catch(e){alive=e.code!=='ESRCH';}if(alive)cleanup.allOwnedProcessesStopped=false;}}if(cleanup.allOwnedProcessesStopped)try{rmSync(profile,{recursive:true,force:true});cleanup.profileRemoved=true;}catch{}result.cleanup=cleanup;preparationExternalDone(preparation,'package',Object.values(cleanup).every(v=>v===true));assert.ok(Object.values(cleanup).every(v=>v===true),'Signedout package probe cleanup incomplete; credentials forbidden');}
 return result;
}
