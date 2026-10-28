// Pure protocol primitives. Importing this file generates no credentials/keys,
// starts no holder, performs no network/SQL and writes no files. The caller MUST
// validate a fresh one-time authorization before generating any real password.
import {createHash,createPublicKey} from 'node:crypto';
import {CompactEncrypt,compactVerify,importSPKI} from 'jose';
import bcrypt from 'bcryptjs';

export const authorizedTarget=Object.freeze({projectRef:'jbvrdmrkwpznbrvteive',account:'qa20261027a8be246d1',owner:'account:354d8831-51fc-417b-bc69-19a18b74387b',authUserId:'65dd4c6b-7bfb-435f-840e-d2457c42e692',expectedUpdatedAt:'2026-10-27 09:28:42.699395+00'});
const bindingKeys=['version','projectRef','account','owner','authUserId','expectedUpdatedAt','nonce','ciRunId','ciRunAttempt','harnessCommit','packageSource','encryptionKeySha256','signingKeySha256','issuedAt','expiresAt'];
const utf8=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
function requireCondition(value){if(!value)throw Error('RECOVERY_PROTOCOL_REJECTED');}
function exactKeys(value,keys){requireCondition(value&&Object.getPrototypeOf(value)===Object.prototype);requireCondition(JSON.stringify(Object.keys(value).sort())===JSON.stringify([...keys].sort()));}
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export const bindingDigest=binding=>sha256(JSON.stringify(bindingKeys.map(key=>[key,binding[key]])));
export function validateBinding(binding,now=Math.floor(Date.now()/1000)){
 exactKeys(binding,bindingKeys);requireCondition(binding.version===1&&binding.ciRunAttempt===1);
 for(const key of ['projectRef','account','owner','authUserId','nonce','ciRunId'])requireCondition(typeof binding[key]==='string'&&/^[a-zA-Z0-9:_-]{1,180}$/.test(binding[key]));
 for(const key of ['harnessCommit','packageSource'])requireCondition(/^[a-f0-9]{40}$/.test(binding[key]));
 for(const key of ['encryptionKeySha256','signingKeySha256'])requireCondition(/^[a-f0-9]{64}$/.test(binding[key]));
 requireCondition(binding.encryptionKeySha256!==binding.signingKeySha256);
 requireCondition(typeof binding.expectedUpdatedAt==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}\+00$/.test(binding.expectedUpdatedAt));
 requireCondition(Number.isSafeInteger(now)&&Number.isSafeInteger(binding.issuedAt)&&Number.isSafeInteger(binding.expiresAt));
 requireCondition(binding.issuedAt<=now&&binding.expiresAt>now&&binding.expiresAt-binding.issuedAt<=7200);
 return Object.freeze({...binding});
}
// This pins A and its observed CAS timestamp, but does NOT substitute for the
// separately reviewed GitHub request/actor/commit authorization validator.
export function assertAuthorizedRecoveryBinding(binding,now){validateBinding(binding,now);for(const [key,value] of Object.entries(authorizedTarget))requireCondition(binding[key]===value);return binding;}
function publicKey(pem,type,fingerprint){
 requireCondition(typeof pem==='string'&&pem.length<=8192&&/^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\s*$/.test(pem));
 const key=createPublicKey(pem);requireCondition(key.asymmetricKeyType===type);
 if(type==='rsa')requireCondition(key.asymmetricKeyDetails.modulusLength>=3072&&key.asymmetricKeyDetails.modulusLength<=4096);
 requireCondition(sha256(key.export({type:'spki',format:'der'}))===fingerprint);return key;
}
export function publicKeyFingerprint(pem){const key=createPublicKey(pem);return sha256(key.export({type:'spki',format:'der'}));}
export async function hashNewPassword(password){
 try{
  requireCondition(typeof password==='string'&&password.length>=32&&password.length<=64&&Buffer.byteLength(password,'utf8')<=72&&!bcrypt.truncates(password));
  const hash=await bcrypt.hash(password,12);requireCondition(/^\$2b\$12\$[./A-Za-z0-9]{53}$/.test(hash));return hash;
 }catch{throw Error('RECOVERY_HASH_FAILED');}
}
export async function sealHash(hash,binding,rsaPublicPem,now){
 try{
  const frozen=validateBinding(binding,now);requireCondition(typeof hash==='string'&&/^\$2b\$12\$[./A-Za-z0-9]{53}$/.test(hash));
  publicKey(rsaPublicPem,'rsa',frozen.encryptionKeySha256);
  const key=await importSPKI(rsaPublicPem,'RSA-OAEP-256');
  const plaintext=utf8.encode(JSON.stringify({binding:frozen,bcryptHash:hash}));
  try{
   const ciphertext=await new CompactEncrypt(plaintext).setProtectedHeader({alg:'RSA-OAEP-256',enc:'A256GCM',typ:'lingjing-recovery-hash-v1',kid:frozen.encryptionKeySha256}).encrypt(key);
   return Object.freeze({nonce:frozen.nonce,ciRunId:frozen.ciRunId,bindingDigest:bindingDigest(frozen),ciphertext,requestSha256:sha256(ciphertext)});
  }finally{plaintext.fill(0);}
 }catch{throw Error('RECOVERY_ENVELOPE_FAILED');}
}
export async function verifyAppliedReceipt(token,{binding,requestSha256,signingPublicPem,now=Math.floor(Date.now()/1000)}){
 try{
  const frozen=validateBinding(binding,now);requireCondition(typeof token==='string'&&token.length<=16384&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token));
  requireCondition(/^[a-f0-9]{64}$/.test(requestSha256));publicKey(signingPublicPem,'ed25519',frozen.signingKeySha256);
  const key=await importSPKI(signingPublicPem,'EdDSA');
  const {payload,protectedHeader}=await compactVerify(token,key,{algorithms:['EdDSA']});
  exactKeys(protectedHeader,['alg','typ','kid']);requireCondition(protectedHeader.alg==='EdDSA'&&protectedHeader.typ==='lingjing-recovery-applied-v1'&&protectedHeader.kid===frozen.signingKeySha256);
  const receipt=JSON.parse(decoder.decode(payload));exactKeys(receipt,['bindingDigest','nonce','ciRunId','requestSha256','applied','affectedRows','updatedAt','issuedAt','expiresAt']);
  requireCondition(receipt.bindingDigest===bindingDigest(frozen)&&receipt.nonce===frozen.nonce&&receipt.ciRunId===frozen.ciRunId);
  requireCondition(receipt.requestSha256===requestSha256&&receipt.applied===true&&receipt.affectedRows===1);
  requireCondition(typeof receipt.updatedAt==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}\+00$/.test(receipt.updatedAt)&&receipt.updatedAt>frozen.expectedUpdatedAt);
  requireCondition(Number.isSafeInteger(receipt.issuedAt)&&Number.isSafeInteger(receipt.expiresAt)&&receipt.issuedAt>=frozen.issuedAt&&receipt.issuedAt<=now&&receipt.expiresAt>now&&receipt.expiresAt<=frozen.expiresAt);
  return Object.freeze({...receipt});
 }catch{throw Error('RECOVERY_RECEIPT_REJECTED');}
}
// No password retained here. A same-holder closure must perform exactly one
// normal login; markIntent MUST durably write nonsecret intent before the call.
// Any malformed receipt or unknown login result permanently stops this gate.
export function createOneShotLoginGate({binding,requestSha256,signingPublicPem,markIntent,login,now=()=>Math.floor(Date.now()/1000)}){
 const frozen=validateBinding(binding,now());requireCondition(typeof markIntent==='function'&&typeof login==='function');let state='waiting';
 return Object.freeze({get state(){return state;},async consume(token){
  requireCondition(state==='waiting');state='checking';
  try{const receipt=await verifyAppliedReceipt(token,{binding:frozen,requestSha256,signingPublicPem,now:now()});state='login-in-flight';await markIntent({nonce:frozen.nonce,ciRunId:frozen.ciRunId,requestSha256,state});const loginTime=now();validateBinding(frozen,loginTime);requireCondition(receipt.expiresAt>loginTime);const result=await login(receipt);state='complete';return result;}
  catch{state='stopped';throw Error('RECOVERY_STOPPED');}
 }});
}
