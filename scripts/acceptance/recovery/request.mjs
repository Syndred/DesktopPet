// Fresh one-time recovery request only. Never accepts the old registration file.
import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createPublicKey} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {publicKeyFingerprint} from './protocol.mjs';
export const requestPath='scripts/acceptance/requests/live-qa-recovery-20261027.json';
export function validateRecoveryRequest({env=process.env,git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim(),read=file=>readFileSync(file,'utf8'),now=Math.floor(Date.now()/1000)}={}){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.match(env.GITHUB_RUN_ID||'',/^[1-9][0-9]{0,19}$/);
 assert.equal(env.GITHUB_REPOSITORY,'Syndred/DesktopPet');assert.equal(env.GITHUB_REF,'refs/heads/codex/cloud-authority-convergence');assert.equal(env.GITHUB_ACTOR,'Syndred');assert.equal(env.GITHUB_TRIGGERING_ACTOR,'Syndred');
 const event=JSON.parse(read(env.GITHUB_EVENT_PATH)),request=JSON.parse(read(requestPath));
 assert.deepEqual(Object.keys(request).sort(),['version','nonce','expectedBefore','projectRef','scenario','sourceCommit','expiresAt','rsaPublicKey','signingPublicKey','encryptionKeySha256','signingKeySha256','bConfirmedAbsent','executableSha256','compiledFingerprint','artifactRunId','artifactName'].sort());
 assert.match(request.artifactRunId,/^[1-9][0-9]{0,19}$/);assert.equal(request.artifactName,`desktoppet-map-discovery-${request.sourceCommit}`);assert.equal(request.version,1);assert.match(request.nonce,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);assert.notEqual(request.nonce,'8be246d1-7bc5-4d1a-a3b4-81e5c09f6072');assert.equal(request.projectRef,'jbvrdmrkwpznbrvteive');assert.equal(request.scenario,'cloud-acceptance-20261027-8be246d1');assert.match(request.sourceCommit,/^[a-f0-9]{40}$/);assert.match(request.executableSha256,/^[a-f0-9]{64}$/);assert.match(request.compiledFingerprint,/^[a-f0-9]{64}$/);assert.equal(request.bConfirmedAbsent,true);
 assert.ok(Number.isSafeInteger(request.expiresAt)&&request.expiresAt>now&&request.expiresAt-now<=7200);assert.match(request.expectedBefore,/^[a-f0-9]{40}$/);
 for(const [field,type,fingerprint] of [['rsaPublicKey','rsa','encryptionKeySha256'],['signingPublicKey','ed25519','signingKeySha256']]){
  assert.equal(typeof request[field],'string');assert.ok(request[field].length<=8192);assert.match(request[field],/^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\s*$/);const key=createPublicKey(request[field]);assert.equal(key.asymmetricKeyType,type);if(type==='rsa')assert.ok(key.asymmetricKeyDetails.modulusLength>=3072&&key.asymmetricKeyDetails.modulusLength<=4096);assert.equal(publicKeyFingerprint(request[field]),request[fingerprint]);
 }
 const message=`acceptance: recover authorized QA A ${request.nonce} [native-only]`;
 assert.equal(event.repository.full_name,'Syndred/DesktopPet');assert.equal(event.sender.login,'Syndred');assert.equal(event.ref,env.GITHUB_REF);assert.equal(event.head_commit.message,message);assert.equal(event.after,env.GITHUB_SHA);assert.equal(event.head_commit.id,env.GITHUB_SHA);assert.equal(event.before,request.expectedBefore);
 assert.equal(git('rev-parse','HEAD'),env.GITHUB_SHA);assert.equal(git('rev-parse','HEAD^'),request.expectedBefore);assert.equal(git('log','-1','--format=%B').trim(),message);assert.deepEqual(git('diff','--name-status',request.expectedBefore,'HEAD').split('\n'),[`A\t${requestPath}`]);assert.equal(git('diff','--name-only'),'');
 return Object.freeze({...request,triggerCommit:env.GITHUB_SHA,ciRunId:env.GITHUB_RUN_ID,ciRunAttempt:1});
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{assert.ok(process.argv.includes('--check'));const r=validateRecoveryRequest();if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,`source=${r.sourceCommit}\nartifact-run=${r.artifactRunId}\nartifact-name=${r.artifactName}\n`);process.stdout.write('Exact one-time recovery request validated.\n');}
 catch{process.stderr.write('RECOVERY_REQUEST_REJECTED\n');process.exitCode=1;}
}
