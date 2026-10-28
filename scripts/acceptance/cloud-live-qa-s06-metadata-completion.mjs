// Dedicated future A3 device only; same existing A owner, never another account.
// Does not create a device/login/grant. Prelogin ticket must already be genuine.
import assert from 'node:assert/strict';
import {existsSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';import {join} from 'node:path';
import {assertReleasedS06Gate} from './cloud-live-qa-s06-prelogin-gate.mjs';
import {runCloudLiveQaGardenSyncCompletionCases,hasGenuineS06Metadata} from './cloud-live-qa-garden-sync-completion-cases.mjs';
export function validateS06DedicatedRoles(expected){assert.equal(expected.a3.ownerAccountId,expected.a.ownerAccountId);assert.equal(expected.a3.authUserId,expected.a.authUserId);assert.equal(expected.a2.ownerAccountId,expected.a.ownerAccountId);assert.notEqual(expected.b.ownerAccountId,expected.a.ownerAccountId);const ds=['a','a2','a3','b'].map(r=>expected[r].deviceId);assert.equal(new Set(ds).size,4);return true;}
export async function runCloudS06MetadataCompletion(context,{gateTicket,binding}){
 const file=join(context.output,'live-s06-metadata-completion-evidence.json');assert.equal(existsSync(file),false);const save=result=>{writeFileSync(file+'.tmp',JSON.stringify(result,null,2),{mode:0o600});renameSync(file+'.tmp',file);return result;};
 const {models,expectedActors}=context;validateS06DedicatedRoles(expectedActors);assert.equal(binding.role,'a3');assert.equal(binding.runId,context.runId);assert.equal(binding.scenario,context.scenario);for(const k of['ownerAccountId','authUserId','deviceId'])assert.equal(binding[k],expectedActors.a3[k]);
 await context.assertActive();await assertReleasedS06Gate(gateTicket,{model:models.a3,binding});
 const before=await models.a3.call('accounts','syncStatus');if(!hasGenuineS06Metadata(before))return save({runId:context.runId,scenario:context.scenario,passed:false,fullCasePassed:false,cases:[],status:'blocked',errorCode:'S06_GENUINE_METADATA_MISSING',beforeAnyBusinessWrite:true,executionRoles:{faultDevice:'a3',positiveControl:'a',untouchedColdProfile:'a2'}});
 const innerOutput=join(context.output,'s06-owned-a3-garden');assert.equal(existsSync(innerOutput),false,'Never overwrite any original garden intent');mkdirSync(innerOutput);
 const result=await runCloudLiveQaGardenSyncCompletionCases({...context,output:innerOutput,models:{a:models.a3,a2:models.a,b:models.b},expectedActors:{a:expectedActors.a3,a2:expectedActors.a,b:expectedActors.b},requireGenuineMetadataWarning:true,assertActive:async()=>{await context.assertActive();await assertReleasedS06Gate(gateTicket,{model:models.a3,binding});}});
 return save({...result,innerEvidence:'s06-owned-a3-garden/live-garden-sync-completion-evidence.json',innerIntents:'s06-owned-a3-garden/live-garden-sync-completion-intent.json',executionRoles:{faultDevice:'a3',positiveControl:'a',untouchedColdProfile:'a2'},scope:'S06 only; reused normal garden mechanism on dedicated original A3. Does not reclassify G07 or create another owner.'});
}
