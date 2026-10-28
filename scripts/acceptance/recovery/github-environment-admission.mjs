// Official platform admission only. No configuration API, passwords or public tickets.
// Schema: https://docs.github.com/en/rest/actions/workflow-runs#get-the-review-history-for-a-workflow-run
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateSameRunRequest} from './same-run-request.mjs';
export const PLATFORM_PINS=Object.freeze({repositoryId:1173290306,workflowId:399362066,environmentId:25567576058,environmentName:'desktoppet-qa-20261028',actorId:103977765,reviewerId:103977765,reviewerLogin:'Syndred'});
export const PLATFORM_CASES=Object.freeze(['S06','R06','R05','C03','S05','P05','G07','S04','B06','B11','S02','C11','M07','A06','A13','A15','A12']);
export const PLATFORM_WORKFLOW='.github/workflows/cloud-environment-completion.yml';
const admissions=new WeakMap();
let mintAttempted=false;
const fixed={repo:'Syndred/DesktopPet',branch:'codex/cloud-authority-convergence',actor:'Syndred',source:'5016f1c3f7de04b4e2b322d0b47ec52248596771',exe:'a88f61364810291e6ca79ff1b9030680831d7382e65137b9ace9607e3e65fafc'};
const fail=()=>{throw Object.assign(Error('PLATFORM_ADMISSION_NOT_READY'),{code:'PLATFORM_ADMISSION_NOT_READY'});};
const freeze=x=>{if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;};
export function assertPlatformPins(p){for(const k of ['repositoryId','workflowId','environmentId','actorId','reviewerId'])assert.ok(Number.isSafeInteger(p[k])&&p[k]>0);for(const k of ['environmentName','reviewerLogin'])assert.ok(typeof p[k]==='string'&&/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(p[k]));}
// Parent's original earliest generation/configuration/use timestamp, never reset by a job.
export function validateCustodyWindow(value,{environmentId,nonce,clock,now}){
 assert.deepEqual(Object.keys(value).sort(),['version','environmentId','nonce','custodyStartedAtMs','absoluteCleanupDeadlineMs'].sort());assert.equal(value.version,1);assert.equal(value.environmentId,environmentId);assert.equal(value.nonce,nonce);
 for(const key of ['custodyStartedAtMs','absoluteCleanupDeadlineMs'])assert.ok(Number.isSafeInteger(value[key])&&value[key]>0);
 assert.ok(value.custodyStartedAtMs<=clock.startedAtMs&&value.custodyStartedAtMs<=now);assert.equal(value.absoluteCleanupDeadlineMs-value.custodyStartedAtMs,330*60000);
 const hardEndMs=Math.min(clock.hardEndMs,value.absoluteCleanupDeadlineMs);assert.ok(now<hardEndMs);return freeze({...value,hardEndMs});
}
// Pure schema contract for synthetic tests. This function NEVER produces admission.
export function validatePlatformReadbacks({run,reviews,jobs,request,clock,businessDeadline,env,pins,now,reconciliation=false}){
 assertPlatformPins(pins);
 for(const [k,v]of Object.entries({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:fixed.repo,GITHUB_REF:'refs/heads/'+fixed.branch,GITHUB_ACTOR:fixed.actor,GITHUB_TRIGGERING_ACTOR:fixed.actor}))assert.equal(env[k],v);
 assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]{0,19}$/);assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
 assert.equal(String(run.id),env.GITHUB_RUN_ID);assert.equal(run.repository.id,pins.repositoryId);assert.equal(run.repository.full_name,fixed.repo);assert.equal(run.workflow_id,pins.workflowId);assert.equal(run.path,PLATFORM_WORKFLOW);assert.equal(run.head_sha,env.GITHUB_SHA);assert.equal(run.head_branch,fixed.branch);assert.equal(run.event,'push');assert.equal(run.run_attempt,1);assert.equal(run.status,'in_progress');
 for(const actor of [run.actor,run.triggering_actor]){assert.equal(actor.id,pins.actorId);assert.equal(actor.login,fixed.actor);}
 assert.equal(request.ciRunId,env.GITHUB_RUN_ID);assert.equal(request.triggerCommit,env.GITHUB_SHA);assert.equal(request.packageSource,fixed.source);assert.match(request.nonce,/^[a-f0-9-]{36}$/);assert.equal(typeof reconciliation,'boolean');assert.ok(reconciliation||request.expiresAt>now);
 assert.deepEqual(Object.keys(clock).sort(),['version','run','commit','startedAtMs','hardEndMs'].sort());assert.equal(clock.version,1);assert.equal(clock.run,env.GITHUB_RUN_ID);assert.equal(clock.commit,env.GITHUB_SHA);assert.ok(Number.isSafeInteger(clock.startedAtMs)&&Number.isSafeInteger(clock.hardEndMs));assert.equal(clock.hardEndMs-clock.startedAtMs,320*60000);assert.ok(clock.startedAtMs<=now&&now<clock.hardEndMs);
 assert.equal(env.GITHUB_JOB,'prepare');assert.equal(jobs.total_count,1);assert.ok(Array.isArray(jobs.jobs)&&jobs.jobs.length===1);const job=jobs.jobs[0];assert.equal(String(job.run_id),env.GITHUB_RUN_ID);assert.equal(job.head_sha,env.GITHUB_SHA);assert.equal(job.name,'prepare');assert.equal(job.status,'in_progress');assert.equal(job.runner_name,env.RUNNER_NAME);assert.ok(typeof env.RUNNER_NAME==='string'&&env.RUNNER_NAME.length>0);const jobStarted=Date.parse(job.started_at);assert.ok(Number.isFinite(jobStarted)&&jobStarted<=clock.startedAtMs&&clock.startedAtMs-jobStarted<=10*60000);
 assert.ok(typeof env.DESKTOPPET_QA_CUSTODY_BINDING_JSON==='string'&&Buffer.byteLength(env.DESKTOPPET_QA_CUSTODY_BINDING_JSON)<=2048);const custody=validateCustodyWindow(JSON.parse(env.DESKTOPPET_QA_CUSTODY_BINDING_JSON),{environmentId:pins.environmentId,nonce:request.nonce,clock,now});
 assert.ok(Number.isSafeInteger(businessDeadline)&&(reconciliation||businessDeadline>now)&&businessDeadline<=custody.hardEndMs&&businessDeadline-clock.startedAtMs<=2*3600000);
 assert.ok(Array.isArray(reviews)&&reviews.length>0&&reviews.length<=100);const target=[];
 for(const review of reviews){assert.ok(Array.isArray(review.environments));for(const environment of review.environments){if(environment.id===pins.environmentId||environment.name===pins.environmentName){assert.equal(environment.id,pins.environmentId);assert.equal(environment.name,pins.environmentName);target.push(review);}}}
 // No array-order/"latest" inference and no nonexistent approval timestamp.
 assert.equal(target.length,1);const approval=target[0];assert.equal(approval.state,'approved');assert.equal(approval.user.id,pins.reviewerId);assert.equal(approval.user.login,pins.reviewerLogin);
 return freeze({source:'github-environment-v1',scenario:'cloud-acceptance-20261027-8be246d1',repo:fixed.repo,branch:'refs/heads/'+fixed.branch,actor:fixed.actor,run:env.GITHUB_RUN_ID,attempt:1,commit:env.GITHUB_SHA,nonce:request.nonce,packageSource:fixed.source,executableSha256:fixed.exe,issuedAt:clock.startedAtMs,expiresAt:custody.hardEndMs,custodyStartedAtMs:custody.custodyStartedAtMs,absoluteCleanupDeadlineMs:custody.absoluteCleanupDeadlineMs,businessDeadline,caseIds:[...PLATFORM_CASES],permissions:['login-A','login-B','login-C','register-C','password-change-C','revoke-C','remember-C','business'],environmentId:pins.environmentId,workflowId:pins.workflowId});
}
export function platformChildEnvironment(env=process.env){const keys=new Set(['SYSTEMROOT','WINDIR','COMSPEC','PATH','PATHEXT','TEMP','TMP','RUNNER_TEMP','USERPROFILE','LOCALAPPDATA','APPDATA','PROGRAMDATA','PROGRAMFILES','PROGRAMFILES(X86)','COMMONPROGRAMFILES','PSMODULEPATH','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE']);return Object.fromEntries(Object.entries(env).filter(([k])=>keys.has(k.toUpperCase())));}
async function fixedJson(path,token){const response=await fetch('https://api.github.com/repos/Syndred/DesktopPet/actions/runs/'+path,{redirect:'error',credentials:'omit',headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15000)});assert.equal(response.status,200);const length=response.headers.get('content-length');if(length!==null)assert.ok(/^\d+$/.test(length)&&Number(length)<=262144);assert.ok(response.body);const reader=response.body.getReader(),chunks=[];let size=0;try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;assert.ok(size<=262144);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
export async function admitGitHubEnvironment({clock,businessDeadline,resume=false}){
 let token;
 try{assertPlatformPins(PLATFORM_PINS);if(mintAttempted)fail();mintAttempted=true;const env=process.env;assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]{0,19}$/);
 assert.equal(typeof resume,'boolean');const request=validateSameRunRequest({reconciliation:resume,git:(...args)=>execFileSync('git',args,{encoding:'utf8',env:platformChildEnvironment()}).trim()});
 token=env.GH_ENVIRONMENT_ADMISSION_TOKEN;assert.ok(typeof token==='string'&&token.length>0&&token.length<8192);delete env.GH_ENVIRONMENT_ADMISSION_TOKEN;
 const run=await fixedJson(env.GITHUB_RUN_ID,token),reviews=await fixedJson(env.GITHUB_RUN_ID+'/approvals',token),jobs=await fixedJson(env.GITHUB_RUN_ID+'/attempts/1/jobs?per_page=100',token);
 const data=validatePlatformReadbacks({run,reviews,jobs,request,clock,businessDeadline,env,pins:PLATFORM_PINS,now:Date.now(),reconciliation:resume});const digest=createHash('sha256').update(JSON.stringify(data)).digest('hex');const cap=Object.freeze({});admissions.set(cap,freeze({...data,requestDigest:digest,readOnly:resume}));return cap;
 }catch{fail();}finally{token=null;delete process.env.GH_ENVIRONMENT_ADMISSION_TOKEN;}
}
export function assertPlatformAdmission(cap,{permissions=[],caseIds=[]}={}){const data=admissions.get(cap);if(!data||(data.readOnly&&permissions.length>0)||Date.now()<data.issuedAt||Date.now()>=data.expiresAt||permissions.some(x=>!data.permissions.includes(x))||caseIds.some(x=>!data.caseIds.includes(x)))fail();for(const [key,value]of Object.entries({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:data.repo,GITHUB_REF:data.branch,GITHUB_ACTOR:data.actor,GITHUB_TRIGGERING_ACTOR:data.actor,GITHUB_RUN_ID:data.run,GITHUB_SHA:data.commit}))if(process.env[key]!==value)fail();return data;}
