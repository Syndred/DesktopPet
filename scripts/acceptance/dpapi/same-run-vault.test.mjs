// Windows/GitHub synthetic-only selftest. No accounts, network, SDK or real secret.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true')throw Error('WINDOWS_GITHUB_ONLY');
const proof={version:1,syntheticOnly:true,passed:false,checks:[],noRealCredentials:true,limitations:['same Windows VM/user/run only','not cross-job or 24-hour guarantee','DPAPI is not whole-filesystem encryption','process-string zeroization and forensic erasure not claimed']};
const directoryName='dpapi-synthetic-'+randomUUID(),root=join(process.env.RUNNER_TEMP,directoryName),file=resolve('scripts/acceptance/dpapi/same-run-vault.ps1');
const issuedAt=Date.now(),binding={version:1,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,project:'SYNTHETIC_PROJECT',owner:'SYNTHETIC_OWNER_A',issuedAt,expiresAt:issuedAt+120000};
let unconfirmedOwnedExit=false;
async function call(action,fields={}){return new Promise((resolve,reject)=>{
 const exe=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
 const child=spawn(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,'-Action',action],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 let out='',tooLarge=false,timedOut=false,secondTimer,exitTimer;
 const terminate=()=>{if(timedOut)return;timedOut=true;child.kill();secondTimer=setTimeout(()=>{child.kill();exitTimer=setTimeout(()=>{unconfirmedOwnedExit=true;reject(Error('OWNED_EXIT_UNCONFIRMED'));},5000);},5000);};
 const clearTimers=()=>{clearTimeout(timeout);clearTimeout(secondTimer);clearTimeout(exitTimer);};
 const timeout=setTimeout(terminate,15000);
 child.stdout.on('data',b=>{if(out.length+b.length>4096){tooLarge=true;clearTimeout(timeout);terminate();}else out+=b;});
 // Never retain/log arbitrary stderr or the input JSON.
 child.stderr.on('data',()=>{});child.on('error',()=>{clearTimers();if(child.pid)unconfirmedOwnedExit=true;reject(Error('SELFTEST_SPAWN_FAILED'));});
 child.on('close',code=>{clearTimers();try{assert.equal(timedOut,false);assert.equal(tooLarge,false);const result=JSON.parse(out);assert.equal(Object.hasOwn(result,'password'),false);if(result.ok===false)proof.lastRejectedOperation={action,stage:result.stage??null,exceptionType:result.exceptionType??null,acl:result.acl??null};resolve({code,...result});}catch{reject(Error('SELFTEST_FIXED_RECEIPT_INVALID'));}});
 child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({syntheticOnly:true,directoryName,binding,...fields}));
 });}
