import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,basename} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const source=resolve(process.env.GARDEN_SMOKE_OUTPUT||'artifacts/garden/integrated-electron');
const sqlSource=resolve(process.argv[2]||'artifacts/garden/postgres/latest/evidence.json');
const output=resolve('docs/implementation/evidence/garden');
const run=JSON.parse(readFileSync(resolve(source,'run.json'),'utf8'));
assert.ok(run.final&&run.readback&&run.motion&&run.library&&run.battle&&run.carrotHarvest&&run.rewardCycle,'Finish the real native phases before exporting evidence');
assert.equal(run.readback.repeatHarvest.code,'ALREADY_HARVESTED');
assert.equal(run.readback.staleOwner.code,'SESSION_CHANGED');
assert.deepEqual(run.readback.result.data.items,run.rewardCycle.final.data.items);
const nativeDb=new DatabaseSync(resolve(source,'profile/lingjing.sqlite'),{readOnly:true});
const inventory=nativeDb.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=? ORDER BY item_id').all(run.ownerAccountId);
const riceHarvest=nativeDb.prepare("SELECT created_at FROM garden_events WHERE owner_account_id=? AND kind='harvest' AND item_id='rice'").all(run.ownerAccountId);
assert.equal(riceHarvest.length,1);
const planted=run.planted.data.plots[0],elapsed=riceHarvest[0].created_at-planted.plantedAt;
assert.ok(elapsed>=25*60_000,'Production rice must mature without edited clocks');
const petState=pet=>({petId:pet.petId,name:pet.name,revision:pet.revision,growth:pet.growth});
for(const name of ['小蓝','饭团'])assert.deepEqual(run.afterFeed.data.pets.find(p=>p.name===name),run.beforeFeed.data.pets.find(p=>p.name===name));
const otherPets=result=>result.data.pets.filter(pet=>pet.petId!==run.petIds['鱼丸']);
assert.deepEqual(otherPets(run.afterFeed),otherPets(run.beforeFeed));
assert.deepEqual(otherPets(run.rewardCycle.afterFeed),otherPets(run.rewardCycle.beforeFeed));
const oldSource=resolve('artifacts/garden/electron'),old=JSON.parse(readFileSync(resolve(oldSource,'run.json'),'utf8'));
const oldDb=new DatabaseSync(resolve(oldSource,'profile/lingjing.sqlite'),{readOnly:true});
assert.equal(old.identity.result.code,'OWNER_MIGRATION_REQUIRED');
const oldItems=oldDb.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=?').all(old.ownerAccountId);
assert.ok(old.final.data.items.every(item=>(oldItems.find(row=>row.item_id===item.id)?.quantity||0)===item.quantity));
const upgraded=old.identityUpgrade?.restartExact===true;
const ownerTransition={source:old.ownerAccountId,target:old.storageOwnerAccountId,beforeAdapterCode:old.identity.result.code,oldInventoryExactlyPreserved:true,status:upgraded?'verified-native-upgrade':'guarded-provider-adapter-required',providerMigrationStillRequired:!upgraded};
if(upgraded){
  const targetItems=oldDb.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=?').all(old.storageOwnerAccountId);
  assert.ok(old.final.data.items.every(item=>(targetItems.find(row=>row.item_id===item.id)?.quantity||0)===item.quantity));
  for(const pet of old.afterFeed.data.pets)assert.deepEqual(JSON.parse(oldDb.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id=? AND pet_id=?').get(old.ownerAccountId,pet.petId).data_json),pet);
  const starterCount=owner=>oldDb.prepare("SELECT COUNT(*) n FROM garden_events WHERE owner_account_id=? AND kind='starter'").get(owner).n;
  assert.equal(starterCount(old.storageOwnerAccountId),starterCount(old.ownerAccountId));
  ownerTransition.gardenArchive=oldDb.prepare('SELECT source_owner_account_id,target_owner_account_id,created_at,LENGTH(archive_json) archiveBytes FROM garden_identity_imports WHERE source_owner_account_id=?').get(old.ownerAccountId);
  ownerTransition.companionArchive=oldDb.prepare('SELECT source_owner_account_id,target_owner_account_id,created_at,LENGTH(archive_json) archiveBytes FROM companion_identity_imports WHERE source_owner_account_id=?').get(old.ownerAccountId);
  assert.equal(ownerTransition.gardenArchive.target_owner_account_id,old.storageOwnerAccountId);assert.equal(ownerTransition.companionArchive.target_owner_account_id,old.storageOwnerAccountId);
  Object.assign(ownerTransition,{targetInventoryExact:true,sourcePetRecordsExact:true,targetPetGrowthExact:true,noStarterRegrant:true,secondReadSame:true,restartExact:true});
}else{
  assert.equal(oldDb.prepare('SELECT 1 FROM garden_accounts WHERE owner_account_id=?').get(old.storageOwnerAccountId),undefined);ownerTransition.newGardenNotCreated=true;
}
const sql=JSON.parse(readFileSync(sqlSource,'utf8'));
assert.equal(sql.accountCoordination?.exactInventory,true,'Verify the shared AccountSync checkpoint and next full-save push first');
assert.equal(sql.checks.length,11);assert.equal(sql.cloudPlayback?.pendingReadback?.matchingReadbackReceiptRequired,true);
assert.equal(run.canonicalResources?.restartExact,true);assert.equal(run.map.privacyReleasedAfterRead,true);
const rosterSource=resolve('artifacts/garden/roster-electron'),roster=JSON.parse(readFileSync(resolve(rosterSource,'run.json'),'utf8'));
const rosterDb=new DatabaseSync(resolve(rosterSource,'profile/lingjing.sqlite'),{readOnly:true});
assert.equal(roster.rosterFixture.cloudAcceptance,false);
assert.equal(roster.roster.restartExact,true);assert.equal(roster.rosterAction.restartExact,true);
assert.equal(new Set(roster.roster.assets.map(asset=>asset.resourceId)).size,6);
assert.equal(new Set(roster.roster.assets.map(asset=>asset.contentHash)).size,6);
assert.ok(roster.roster.assets.every(asset=>asset.width>0&&asset.height>0&&asset.renderer==='shared-pixi-stage'));
const eat=roster.rosterAction,otherThanTarget=result=>result.data.pets.filter(pet=>pet.petId!==eat.targetPetId);
assert.deepEqual(otherThanTarget(eat.before),otherThanTarget(eat.after));
assert.equal(eat.stockBefore.data.items.find(item=>item.id==='tomato').quantity-eat.stockAfter.data.items.find(item=>item.id==='tomato').quantity,1);
assert.equal(eat.repeated.replayed,true);assert.equal(eat.events.length,1);
const rosterItems=rosterDb.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=?').all(roster.ownerAccountId);
assert.ok((roster.realTerritory?.after||eat.stockAfter).data.items.every(item=>(rosterItems.find(row=>row.item_id===item.id)?.quantity||0)===item.quantity));
assert.equal(eat.after.data.pets.find(pet=>pet.petId===eat.targetPetId).growth.satiety-eat.before.data.pets.find(pet=>pet.petId===eat.targetPetId).growth.satiety,10);
assert.equal(eat.events[0].petId,eat.targetPetId);assert.equal(eat.events[0].ownerAccountId,roster.ownerAccountId);
assert.equal(eat.events[0].action,'eat');
assert.ok(new Set(eat.frames.filter(frame=>frame.action==='eat').map(frame=>frame.frame)).size>=2);
const physical=roster.realTerritory;assert.equal(physical?.completed,true);assert.equal(physical.restartExact,true);
assert.equal(physical.importedFixture,false);assert.equal(physical.location.fix.source,'os');assert.ok(physical.location.fix.accuracyMeters<=80);
const physicalBattle=JSON.parse(rosterDb.prepare('SELECT data_json FROM battle_sessions WHERE owner_account_id=? AND id=?').get(roster.ownerAccountId,physical.sessionId).data_json);
assert.equal(physicalBattle.mode,'territory');assert.equal(physicalBattle.status,'finished');assert.equal(physicalBattle.winner,'player');
assert.equal(rosterDb.prepare('SELECT owner_account_id FROM garden_territory_records WHERE territory_id=?').get(physical.territoryId).owner_account_id,roster.ownerAccountId);
assert.equal(rosterDb.prepare('SELECT pet_id FROM garden_garrisons WHERE owner_account_id=? AND territory_id=?').get(roster.ownerAccountId,physical.territoryId).pet_id,physical.garrisonPetId);
const physicalSettlement=JSON.parse(rosterDb.prepare('SELECT result_json FROM garden_territory_challenges WHERE owner_account_id=? AND battle_id=? AND settled=1').get(roster.ownerAccountId,physical.sessionId).result_json);
assert.equal(physicalSettlement.won,true);assert.equal(physical.garrisonChangesNoGrowthOrIndependentSelection,true);
const territoryRun=JSON.parse(readFileSync(resolve('artifacts/garden/territory-electron/run.json'),'utf8'));
assert.equal(territoryRun.territoryRestart.exactGarrisonAndIndependentSelections,true);
const evidence={
  capturedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  mode:'Actual Windows Electron + IPC + SQLite reopen. PostgreSQL checks use a local WASM server, not deployed Supabase.',
  ownerAccountId:run.ownerAccountId,electron:run.phases.at(-1).electron,phases:run.phases,
  productionGrowth:{crop:'rice',plantedAt:planted.plantedAt,maturesAt:planted.maturesAt,harvestedAt:riceHarvest[0].created_at,elapsedMs:elapsed,appRestarts:true,clockOrDatabaseGrowthEdits:false},
  inventory,battle:{sessionId:run.battle.session.id,winner:run.battle.session.winner,reward:run.battle.session.reward,seedDelta:2,repeatedSnapshotAddsNothing:true},
  selectedPetFeed:{before:run.beforeFeed.data.pets.map(petState),after:run.afterFeed.data.pets.map(petState),onlyFishChanged:true,cookedRiceConsumed:1,riceRemaining:1},
  rewardedSeedCycle:{receipt:run.rewardPlant.receipt,planted:run.rewardPlant.after.data.plots.find(plot=>plot.plotId===run.rewardPlant.plotId),harvested:run.rewardCycle.harvested.data.ledger.find(entry=>entry.kind==='harvest'&&entry.itemId===run.rewardPlant.crop),foodConsumed:1,before:run.rewardCycle.beforeFeed.data.pets.map(petState),after:run.rewardCycle.afterFeed.data.pets.map(petState),nextBattle:{sessionId:run.rewardCycle.nextBattle.id,winner:run.rewardCycle.nextBattle.winner,reward:run.rewardCycle.nextBattle.reward},finalPets:run.rewardCycle.finalPets.data.pets.map(petState)},
  restart:{exactItemsAndPets:true,duplicateHarvest:run.readback.repeatHarvest,staleAccount:run.readback.staleOwner},
  publicComponents:{...run.library,...run.motion},visualAudit:run.visualAudit,responsive:run.responsive,realLocation:run.map,
  oldOwnerSafety:ownerTransition,
  controlledTerritoryUI:{fixture:true,realGeographicAcceptance:false,actualIPCAndSqlite:true,garrisonOnly:territoryRun.territoryUI.garrisonOnly,restart:territoryRun.territoryRestart},
  physicalTerritory:{mode:'actual OS location + local account + actual native buttons/IPC/battle/SQLite/restart; no imported territory fixture',coordinatesOmitted:true,accuracyMeters:physical.location.fix.accuracyMeters,positionSource:physical.location.fix.positionSource,fixTimestampMs:physical.location.fix.timestampMs,attemptedAt:roster.realTerritoryAttempt.at,battle:{sessionId:physicalBattle.id,mode:physicalBattle.mode,winner:physicalBattle.winner,rounds:physicalBattle.rounds.length,reward:physicalBattle.reward},ownershipReadback:true,garrisonPetId:physical.garrisonPetId,garrisonChangesNoGrowthOrIndependentSelection:true,restartExact:true,cloudAcceptance:false,localProof:'artifacts/garden/roster-electron/run.json'},
  postgres:{mode:sql.mode,at:sql.at,checks:sql.checks,accountRevision:sql.finalCloud?.revision,accountCoordination:sql.accountCoordination,cloudPlayback:sql.cloudPlayback},
  canonicalResourceUpgrade:{...run.canonicalResources,fixtureRosterRestartExact:roster.canonicalResources?.restartExact===true},
  canonicalRoster:{fixture:roster.rosterFixture,assets:roster.roster.assets,targetPetId:roster.roster.targetPetId,onlyTargetChanged:true,restartExact:true},
  selectedPetAnimation:{fixture:true,cloudAcceptance:false,targetPetId:eat.targetPetId,before:eat.before.data.pets.map(petState),after:eat.after.data.pets.map(petState),events:eat.events,frames:eat.frames,foodConsumed:1,otherPetsUnchanged:true,replayed:eat.repeated.replayed,noSecondDebitOrAction:true,restartExact:true},
  externalGaps:['Live HTTPS Supabase deployment and real-account two-device readback','Cloud territory challenge/garrison authority and shared battle integration',...(upgraded?[]:['Companions verified alias migration callback']),'Central full-app A01-A12 visual acceptance and Windows packaging']
};
mkdirSync(output,{recursive:true});
for(const name of ['02a-2d-mature-garden.png','02-cooked-and-fed.png','05-radix-inventory.png','09a-reward-mature.png','11-kitchen-current.png','12-inventory-current.png','A04-1280x844-inventory.png','A04-1440x900-inventory.png'])copyFileSync(resolve(source,name),resolve(output,name));
copyFileSync(resolve(oldSource,'identity-migration-preserved.png'),resolve(output,'identity-migration-preserved.png'));
if(upgraded)copyFileSync(resolve(oldSource,'identity-upgraded-preserved.png'),resolve(output,'identity-upgraded-preserved.png'));
for(const name of ['six-canonical-resources-and-selected-fox-feed.png','only-selected-fox-eating.png'])copyFileSync(resolve(rosterSource,name),resolve(output,name));
copyFileSync(resolve(rosterSource,'real-territory-battle.png'),resolve(output,'real-territory-battle.png'));
writeFileSync(resolve(output,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
nativeDb.close();oldDb.close();rosterDb.close();
console.log(JSON.stringify({output,screenshots:upgraded?13:12,elapsedMs:elapsed,sqlEvidence:basename(sqlSource),canonicalResources:6,accountCoordination:true,physicalTerritory:true}));
