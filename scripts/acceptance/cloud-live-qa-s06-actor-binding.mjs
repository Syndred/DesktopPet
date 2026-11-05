// Public observation binding only. A digest is neither a signature nor authority.
// Raw original session IDs stay in the lifecycle/transition memory, never artifacts.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {FIXED_IDENTITIES} from './dpapi/authorized-vault-client.mjs';
export const S06_ACTOR_ROLES=Object.freeze(['a','a2','a3','b','c']);
const actorKeys=['ownerAccountId','authUserId','deviceId','sessionId','epoch'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha=value=>createHash('sha256').update(value,'utf8').digest('hex');
const exact=(value,keys)=>assert.deepEqual(Object.keys(value).sort(),[...keys].sort());
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
function scope(binding){
 assert.equal(binding.source,'github-environment-v1');assert.match(binding.run,/^[1-9][0-9]{0,19}$/);assert.equal(binding.attempt,1);assert.match(binding.commit,/^[a-f0-9]{40}$/);assert.match(binding.requestDigest,/^[a-f0-9]{64}$/);assert.match(binding.nonce,uuid);assert.equal(binding.scenario,'cloud-acceptance-20261027-8be246d1');
 for(const key of ['businessDeadline','expiresAt','absoluteCleanupDeadlineMs'])assert.ok(Number.isSafeInteger(binding[key])&&binding[key]>0);assert.ok(binding.businessDeadline<=binding.expiresAt&&binding.expiresAt<=binding.absoluteCleanupDeadlineMs);
 return {source:binding.source,run:binding.run,attempt:binding.attempt,commit:binding.commit,requestDigest:binding.requestDigest,nonce:binding.nonce,scenario:binding.scenario,businessDeadline:binding.businessDeadline,expiresAt:binding.expiresAt,absoluteCleanupDeadlineMs:binding.absoluteCleanupDeadlineMs};
}
export function validateS06Actors(actors){
 exact(actors,S06_ACTOR_ROLES);
 for(const role of S06_ACTOR_ROLES){const a=actors[role];exact(a,actorKeys);assert.match(a.ownerAccountId,/^account:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);for(const key of ['authUserId','deviceId','sessionId'])assert.match(a[key],uuid);assert.ok(Number.isSafeInteger(a.epoch)&&a.epoch>=0);}
 for(const [role,slot] of [['a','A'],['a2','A'],['a3','A'],['b','B']]){assert.equal(actors[role].ownerAccountId,FIXED_IDENTITIES[slot].owner);assert.equal(actors[role].authUserId,FIXED_IDENTITIES[slot].authUid);}
 for(const key of ['ownerAccountId','authUserId'])assert.equal(new Set(['a','b','c'].map(r=>actors[r][key])).size,3);
 for(const key of ['deviceId','sessionId'])assert.equal(new Set(S06_ACTOR_ROLES.map(r=>actors[r][key])).size,5);return true;
}
export function assertS06OriginalActors(actual,original){
 validateS06Actors(actual);validateS06Actors(original);for(const role of S06_ACTOR_ROLES)for(const key of actorKeys)assert.equal(actual[role][key],original[role][key],'S06_ORIGINAL_ACTOR_CHANGED');return true;
}
export function createS06ActorBinding({binding,actors,cIdentity}){
 validateS06Actors(actors);exact(cIdentity,['accountKey','owner','authUid']);assert.equal(cIdentity.accountKey,FIXED_IDENTITIES.C.accountKey);assert.equal(cIdentity.owner,actors.c.ownerAccountId);assert.equal(cIdentity.authUid,actors.c.authUserId);
 const data={actorBindingVersion:1,...scope(binding),devices:S06_ACTOR_ROLES.map(role=>{const a=actors[role];return {role,ownerAccountId:a.ownerAccountId,authUserId:a.authUserId,deviceId:a.deviceId,sessionIdSha256:sha(a.sessionId),epoch:a.epoch};})};
 return freeze({...data,actorBindingDigest:sha(JSON.stringify(data))});
}
export function s06ArtifactBindingFields(actorBinding,binding){
 const expected=scope(binding);exact(actorBinding,['actorBindingVersion',...Object.keys(expected),'devices','actorBindingDigest']);assert.equal(actorBinding.actorBindingVersion,1);for(const [key,value] of Object.entries(expected))assert.equal(actorBinding[key],value,'S06_ARTIFACT_RUN_CHANGED');
 assert.equal(actorBinding.devices.length,5);for(const [i,device] of actorBinding.devices.entries()){exact(device,['role','ownerAccountId','authUserId','deviceId','sessionIdSha256','epoch']);assert.equal(device.role,S06_ACTOR_ROLES[i]);assert.match(device.sessionIdSha256,/^[a-f0-9]{64}$/);assert.match(device.ownerAccountId,/^account:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);for(const key of ['authUserId','deviceId'])assert.match(device[key],uuid);assert.ok(Number.isSafeInteger(device.epoch)&&device.epoch>=0);const slot=device.role.startsWith('a')?'A':device.role==='b'?'B':null;if(slot){assert.equal(device.ownerAccountId,FIXED_IDENTITIES[slot].owner);assert.equal(device.authUserId,FIXED_IDENTITIES[slot].authUid);}}
 for(const key of ['deviceId','sessionIdSha256'])assert.equal(new Set(actorBinding.devices.map(d=>d[key])).size,5);for(const key of ['ownerAccountId','authUserId'])assert.equal(new Set(actorBinding.devices.filter(d=>['a','b','c'].includes(d.role)).map(d=>d[key])).size,3);
 const data={actorBindingVersion:1,...expected,devices:actorBinding.devices};assert.equal(actorBinding.actorBindingDigest,sha(JSON.stringify(data)),'S06_ARTIFACT_DIGEST_CHANGED');return freeze({actorBindingVersion:1,...expected,actorBindingDigest:actorBinding.actorBindingDigest});
}
export function assertS06ActorBinding(actorBinding,{binding,actors,cIdentity}){
 s06ArtifactBindingFields(actorBinding,binding);assert.deepEqual(actorBinding,createS06ActorBinding({binding,actors,cIdentity}),'S06_ARTIFACT_ACTORS_CHANGED');return true;
}

export function createS06BaselineArtifact({actorBinding,binding,actors,cIdentity,observations}){
 assertS06ActorBinding(actorBinding,{binding,actors,cIdentity});exact(observations,S06_ACTOR_ROLES);assertS06OriginalActors(Object.fromEntries(S06_ACTOR_ROLES.map(role=>[role,observations[role].actor])),actors);
 const first=observations.a3;for(const role of S06_ACTOR_ROLES){const o=observations[role];assert.equal(o.allowed,false);assert.equal(o.protocol,'lingjing-discovery-v2');assert.ok(o.scenario===null||o.scenario===binding.scenario);assert.ok(Number.isSafeInteger(o.observedAtMs)&&Number.isSafeInteger(o.serverTime)&&Math.abs(o.serverTime-o.observedAtMs)<=15000);assert.ok(Number.isFinite(o.monotonicMs)&&o.monotonicMs>=first.monotonicMs&&o.monotonicMs-first.monotonicMs<60000);assert.ok(o.observedAtMs>=first.observedAtMs&&o.observedAtMs<first.observedAtMs+60000&&o.observedAtMs<binding.businessDeadline);}
 assert.ok(Math.max(...S06_ACTOR_ROLES.map(r=>observations[r].serverTime))-Math.min(...S06_ACTOR_ROLES.map(r=>observations[r].serverTime))<=60000);
 const data={version:2,...s06ArtifactBindingFields(actorBinding,binding),baselineFiveFalse:true,baselineStartedAt:first.observedAtMs,windowClosesAt:first.observedAtMs+60000,baselineObservations:S06_ACTOR_ROLES.map(role=>{const o=observations[role];return {role,allowed:o.allowed,protocol:o.protocol,scenario:o.scenario,serverTime:o.serverTime,observedAtMs:o.observedAtMs};}),parentSingleConditionalTransactionRequired:true};
 return freeze({...data,baselineDigest:sha(JSON.stringify(data))});
}
