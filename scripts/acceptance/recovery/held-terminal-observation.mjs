// Independent, bounded after-step observation. Never opens a vault, contacts a
// service, deletes a file or alters an original lifecycle/cleanup receipt.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const exact=(value,keys)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...keys].sort());};
const hash=value=>createHash('sha256').update(value).digest('hex');
const pause=ms=>new Promise(done=>setTimeout(done,ms));
const publicUtcTimestamp=value=>{assert.equal(typeof value,'string');assert.match(value,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{4})?(?:Z|\+00:00)$/);const parsed=Date.parse(value);assert.ok(Number.isFinite(parsed));return parsed;};
export const WATCHDOG_DIAGNOSTIC_STAGES=Object.freeze(['root-check','registry-read','holder-check','business-deadline-read','business-deadline-validate','business-deadline-stop','deadline-loop']);
export const WATCHDOG_DIAGNOSTIC_CATEGORIES=Object.freeze(['sharing-violation','access-denied','validation-failure','io-failure','other']);
function readBounded(root,path){
 const rel=relative(root,path);assert.ok(rel&&!rel.startsWith('..')&&!rel.startsWith(sep));let current=root;
 for(const part of rel.split(sep)){current=join(current,part);const stat=lstatSync(current);assert.equal(stat.isSymbolicLink(),false);}
 const stat=lstatSync(path);assert.equal(stat.isFile(),true);assert.ok(stat.size<=32768);const bytes=readFileSync(path);assert.ok(bytes.length>0&&bytes.length<=32768);return {bytes,value:JSON.parse(bytes.toString('utf8'))};
}
function optional(root,path){try{return readBounded(root,path);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
export function validateHeldTerminal(value,binding,startedAtMs,now=Date.now()){
 exact(value,['version','run','commit','requestDigest','closed','cleanupConfirmed','registeredProfilesOnly','ciphertextRemoved','endedAt']);assert.equal(value.version,1);
 for(const key of ['run','commit','requestDigest'])assert.equal(value[key],binding[key]);
 assert.equal(value.closed,true);assert.equal(value.registeredProfilesOnly,true);for(const key of ['cleanupConfirmed','ciphertextRemoved'])assert.equal(typeof value[key],'boolean');
 const ended=publicUtcTimestamp(value.endedAt);assert.ok(Number.isFinite(ended)&&ended>=startedAtMs&&ended<=now);return value;
}
export function validateHeldDiagnostic(value,binding,startedAtMs,now=Date.now()){
 exact(value,['version','run','commit','requestDigest','stage','category','win32Code','observedAt']);assert.equal(value.version,1);for(const key of ['run','commit','requestDigest'])assert.equal(value[key],binding[key]);
 assert.ok(WATCHDOG_DIAGNOSTIC_STAGES.includes(value.stage));assert.ok(WATCHDOG_DIAGNOSTIC_CATEGORIES.includes(value.category));assert.ok([null,5,32].includes(value.win32Code));
 if(value.category==='sharing-violation')assert.equal(value.win32Code,32);else if(value.category==='access-denied')assert.equal(value.win32Code,5);else assert.equal(value.win32Code,null);
 const observed=publicUtcTimestamp(value.observedAt);assert.ok(Number.isFinite(observed)&&observed>=startedAtMs&&observed<=now);return value;
}
export async function observeHeldTerminal({root=process.cwd(),run,commit,waitMs=45000}){
 assert.match(run,/^[1-9][0-9]*$/);assert.match(commit,/^[a-f0-9]{40}$/);assert.ok(Number.isSafeInteger(waitMs)&&waitMs>=0&&waitMs<=45000);root=realpathSync.native(root);
 const observation={version:1,run,commit,scope:'independent-post-step-watchdog-observation-only',additionalFullCasesPassed:0,liveCloud:false,holderEvidencePassed:false,lifecycleBindingVerified:false,terminalFound:false,cleanupConfirmed:false,ciphertextRemoved:false,diagnosticFound:false};
 const held=optional(root,resolve(root,'artifacts/qa/held-prelude-contract/evidence.json'));
 if(!held){observation.status='held-evidence-unavailable';return {observation};}
 const proof=held.value;assert.equal(proof.version,1);assert.equal(proof.run,run);assert.equal(proof.commit,commit);assert.equal(proof.syntheticOnly,true);assert.equal(proof.noAuthOrManagementCalls,true);assert.equal(typeof proof.passed,'boolean');assert.ok(Number.isSafeInteger(proof.startedAtMs)&&proof.startedAtMs<=Date.now());
 observation.holderEvidencePassed=proof.passed;const binding=proof.lifecycleBinding;
 if(!binding){observation.status='before-lifecycle-binding';return {observation};}
 exact(binding,['run','commit','requestDigest']);assert.equal(binding.run,run);assert.equal(binding.commit,commit);assert.match(binding.requestDigest,/^[a-f0-9]{64}$/);observation.lifecycleBindingVerified=true;
 const directory=resolve(root,'artifacts/qa/same-run-watchdog-'+run),terminalPath=join(directory,binding.requestDigest+'-terminal.json'),diagnosticPath=join(directory,binding.requestDigest+'-diagnostic.json');
 const end=Date.now()+waitMs;let terminal;
 while(true){try{terminal=optional(root,terminalPath);}catch(error){if(process.platform!=='win32'||error.code!=='EBUSY')throw error;}if(terminal||Date.now()>=end)break;await pause(Math.min(250,end-Date.now()));}
 const diagnostic=optional(root,diagnosticPath),result={observation};
 if(terminal){result.terminal=validateHeldTerminal(terminal.value,binding,proof.startedAtMs);observation.terminalFound=true;observation.terminalSha256=hash(terminal.bytes);observation.cleanupConfirmed=result.terminal.cleanupConfirmed;observation.ciphertextRemoved=result.terminal.ciphertextRemoved;}
 if(diagnostic){result.diagnostic=validateHeldDiagnostic(diagnostic.value,binding,proof.startedAtMs);observation.diagnosticFound=true;observation.diagnosticSha256=hash(diagnostic.bytes);}
 observation.status=observation.cleanupConfirmed&&observation.ciphertextRemoved?'cleanup-confirmed':'cleanup-unconfirmed';return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const run=process.env.GITHUB_RUN_ID,commit=process.env.GITHUB_SHA,out=resolve('artifacts/qa/held-prelude-contract');mkdirSync(out,{recursive:true});
 let result;try{assert.equal(process.env.GITHUB_ACTIONS,'true');assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');result=await observeHeldTerminal({run,commit});}catch{result={observation:{version:1,run,commit,scope:'independent-post-step-watchdog-observation-only',additionalFullCasesPassed:0,liveCloud:false,status:'observation-rejected',cleanupConfirmed:false}};}
 for(const [key,file]of [['terminal','watchdog-terminal-independent.json'],['diagnostic','watchdog-diagnostic.json'],['observation','independent-watchdog-observation.json']])if(result[key]){const path=join(out,file);assert.equal(existsSync(path),false,'NO_OBSERVATION_REWRITE');writeFileSync(path,JSON.stringify(result[key],null,2),{flag:'wx'});}
 console.log(JSON.stringify(result.observation));if(result.observation.status!=='cleanup-confirmed')process.exitCode=1;
}
