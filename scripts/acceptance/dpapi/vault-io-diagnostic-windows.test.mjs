// One fixed original privateCall rejection; no admission, account, credential or model.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {createVaultIoFailure,getVaultIoDiagnostic} from './vault-io-diagnostic.mjs';
const proof={version:1,syntheticOnly:true,noCredentials:true,noAuthCalls:true,passed:false};
try{
 assert.equal(process.platform,'win32');assert.match(process.env.GITHUB_RUN_ID,/^[1-9][0-9]{0,19}$/);assert.match(process.env.GITHUB_SHA,/^[a-f0-9]{40}$/);
 const source=readFileSync(new URL('./authorized-vault-client.mjs',import.meta.url),'utf8');
 const start=source.indexOf('function privateCall(action,input){'),end=source.indexOf('\nexport async function createAuthorizedVault',start);
 assert.ok(start>=0&&end>start);assert.equal(source.indexOf('function privateCall(action,input){',start+1),-1);
 const fn=source.slice(start,end);proof.sourceSha256=createHash('sha256').update(source).digest('hex');proof.functionSha256=createHash('sha256').update(fn).digest('hex');
 const digest='a'.repeat(64),directory=join(process.env.RUNNER_TEMP,'dpapi-authorized-'+process.env.GITHUB_RUN_ID+'-'+digest);assert.equal(existsSync(directory),false);
 const env={};for(const key of ['SystemRoot','WINDIR','PATH','PATHEXT','TEMP','TMP','RUNNER_TEMP','PSMODULEPATH'])if(process.env[key]!==undefined)env[key]=process.env[key];env.GITHUB_ACTIONS='false';env.GITHUB_RUN_ID=process.env.GITHUB_RUN_ID;env.GITHUB_SHA=process.env.GITHUB_SHA;
 const context=vm.createContext({spawn,join,resolve,process:{env},Buffer,Promise,Error,JSON,setTimeout,clearTimeout,createVaultIoFailure,vaultChildEnvironment:()=>({...env}),reject:()=>{throw Error('AUTHORIZED_VAULT_REJECTED');}});
 vm.runInContext('let ownedIoUnconfirmed=false;'+fn+';globalThis.fixedCall=()=>privateCall("init",{purpose:"same-run-qa-continuity-v1",directoryName:"dpapi-authorized-'+process.env.GITHUB_RUN_ID+'-'+digest+'",requestDigest:"'+digest+'"});',context);
 let error;try{await context.fixedCall();}catch(e){error=e;}
 assert.equal(error?.code,'AUTHORIZED_VAULT_IO_FAILED');const d=getVaultIoDiagnostic(error);assert.equal(d?.reason,'ps-rejected');assert.equal(d?.exitCode,1);assert.equal(d?.timedOut,false);assert.equal(d?.psStage,'bootstrap');assert.equal(typeof d.psExceptionType,'string');assert.equal(existsSync(directory),false);
 proof.diagnostic=d;proof.actualChildCloseObserved=true;proof.vaultAbsent=true;proof.passed=true;
}catch{proof.error='VAULT_DIAGNOSTIC_CONTRACT_FAILED';process.exitCode=1;}finally{const output=resolve('artifacts/qa/vault-io-diagnostic-contract');mkdirSync(output,{recursive:true});writeFileSync(join(output,'evidence.json'),JSON.stringify(proof,null,2));}
