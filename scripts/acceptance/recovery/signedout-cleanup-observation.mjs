// Read-only evidence for the no-account held contract. Never cleanup or authority.
import assert from 'node:assert/strict';
import {lstatSync,readFileSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,basename,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {preparationSnapshot} from './preparation-state.mjs';

const samePath=(a,b)=>process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;
function localJson(path){
 const st=lstatSync(path);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size>0&&st.size<=65536);
 assert.ok(samePath(realpathSync.native(path),resolve(path)));
 return JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
}
function absentDirectory(path){
 try{lstatSync(path);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}
}

export function observeSignedoutCleanup({preparation,prelude,lifecycleBinding}){
 try{
  const original=preparationSnapshot(preparation),{run,commit,requestDigest}=original;
  assert.equal(run,process.env.GITHUB_RUN_ID);assert.equal(commit,process.env.GITHUB_SHA);
  assert.equal(requestDigest,createHash('sha256').update('signedout-prelude-observation:'+run+':'+commit).digest('hex'));
  assert.equal(original.holderEntered,false);assert.equal(original.pendingExternalCount,0);assert.equal(original.allocationUnconfirmed,false);assert.equal(original.ownedDirectoryCount,7);
  assert.deepEqual(Object.keys(prelude).sort(),['version','signedoutOnly','passed','stage','businessEntryRejected','credentialImportInvoked','loginInvoked','registrationInvoked','ownedCleanup','vaultClosed','watchdogTerminal','watchdogExited'].sort());assert.equal(prelude.version,1);
  assert.equal(prelude.signedoutOnly,true);assert.equal(prelude.passed,true);assert.equal(prelude.stage,'finished');
  for(const key of ['businessEntryRejected','ownedCleanup','vaultClosed','watchdogExited'])assert.equal(prelude[key],true);
  for(const key of ['credentialImportInvoked','loginInvoked','registrationInvoked'])assert.equal(prelude[key],false);
  const entry=resolve('artifacts/qa/same-run-entry-'+run),lifecycleDir=resolve('artifacts/qa/same-run-'+run);
  assert.deepEqual(localJson(join(entry,'preparation-state.json')),original);
  const owned=localJson(join(entry,'preparation-owned.LOCAL-ONLY.json'));
  assert.deepEqual(Object.keys(owned).sort(),['run','commit','requestDigest','directories'].sort());
  for(const key of ['run','commit','requestDigest'])assert.equal(owned[key],original[key]);
  assert.deepEqual(localJson(join(lifecycleDir,'signedout-prelude-evidence.json')),prelude);
  assert.deepEqual(Object.keys(lifecycleBinding).sort(),['run','commit','requestDigest'].sort());assert.equal(lifecycleBinding.run,run);assert.equal(lifecycleBinding.commit,commit);assert.match(lifecycleBinding.requestDigest,/^[a-f0-9]{64}$/);
  const terminal=prelude.watchdogTerminal;
  assert.deepEqual(Object.keys(terminal).sort(),['version','run','commit','requestDigest','closed','cleanupConfirmed','registeredProfilesOnly','ciphertextRemoved','endedAt'].sort());
  assert.equal(terminal.version,1);assert.equal(terminal.run,run);assert.equal(terminal.commit,commit);assert.match(terminal.requestDigest,/^[a-f0-9]{64}$/);
  assert.equal(terminal.requestDigest,lifecycleBinding.requestDigest);
  for(const key of ['closed','cleanupConfirmed','registeredProfilesOnly','ciphertextRemoved'])assert.equal(terminal[key],true);
  assert.ok(Number.isFinite(Date.parse(terminal.endedAt)));
  assert.deepEqual(localJson(resolve('artifacts/qa/same-run-watchdog-'+run,terminal.requestDigest+'-terminal.json')),terminal);
  const lifecycle=localJson(join(lifecycleDir,'lifecycle-cleanup.json'));
  assert.deepEqual(Object.keys(lifecycle).sort(),['ownedProcessesStopped','profilesRemoved','preservedOnlyUntilHardDeadline','expiresAt'].sort());
  assert.equal(lifecycle.ownedProcessesStopped,true);assert.equal(lifecycle.profilesRemoved,true);assert.equal(lifecycle.preservedOnlyUntilHardDeadline,false);assert.ok(Number.isSafeInteger(lifecycle.expiresAt));
  assert.equal(typeof process.env.RUNNER_TEMP,'string');assert.ok(isAbsolute(process.env.RUNNER_TEMP));const root=resolve(process.env.RUNNER_TEMP);assert.ok(lstatSync(root).isDirectory()&&!lstatSync(root).isSymbolicLink());assert.ok(samePath(realpathSync.native(root),root));
  assert.ok(Array.isArray(owned.directories));assert.equal(owned.directories.length,7);
  const counts={profile:0,package:0,native:0},prefixes={profile:'lingjing-live-holder-',package:'lingjing-precredential-package-',native:'lingjing-uia-api-selftest-'},paths=new Set();
  for(const row of owned.directories){
   assert.deepEqual(Object.keys(row).sort(),['canonical','dev','ino','kind','pids','removed'].sort());assert.ok(Object.hasOwn(counts,row.kind));
   assert.equal(typeof row.canonical,'string');assert.ok(isAbsolute(row.canonical));assert.ok(samePath(resolve(row.canonical),row.canonical));assert.ok(samePath(dirname(row.canonical),root));assert.ok(basename(row.canonical).startsWith(prefixes[row.kind]));
   assert.ok(Number.isFinite(row.dev)&&Number.isFinite(row.ino));assert.equal(typeof row.removed,'boolean');assert.ok(Array.isArray(row.pids)&&row.pids.every(pid=>Number.isSafeInteger(pid)&&pid>0));
   const key=process.platform==='win32'?row.canonical.toLowerCase():row.canonical;assert.equal(paths.has(key),false);paths.add(key);counts[row.kind]++;
  }
  assert.deepEqual(counts,{profile:5,package:1,native:1});
  for(const row of owned.directories)assert.equal(absentDirectory(row.canonical),true);
  assert.deepEqual(preparationSnapshot(preparation),original);assert.deepEqual(localJson(join(entry,'preparation-state.json')),original);
  return Object.freeze({version:1,scope:'signedout-prelude-post-cleanup-readonly-observation',run,commit,preparationRequestDigest:requestDigest,lifecycleRequestDigest:terminal.requestDigest,observedAt:new Date().toISOString(),passed:true,noIdentityOperation:true,additionalFullCasesPassed:0,liveCloud:false,registeredDirectoryCount:7,absentDirectoryCount:7,absentByKind:Object.freeze(counts),preparationRecordUnchanged:true,originalPreparationCleanupConfirmed:original.cleanupConfirmed,originalPreparationRemovedDirectoryCount:original.removedDirectoryCount});
 }catch{throw Object.assign(Error('SIGNEDOUT_CLEANUP_OBSERVATION_FAILED'),{code:'SIGNEDOUT_CLEANUP_OBSERVATION_FAILED'});}
}
