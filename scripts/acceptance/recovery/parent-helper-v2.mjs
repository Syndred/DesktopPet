// Parent-only v2 A/B recovery. No CLI, key generation, password generation,
// network, SQL, file writes or logging. Returned bcrypt is private-memory only.
import {createPrivateKey,createPublicKey} from 'node:crypto';
import {compactVerify,compactDecrypt,CompactSign,importSPKI,importPKCS8} from 'jose';
import {APPROVAL_KEY_SHA256,validateAuthorizationData,FIXED_IDENTITIES} from '../dpapi/authorized-vault-client.mjs';
import {validateBinding,bindingDigest,publicKeyFingerprint,sha256} from './protocol.mjs';
const approvals=new WeakMap(),decryptedCapsules=new WeakMap(),verifiedTickets=new Map();
const clock=()=>Date.now();
const fail=()=>{throw Error('PARENT_V2_RECOVERY_REJECTED');};
const need=x=>{if(!x)fail();};
const exact=(x,keys)=>need(x&&Object.getPrototypeOf(x)===Object.prototype&&JSON.stringify(Object.keys(x).sort())===JSON.stringify([...keys].sort()));
function parentOnly(){need(process.env.GITHUB_ACTIONS!=='true');}
function state(cap,nowMs){parentOnly();const state=approvals.get(cap);need(state&&Number.isSafeInteger(nowMs)&&nowMs>=state.approval.issuedAt&&nowMs<state.approval.expiresAt);return state;}
function slotBinding(binding,a,slot,nowSeconds){
 need(slot==='A'||slot==='B');validateBinding(binding,nowSeconds);const id=FIXED_IDENTITIES[slot];
 const values={projectRef:'jbvrdmrkwpznbrvteive',account:id.accountKey,owner:id.owner,authUserId:id.authUid,expectedUpdatedAt:a.recovery.expectedUpdatedAt[slot],nonce:a.recovery.resetNonces[slot],ciRunId:a.run,ciRunAttempt:1,harnessCommit:a.commit,packageSource:a.packageSource,encryptionKeySha256:a.recovery.encryptionKeySha256,signingKeySha256:a.recovery.signingKeySha256};
 for(const[k,v]of Object.entries(values))need(binding[k]===v);
 need(a.permissions.includes('reset-'+slot));need(binding.issuedAt>=Math.floor(a.issuedAt/1000)&&binding.expiresAt*1000<=a.expiresAt);return binding;
}
// Parent-only signing of the already observed fixed entry request. No IO or keys generated.
export async function signParentRecoveryApproval({approval,observedRequest,approvalPrivatePem}){
 parentOnly();exact(observedRequest,['version','run','commit','nonce','hardEndMs','requestedAt','waitDeadline']);
 const a=structuredClone(approval),r=observedRequest,now=clock();
 need(r.version===1&&a.run===r.run&&a.commit===r.commit&&a.nonce===r.nonce);
 need(Number.isSafeInteger(r.hardEndMs)&&a.expiresAt<=r.hardEndMs&&r.hardEndMs-now<=320*60000);
 need(Number.isFinite(Date.parse(r.requestedAt))&&Date.parse(r.requestedAt)<=now&&now<Date.parse(r.waitDeadline));
 need(Date.parse(r.waitDeadline)-Date.parse(r.requestedAt)<=20*60000);
 const key=createPrivateKey(approvalPrivatePem),pub=createPublicKey(key).export({type:'spki',format:'pem'});
 need(key.asymmetricKeyType==='ed25519'&&publicKeyFingerprint(pub)===APPROVAL_KEY_SHA256);
 validateAuthorizationData(a,{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'Syndred/DesktopPet',GITHUB_REF:'refs/heads/codex/cloud-authority-convergence',GITHUB_ACTOR:'Syndred',GITHUB_TRIGGERING_ACTOR:'Syndred',GITHUB_RUN_ID:r.run,GITHUB_SHA:r.commit},now);
 const ticket=await new CompactSign(new TextEncoder().encode(JSON.stringify(a))).setProtectedHeader({alg:'EdDSA',typ:'lingjing-same-run-qa-authorization-v1'}).sign(await importPKCS8(approvalPrivatePem,'EdDSA'));
 need(clock()<Date.parse(r.waitDeadline)&&clock()<r.hardEndMs);
 await verifyParentRecoveryApproval({ticket,approvalPublicPem:pub,observedRun:r.run,observedCommit:r.commit});return {ticket};
}
export async function verifyParentRecoveryApproval({ticket,approvalPublicPem,observedRun,observedCommit}){
 parentOnly();need(typeof APPROVAL_KEY_SHA256==='string'&&/^[a-f0-9]{64}$/.test(APPROVAL_KEY_SHA256));
 need(typeof ticket==='string'&&ticket.length<=32768);need(typeof approvalPublicPem==='string'&&approvalPublicPem.length<=8192);
 const pub=createPublicKey(approvalPublicPem);need(pub.asymmetricKeyType==='ed25519'&&publicKeyFingerprint(approvalPublicPem)===APPROVAL_KEY_SHA256);
 const {payload,protectedHeader}=await compactVerify(ticket,await importSPKI(approvalPublicPem,'EdDSA'),{algorithms:['EdDSA']});
 try{
  exact(protectedHeader,['alg','typ']);need(protectedHeader.alg==='EdDSA'&&protectedHeader.typ==='lingjing-same-run-qa-authorization-v1');need(payload.length<=24000);
  const a=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));
  // Observed public Actions run/commit come from the parent, not from capsule.
  need(a.run===observedRun&&a.commit===observedCommit);
  validateAuthorizationData(a,{GITHUB_ACTIONS:'true',GITHUB_EVENT_NAME:'push',GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:'Syndred/DesktopPet',GITHUB_REF:'refs/heads/codex/cloud-authority-convergence',GITHUB_ACTOR:'Syndred',GITHUB_TRIGGERING_ACTOR:'Syndred',GITHUB_RUN_ID:observedRun,GITHUB_SHA:observedCommit},clock());
  need(a.recovery.signingKeySha256!==APPROVAL_KEY_SHA256); // independent authorization and applied-receipt signing keys
  for(const slot of ['A','B'])need(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}\+00$/.test(a.recovery.expectedUpdatedAt[slot]));
  need(clock()>=a.issuedAt&&clock()<a.expiresAt);const ticketSha256=sha256(ticket);const prior=verifiedTickets.get(ticketSha256);if(prior)return prior;const cap=Object.freeze({});approvals.set(cap,{approval:structuredClone(a),ticketSha256,usedSlots:new Map()});verifiedTickets.set(ticketSha256,cap);return cap;
 }finally{payload.fill(0);}
}
export async function decryptApprovedCapsule({authorization,slot,capsule,rsaPrivatePem}){
 const nowMs=clock();const s=state(authorization,nowMs),a=s.approval;need(slot==='A'||slot==='B');need(a.permissions.includes('reset-'+slot));
 exact(capsule,['nonce','ciRunId','bindingDigest','ciphertext','requestSha256']);need(typeof capsule.ciphertext==='string'&&capsule.ciphertext.length<=16384);need(sha256(capsule.ciphertext)===capsule.requestSha256);need(capsule.nonce===a.recovery.resetNonces[slot]&&capsule.ciRunId===a.run);
 const prior=s.usedSlots.get(slot);need(!prior||prior===capsule.requestSha256); // same original capsule may be read after an uncertain management call, never replaced
 need(typeof rsaPrivatePem==='string'&&rsaPrivatePem.length<=16384);const privateKey=createPrivateKey(rsaPrivatePem);need(privateKey.asymmetricKeyType==='rsa'&&privateKey.asymmetricKeyDetails.modulusLength>=3072&&privateKey.asymmetricKeyDetails.modulusLength<=4096);need(publicKeyFingerprint(createPublicKey(privateKey).export({type:'spki',format:'pem'}))===a.recovery.encryptionKeySha256);
 const imported=await importPKCS8(rsaPrivatePem,'RSA-OAEP-256');state(authorization,clock());
 const{plaintext,protectedHeader}=await compactDecrypt(capsule.ciphertext,imported,{keyManagementAlgorithms:['RSA-OAEP-256'],contentEncryptionAlgorithms:['A256GCM']});
 try{
  exact(protectedHeader,['alg','enc','typ','kid']);need(protectedHeader.alg==='RSA-OAEP-256'&&protectedHeader.enc==='A256GCM'&&protectedHeader.typ==='lingjing-recovery-hash-v1'&&protectedHeader.kid===a.recovery.encryptionKeySha256);need(plaintext.length<=8192);
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext));exact(value,['binding','bcryptHash']);state(authorization,clock());const b=slotBinding(value.binding,a,slot,Math.floor(clock()/1000));need(bindingDigest(b)===capsule.bindingDigest);need(typeof value.bcryptHash==='string'&&/^\$2b\$12\$[./A-Za-z0-9]{53}$/.test(value.bcryptHash));
  state(authorization,clock());slotBinding(b,a,slot,Math.floor(clock()/1000));const finalPrior=s.usedSlots.get(slot);need(!finalPrior||finalPrior===capsule.requestSha256);s.usedSlots.set(slot,capsule.requestSha256);const decoded=Object.freeze({binding:Object.freeze({...b}),bcryptHash:value.bcryptHash,requestSha256:capsule.requestSha256});decryptedCapsules.set(decoded,{authorization,slot});return decoded;
 }finally{plaintext.fill(0);}
}
export async function signApprovedCasReceipt({authorization,decrypted,confirmation,signingPrivatePem}){
 const nowMs=clock();const s=state(authorization,nowMs),known=decryptedCapsules.get(decrypted);need(known?.authorization===authorization);const b=slotBinding(decrypted.binding,s.approval,known.slot,Math.floor(nowMs/1000));
 exact(confirmation,['authUserId','affectedRows','updatedAt','requestSha256']);need(confirmation.authUserId===b.authUserId&&confirmation.affectedRows===1&&confirmation.requestSha256===decrypted.requestSha256);
 need(typeof confirmation.updatedAt==='string'&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}\+00$/.test(confirmation.updatedAt)&&confirmation.updatedAt>b.expectedUpdatedAt&&Number.isFinite(Date.parse(confirmation.updatedAt)));
 need(typeof signingPrivatePem==='string'&&signingPrivatePem.length<=16384);const key=createPrivateKey(signingPrivatePem);need(key.asymmetricKeyType==='ed25519'&&publicKeyFingerprint(createPublicKey(key).export({type:'spki',format:'pem'}))===b.signingKeySha256);
 const now=Math.floor(nowMs/1000),payload={bindingDigest:bindingDigest(b),nonce:b.nonce,ciRunId:b.ciRunId,requestSha256:decrypted.requestSha256,applied:true,affectedRows:1,updatedAt:confirmation.updatedAt,issuedAt:now,expiresAt:Math.min(b.expiresAt,now+900)};
 const imported=await importPKCS8(signingPrivatePem,'EdDSA');state(authorization,clock());slotBinding(b,s.approval,known.slot,Math.floor(clock()/1000));
 const jws=await new CompactSign(new TextEncoder().encode(JSON.stringify(payload))).setProtectedHeader({alg:'EdDSA',typ:'lingjing-recovery-applied-v1',kid:b.signingKeySha256}).sign(imported);state(authorization,clock());slotBinding(b,s.approval,known.slot,Math.floor(clock()/1000));need(payload.expiresAt>Math.floor(clock()/1000));return {jws};
}
