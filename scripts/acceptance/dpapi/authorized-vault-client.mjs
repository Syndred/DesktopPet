// Production-purpose adapter, disabled until a separately approved signing key is pinned.
// Never invoke a real reset/register here. Private child pipes are NOT console output.
import assert from 'node:assert/strict';
import {createVaultIoFailure} from './vault-io-diagnostic.mjs';
import {assertPlatformAdmission,platformChildEnvironment} from '../recovery/github-environment-admission.mjs';
import {spawn} from 'node:child_process';
import {createHash,createPublicKey} from 'node:crypto';
import {join,resolve} from 'node:path';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const recoveryRequire=createRequire(new URL('../recovery/package.json',import.meta.url));
const {compactVerify,importSPKI}=await import(pathToFileURL(recoveryRequire.resolve('jose')).href);
export const APPROVAL_KEY_SHA256='bc18889a509bc5aa204ac95135d9811f4f6ec2af51d54ebc915d99f9b8c4ae12';
export const FIXED_IDENTITIES=Object.freeze({A:Object.freeze({accountKey:'qa20261027a8be246d1',owner:'account:354d8831-51fc-417b-bc69-19a18b74387b',authUid:'65dd4c6b-7bfb-435f-840e-d2457c42e692'}),B:Object.freeze({accountKey:'qa20261027b8be246d1',owner:'account:bbf15c56-2c37-4738-9a49-2c0cb7b971ab',authUid:'751587c1-bb93-4f6d-bf8a-b845e9e4cf62'}),C:Object.freeze({accountKey:'qa20261028c8be246d1',owner:'PRE_REGISTRATION',authUid:'PRE_REGISTRATION'})});
export const FIXED_CASE_IDS=Object.freeze(['R06','R05','C03','S05','P05','G07','S06','S02','S04','B06','B11','C11','M07','A13','A06','A12','A15','C12','D05','M03']);
const platformVaultSources=new WeakSet();
const vaults=new WeakSet(),capabilities=new WeakMap(),authorizations=new WeakMap();
const sha=x=>createHash('sha256').update(x).digest('hex');
const reject=()=>{throw Object.assign(Error('AUTHORIZED_VAULT_REJECTED'),{code:'AUTHORIZED_VAULT_REJECTED'});};
function active(a){if(a.platformCap)assertPlatformAdmission(a.platformCap);if(Date.now()>=a.expiresAt||Date.now()<a.issuedAt)reject();}
export function validateAuthorizationData(a,env,now){
 const fields=['version','purpose','repo','branch','actor','run','attempt','commit','packageSource','executableSha256','nonce','issuedAt','expiresAt','identities','permissions','caseIds','recovery'];
 assert.deepEqual(Object.keys(a).sort(),fields.sort());assert.equal(a.version,1);assert.equal(a.purpose,'same-run-qa-continuity-v1');
 assert.equal(a.repo,'Syndred/DesktopPet');assert.equal(a.branch,'refs/heads/codex/cloud-authority-convergence');assert.equal(a.actor,'Syndred');assert.equal(a.attempt,1);
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_REPOSITORY,a.repo);assert.equal(env.GITHUB_REF,a.branch);assert.equal(env.GITHUB_ACTOR,a.actor);assert.equal(env.GITHUB_TRIGGERING_ACTOR,a.actor);assert.equal(env.GITHUB_RUN_ID,a.run);assert.equal(env.GITHUB_SHA,a.commit);
 assert.match(a.run,/^[1-9][0-9]{0,19}$/);assert.match(a.commit,/^[a-f0-9]{40}$/);assert.equal(a.packageSource,'5016f1c3f7de04b4e2b322d0b47ec52248596771');assert.equal(a.executableSha256,'a88f61364810291e6ca79ff1b9030680831d7382e65137b9ace9607e3e65fafc');assert.match(a.nonce,/^[a-f0-9-]{36}$/);
 assert.ok(Number.isSafeInteger(a.issuedAt)&&Number.isSafeInteger(a.expiresAt)&&a.issuedAt<=now&&a.expiresAt>now&&a.expiresAt-a.issuedAt<=330*60000);
 assert.deepEqual(a.identities,FIXED_IDENTITIES);assert.ok(Array.isArray(a.permissions)&&new Set(a.permissions).size===a.permissions.length&&a.permissions.every(p=>['reset-A','reset-B','register-C','login-A','login-B','login-C','password-change-C','revoke-C','remember-C','business'].includes(p)));assert.ok(Array.isArray(a.caseIds)&&a.caseIds.length>0&&new Set(a.caseIds).size===a.caseIds.length&&a.caseIds.every(x=>FIXED_CASE_IDS.includes(x)));
 const recovery=a.recovery;assert.deepEqual(Object.keys(recovery).sort(),['encryptionPublicPem','encryptionKeySha256','signingPublicPem','signingKeySha256','resetNonces','expectedUpdatedAt'].sort());
 for(const [pem,fp,type]of [['encryptionPublicPem','encryptionKeySha256','rsa'],['signingPublicPem','signingKeySha256','ed25519']]){assert.equal(typeof recovery[pem],'string');assert.ok(recovery[pem].length<=8192);const key=createPublicKey(recovery[pem]);assert.equal(key.asymmetricKeyType,type);if(type==='rsa')assert.ok(key.asymmetricKeyDetails.modulusLength>=3072&&key.asymmetricKeyDetails.modulusLength<=4096);assert.equal(sha(key.export({type:'spki',format:'der'})),recovery[fp]);}
 assert.deepEqual(Object.keys(recovery.resetNonces).sort(),['A','B']);assert.deepEqual(Object.keys(recovery.expectedUpdatedAt).sort(),['A','B']);
 for(const role of ['A','B']){assert.match(recovery.resetNonces[role],/^[a-f0-9-]{36}$/);assert.equal(typeof recovery.expectedUpdatedAt[role],'string');assert.ok(Number.isFinite(Date.parse(recovery.expectedUpdatedAt[role])));}
 assert.notEqual(recovery.resetNonces.A,recovery.resetNonces.B);
 return true;
}
export async function verifySameRunAuthorization({ticket,publicKeyPem,env=process.env}){
 if(!APPROVAL_KEY_SHA256)reject();const key=createPublicKey(publicKeyPem);if(key.asymmetricKeyType!=='ed25519'||sha(key.export({type:'spki',format:'der'}))!==APPROVAL_KEY_SHA256)reject();
 const {payload,protectedHeader}=await compactVerify(ticket,await importSPKI(publicKeyPem,'EdDSA'),{algorithms:['EdDSA']});if(protectedHeader.typ!=='lingjing-same-run-qa-authorization-v1'||JSON.stringify(Object.keys(protectedHeader).sort())!==JSON.stringify(['alg','typ']))reject();
 const a=JSON.parse(new TextDecoder().decode(payload));validateAuthorizationData(a,env,Date.now());if(a.recovery.signingKeySha256===APPROVAL_KEY_SHA256)reject();const opaque=Object.freeze({});authorizations.set(opaque,{...a,requestDigest:sha(payload)});return opaque;
}
export function assertSameRunAuthorization(value,{permissions=[],caseIds=[]}={}){const a=authorizations.get(value);if(!a)reject();active(a);if(permissions.some(x=>!a.permissions.includes(x))||caseIds.some(x=>!a.caseIds.includes(x)))reject();const clone=structuredClone(a);function freeze(x){if(x&&typeof x==='object'){for(const v of Object.values(x))freeze(v);Object.freeze(x);}return x;}return freeze(clone);}

