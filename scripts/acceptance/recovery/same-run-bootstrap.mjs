// Fixed observable CLI only. Never accepts module, file, output or credential input.
import {lstatSync,realpathSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const phases=new Set(['IMPORT_FIXED_ENTRY','ARGUMENTS','TEMP','REQUEST','JOB_CLOCK','PUBLIC_INPUT','PRIVATE_FIXTURE','AWAIT_SIGNED_AUTHORIZATION','BOUND_AUTHORIZATION','PREPARE_HOLDER','RUN_HOLDER','COMPLETED']);
const env=process.env;let path,record,markerOwned=false;
function persist(){if(!path||!markerOwned)return;writeFileSync(path+'.tmp',JSON.stringify(record),{mode:0o600});renameSync(path+'.tmp',path);}
try{
 assert.equal(env.GITHUB_ACTIONS,'true');assert.match(env.GITHUB_RUN_ID||'',/^\d+$/);assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
 const dir=join(root,'artifacts/qa/same-run-entry-'+env.GITHUB_RUN_ID);mkdirSync(dir,{recursive:true});assert.equal(lstatSync(dir).isSymbolicLink(),false);assert.equal(realpathSync.native(dir).toLowerCase(),dir.toLowerCase());
 const resume=process.argv.slice(2).includes('--reconcile-only');path=join(dir,resume?'reconciliation-bootstrap.json':'entry-bootstrap.json');
 record={version:1,run:env.GITHUB_RUN_ID,commit:env.GITHUB_SHA,started:true,mainCalled:false,phase:'IMPORT_FIXED_ENTRY',credentialOperationsStarted:false,requestedExitCode:null,actualExitCode:null,nodeExitObserved:false,errorCode:null};
 writeFileSync(path,JSON.stringify(record),{mode:0o600,flag:'wx'});markerOwned=true;
 process.on('exit',()=>{record.nodeExitObserved=true;record.requestedExitCode=process.exitCode??0;try{persist();}catch{}});
 const {runSameRunEntry}=await import('./run-same-run.mjs');record.mainCalled=true;persist();
 await runSameRunEntry(process.argv.slice(2),phase=>{assert.ok(phases.has(phase));record.phase=phase;if(['BOUND_AUTHORIZATION','PREPARE_HOLDER','RUN_HOLDER'].includes(phase))record.credentialOperationsStarted=true;persist();});
 record.phase='COMPLETED';persist();
}catch{if(record){record.errorCode=record.credentialOperationsStarted?'SAME_RUN_STOPPED_CHECK_SAFE_CHECKPOINT':'PRE_CREDENTIAL_NOT_READY';try{persist();}catch{}}process.exitCode=1;}
