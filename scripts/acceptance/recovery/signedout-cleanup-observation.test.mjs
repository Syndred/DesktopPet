import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,realpathSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {assertPlatformAdmission} from './github-environment-admission.mjs';
import {assertPreparedCompletion} from '../cloud-live-qa-completion-readiness.mjs';
import {createPreparationState,preparationAllocationStart,preparationDirectory,preparationSnapshot,preparationExternalStart,preparationHolderEntered} from './preparation-state.mjs';
import {observeSignedoutCleanup} from './signedout-cleanup-observation.mjs';

function fixture(fn){
 const keys=['GITHUB_RUN_ID','GITHUB_SHA','RUNNER_TEMP'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const run=String(910000000000+Math.floor(Math.random()*100000000)),commit='a'.repeat(40),root=realpathSync.native(tmpdir());
 Object.assign(process.env,{GITHUB_RUN_ID:run,GITHUB_SHA:commit,RUNNER_TEMP:root});
 const entry=resolve('artifacts/qa/same-run-entry-'+run),lifecycleDir=resolve('artifacts/qa/same-run-'+run),watchdog=resolve('artifacts/qa/same-run-watchdog-'+run),dirs=[];
 const requestDigest=createHash('sha256').update('signedout-prelude-observation:'+run+':'+commit).digest('hex');
 const preparation=createPreparationState({run,commit,requestDigest});
 const terminal={version:1,run,commit,requestDigest:'c'.repeat(64),closed:true,cleanupConfirmed:true,registeredProfilesOnly:true,ciphertextRemoved:true,endedAt:new Date().toISOString()};
 const prelude={version:1,signedoutOnly:true,passed:true,stage:'finished',businessEntryRejected:true,credentialImportInvoked:false,loginInvoked:false,registrationInvoked:false,ownedCleanup:true,vaultClosed:true,watchdogTerminal:terminal,watchdogExited:true};
 const lifecycle={ownedProcessesStopped:true,profilesRemoved:true,preservedOnlyUntilHardDeadline:false,expiresAt:Date.now()+60000};
 const write=(p,v)=>writeFileSync(p,JSON.stringify(v));
 const registryPath=join(entry,'preparation-owned.LOCAL-ONLY.json'),statePath=join(entry,'preparation-state.json'),preludePath=join(lifecycleDir,'signedout-prelude-evidence.json'),terminalPath=join(watchdog,terminal.requestDigest+'-terminal.json'),lifecyclePath=join(lifecycleDir,'lifecycle-cleanup.json');
 try{
  for(const kind of ['package','native',...Array(5).fill('profile')]){
   const prefix={package:'lingjing-precredential-package-',native:'lingjing-uia-api-selftest-',profile:'lingjing-live-holder-'}[kind];
   const path=mkdtempSync(join(root,prefix));dirs.push(path);if(kind==='profile')preparationAllocationStart(preparation);preparationDirectory(preparation,path,{kind});rmSync(path,{recursive:true});
  }
  mkdirSync(lifecycleDir);mkdirSync(watchdog);write(preludePath,prelude);write(terminalPath,terminal);write(lifecyclePath,lifecycle);
  const read=p=>JSON.parse(readFileSync(p,'utf8'));
  const mutateOwned=change=>{const v=read(registryPath);change(v);write(registryPath,v);};
  const setPrelude=change=>{change(prelude);write(preludePath,prelude);};
  return fn({preparation,prelude,lifecycleBinding:{run,commit,requestDigest:terminal.requestDigest},run,commit,root,dirs,entry,lifecycleDir,registryPath,statePath,preludePath,terminalPath,lifecyclePath,read,write,mutateOwned,setPrelude});
 }finally{
  for(const path of dirs)rmSync(path,{recursive:true,force:true});for(const path of [entry,lifecycleDir,watchdog])rmSync(path,{recursive:true,force:true});
  for(const key of keys)if(saved[key]===undefined)delete process.env[key];else process.env[key]=saved[key];
 }
}
const reject=f=>assert.throws(()=>observeSignedoutCleanup(f),error=>{assert.equal(error.code,'SIGNEDOUT_CLEANUP_OBSERVATION_FAILED');assert.equal(error.message,error.code);assert.equal(error.cause,undefined);return true;});

test('seven registered directories are absent without rewriting the stale preparation observation',()=>fixture(f=>{
 const files=[f.registryPath,f.statePath,f.preludePath,f.terminalPath,f.lifecyclePath],before=files.map(p=>readFileSync(p));
 const result=observeSignedoutCleanup(f);assert.equal(result.passed,true);assert.equal(result.registeredDirectoryCount,7);assert.equal(result.absentDirectoryCount,7);assert.deepEqual(result.absentByKind,{profile:5,package:1,native:1});
 assert.throws(()=>assertPlatformAdmission(result));assert.throws(()=>assertPreparedCompletion(result));
 assert.deepEqual(Object.keys(result).sort(),['version','scope','run','commit','preparationRequestDigest','lifecycleRequestDigest','observedAt','passed','noIdentityOperation','additionalFullCasesPassed','liveCloud','registeredDirectoryCount','absentDirectoryCount','absentByKind','preparationRecordUnchanged','originalPreparationCleanupConfirmed','originalPreparationRemovedDirectoryCount'].sort());
 assert.equal(result.originalPreparationCleanupConfirmed,false);assert.equal(result.originalPreparationRemovedDirectoryCount,0);assert.equal(result.preparationRecordUnchanged,true);
 assert.notEqual(result.preparationRequestDigest,result.lifecycleRequestDigest);assert.equal(result.lifecycleRequestDigest,f.prelude.watchdogTerminal.requestDigest);assert.equal(result.additionalFullCasesPassed,0);assert.equal(result.liveCloud,false);assert.ok(Object.isFrozen(result)&&Object.isFrozen(result.absentByKind));
 files.forEach((p,i)=>assert.deepEqual(readFileSync(p),before[i]));assert.equal(preparationSnapshot(f.preparation).cleanupConfirmed,false);
 const publicText=JSON.stringify(result);for(const privateValue of [f.root,...f.dirs,'canonical','pids','directories'])assert.equal(publicText.includes(privateValue),false);
}));
test('caller projection cannot replace the genuine preparation observer',()=>reject({preparation:{cleanupConfirmed:true},prelude:{passed:true}}));
test('different current run or commit cannot reuse evidence',()=>fixture(f=>{process.env.GITHUB_RUN_ID='1';reject(f);process.env.GITHUB_RUN_ID=f.run;process.env.GITHUB_SHA='b'.repeat(40);reject(f);}));
test('runner temporary root must be an explicit absolute directory',()=>fixture(f=>{process.env.RUNNER_TEMP='.';reject(f);}));
test('prelude and watchdog summaries require exact schemas',()=>{fixture(f=>{f.setPrelude(p=>p.extra=true);reject(f);});fixture(f=>{f.setPrelude(p=>p.watchdogTerminal.extra=true);f.write(f.terminalPath,f.prelude.watchdogTerminal);reject(f);});});
test('pending helper, allocation, or holder custody remains fail closed',()=>{
 fixture(f=>{preparationExternalStart(f.preparation,'package');reject(f);});fixture(f=>{preparationAllocationStart(f.preparation);reject(f);});fixture(f=>{preparationHolderEntered(f.preparation);reject(f);});
});
for(const [name,change] of [
 ['other run',v=>v.run='1'],['other commit',v=>v.commit='b'.repeat(40)],['other preparation digest',v=>v.requestDigest='d'.repeat(64)],
 ['missing directory',v=>v.directories.pop()],['duplicate directory',v=>v.directories[6]={...v.directories[5]}],
 ['extra directory',v=>v.directories.push({...v.directories[5]})],['wrong kind count',v=>{v.directories[0].kind='profile';v.directories[0].canonical=join(resolve(process.env.RUNNER_TEMP),'lingjing-live-holder-nonexistent-synthetic');}],
 ['unknown kind',v=>v.directories[0].kind='other'],['relative path',v=>v.directories[0].canonical='relative'],['outside root',v=>v.directories[0].canonical=resolve(process.env.RUNNER_TEMP,'..','lingjing-precredential-package-outside')],
 ['nested path',v=>v.directories[0].canonical=join(v.directories[0].canonical,'lingjing-precredential-package-nested')],['wrong prefix',v=>v.directories[0].canonical=join(resolve(process.env.RUNNER_TEMP),'other-prefix')],
 ['extra registry field',v=>v.extra=true],['invalid process identifier',v=>v.directories[0].pids=['PRIVATE']],['extra row field',v=>v.directories[0].extra=true]
])test('private ownership registry rejects '+name,()=>fixture(f=>{f.mutateOwned(change);reject(f);}));
for(const key of ['credentialImportInvoked','loginInvoked','registrationInvoked'])test('identity operation '+key+' cannot produce signedout cleanup evidence',()=>fixture(f=>{f.setPrelude(p=>p[key]=true);reject(f);}));
for(const key of ['businessEntryRejected','ownedCleanup','vaultClosed','watchdogExited'])test('missing terminal fact '+key+' fails closed',()=>fixture(f=>{f.setPrelude(p=>p[key]=false);reject(f);}));
test('watchdog receipt binds the lifecycle digest independently of preparation digest',()=>fixture(f=>{f.setPrelude(p=>p.watchdogTerminal.requestDigest=preparationSnapshot(f.preparation).requestDigest);reject(f);}));
test('expected lifecycle binding is independent of the supplied terminal receipt',()=>fixture(f=>{f.lifecycleBinding.requestDigest='e'.repeat(64);reject(f);}));
test('changed watchdog run or commit does not reconcile',()=>fixture(f=>{f.setPrelude(p=>p.watchdogTerminal.run='1');f.write(f.terminalPath,f.prelude.watchdogTerminal);reject(f);}));
test('missing or conflicting watchdog receipt cannot be replaced with a caller success',()=>{fixture(f=>{rmSync(f.terminalPath);reject(f);});fixture(f=>{const t=f.read(f.terminalPath);t.ciphertextRemoved=false;f.write(f.terminalPath,t);reject(f);});});
test('preserved profiles or unsuccessful process cleanup never pass',()=>{for(const patch of [{profilesRemoved:false},{ownedProcessesStopped:false},{preservedOnlyUntilHardDeadline:true}])fixture(f=>{f.write(f.lifecyclePath,{...f.read(f.lifecyclePath),...patch});reject(f);});});
test('stale public preparation file cannot replace the original opaque snapshot',()=>fixture(f=>{const p=f.read(f.statePath);p.cleanupConfirmed=true;p.removedDirectoryCount=7;f.write(f.statePath,p);reject(f);}));
test('a remaining registered directory is observed but never removed',()=>fixture(f=>{mkdirSync(f.dirs[0]);writeFileSync(join(f.dirs[0],'synthetic-only'),'keep');reject(f);assert.equal(readFileSync(join(f.dirs[0],'synthetic-only'),'utf8'),'keep');}));
test('a remaining file is not absence',()=>fixture(f=>{writeFileSync(f.dirs[0],'keep');reject(f);assert.equal(readFileSync(f.dirs[0],'utf8'),'keep');}));
test('a dangling registered symlink is not absence and is not followed or deleted',()=>fixture(f=>{symlinkSync(join(f.root,'synthetic-missing-target-'+f.run),f.dirs[0],process.platform==='win32'?'junction':'dir');reject(f);}));
test('private registry symlink is rejected even when its bytes match',{skip:process.platform==='win32'?'File symlinks may need additional OS privilege; directory junction check still runs.':false},()=>fixture(f=>{const other=join(f.entry,'synthetic-registry-copy.json');writeFileSync(other,readFileSync(f.registryPath));rmSync(f.registryPath);symlinkSync(other,f.registryPath,'file');reject(f);}));
test('errors never expose paths, PIDs, private values or raw assertion details',()=>fixture(f=>{f.write(f.registryPath,{PRIVATE_SECRET:'PRIVATE_RAW_VALUE'});reject(f);}));
test('actual absence predicate accepts only ENOENT and never suppresses permission or path errors',()=>{
 const source=readFileSync(new URL('./signedout-cleanup-observation.mjs',import.meta.url),'utf8'),snippet=source.match(/function absentDirectory\(path\)\{\n[^]*?\n\}/)?.[0];assert.ok(snippet);
 for(const code of ['ENOENT','EACCES','EPERM','ENOTDIR','EIO']){const error=Object.assign(Error('PRIVATE'),{code}),predicate=Function('lstatSync','return ('+snippet+')')(()=>{throw error;});if(code==='ENOENT')assert.equal(predicate('synthetic'),true);else assert.throws(()=>predicate('synthetic'),value=>value===error);}
 assert.equal(Function('lstatSync','return ('+snippet+')')(()=>({}))('synthetic'),false);
});
test('observer contains no deletion, mutation, process, network or authority-mint entry point',()=>{
 const source=readFileSync(new URL('./signedout-cleanup-observation.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\b(?:rmSync|unlinkSync|writeFileSync|renameSync|mkdirSync|spawn|execFileSync|fetch|createPlatformAuthorizedVault|admitGitHubEnvironment|preparationHolderEntered|cleanupPreparation)\b/);
 assert.match(source,/import \{preparationSnapshot\} from '\.\/preparation-state\.mjs'/);
});
test('Windows held integration binds the original admission and uploads only the fixed public summary',()=>{
 const runner=readFileSync(new URL('./held-prelude-windows.test.mjs',import.meta.url),'utf8'),workflow=readFileSync(new URL('../../../.github/workflows/cloud-held-prelude-contract.yml',import.meta.url),'utf8');
 assert.match(runner,/admitted=isolated\.assertPlatformAdmission\(admission\),lifecycleBinding=\{run:admitted\.run,commit:admitted\.commit,requestDigest:admitted\.requestDigest\}/);
 assert.match(runner,/assert\.equal\(proof\.passed,true\);proof\.postCleanupObservation=observeSignedoutCleanup\(\{preparation,prelude:proof\.prelude,lifecycleBinding\}\)/);
 assert.match(workflow,/node --test scripts\/acceptance\/recovery\/signedout-cleanup-observation\.test\.mjs/);
 assert.match(workflow,/artifacts\/qa\/held-prelude-contract\/post-cleanup-observation\.json/);
 assert.doesNotMatch(workflow,/LOCAL-ONLY|secrets\.|environment: desktoppet/);
 const artifacts=workflow.split('          path: |')[1];assert.ok(artifacts);assert.ok(artifacts.trim().split('\n').every(p=>/^artifacts\/qa\/[a-z-]+(?:-\$\{\{ github.run_id \}\})?\/[a-z-]+\.json$/.test(p.trim())));
});
test('custody, preparation and activation guards remain exact published bytes',()=>{
 const baseline='9b16b9e95fdf7fd3d0b0ecde423cb6264f1109a2';
 for(const path of ['scripts/acceptance/recovery/preparation-state.mjs','scripts/acceptance/recovery/github-environment-admission.mjs','scripts/acceptance/recovery/same-run-request.mjs','scripts/acceptance/recovery/environment-process.ps1','scripts/acceptance/recovery/holder-environment.mjs','scripts/acceptance/dpapi/authorized-vault-client.mjs','.github/workflows/cloud-environment-completion.yml']){let current=readFileSync(resolve(path),'utf8');if(path.endsWith('cloud-environment-completion.yml'))for(const stage of ['active','warm','report-before-restart','report-after-restart'])for(const role of ['a','b']){const line='            artifacts/qa/same-run-${{ github.run_id }}/completion/fixed-completion/friend-completion/C03-friend-'+stage+'-'+role+'.png\n';assert.equal(current.split(line).length,2);current=current.replace(line,'');}assert.equal(current,execFileSync('git',['show',baseline+':'+path],{encoding:'utf8'}));}
});

test('cleanup changes cannot alter original lifecycle guards outside the isolated C authentication addition',()=>{
 let source=readFileSync(resolve('scripts/acceptance/recovery/same-run-normal-lifecycle-factory.mjs'),'utf8');
 for(const [indent,part]of [['','DEFINITIONS'],['  ','DEPS']]){const start=indent+'// BEGIN C_AUTHENTICATION_TRANSITION '+part+'\n',end=indent+'// END C_AUTHENTICATION_TRANSITION '+part+'\n';assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(b>a);source=source.slice(0,a)+source.slice(b+end.length);}
 assert.equal(source,execFileSync('git',['show','797eb0ad6510b9d558297c2e4c0651cc6b14f3f2:scripts/acceptance/recovery/same-run-normal-lifecycle-factory.mjs'],{encoding:'utf8'}));
 const sourcePath='scripts/acceptance/cloud-live-qa-completion-readiness.mjs',old=execFileSync('git',['show','797eb0ad6510b9d558297c2e4c0651cc6b14f3f2:'+sourcePath],{encoding:'utf8'}),current=readFileSync(resolve(sourcePath),'utf8');
 for(const value of [old,current])assert.equal(value.split(');\nconst common=').length,2);
 assert.equal(current.split('export const MODULES=frozen(')[0],old.split('export const MODULES=frozen(')[0]);assert.equal(current.split(');\nconst common=')[1],old.split(');\nconst common=')[1]);
});