async function check(name,fn){proof.currentCheck=name;await fn();proof.checks.push({name,passed:true});}
let created=false,expiryCreated=false;const expiryDirectory='dpapi-synthetic-'+randomUUID(),expiryRoot=join(process.env.RUNNER_TEMP,expiryDirectory);
try{
 await check('exact-runner-SID-and-SYSTEM-protected-ACL',async()=>{const r=await call('init');assert.equal(r.ok,true);assert.equal(r.result.aclExact,true);created=true;});
 await check('DPAPI-CurrentUser-encrypt-only-ciphertext-on-disk',async()=>{assert.equal((await call('seal',{syntheticSecret:'SYNTHETIC_ONLY_NOT_A_REAL_PASSWORD'})).ok,true);const raw=readFileSync(join(root,'sealed.json'),'utf8');assert.equal(raw.includes('SYNTHETIC_ONLY_NOT_A_REAL_PASSWORD'),false);assert.equal(typeof JSON.parse(raw).ciphertext,'string');});
 await check('fresh-holder-process-same-VM-restore-without-plaintext-output',async()=>{const r=await call('verify');assert.equal(r.ok,true);assert.equal(r.result.restoredSameVm,true);assert.equal(r.result.plaintextOutput,false);});
 await check('wrong-owner-entropy-rejected',async()=>{assert.equal((await call('verify',{binding:{...binding,owner:'SYNTHETIC_OWNER_B'}})).ok,false);});
 await check('wrong-run-commit-project-rejected',async()=>{for(const [key,value]of [['run','wrong-run'],['commit','0'.repeat(40)],['project','OTHER_PROJECT']])assert.equal((await call('verify',{binding:{...binding,[key]:value}})).ok,false);});
 await check('expired-and-over-330min-rejected',async()=>{assert.equal((await call('verify',{binding:{...binding,expiresAt:Date.now()-1}})).ok,false);assert.equal((await call('verify',{binding:{...binding,expiresAt:binding.issuedAt+19800001}})).ok,false);});
 await check('durable-intent-unknown-survives-process-exit-no-blind-retry',async()=>{assert.equal((await call('claim',{intent:'SYNTHETIC_FIXED_INTENT'})).ok,true);const state=await call('readback');assert.equal(state.result.requiresAuthoritativeReadback,true);assert.equal(state.result.mayBlindRetry,false);assert.equal((await call('claim',{intent:'SYNTHETIC_FIXED_INTENT'})).ok,false);});
 await check('only-explicit-synthetic-readback-receipt-ends-unknown',async()=>{assert.equal((await call('receipt',{outcome:'SYNTHETIC_CONFIRMED_BY_READBACK'})).ok,true);assert.equal((await call('readback')).result.requiresAuthoritativeReadback,false);assert.equal((await call('claim',{intent:'SYNTHETIC_FIXED_INTENT'})).ok,false);});
 await check('same-VM-holder-can-still-restore-before-completion',async()=>{assert.equal((await call('verify')).ok,true);});
 await check('real-expiry-check-removes-ciphertext-and-seals-terminal-before-recovery',async()=>{
  assert.equal((await call('init',{directoryName:expiryDirectory})).ok,true);expiryCreated=true;
  const t=Date.now(),short={...binding,issuedAt:t,expiresAt:t+8000};
  assert.equal((await call('seal',{directoryName:expiryDirectory,binding:short,syntheticSecret:'SYNTHETIC_ONLY_NOT_A_REAL_PASSWORD'})).ok,true);
  await new Promise(r=>setTimeout(r,Math.max(0,short.expiresAt-Date.now()+100)));
  assert.equal((await call('verify',{directoryName:expiryDirectory,binding:short})).ok,false);
  assert.equal(existsSync(join(expiryRoot,'sealed.json')),false);assert.equal(JSON.parse(readFileSync(join(expiryRoot,'terminal.json'),'utf8')).state,'expired');
 });
 proof.passed=true;
}catch{proof.failedOperation=proof.lastRejectedOperation??null;proof.error='DPAPI_SYNTHETIC_SELFTEST_FAILED';proof.passed=false;}
finally{
 if(unconfirmedOwnedExit){proof.cleanup={removed:false,ownedExitUnconfirmed:true,leftover:existsSync(root)};proof.passed=false;}
 else if(created||existsSync(root)){try{const result=await call('cleanup');proof.cleanup={removed:result.ok===true&&result.result.removed===true&& !existsSync(root),leftover:existsSync(root)};if(!proof.cleanup.removed)proof.passed=false;}catch{proof.cleanup={removed:false,leftover:existsSync(root)};proof.passed=false;}}
 else proof.cleanup={notCreated:true};
 if(unconfirmedOwnedExit){proof.expiryCleanup={removed:false,ownedExitUnconfirmed:true,leftover:existsSync(expiryRoot)};proof.passed=false;}
 else if(expiryCreated||existsSync(expiryRoot)){try{const r=await call('cleanup',{directoryName:expiryDirectory});proof.expiryCleanup={removed:r.ok===true&&!existsSync(expiryRoot)};if(!proof.expiryCleanup.removed)proof.passed=false;}catch{proof.expiryCleanup={removed:false};proof.passed=false;}}
 const output='artifacts/qa/dpapi-selftest';mkdirSync(output,{recursive:true});writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2)+'\n');
}
console.log(JSON.stringify({syntheticOnly:true,passed:proof.passed,checks:proof.checks.length,cleanup:proof.cleanup}));
if(!proof.passed)process.exitCode=1;
