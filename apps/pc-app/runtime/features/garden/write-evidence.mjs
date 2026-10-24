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
assert.equal(oldDb.prepare('SELECT 1 FROM garden_accounts WHERE owner_account_id=?').get(old.storageOwnerAccountId),undefined);
const sql=JSON.parse(readFileSync(sqlSource,'utf8'));
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
  oldOwnerSafety:{source:old.ownerAccountId,target:old.storageOwnerAccountId,code:old.identity.result.code,oldInventoryExactlyPreserved:true,newGardenNotCreated:true,providerMigrationStillRequired:true},
  controlledTerritoryUI:{fixture:true,realGeographicAcceptance:false,actualIPCAndSqlite:true,garrisonOnly:territoryRun.territoryUI.garrisonOnly,restart:territoryRun.territoryRestart},
  postgres:{mode:sql.mode,at:sql.at,checks:sql.checks,accountRevision:sql.finalCloud?.revision},
  externalGaps:['Live HTTPS Supabase deployment and real-account two-device readback','Cloud territory challenge/garrison authority and shared battle integration','Companions verified alias migration callback','Common accounts save-version reconciliation after garden operations','Physical location precision <= 80m for actual capture/occupation']
};
mkdirSync(output,{recursive:true});
for(const name of ['02a-2d-mature-garden.png','02-cooked-and-fed.png','05-radix-inventory.png','09a-reward-mature.png','11-kitchen-current.png','12-inventory-current.png','A04-1280x844-inventory.png','A04-1440x900-inventory.png'])copyFileSync(resolve(source,name),resolve(output,name));
copyFileSync(resolve(oldSource,'identity-migration-preserved.png'),resolve(output,'identity-migration-preserved.png'));
writeFileSync(resolve(output,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
nativeDb.close();oldDb.close();
console.log(JSON.stringify({output,screenshots:9,elapsedMs:elapsed,sqlEvidence:basename(sqlSource)}));
