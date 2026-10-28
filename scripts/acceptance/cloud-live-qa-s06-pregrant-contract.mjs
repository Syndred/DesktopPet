// Preparation-only: pure precondition validation and original-SQL source check.
// This exports NO cloud request and cannot authorize/perform grants or a login.
import assert from 'node:assert/strict';
export function validateS06PregrantSnapshot(value,binding){
 assert.ok(['a','a3'].includes(binding.role),'Only the existing A owner or dedicated same-A A3, never C/new synthetic owner');
 for(const key of['ownerAccountId','authUserId','deviceId','scenario','runId','nonce'])assert.equal(value[key],binding[key]);
 assert.match(binding.ownerAccountId,/^account:[0-9a-f-]{36}$/i);assert.match(binding.authUserId,/^[0-9a-f-]{36}$/i);assert.match(binding.deviceId,/^[0-9a-f-]{36}$/i);
 assert.equal(value.accountActive,true);assert.equal(value.deviceExists,true);assert.equal(value.deviceRevoked,false);
 assert.deepEqual(value.ownerNamespaces,['qa:'+binding.scenario]);assert.equal(value.liveSerialCount,0);assert.equal(value.otherNamespaceSerialCount,0);assert.equal(value.newDeviceGrantCount,0);assert.equal(value.ownerCompanionModulePresent,true);assert.ok(value.ownerPetCount>0);
 assert.equal(value.ownerMappingMatches,true);assert.equal(value.actorGuardBeforeRegistration,true);assert.equal(value.deployedSourceMatchesReviewed,true);
 assert.ok(Number.isSafeInteger(value.observedAtMs)&&Number.isSafeInteger(binding.nowMs));assert.ok(binding.nowMs>=value.observedAtMs&&binding.nowMs-value.observedAtMs<=60000,'A new exact parent read is required, not a historical scope declaration');
 return {eligibleForSeparateReviewedSingleSnapshot:true,namespace:value.ownerNamespaces[0],notACloudAuthorization:true};
}
export function assertOriginalScopeOrdering(sql){
 const owned=sql.slice(sql.indexOf('create function public.lingjing_global_serial_owned('),sql.indexOf('create function public.lingjing_global_serial_wild_lookup('));
 assert.ok(owned.includes('v_namespace:=lingjing_private.global_serial_actor_namespace(p_actor);'));assert.ok(owned.indexOf('global_serial_actor_namespace(p_actor)')<owned.indexOf('register_owned_global_serials(v_owner)'));
 const actor=sql.slice(sql.indexOf('create function lingjing_private.global_serial_actor_namespace('),sql.indexOf('create function lingjing_private.global_serial_owner_namespace('));
 assert.ok(actor.includes("if v_scope<>'live' or p_actor->>'allowSimulatedLocation'='true' then raise exception 'LJ_GLOBAL_SERIAL_SCOPE_REVOKED';end if;"));
 assert.ok(actor.indexOf('lingjing_discovery.live_actor(p_actor)')<actor.indexOf('global_serial_owner_namespace'));
 return true;
}
