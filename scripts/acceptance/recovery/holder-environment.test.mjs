import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,cpSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';import {tmpdir} from 'node:os';import {basename,join} from 'node:path';import {pathToFileURL} from 'node:url';
import {prepareEnvironmentBeforeCredentials,runEnvironmentHolder,inspectEnvironmentOriginalIntent,verifyEnvironmentLifecycleSource,ENVIRONMENT_LIFECYCLE_SHA256} from './holder-environment.mjs';
import {validateConfirmedRegistrationReadback,assertCompletionAuthorization} from '../dpapi/authorized-vault-client.mjs';
import {MODULES} from '../cloud-live-qa-completion-readiness.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
test('fixed holder source gate reads the actual lifecycle bytes pinned by readiness',()=>{
 const url=new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url);
 assert.equal(verifyEnvironmentLifecycleSource.length,0);assert.equal(verifyEnvironmentLifecycleSource().href,url.href);
 assert.equal(ENVIRONMENT_LIFECYCLE_SHA256,sha(readFileSync(url)));assert.equal(ENVIRONMENT_LIFECYCLE_SHA256,MODULES.lifecycle.sha256);
 assert.equal(sha(readFileSync(new URL('./holder-environment.mjs',import.meta.url))),MODULES.environmentHolder.sha256);
});
test('fixed gate rejects real file drift and missing bytes without a caller bypass',async()=>{
 // Copy real modules, never rewrite or evaluate a string model of the gate.
 // No lifecycle is imported or executed, and the checkout stays untouched.
 const root=mkdtempSync(join(tmpdir(),'desktoppet-holder-source-contract-'));
 try{
  cpSync(new URL('../',import.meta.url),root,{recursive:true,filter:path=>basename(path)!=='.bin'});
  const holder=await import(pathToFileURL(join(root,'recovery','holder-environment.mjs')).href),file=join(root,'recovery','same-run-normal-lifecycle-factory.mjs'),bytes=readFileSync(file);
  assert.equal(holder.verifyEnvironmentLifecycleSource().href,pathToFileURL(file).href);
  const drifted=Buffer.concat([bytes,Buffer.from('\nthrow Error("SOURCE_GATE_MUST_NOT_EXECUTE_LIFECYCLE");\n')]);writeFileSync(file,drifted);
  let called=false;const bypass={path:new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url),sha256:sha(drifted),verifier:()=>{called=true;return true;}};
  assert.throws(()=>holder.verifyEnvironmentLifecycleSource(bypass),error=>error.code==='ERR_ASSERTION'&&error.actual===sha(drifted)&&error.expected===ENVIRONMENT_LIFECYCLE_SHA256);assert.equal(called,false);
  rmSync(file);assert.throws(()=>holder.verifyEnvironmentLifecycleSource(bypass),{code:'ENOENT'});
  writeFileSync(file,bytes);assert.equal(holder.verifyEnvironmentLifecycleSource().href,pathToFileURL(file).href);
  const holderFile=join(root,'recovery','holder-environment.mjs'),holderBytes=readFileSync(holderFile,'utf8'),stalePin='2f88880662dc897962a8cf0aa689ab0cf1249b8da52924fac594a9973564f5ae';
  assert.equal(holderBytes.split(ENVIRONMENT_LIFECYCLE_SHA256).length,2);writeFileSync(holderFile,holderBytes.replace(ENVIRONMENT_LIFECYCLE_SHA256,stalePin));
  const staleHolder=await import(pathToFileURL(holderFile).href+'?stale-pin-contract');
  assert.throws(()=>staleHolder.verifyEnvironmentLifecycleSource(),error=>error.code==='ERR_ASSERTION'&&error.actual===MODULES.lifecycle.sha256&&error.expected===stalePin);
  assert.equal(sha(readFileSync(new URL('./same-run-normal-lifecycle-factory.mjs',import.meta.url))),ENVIRONMENT_LIFECYCLE_SHA256);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('platform entry cannot use caller approved flags or legacy-shaped JSON',async()=>{for(const admission of [{approved:true},{source:'github-environment-v1'},{ticket:'not-a-ticket'}]){await assert.rejects(prepareEnvironmentBeforeCredentials({admission,completionOptions:{}}));await assert.rejects(inspectEnvironmentOriginalIntent({admission}));assert.throws(()=>assertCompletionAuthorization(admission));}await assert.rejects(runEnvironmentHolder({},{parentCasProvenance:{}}));});
test('shared registration readback guard distinguishes rejected/unknown from confirmed',()=>{const state={claimed:true,requiresAuthoritativeReadback:false,mayBlindRetry:false,outcome:'confirmed'};assert.equal(validateConfirmedRegistrationReadback(state),true);for(const patch of [{outcome:'rejected'},{outcome:null},{requiresAuthoritativeReadback:true},{claimed:false},{mayBlindRetry:true}])assert.throws(()=>validateConfirmedRegistrationReadback({...state,...patch}));});
test('new holder uses no old ticket/reset transport and five held models precede credential import',()=>{const text=readFileSync(new URL('./holder-environment.mjs',import.meta.url),'utf8');for(const forbidden of ['verifySameRunAuthorization','freshParentProof','resetKnownViaApprovedParentReceipt','hashNewPassword','sealHash','readAppliedReceipt'])assert.equal(text.includes(forbidden),false);assert.ok(text.indexOf('await factory.prepareHeldModels')<text.indexOf('await factory.importEnvironmentCredentials'));assert.ok(text.includes("delete process.env.DESKTOPPET_QA_A_PASSWORD"));assert.ok(text.includes("delete process.env.DESKTOPPET_QA_B_PASSWORD"));});
