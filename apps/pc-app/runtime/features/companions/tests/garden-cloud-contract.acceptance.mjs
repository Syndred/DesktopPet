import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync,mkdtempSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { awardBattleResult } from '../cloud-growth.mjs';

// Read an exact committed05 checkpoint into an isolated fixture directory.
// No peer checkout, remote service or battle UI is modified. The canonical
// engine/domain run locally; this is NOT HTTPS/real-world territory evidence.
const require=createRequire(import.meta.url),root=resolve('.'),ref=process.argv[2]||'53732f4';
assert.match(ref,/^[a-f0-9]{7,40}$/i);
const git=args=>execFileSync('git',args,{cwd:root,windowsHide:true});
const peer=git(['rev-parse','--verify',ref+'^{commit}']).toString().trim();
const outputRoot=resolve('artifacts/companions');mkdirSync(outputRoot,{recursive:true});
const output=mkdtempSync(join(outputRoot,'garden-contract-')),staged=join(output,'peer');
const evidence={at:new Date().toISOString(),output,sourceCommit:git(['rev-parse','HEAD']).toString().trim(),dirty:git(['status','--porcelain']).toString().trim(),peerCommit:peer,kind:'local-product-domain-and-real-SQLite',realCloudAcceptance:false,physicalSecondDevice:false,files:[],checks:[]};
for(const path of['infra/supabase/functions/_shared/battle-core.generated.mjs','infra/supabase/functions/territory-sync/domain.mjs','apps/pc-app/runtime/features/garden/cloud-domain.mjs','apps/pc-app/runtime/features/garden/catalog.json','apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json']){
  const bytes=git(['show',peer+':'+path]),file=join(staged,path);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes,{flag:'wx'});
  evidence.files.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
}
const {beginTerritoryBattle,advanceTerritoryBattle,applyTerritoryCommand}=await import(pathToFileURL(join(staged,'infra/supabase/functions/territory-sync/domain.mjs')).href);
const {digest:requestDigest}=await import(pathToFileURL(join(staged,'apps/pc-app/runtime/features/garden/cloud-domain.mjs')).href);
const {migrations}=require('../../accounts/schema.cjs'),{BackupManager}=require('../../accounts/backups.cjs');
const {migrateCompanions}=require('../migrations.cjs'),{CompanionsService}=require('../service.cjs'),{createCompanionBackupAdapter}=require('../backup.cjs');
const {GardenService}=require('../../garden/service.cjs'),{createGardenBackupAdapter}=require('../../garden/backup.cjs');
const owner='original-territory-owner',now=1792896900000;
function client(name){
  const db=new DatabaseSync(join(output,name+'.sqlite'));db.exec('PRAGMA foreign_keys=ON');migrations.forEach(m=>db.exec(m.sql));migrateCompanions(db);
  db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(owner,'runtime',owner,'original','original','原账号','2026-10-24','2026-10-24');
  const service=new CompanionsService({db,now:()=>new Date(now)}),adapter=createCompanionBackupAdapter(db),garden=new GardenService({db,clock:()=>now});
  const backups=new BackupManager({db,directory:join(output,name+'-backups'),getIdentity:who=>db.prepare('SELECT * FROM account_identities WHERE owner_account_id=?').get(who)});
  backups.register(adapter);backups.register(createGardenBackupAdapter(db));
  return{db,service,adapter,garden,backups};
}
const a=client('client-a'),b=client('client-b');
try{
  a.service.importLegacyInventory(owner,{pets:[{id:'old-archived-pet',name:{zh:'原来伙伴的历史'},model:'old.glb',chats:[{id:'original-history'}]}]});
  const pets=['原鱼一号','原鱼二号'].map((name,index)=>a.service.adopt(owner,{actionId:'original-adopt-'+index,templateId:'big-fish-gentle',name,showOnDesktop:false}).data.pet);
  a.service.applyGrowthInTransaction(owner,{actionId:'original-xp',petId:pets[0].petId,effect:{experience:90}});
  // Match the real wire envelope; Node SQLite rows have null prototypes.
  a.garden.snapshot({ownerAccountId:owner});const baseline=JSON.parse(JSON.stringify(a.backups.snapshot(owner))),original=structuredClone(baseline);
  const region={id:'territory:local-contract',revision:1,ownerAccountId:null,captureMultiplier:2};
  let battle=beginTerritoryBattle(owner,baseline,region,{petId:pets[0].petId},now,'original-server-session');
  for(let turn=0;turn<100&&battle.status==='active';turn++)battle=advanceTerritoryBattle(battle,{action:'normal_attack',expectedRound:battle.snapshot.round+1},now+turn+1);
  assert.equal(battle.status,'finished');assert.ok(['player','enemy'].includes(battle.winner));
  const input={actionId:'territory-settle-original',sessionId:battle.id,expectedRevision:0},hash=await requestDigest({kind:'territorySettle',input});
  const result=await applyTerritoryCommand(baseline,owner,'territorySettle',input,now+200,hash,{region,battle},{awardBattleResult});
  assert.deepEqual(baseline,original);a.backups.validate(result.envelope,owner);
  const module=result.envelope.data.modules.companions.data,pet=JSON.parse(module.tables.companion_pets.find(row=>row.pet_id===pets[0].petId).data_json);
  assert.equal(pet.growth.experience,battle.winner==='player'?10:95);assert.equal(pet.growth.winsTotal,battle.winner==='player'?1:0);
  assert.deepEqual(module.tables.companion_pets.filter(row=>row.pet_id!==pets[0].petId),original.data.modules.companions.data.tables.companion_pets.filter(row=>row.pet_id!==pets[0].petId));
  const total=envelope=>envelope.data.modules.garden.data.tables.garden_items.reduce((sum,row)=>sum+row.quantity,0);
  assert.equal(total(result.envelope)-total(original),2);
  assert.equal(result.envelope.data.modules.garden.data.tables.garden_reward_receipts.length,1);
  const duplicate=await applyTerritoryCommand(result.envelope,owner,'territorySettle',input,now+1000,hash,{region,battle},{awardBattleResult});
  assert.equal(duplicate.changed,false);assert.deepEqual(duplicate.envelope,result.envelope);
  evidence.checks.push('Exact05 canonical engine/domain uses02 shared growth adapter: one target XP award, one seed receipt and replay without duplicate reward');
  const file=join(output,'authoritative-domain-fixture.lingjing.json');writeFileSync(file,JSON.stringify(result.envelope));
  const preview=b.backups.preview(owner,file);b.backups.restore(owner,{previewId:preview.previewId,actionId:'restore-domain-fixture',mode:'replace'});
  assert.deepEqual(b.adapter.export(owner),module);assert.equal(total(b.backups.snapshot(owner)),total(result.envelope));
  assert.deepEqual(JSON.parse(b.adapter.export(owner).tables.companion_legacy_archive[0].source_json).chats,[{id:'original-history'}]);
  evidence.checks.push('Actual Accounts BackupManager restores the same whole companion/Garden envelope in an independent SQLite client with original IDs/history');
  const stalePreview=b.backups.preview(owner,file);b.service.rename(owner,{actionId:'client-b-offline-name',petId:pets[1].petId,name:'B端离线名字'});
  const kept=b.adapter.export(owner);assert.throws(()=>b.backups.restore(owner,{previewId:stalePreview.previewId,actionId:'must-not-overwrite-offline',mode:'replace'}),error=>error.code==='SAVE_CHANGED');assert.deepEqual(b.adapter.export(owner),kept);
  evidence.checks.push('A local edit after cloud-fixture preview rejects stale replacement and preserves the independent second pet');
  evidence.battle={sessionId:battle.id,winner:battle.winner,rounds:battle.rounds.length,authority:'local-canonical-engine-fixture'};
  evidence.growthReceipt=result.settledBattle.reward;evidence.passed=true;
}catch(error){evidence.passed=false;evidence.failure={message:error.message,stack:error.stack};process.exitCode=1;}
finally{a.db.close();b.db.close();writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({output,peerCommit:peer,passed:evidence.passed,checks:evidence.checks,failure:evidence.failure?.message.slice(0,800)}));}
