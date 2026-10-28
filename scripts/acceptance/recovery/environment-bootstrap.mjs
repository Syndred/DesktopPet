// Fixed explicit entry, safe marker before dynamic imports, no private exception output.
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';import {resolve,join} from 'node:path';
const run=process.env.GITHUB_RUN_ID,commit=process.env.GITHUB_SHA;let directory,proof;
function persist(){if(directory){const p=join(directory,'environment-bootstrap'+(process.argv.includes('--reconcile-only')?'-reconciliation':'')+'.json');writeFileSync(p+'.tmp',JSON.stringify(proof),{mode:0o600});renameSync(p+'.tmp',p);}}
try{
 if(!/^[1-9][0-9]*$/.test(run||'')||!/^[a-f0-9]{40}$/.test(commit||''))throw Error();directory=resolve('artifacts/qa/same-run-entry-'+run);mkdirSync(directory,{recursive:true});proof={version:1,run,commit,stage:'import-fixed-entry',mainCalled:false,nodeExitObserved:false,requestedExitCode:null,credentialConsumptionNotEstablished:true};persist();process.once('exit',()=>{proof.nodeExitObserved=true;persist();});
 const {runEnvironmentCompletion}=await import('./run-environment-completion.mjs');proof.mainCalled=true;proof.stage='call-fixed-entry';persist();await runEnvironmentCompletion();proof.stage='completed';proof.requestedExitCode=0;process.exitCode=0;
}catch{if(proof){proof.stage='failed';proof.errorCode='ENVIRONMENT_BOOTSTRAP_FAILED';proof.requestedExitCode=1;}process.exitCode=1;}
finally{for(const k of ['DESKTOPPET_QA_A_PASSWORD','DESKTOPPET_QA_B_PASSWORD','DESKTOPPET_QA_CAS_PROVENANCE','GH_ENVIRONMENT_ADMISSION_TOKEN'])delete process.env[k];persist();}