export function assertCompletionAuthorization(value,options={}){if(authorizations.has(value))return assertSameRunAuthorization(value,options);const p=assertPlatformAdmission(value,options);return Object.freeze({...p,purpose:'same-run-qa-continuity-v1',identities:FIXED_IDENTITIES});}

export function assertAuthorizedVault(vault){if(!vaults.has(vault))reject();return true;}
export function vaultChildEnvironment(env=process.env){const clean=platformChildEnvironment(env);for(const key of ['GITHUB_ACTIONS','GITHUB_RUN_ID','GITHUB_SHA','GITHUB_RUN_ATTEMPT'])if(env[key]!==undefined)clean[key]=env[key];return clean;}
let ownedIoUnconfirmed=false;
function privateCall(action,input){if(ownedIoUnconfirmed)return Promise.reject(Error('OWNED_VAULT_IO_UNCONFIRMED'));return new Promise((resolvePromise,rejectPromise)=>{
 const child=spawn(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-File',resolve('scripts/acceptance/dpapi/authorized-vault.ps1'),'-Action',action],{stdio:['pipe','pipe','pipe'],windowsHide:true,env:vaultChildEnvironment()});
 let chunks=[],length=0,failed=false,failureReason=null,timedOut=false,killTimer,exitTimer;const fail=(reason)=>{if(failed)return;failed=true;failureReason=reason;timedOut=reason==='timeout';child.kill();killTimer=setTimeout(()=>{child.kill();exitTimer=setTimeout(()=>{ownedIoUnconfirmed=true;for(const b of chunks)b.fill(0);chunks=[];rejectPromise(Error('OWNED_VAULT_IO_UNCONFIRMED'));},5000);},5000);};const timer=setTimeout(()=>fail('timeout'),15000);
 child.stdout.on('data',b=>{length+=b.length;if(length>32768)fail('output-limit');else chunks.push(b);});child.stderr.on('data',()=>{});child.stdin.on('error',()=>fail('stdin-error'));child.on('error',()=>{if(child.pid)fail('child-error');else{clearTimeout(timer);rejectPromise(Error('VAULT_CHILD_NOT_STARTED'));}});
 child.on('close',(code,signal)=>{clearTimeout(timer);clearTimeout(killTimer);clearTimeout(exitTimer);const bytes=Buffer.concat(chunks);for(const b of chunks)b.fill(0);chunks=[];let response=null;try{try{response=JSON.parse(bytes.toString('utf8'));}catch{}if(failed||code!==0||response?.ok!==true){rejectPromise(createVaultIoFailure({action,reason:failureReason??(response?.ok===false&&response?.error==='AUTHORIZED_VAULT_REJECTED'?'ps-rejected':code!==0?'child-exit':'invalid-response'),exitCode:code,signal,timedOut,response:failed?null:response}));}else resolvePromise(response.result);}finally{bytes.fill(0);}});
 // Timeout does not return while an owned process can still produce a response.
 child.stdin.end(JSON.stringify(input));
 });}
export async function createAuthorizedVault({authorization,resume=false}){
 const a=authorizations.get(authorization);if(!a)reject();return createVaultFromVerifiedSource(a,assertSameRunAuthorization(authorization),resume);
}
// Distinct source admission, never inserted into the legacy signed-authorizations map.
export async function createPlatformAuthorizedVault({admission,resume=false}){
 const data=assertPlatformAdmission(admission);if(data.readOnly!==resume)reject();if(platformVaultSources.has(admission))reject();platformVaultSources.add(admission);
 if(resume){const path=resolve('artifacts/qa/same-run-entry-'+data.run+'/entry-binding.json'),st=lstatSync(path);if(!st.isFile()||st.isSymbolicLink()||st.size>2048||realpathSync.native(path).toLowerCase()!==path.toLowerCase())reject();assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),{version:1,run:data.run,commit:data.commit,requestDigest:data.requestDigest});}
 const a={...data,platformCap:admission,purpose:'same-run-qa-continuity-v1',identities:FIXED_IDENTITIES};
 return createVaultFromVerifiedSource(a,Object.freeze({...data,identities:FIXED_IDENTITIES}),resume);
}
export async function cleanupFailedPlatformInitialization({admission}){const a=assertPlatformAdmission(admission);if(!platformVaultSources.has(admission))reject();return privateCall('cleanup',{purpose:'same-run-qa-continuity-v1',directoryName:`dpapi-authorized-${a.run}-${a.requestDigest}`,requestDigest:a.requestDigest});}
export function validateConfirmedRegistrationReadback(state){assert.equal(state.claimed,true);assert.equal(state.requiresAuthoritativeReadback,false);assert.equal(state.mayBlindRetry,false);assert.equal(state.outcome,'confirmed');return true;}
export function validateAppliedParentCredentialProvenance(value,slot){
 assert.ok(['A','B'].includes(slot));assert.deepEqual(Object.keys(value).sort(),['source','slot','authUid','expectedBefore','actualAfter','rowCount'].sort());assert.equal(value.source,'parent-private-cas-record');assert.equal(value.slot,slot);assert.equal(value.authUid,FIXED_IDENTITIES[slot].authUid);assert.equal(value.rowCount,1);
 for(const k of ['expectedBefore','actualAfter'])assert.ok(typeof value[k]==='string'&&Number.isFinite(Date.parse(value[k])));assert.ok(Date.parse(value.actualAfter)>Date.parse(value.expectedBefore));return true;
}
async function createVaultFromVerifiedSource(a,authorizationSnapshot,resume){
 if(process.platform!=='win32'||typeof resume!=='boolean')reject();active(a);
 const base={purpose:a.purpose,directoryName:`dpapi-authorized-${a.run}-${a.requestDigest}`,requestDigest:a.requestDigest};const lease={run:a.run,commit:a.commit,requestDigest:a.requestDigest,issuedAt:a.issuedAt,expiresAt:a.expiresAt};let closed=false;let queue=Promise.resolve();
 const call=(op,value)=>{const next=queue.then(async()=>{if(closed&&op!=='cleanup')reject();if(a.readOnly&&!['registry','inspect-intent','readback','request-stop','cleanup'].includes(op))reject();if(!['cleanup','request-stop'].includes(op))active(a);const result=await privateCall(op,{...base,...value});if(!['cleanup','request-stop'].includes(op))active(a);return result;});queue=next.catch(()=>{});return next;};
 if(!resume)await call('init',{lease});
 const binding=(slot,credentialVersion,identity=FIXED_IDENTITIES[slot])=>{if(!identity||!FIXED_IDENTITIES[slot]||identity.accountKey!==FIXED_IDENTITIES[slot].accountKey||!/^[a-f0-9]{64}$/.test(credentialVersion))reject();if(slot!=='C'&&JSON.stringify(identity)!==JSON.stringify(FIXED_IDENTITIES[slot]))reject();return {version:1,run:a.run,commit:a.commit,project:'jbvrdmrkwpznbrvteive',...identity,slot,credentialVersion,requestDigest:a.requestDigest,issuedAt:a.issuedAt,expiresAt:a.expiresAt};};
 const permission=(slot,operation)=>{if(!a.permissions.includes(operation==='business'?'business':operation+'-'+slot))reject();};
 let vault;
 const assertCap=async(cap,expected)=>{const c=capabilities.get(cap);if(closed||!c||c.vault!==vault||Object.entries(expected).some(([k,v])=>(['owner','authUid','accountKey'].includes(k)?c.binding[k]:c[k])!==v))reject();active(a);permission(c.slot,c.operation);return c;};
 vault=Object.freeze({
  authorization:authorizationSnapshot,
  async requestStop(){return call('request-stop',{});},
  async registerBusinessDeadline(deadline){if(a.source==='github-environment-v1'&&deadline?.expiresAtMs!==a.businessDeadline)reject();if(!deadline||Object.keys(deadline).sort().join(',')!=='expiresAtMs,insertedAtMs,scopeDigest'||!Number.isSafeInteger(deadline.expiresAtMs)||!Number.isSafeInteger(deadline.insertedAtMs)||deadline.insertedAtMs>Date.now()||deadline.expiresAtMs<=Date.now()||deadline.expiresAtMs>a.expiresAt||deadline.expiresAtMs-deadline.insertedAtMs>7200000||!/^[a-f0-9]{64}$/.test(deadline.scopeDigest))reject();return call('business-deadline',{deadline});},
  async registerSupervisor(record){return call('bind-supervisor',{record});},
  async bindHolder(record){return call('bind-holder',{record});},
  async registerOwnedModel(record){if(!['a','a2','a3','b','c'].includes(record.role))reject();return call('register-owned',{record});},
  async verifyRegistry(){return call('registry',{});},
  async sealBeforeMutation({slot,credentialVersion,password,operation,intentId,identity}){permission(slot,operation);if(typeof password!=='string'||password.length<40||password.length>64||typeof intentId!=='string'||!intentId||intentId.length>200)reject();const b=binding(slot,credentialVersion,identity);if(slot==='C'&&operation!=='register'&&b.owner==='PRE_REGISTRATION')reject();if(slot==='C'&&operation==='register'&&b.owner!=='PRE_REGISTRATION')reject();await call('seal',{binding:b,secret:password});const restored=await call('restore',{binding:b});try{if(restored.secret!==password)reject();}finally{restored.secret=null;}const cap=Object.freeze({});capabilities.set(cap,{vault,slot,credentialVersion,operation,intentId,binding:b});return cap;},
  // Parent has already applied CAS. This stores a login credential, NOT a reset
  // receipt or proof the CAS happened. Parent's private authoritative record remains
  // separately reviewed; no reset claim/send/replay is available in this source.
  async importAppliedParentCredential({slot,password,provenance}){
   if(a.source!=='github-environment-v1'||resume)reject();validateAppliedParentCredentialProvenance(provenance,slot);permission(slot,'login');
   const intentId=a.requestDigest+':'+slot+':environment-login',credentialVersion=sha(intentId);
   return this.sealBeforeMutation({slot,password,credentialVersion,operation:'login',intentId,identity:FIXED_IDENTITIES[slot]});
  },
  async inspectOriginalIntent({slot,credentialVersion,operation,intentId}){if(operation!==(slot==='C'?'register':'reset')||intentId!==a.requestDigest+':'+slot+':'+operation||credentialVersion!==sha(intentId))reject();permission(slot,operation);return call('inspect-intent',{binding:binding(slot,credentialVersion),operation,intentDigest:sha(intentId)});},
  async resumeKnownCredential({slot,credentialVersion,operation,intentId,identity}){permission(slot,operation);const b=binding(slot,credentialVersion,identity);const result=await call('restore',{binding:b});result.secret=null;const cap=Object.freeze({});capabilities.set(cap,{vault,slot,credentialVersion,operation,intentId,binding:b});return cap;},
  async assertCustodyCapability(cap,expected){await assertCap(cap,expected);return true;},
  async withCredential(cap,consumer){const c=await assertCap(cap,{});if(typeof consumer!=='function')reject();const result=await call('restore',{binding:c.binding});try{active(a);const outcome=await consumer(Object.freeze({accountKey:c.binding.accountKey,password:result.secret}));if(!outcome||Object.keys(outcome).length!==1||typeof outcome.ok!=='boolean')reject();return Object.freeze({ok:outcome.ok});}finally{result.secret=null;}},
  async bindRegisteredC(cap,identity){const c=await assertCap(cap,{slot:'C',operation:'register'});if(c.binding.owner!=='PRE_REGISTRATION'||identity.accountKey!==FIXED_IDENTITIES.C.accountKey||!/^account:[a-f0-9-]{36}$/.test(identity.owner)||!/^[a-f0-9-]{36}$/.test(identity.authUid))reject();const state=await this.readbackIntent(cap);validateConfirmedRegistrationReadback(state);const credentialVersion=sha(c.credentialVersion+identity.owner+identity.authUid),b=binding('C',credentialVersion,identity);const restored=await call('restore',{binding:c.binding});try{await call('seal',{binding:b,secret:restored.secret});}finally{restored.secret=null;}const next=Object.freeze({});capabilities.set(next,{vault,slot:'C',credentialVersion,operation:'login',intentId:c.intentId+':known-login',binding:b,registrationConfirmed:true});return next;},
  async claimBeforeSend(cap){const c=await assertCap(cap,{});return call('claim',{binding:c.binding,intentDigest:sha(c.intentId),operation:c.operation});},
  async readbackIntent(cap){const c=await assertCap(cap,{});return call('readback',{binding:c.binding,intentDigest:sha(c.intentId)});},
  async recordReadback(cap,{outcome,digest}){const c=await assertCap(cap,{});if(!['confirmed','rejected'].includes(outcome)||!/^[a-f0-9]{64}$/.test(digest))reject();return call('receipt',{binding:c.binding,intentDigest:sha(c.intentId),outcome,readbackDigest:digest});},
  async close(){closed=true;return call('cleanup',{});}
 });vaults.add(vault);return vault;
}
