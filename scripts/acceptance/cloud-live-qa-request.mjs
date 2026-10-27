// A single explicitly authorized request commit, never a generic push-to-register hook.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
export const requestPath='scripts/acceptance/requests/live-qa-20261027.json';
export const authorizationNonce='8be246d1-7bc5-4d1a-a3b4-81e5c09f6072';
export const triggerMessage=`acceptance: execute authorized two-QA batch ${authorizationNonce} [native-only]`;
export function validateLiveQaRequest({env=process.env,git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),read=file=>readFileSync(file,'utf8')}={}){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');
 assert.equal(env.GITHUB_REPOSITORY,'Syndred/DesktopPet');assert.equal(env.GITHUB_REF,'refs/heads/codex/cloud-authority-convergence');
 assert.equal(env.GITHUB_ACTOR,'Syndred');assert.equal(env.GITHUB_TRIGGERING_ACTOR,'Syndred');
 const event=JSON.parse(read(env.GITHUB_EVENT_PATH)),request=JSON.parse(read(requestPath));
 assert.equal(event.repository.full_name,'Syndred/DesktopPet');assert.equal(event.sender.login,'Syndred');assert.equal(event.ref,env.GITHUB_REF);
 assert.equal(event.head_commit.message,triggerMessage);assert.equal(event.after,env.GITHUB_SHA);assert.equal(event.head_commit.id,env.GITHUB_SHA);
 assert.deepEqual(Object.keys(request).sort(),['accounts','authorizationNonce','expectedBefore','projectRef','scenario','version']);
 assert.equal(request.version,1);assert.equal(request.authorizationNonce,authorizationNonce);assert.equal(request.projectRef,'jbvrdmrkwpznbrvteive');
 assert.equal(request.scenario,'cloud-acceptance-20261027-8be246d1');assert.deepEqual(request.accounts,['qa20261027a8be246d1','qa20261027b8be246d1']);
 assert.match(request.expectedBefore,/^[a-f0-9]{40}$/);assert.equal(event.before,request.expectedBefore);assert.equal(git('rev-parse','HEAD'),env.GITHUB_SHA);
 assert.equal(git('rev-parse','HEAD^'),request.expectedBefore);assert.equal(git('log','-1','--format=%B').trim(),triggerMessage);
 assert.deepEqual(git('diff','--name-status',request.expectedBefore,'HEAD').split('\n'),[`A\t${requestPath}`]);
 assert.equal(git('diff','--name-only'),'');
 return Object.freeze({projectRef:request.projectRef,scenario:request.scenario,accounts:[...request.accounts],authorizationNonce,expectedBefore:request.expectedBefore,triggerCommit:env.GITHUB_SHA});
}
if(process.argv.includes('--check')){const r=validateLiveQaRequest();console.log(JSON.stringify({authorizedRequestVerified:true,projectRef:r.projectRef,scenario:r.scenario,expectedBefore:r.expectedBefore,triggerCommit:r.triggerCommit,accountCount:r.accounts.length}));}
