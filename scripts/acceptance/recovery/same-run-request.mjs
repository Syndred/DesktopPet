// One new fixed request file only. A normal code push cannot authorize identities.
import assert from 'node:assert/strict';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const SAME_RUN_REQUEST_PATH='scripts/acceptance/requests/same-run-next-trigger.json';
export function validateSameRunRequest({reconciliation=false,env=process.env,git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),read=file=>{const p=resolve(file),st=lstatSync(p);assert.ok(st.isFile()&&!st.isSymbolicLink()&&st.size<=65536);assert.equal(realpathSync.native(p).toLowerCase(),p.toLowerCase());return readFileSync(p,'utf8');},now=Date.now()}={}){
 assert.equal(typeof reconciliation,'boolean');
 for(const [k,v]of Object.entries({GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'Syndred/DesktopPet',GITHUB_REF:'refs/heads/codex/cloud-authority-convergence',GITHUB_ACTOR:'Syndred',GITHUB_TRIGGERING_ACTOR:'Syndred'}))assert.equal(env[k],v);
 assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]{0,19}$/);assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
 const event=JSON.parse(read(env.GITHUB_EVENT_PATH)),r=JSON.parse(read(SAME_RUN_REQUEST_PATH));
 assert.deepEqual(Object.keys(r).sort(),['version','nonce','expectedBefore','expiresAt','packageSource'].sort());assert.equal(r.version,1);assert.match(r.nonce,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.match(r.expectedBefore,/^[a-f0-9]{40}$/);assert.equal(r.packageSource,'5016f1c3f7de04b4e2b322d0b47ec52248596771');assert.ok(Number.isSafeInteger(r.expiresAt)&&r.expiresAt>0&&(reconciliation||r.expiresAt>now)&&r.expiresAt-now<=2*3600000);
 const message=`acceptance: authorized same-run completion ${r.nonce} [native-only]`;
 assert.equal(event.repository.full_name,env.GITHUB_REPOSITORY);assert.equal(event.sender.login,'Syndred');assert.equal(event.ref,env.GITHUB_REF);assert.equal(event.head_commit.message,message);assert.equal(event.head_commit.id,env.GITHUB_SHA);assert.equal(event.after,env.GITHUB_SHA);assert.equal(event.before,r.expectedBefore);
 assert.equal(git('rev-parse','HEAD'),env.GITHUB_SHA);assert.equal(git('rev-parse','HEAD^'),r.expectedBefore);assert.equal(git('log','-1','--format=%B').trim(),message);assert.deepEqual(git('diff','--name-status',r.expectedBefore,'HEAD').split('\n'),[`A\t${SAME_RUN_REQUEST_PATH}`]);assert.equal(git('diff','--name-only'),'');assert.equal(git('diff','--cached','--name-only'),'');
 return Object.freeze({...r,triggerCommit:env.GITHUB_SHA,ciRunId:env.GITHUB_RUN_ID});
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){try{assert.deepEqual(process.argv.slice(2),['--check']);validateSameRunRequest();console.log('EXACT_SAME_RUN_REQUEST_VALIDATED');}catch{console.error('SAME_RUN_REQUEST_REJECTED');process.exitCode=1;}}
