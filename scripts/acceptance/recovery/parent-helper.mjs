// Parent-only management transport. No Supabase calls. Never execute in Actions.
import {generateKeyPairSync,createPrivateKey,createPublicKey} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compactDecrypt,CompactSign,importPKCS8} from 'jose';
import {authorizedTarget,assertAuthorizedRecoveryBinding,publicKeyFingerprint,bindingDigest,sha256} from './protocol.mjs';
const exact=(o,k)=>{if(!o||JSON.stringify(Object.keys(o).sort())!==JSON.stringify([...k].sort()))throw Error('PARENT_RECOVERY_REJECTED');};
const requireThat=x=>{if(!x)throw Error('PARENT_RECOVERY_REJECTED');};
const readJson=p=>{const b=readFileSync(p);requireThat(b.length<=32768);return JSON.parse(b.toString('utf8'));};
function privatePem(path,type){const s=statSync(path);requireThat(s.isFile()&&(s.mode&0o077)===0&&s.size<16384);const pem=readFileSync(path,'utf8'),key=createPrivateKey(pem);requireThat(key.asymmetricKeyType===type);return pem;}
export function generateParentKeys(directory){
 requireThat(process.env.GITHUB_ACTIONS!=='true');mkdirSync(directory,{recursive:false,mode:0o700});
 const rsa=generateKeyPairSync('rsa',{modulusLength:3072}),sign=generateKeyPairSync('ed25519');
 for(const [name,key] of [['rsa-private.pem',rsa.privateKey],['signing-private.pem',sign.privateKey]])writeFileSync(join(directory,name),key.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
 const rsaPublicKey=rsa.publicKey.export({type:'spki',format:'pem'}),signingPublicKey=sign.publicKey.export({type:'spki',format:'pem'});
 const publicKeys={rsaPublicKey,signingPublicKey,encryptionKeySha256:publicKeyFingerprint(rsaPublicKey),signingKeySha256:publicKeyFingerprint(signingPublicKey)};
 writeFileSync(join(directory,'public-keys.json'),JSON.stringify(publicKeys,null,2),{mode:0o600,flag:'wx'});return publicKeys;
}
export async function decryptValidatedCapsule({capsule,request,rsaPrivatePem,ciRunId,triggerCommit,now=Math.floor(Date.now()/1000)}){
 exact(capsule,['nonce','ciRunId','bindingDigest','ciphertext','requestSha256']);requireThat(capsule.ciphertext.length<=16384&&sha256(capsule.ciphertext)===capsule.requestSha256);requireThat(capsule.nonce===request.nonce&&capsule.ciRunId===ciRunId);
 const priv=createPrivateKey(rsaPrivatePem);requireThat(priv.asymmetricKeyType==='rsa');const pub=createPublicKey(priv).export({type:'spki',format:'pem'});requireThat(publicKeyFingerprint(pub)===request.encryptionKeySha256);
 const key=await importPKCS8(rsaPrivatePem,'RSA-OAEP-256');const {plaintext,protectedHeader}=await compactDecrypt(capsule.ciphertext,key,{keyManagementAlgorithms:['RSA-OAEP-256'],contentEncryptionAlgorithms:['A256GCM']});
 try{exact(protectedHeader,['alg','enc','typ','kid']);requireThat(protectedHeader.alg==='RSA-OAEP-256'&&protectedHeader.enc==='A256GCM'&&protectedHeader.typ==='lingjing-recovery-hash-v1'&&protectedHeader.kid===request.encryptionKeySha256);
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));exact(value,['binding','bcryptHash']);const b=assertAuthorizedRecoveryBinding(value.binding,now);
  requireThat(b.nonce===request.nonce&&b.ciRunId===ciRunId&&b.ciRunAttempt===1&&b.harnessCommit===triggerCommit&&b.packageSource===request.sourceCommit&&b.encryptionKeySha256===request.encryptionKeySha256&&b.signingKeySha256===request.signingKeySha256&&b.expiresAt<=request.expiresAt&&bindingDigest(b)===capsule.bindingDigest);
  requireThat(/^\$2b\$12\$[./A-Za-z0-9]{53}$/.test(value.bcryptHash));return {binding:b,bcryptHash:value.bcryptHash,requestSha256:capsule.requestSha256};
 }finally{plaintext.fill(0);}
}
export async function signConfirmedReceipt({decrypted,confirmation,signingPrivatePem,now=Math.floor(Date.now()/1000)}){
 exact(confirmation,['authUserId','affectedRows','updatedAt','requestSha256']);const b=assertAuthorizedRecoveryBinding(decrypted.binding,now);requireThat(confirmation.authUserId===authorizedTarget.authUserId&&confirmation.affectedRows===1&&confirmation.requestSha256===decrypted.requestSha256);
 requireThat(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}\+00$/.test(confirmation.updatedAt)&&confirmation.updatedAt>b.expectedUpdatedAt);
 const priv=createPrivateKey(signingPrivatePem);requireThat(priv.asymmetricKeyType==='ed25519'&&publicKeyFingerprint(createPublicKey(priv).export({type:'spki',format:'pem'}))===b.signingKeySha256);
 const payload={bindingDigest:bindingDigest(b),nonce:b.nonce,ciRunId:b.ciRunId,requestSha256:decrypted.requestSha256,applied:true,affectedRows:1,updatedAt:confirmation.updatedAt,issuedAt:now,expiresAt:Math.min(b.expiresAt,now+900)};
 const key=await importPKCS8(signingPrivatePem,'EdDSA');return {jws:await new CompactSign(new TextEncoder().encode(JSON.stringify(payload))).setProtectedHeader({alg:'EdDSA',typ:'lingjing-recovery-applied-v1',kid:b.signingKeySha256}).sign(key)};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  requireThat(process.env.GITHUB_ACTIONS!=='true');const mode=process.argv[2],opt=name=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3);
  if(mode==='generate-public'){requireThat(opt('private-dir'));process.stdout.write(JSON.stringify(generateParentKeys(resolve(opt('private-dir')))));}
  else{
   requireThat(['decrypt-private-bridge','sign-confirmed'].includes(mode));requireThat(!process.stdout.isTTY);const dir=resolve(opt('private-dir')||'');requireThat(opt('private-dir')&&opt('capsule')&&opt('request')&&opt('run')&&opt('commit'));
   const value=await decryptValidatedCapsule({capsule:readJson(opt('capsule')),request:readJson(opt('request')),rsaPrivatePem:privatePem(join(dir,'rsa-private.pem'),'rsa'),ciRunId:opt('run'),triggerCommit:opt('commit')});
   if(mode==='decrypt-private-bridge'){requireThat(process.argv.includes('--private-memory-bridge'));process.stdout.write(JSON.stringify(value));}
   else{requireThat(opt('confirmation'));const receipt=await signConfirmedReceipt({decrypted:value,confirmation:readJson(opt('confirmation')),signingPrivatePem:privatePem(join(dir,'signing-private.pem'),'ed25519')});process.stdout.write(JSON.stringify(receipt));}
  }
 }catch{process.stderr.write('PARENT_RECOVERY_REJECTED\n');process.exitCode=1;}
}
