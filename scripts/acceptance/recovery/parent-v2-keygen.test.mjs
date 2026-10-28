import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,lstatSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPublicKey,createPrivateKey} from 'node:crypto';
import {generateParentV2Keys} from './parent-v2-keygen.mjs';
import {publicKeyFingerprint} from './protocol.mjs';
test('three purpose-distinct keys, private modes, public-only output, no overwrite',()=>{
 const base=mkdtempSync(join(tmpdir(),'synthetic-parent-keygen-')),dir=join(base,'keys');try{
 const out=generateParentV2Keys(dir);assert.equal(lstatSync(dir).mode&0o077,0);assert.equal(out.version,2);assert.notEqual(out.approvalKeySha256,out.signingKeySha256);
 for(const [file,pub,type]of [['rsa-private.pem',out.encryptionPublicPem,'rsa'],['signing-private.pem',out.signingPublicPem,'ed25519'],['approval-private.pem',out.approvalPublicPem,'ed25519']]){assert.equal(lstatSync(join(dir,file)).mode&0o077,0);const key=createPrivateKey(readFileSync(join(dir,file)));assert.equal(key.asymmetricKeyType,type);assert.equal(publicKeyFingerprint(createPublicKey(key).export({type:'spki',format:'pem'})),publicKeyFingerprint(pub));}
 assert.ok(!JSON.stringify(out).includes('PRIVATE KEY'));assert.deepEqual(JSON.parse(readFileSync(join(dir,'public-v2-keys.json'))),out);assert.throws(()=>generateParentV2Keys(dir));
 }finally{rmSync(base,{recursive:true,force:true});}
});
test('runner and relative paths rejected before generation',()=>{const old=process.env.GITHUB_ACTIONS;try{process.env.GITHUB_ACTIONS='true';assert.throws(()=>generateParentV2Keys('/tmp/never-create-real-key'));}finally{if(old===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=old;}assert.throws(()=>generateParentV2Keys('relative-disallowed'));});
