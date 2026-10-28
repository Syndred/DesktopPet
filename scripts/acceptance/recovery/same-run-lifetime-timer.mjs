// Fixed synthetic protocol only: no verify-ticket/login/holder/vault operations.
import assert from 'node:assert/strict';import {mkdirSync,writeFileSync,renameSync,existsSync,readFileSync} from 'node:fs';import {join} from 'node:path';
let record,output,save=()=>{};
try{
 assert.equal(process.platform,'win32');assert.equal(process.env.GITHUB_ACTIONS,'true');assert.match(process.env.GITHUB_RUN_ID||'',/^\d+$/);assert.match(process.env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
 const mode=process.argv[2];assert.equal(process.argv.length,3);assert.ok(['cross-step','same-step'].includes(mode));const dir=join(process.cwd(),'artifacts/qa/same-run-lifetime-'+process.env.GITHUB_RUN_ID);mkdirSync(dir,{recursive:true});output=join(dir,mode+'-ticks.json');
 record={version:1,run:process.env.GITHUB_RUN_ID,commit:process.env.GITHUB_SHA,mode,phase:'STATIC_READINESS_IMPORT',ticks:0,exitObserved:false,requestedExitCode:null,syntheticReceiptConfirmed:false,stdinDestroyed:process.stdin.destroyed,stdoutDestroyed:process.stdout.destroyed};
 writeFileSync(output,JSON.stringify(record),{flag:'wx'});save=()=>{record.stdinDestroyed=process.stdin.destroyed;record.stdoutDestroyed=process.stdout.destroyed;writeFileSync(output+'.tmp',JSON.stringify(record));renameSync(output+'.tmp',output);};
 process.on('exit',()=>{record.exitObserved=true;record.requestedExitCode=process.exitCode??0;try{save();}catch{}});
 await import('../cloud-live-qa-completion-readiness.mjs');record.phase='CACHED_CLIENT_IMPORT';save();await import('../dpapi/authorized-vault-client.mjs');
 const request={version:1,purpose:'fixed-synthetic-lifetime-only',run:record.run,commit:record.commit,mode};writeFileSync(join(dir,mode+'-synthetic-request.json'),JSON.stringify(request),{flag:'wx'});record.phase='WAITING_SYNTHETIC_RECEIPT';save();
 const receipt=join(dir,mode+'-synthetic-receipt.json');const deadline=Date.now()+25000;
 await new Promise((done,fail)=>{const timer=setInterval(()=>{try{record.ticks++;save();if(existsSync(receipt)){const r=JSON.parse(readFileSync(receipt,'utf8').replace(/^\uFEFF/,''));assert.deepEqual(r,{...request,syntheticAcknowledged:true});record.syntheticReceiptConfirmed=true;record.phase='SYNTHETIC_RECEIPT_CONFIRMED';save();clearInterval(timer);done();}else if(Date.now()>=deadline){clearInterval(timer);fail(Error('FIXED_SYNTHETIC_WAIT_EXPIRED'));}}catch{clearInterval(timer);fail(Error('FIXED_SYNTHETIC_RECEIPT_REJECTED'));}},1000);});
}catch{if(record){record.errorCode='FIXED_SYNTHETIC_TIMER_FAILED';try{save();}catch{}}process.exitCode=1;}
