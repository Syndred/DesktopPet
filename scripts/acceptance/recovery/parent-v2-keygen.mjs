// Parent-only key preparation. No password/hash generation, network, Auth or SQL.
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import {writeFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,dirname,join,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateParentKeys} from './parent-helper.mjs';
import {publicKeyFingerprint} from './protocol.mjs';
export function generateParentV2Keys(directory){
 assert.notEqual(process.env.GITHUB_ACTIONS,'true');assert.ok(isAbsolute(directory));directory=resolve(directory);
 const parent=dirname(directory);assert.equal(lstatSync(parent).isSymbolicLink(),false);assert.equal(realpathSync.native(parent),parent);
 // Reuse the already reviewed RSA3072 / receipt-Ed25519 key generator; it uses
 // CreateNew private files and a new 0700 directory, never overwriting old keys.
 const recovery=generateParentKeys(directory),approval=generateKeyPairSync('ed25519');
 const approvalPublicPem=approval.publicKey.export({type:'spki',format:'pem'});
 writeFileSync(join(directory,'approval-private.pem'),approval.privateKey.export({type:'pkcs8',format:'pem'}),{flag:'wx',mode:0o600});
 writeFileSync(join(directory,'approval-public.pem'),approvalPublicPem,{flag:'wx',mode:0o600});
 const out={version:2,approvalPublicPem,approvalKeySha256:publicKeyFingerprint(approvalPublicPem),encryptionPublicPem:recovery.rsaPublicKey,encryptionKeySha256:recovery.encryptionKeySha256,signingPublicPem:recovery.signingPublicKey,signingKeySha256:recovery.signingKeySha256};
 assert.notEqual(out.approvalKeySha256,out.signingKeySha256);writeFileSync(join(directory,'public-v2-keys.json'),JSON.stringify(out,null,2),{flag:'wx',mode:0o600});return out;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{assert.equal(process.argv.length,3);const arg=process.argv[2];assert.ok(arg.startsWith('--private-dir='));process.stdout.write(JSON.stringify(generateParentV2Keys(arg.slice('--private-dir='.length))));}catch{process.stderr.write('PARENT_V2_KEY_PREPARATION_REJECTED\n');process.exitCode=1;}
}
