// Two-phase fixture readiness: no future room/cell IDs required before login.
// Structural plan admits ONLY fixed reviewed producers. Runtime binds their
// same-batch actual completed evidence, never an arbitrary passed callback.
import assert from 'node:assert/strict';
import {validateDomainFixture} from './cloud-live-qa-cross-domain-conflict-completion-cases.mjs';
export function validateS02ProducedFixturePlan(plan){
 assert.equal(plan?.kind,'fixed-s02-produced-fixture-v1');assert.equal(plan.report.producer,'friend-completion');assert.equal(plan.report.requiredCase,'B11');assert.equal(plan.territory.producer,'s02-territory-producer');assert.equal(plan.territory.requiresFreshParentEmptyCell,true);assert.equal(plan.territory.requiresSignedUiLocationCapability,true);
 assert.equal(plan.base.producer,'s02-base-producer');assert.equal(plan.base.requiresConfirmedG07InventoryWrite,true);assert.ok(typeof plan.base.petId==='string'&&plan.base.petId);
 assert.equal(Object.hasOwn(plan,'callback'),false);assert.equal(Object.hasOwn(plan.report,'roomId'),false,'Future room must be derived from actual producer');assert.equal(Object.hasOwn(plan.territory,'territoryId'),false,'Future cell result must be derived from actual producer');return plan;
}
export function assembleS02ProducedFixture(plan,{runId,scenario,friend,territory,base}){
 validateS02ProducedFixturePlan(plan);for(const p of[friend,territory,base]){assert.equal(p.runId,runId);assert.equal(p.scenario,scenario);assert.notEqual(p.uncertainWrite,true,'No unresolved producer write');}
 assert.ok(friend.passed===true||(!friend.errorCode&&['originalRoomTerminal','bothReportsAndAuthorityVerified','originalIntentsPersisted','observerCleanupVerified','onlyRealtimeReadObservationFailed'].every(k=>friend.friendFailureContinuation?.[k]===true)),'Unclassified friend failure cannot become S02 prerequisite');
 assert.ok(friend.cases.some(r=>r.id==='B11'&&r.status==='passed-scoped'));assert.equal(friend.authorityReadbackPassed,true);assert.equal(friend.normalTerminalConfirmed,true);assert.match(friend.roomId,/^[a-f0-9-]{36}$/i);assert.ok(Object.values(friend.cleanup||{}).length>0&&Object.values(friend.cleanup).every(x=>x===true));
 assert.equal(territory.passed,true);assert.equal(territory.cleanup.traceRemoved,true);assert.equal(territory.fixture.petId,plan.base.petId);assert.ok(territory.fixture.territoryId);assert.ok(Number.isSafeInteger(territory.fixture.territoryRevision));
 assert.equal(base.passed,true);assert.equal(base.fixture.petId,plan.base.petId);assert.ok(base.inventoryWriteActionId);assert.equal(base.cleanup.ownDummyRemoved,true);assert.equal(base.cleanup.loopbackStopped,true);
 return validateDomainFixture({...base.fixture,runId,reportId:'online-'+friend.roomId,territoryId:territory.fixture.territoryId},runId);
}
