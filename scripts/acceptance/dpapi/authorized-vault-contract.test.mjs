// Pure synthetic authorization/opaque-capability checks, no Windows/accounts IO.
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {APPROVAL_KEY_SHA256,FIXED_IDENTITIES,validateAuthorizationData,assertAuthorizedVault,assertSameRunAuthorization,verifySameRunAuthorization} from './authorized-vault-client.mjs';
const hash=k=>createHash('sha256').update(k.export({type:'spki',format:'der'})).digest('hex');
const rsa=generateKeyPairSync('rsa',{modulusLength:3072}).publicKey,ed=generateKeyPairSync('ed25519').publicKey;
const env={GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'Syndred/DesktopPet',GITHUB_REF:'refs/heads/codex/cloud-authority-convergence',GITHUB_ACTOR:'Syndred',GITHUB_TRIGGERING_ACTOR:'Syndred',GITHUB_RUN_ID:'123456789',GITHUB_SHA:'a'.repeat(40)};
const a={version:1,purpose:'same-run-qa-continuity-v1',repo:env.GITHUB_REPOSITORY,branch:env.GITHUB_REF,actor:'Syndred',run:env.GITHUB_RUN_ID,attempt:1,commit:env.GITHUB_SHA,packageSource:'5016f1c3f7de04b4e2b322d0b47ec52248596771',executableSha256:'a88f61364810291e6ca79ff1b9030680831d7382e65137b9ace9607e3e65fafc',nonce:'11111111-1111-4111-8111-111111111111',issuedAt:1000,expiresAt:2000,identities:FIXED_IDENTITIES,permissions:['reset-A','reset-B','register-C','login-A','login-B','login-C','business'],caseIds:['R06','R05'],recovery:{encryptionPublicPem:rsa.export({type:'spki',format:'pem'}),encryptionKeySha256:hash(rsa),signingPublicPem:ed.export({type:'spki',format:'pem'}),signingKeySha256:hash(ed),resetNonces:{A:'22222222-2222-4222-8222-222222222222',B:'33333333-3333-4333-8333-333333333333'},expectedUpdatedAt:{A:'2026-01-01T00:00:00Z',B:'2026-01-01T00:00:00Z'}}};
test('exact future fixed batch data contract only; all substituted identity/run/package/expiry denied',()=>{
 assert.equal(validateAuthorizationData(a,env,1500),true);
 for(const mutate of [x=>x.expiresAt=1000,x=>x.expiresAt=x.issuedAt+19800001,x=>x.identities.C.accountKey='another',x=>x.packageSource='b'.repeat(40),x=>x.permissions.push('reset-other'),x=>x.recovery.expectedUpdatedAt.B='unknown',x=>x.recovery.resetNonces.B=x.recovery.resetNonces.A,x=>x.recovery.encryptionKeySha256='0'.repeat(64)]){const x=structuredClone(a);mutate(x);assert.throws(()=>validateAuthorizationData(x,env,1500));}
 assert.throws(()=>validateAuthorizationData(a,{...env,GITHUB_RUN_ATTEMPT:'2'},1500));assert.throws(()=>validateAuthorizationData(a,{...env,GITHUB_TRIGGERING_ACTOR:'other'},1500));
});
test('fake methods/boolean are not authorization or vault capabilities; actual signing pin stays closed',async()=>{
 assert.equal(APPROVAL_KEY_SHA256,null);assert.throws(()=>assertAuthorizedVault({sealBeforeMutation(){},ready:true}));assert.throws(()=>assertSameRunAuthorization({approved:true}));await assert.rejects(verifySameRunAuthorization({ticket:'not-a-real-ticket',publicKeyPem:a.recovery.signingPublicPem,env}));
});
