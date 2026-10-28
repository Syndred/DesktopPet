// No network/SQL. Artificial cryptographic envelopes only; no real QA password.
import test from 'node:test';import assert from 'node:assert/strict';import {generateKeyPairSync} from 'node:crypto';
import {authorizedTarget,publicKeyFingerprint,sealHash,verifyAppliedReceipt} from './protocol.mjs';
import {decryptValidatedCapsule,signConfirmedReceipt} from './parent-helper.mjs';
const rsa=generateKeyPairSync('rsa',{modulusLength:3072}),ed=generateKeyPairSync('ed25519');const pem=k=>k.export({type:'spki',format:'pem'}),priv=k=>k.export({type:'pkcs8',format:'pem'});
const binding={version:1,...authorizedTarget,nonce:'00000000-0000-4000-8000-000000000001',ciRunId:'123',ciRunAttempt:1,harnessCommit:'a'.repeat(40),packageSource:'b'.repeat(40),encryptionKeySha256:publicKeyFingerprint(pem(rsa.publicKey)),signingKeySha256:publicKeyFingerprint(pem(ed.publicKey)),issuedAt:1000,expiresAt:2000};
// Syntactically valid but deliberately fabricated unusable hash. Not derived from a password.
const hash='$2b$12$'+'.'.repeat(53),capsule=await sealHash(hash,binding,pem(rsa.publicKey),1100);
const request={nonce:binding.nonce,sourceCommit:binding.packageSource,encryptionKeySha256:binding.encryptionKeySha256,signingKeySha256:binding.signingKeySha256,expiresAt:2000};
const options={capsule,request,rsaPrivatePem:priv(rsa.privateKey),ciRunId:'123',triggerCommit:binding.harnessCommit,now:1200};
const decoded=await decryptValidatedCapsule(options);
test('parent exact known target and microsecond CAS preserved without SQL',()=>{assert.equal(decoded.bcryptHash,hash);assert.equal(decoded.binding.expectedUpdatedAt,'2026-10-27 09:28:42.699395+00');});
for(const [name,change] of [['run',{ciRunId:'124'}],['commit',{triggerCommit:'c'.repeat(40)}],['digest',{capsule:{...capsule,requestSha256:'0'.repeat(64)}}],['expired',{now:2000}]])test('parent rejects '+name,async()=>assert.rejects(decryptValidatedCapsule({...options,...change})));
const confirmation={authUserId:authorizedTarget.authUserId,affectedRows:1,updatedAt:'2026-10-27 23:48:00.123456+00',requestSha256:capsule.requestSha256};
test('parent signs only exact successful CAS; public JWS excludes identity',async()=>{const {jws}=await signConfirmedReceipt({decrypted:decoded,confirmation,signingPrivatePem:priv(ed.privateKey),now:1300});const payload=await verifyAppliedReceipt(jws,{binding,requestSha256:capsule.requestSha256,signingPublicPem:pem(ed.publicKey),now:1400});assert.equal(payload.applied,true);assert.equal(JSON.stringify(payload).includes(authorizedTarget.owner),false);});
for(const change of[{affectedRows:0},{authUserId:'other'},{requestSha256:'0'.repeat(64)},{updatedAt:binding.expectedUpdatedAt}])test('no sign for invalid CAS '+Object.keys(change)[0],async()=>assert.rejects(signConfirmedReceipt({decrypted:decoded,confirmation:{...confirmation,...change},signingPrivatePem:priv(ed.privateKey),now:1300})));
