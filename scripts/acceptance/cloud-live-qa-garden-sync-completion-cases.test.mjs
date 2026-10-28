import test from 'node:test';
import assert from 'node:assert/strict';
import {requireFreshGarden,requireGardenPending} from './cloud-live-qa-garden-sync-completion-cases.mjs';
const owner='local-synthetic-contract-owner';
const fresh=()=>({ownerAccountId:owner,sync:{mode:'cloud',pending:0,conflicts:0}});
const pending=()=>({mode:'cloud-authority',status:'partial',pending:1,lastError:'CLOUD_UNAVAILABLE',domainStates:[{domain:'companions',pending:0,error:'METADATA_OLD',metadataWarning:true},{domain:'garden',pending:1,error:'CLOUD_UNAVAILABLE'},{domain:'conversations',pending:0,error:null}]});
test('fresh assertion requires actual cloud mode, not equal cached content',()=>{assert.equal(requireFreshGarden(fresh(),owner).sync.mode,'cloud');assert.throws(()=>requireFreshGarden({...fresh(),sync:{mode:'cached',pending:0,conflicts:0}},owner));});
test('fresh assertion rejects foreign owner or unresolved request',()=>{assert.throws(()=>requireFreshGarden(fresh(),'different-owner'));assert.throws(()=>requireFreshGarden({...fresh(),sync:{mode:'cloud',pending:1,conflicts:0}},owner));});
test('one durable garden pending contributes once to public aggregate',()=>{assert.equal(requireGardenPending(pending(),1).pending,1);const x=pending();x.pending=0;assert.throws(()=>requireGardenPending(x,1));const y=pending();y.pending=2;assert.throws(()=>requireGardenPending(y,1));});
test('current network error must outrank existing metadata warning',()=>{const x=pending();assert.equal(requireGardenPending(x,1).error,'CLOUD_UNAVAILABLE');x.lastError='METADATA_OLD';assert.throws(()=>requireGardenPending(x,1));});
test('duplicate garden domain cannot masquerade as valid aggregate',()=>{const x=pending();x.domainStates.push({...x.domainStates[1]});x.pending=2;assert.throws(()=>requireGardenPending(x,1));});
test('pending never qualifies as ready even with correct counts',()=>{const x=pending();x.status='ready';assert.throws(()=>requireGardenPending(x,1));});
test('unchanged product garden domain rejects actual earlier revision before occupied-plot check without mutating source',async()=>{
 const {emptyGarden,applyCloudCommand,cloudSnapshot}=await import('../../apps/pc-app/runtime/features/garden/cloud-domain.mjs');
 const initial={ownerAccountId:owner,data:{modules:{garden:emptyGarden(owner)},tables:{}}};
 const ready=applyCloudCommand(initial,owner,'initialize',{actionId:'contract-init',expectedRevision:0},Date.now(),'contract-init-hash').envelope;
 const snapshot=cloudSnapshot(ready,owner,Date.now()),crop=snapshot.crops[0],plot=snapshot.plots[0];
 const intent={actionId:'contract-plant',sessionOwnerAccountId:owner,plotId:plot.plotId,cropType:crop.id,expectedRevision:snapshot.revision};
 const planted=applyCloudCommand(ready,owner,'plant',intent,Date.now(),'contract-plant-hash').envelope,seal=JSON.stringify(planted);
 assert.throws(()=>applyCloudCommand(planted,owner,'plant',{...intent,actionId:'contract-stale'},Date.now(),'contract-stale-hash'),e=>e.code==='REVISION_CONFLICT');
 assert.equal(JSON.stringify(planted),seal);
 const replay=applyCloudCommand(planted,owner,'plant',intent,Date.now(),'contract-plant-hash');assert.equal(replay.result.replayed,true);assert.equal(JSON.stringify(replay.envelope),seal);
});

test('S06 requires exact genuine companions metadata, not generic pending/network/warning',async()=>{const {hasGenuineS06Metadata}=await import('./cloud-live-qa-garden-sync-completion-cases.mjs');const d={domain:'companions',metadataWarning:true,error:'GLOBAL_SERIAL_SCOPE_REVOKED'};assert.equal(hasGenuineS06Metadata({domainStates:[d]}),true);for(const x of[{error:'CLOUD_UNAVAILABLE'},{metadataWarning:false},{domain:'garden'}])assert.equal(hasGenuineS06Metadata({domainStates:[{...d,...x}]}),false);assert.equal(hasGenuineS06Metadata({domainStates:[]}),false);});
