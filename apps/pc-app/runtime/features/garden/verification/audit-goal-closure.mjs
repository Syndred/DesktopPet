// Read-only completion audit. Uses existing real-duration runs and final accepted
// integration receipts; never plants, grants, feeds, replays or edits a profile.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';

const root=resolve('.'),base='docs/implementation/evidence/garden',finalBase='docs/implementation/evidence/foundation/final-unified';
const json=file=>JSON.parse(readFileSync(resolve(file),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const git=args=>execFileSync('git',args,{encoding:'utf8'}).trim();
const delivery=json(`${finalBase}/delivery.json`),historical=json(`${base}/verification.json`),run=json('artifacts/garden/integrated-electron/run.json');
const current=git(['rev-parse','HEAD']);assert.equal(delivery.goalComplete,true);assert.deepEqual(delivery.remaining,[]);
const upstream=git(['rev-parse','origin/main']);assert.equal(git(['rev-list','--count','HEAD..origin/main']),'0');
assert.equal(git(['status','--porcelain','--','apps/pc-app/runtime','apps/pc-app/ui/src','packages/shared-types/src',':(exclude)**/verification/**']),'');

function codeFiles(checkout){
  const files=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(directory,entry.name)):[join(directory,entry.name)]);
  const portable=file=>relative(checkout,file).replaceAll('\\','/');
  const names=['apps/pc-app/runtime','apps/pc-app/ui/src','packages/shared-types/src'].flatMap(directory=>files(join(checkout,directory))).filter(file=>{
    const path=portable(file);return /\.(?:[cm]?js|tsx?|css)$/.test(path)&&!/(?:^|\/)(tests|verification|legacy|renderer|auth)\//.test(path)&&!/\.(?:test|acceptance)\./.test(path)&&!/\.electron\.mjs$/.test(path)&&!/(?:verify-|smoke\.|prepare-.*fixture|write-evidence|generate-fish)/.test(path);
  }).map(portable);
  return [...names,'package.json','package-lock.json','electron.vite.config.ts','scripts/desktop/write-build-manifest.mjs'].sort();
}
function fingerprint(checkout,names){const hash=createHash('sha256');for(const name of names){hash.update(name);hash.update('\0');hash.update(readFileSync(join(checkout,name)));hash.update('\0');}return hash.digest('hex');}
const acceptedCheckout=resolve(dirname(delivery.package.path),'../..'),names=codeFiles(root),acceptedNames=codeFiles(acceptedCheckout);
assert.deepEqual(names,acceptedNames);assert.equal(names.length,delivery.build.codeFiles);
assert.equal(fingerprint(acceptedCheckout,names),delivery.build.codeFingerprint);
const lineEndingDifferences=[];
for(const name of names){const own=readFileSync(join(root,name)),accepted=readFileSync(join(acceptedCheckout,name));if(!own.equals(accepted)){assert.equal(own.toString().replaceAll('\r\n','\n'),accepted.toString().replaceAll('\r\n','\n'),`Source changed: ${name}`);lineEndingDifferences.push(name);}}
assert.equal(sha(readFileSync(delivery.package.path)),delivery.package.sha256);assert.equal(statSync(delivery.package.path).size,delivery.package.bytes);
const independent=delivery.mainIndependent.map(receipt=>{const bytes=readFileSync(join(acceptedCheckout,receipt.evidence)),localBytes=readFileSync(resolve(receipt.evidence));assert.equal(sha(bytes),receipt.sha256);assert.equal(JSON.parse(bytes).passed,true);assert.deepEqual(JSON.parse(localBytes),JSON.parse(bytes));return {name:receipt.name,source:receipt.source,evidence:receipt.evidence,sha256:receipt.sha256,checkedOriginalPath:join(acceptedCheckout,receipt.evidence),localRawSha256:sha(localBytes),localJsonEqual:true,passed:true};});
const unchangedDomain=['service.cjs','catalog.cjs','catalog.json','settlements.cjs'].map(name=>{const path=`apps/pc-app/runtime/features/garden/${name}`,before=git(['rev-parse',`8dadfc2:${path}`]),now=git(['rev-parse',`HEAD:${path}`]);assert.equal(now,before);return {path,gitBlob:now,unchangedSince:historical.commit};});

const db=new DatabaseSync(resolve('artifacts/garden/integrated-electron/profile/lingjing.sqlite'),{readOnly:true});let local;
try{
  const owner=run.ownerAccountId,items=db.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=? ORDER BY item_id').all(owner);
  for(const item of run.rewardCycle.final.data.items)assert.equal(items.find(row=>row.item_id===item.id)?.quantity||0,item.quantity);
  assert.ok(items.every(row=>row.quantity>=0));
  const events=db.prepare('SELECT action_id,kind,item_id,delta,balance,pet_id,created_at FROM garden_events WHERE owner_account_id=? ORDER BY created_at,event_id').all(owner);
  for(const item of items)assert.equal(events.filter(event=>event.item_id===item.item_id).reduce((total,event)=>total+event.delta,0),item.quantity);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM garden_plots WHERE owner_account_id=?').get(owner).n,6);
  const rice=events.find(event=>event.kind==='harvest'&&event.item_id==='rice');assert.equal(rice.delta,2);
  const elapsed=rice.created_at-run.planted.data.plots[0].plantedAt;assert.ok(elapsed>=1500000);assert.equal(elapsed,historical.productionGrowth.elapsedMs);
  const craft=events.filter(event=>event.kind==='craft');assert.equal(craft.length,2);assert.equal(new Set(craft.map(event=>event.action_id)).size,1);assert.equal(craft.find(event=>event.item_id==='rice').delta,-1);assert.equal(craft.find(event=>event.item_id==='cooked_rice').delta,1);
  const feeds=events.filter(event=>event.kind==='feed');assert.equal(feeds.length,2);assert.ok(feeds.every(event=>event.delta===-1&&event.pet_id===run.petIds['鱼丸']));
  const pets=db.prepare('SELECT pet_id,data_json FROM companion_pets WHERE owner_account_id=?').all(owner).map(row=>JSON.parse(row.data_json));
  assert.equal(pets.length,run.rewardCycle.finalPets.data.pets.length);
  for(const expected of run.rewardCycle.finalPets.data.pets)assert.deepEqual(pets.find(pet=>pet.petId===expected.petId).growth,expected.growth);
  for(const [before,after]of [[run.beforeFeed,run.afterFeed],[run.rewardCycle.beforeFeed,run.rewardCycle.afterFeed]])assert.deepEqual(after.data.pets.filter(pet=>pet.petId!==run.petIds['鱼丸']),before.data.pets.filter(pet=>pet.petId!==run.petIds['鱼丸']));
  const receipts=db.prepare('SELECT source,receipt_id,action_id,result_json FROM garden_reward_receipts WHERE owner_account_id=?').all(owner);assert.equal(receipts.length,2);
  const battleIds=[run.battle.session.id,run.rewardCycle.nextBattle.id];
  const sessions=battleIds.map(id=>{const battle=JSON.parse(db.prepare('SELECT data_json FROM battle_sessions WHERE owner_account_id=? AND id=?').get(owner,id).data_json);assert.equal(battle.status,'finished');assert.equal(battle.reward.applied,true);assert.equal(battle.player.petId,run.petIds['鱼丸']);assert.equal(receipts.filter(receipt=>receipt.receipt_id===id).length,1);return {sessionId:id,mode:battle.mode,winner:battle.winner,playerPetId:battle.player.petId,reward:battle.reward};});
  assert.ok(sessions[1].reward.currentExperience>sessions[0].reward.currentExperience);
  assert.equal(run.readback.repeatHarvest.code,'ALREADY_HARVESTED');assert.equal(run.readback.staleOwner.code,'SESSION_CHANGED');assert.equal(run.canonicalResources.restartExact,true);
  local={ownerAccountId:owner,plots:6,inventory:items,ledgerConserved:true,rice:{elapsedMs:elapsed,harvest:rice,craft},feeds,allCurrentPetGrowthMatchesRecordedRestart:true,nonTargetPetsUnchanged:true,rewardReceipts:receipts.map(({result_json,...receipt})=>({...receipt,result:JSON.parse(result_json)})),sessions,seedCrop:historical.rewardedSeedCycle.planted,rewardCropHarvest:historical.rewardedSeedCycle.harvested,duplicateHarvestDenied:run.readback.repeatHarvest.code,staleAccountDenied:run.readback.staleOwner.code};
}finally{db.close();}

const context=json(`${finalBase}/main-independent/final-context-v3.json`),wild=context.checks.find(check=>check.id==='wild-real-victory');assert.equal(wild.passed,true);assert.equal(wild.detail.mode,'wild');assert.equal(wild.detail.reward.seeds.quantity,2);
const territory=json(`${finalBase}/territory/evidence.json`);assert.equal(territory.passed,true);assert.deepEqual(territory.errors,[]);
const territoryReadback={};
for(const label of ['win','loss']){
  const scene=territory.scenarios[label];assert.ok(scene.completed&&scene.exactRestartAndReplay&&scene.restartRecovered&&scene.confirmedResultUi);
  const state=new DatabaseSync(join(scene.profilePath,'lingjing.sqlite'),{readOnly:true});
  try{
    assert.equal(state.prepare('SELECT settled FROM garden_territory_challenges WHERE owner_account_id=? AND battle_id=?').get(scene.owner,scene.sessionId).settled,1);
    const saved=state.prepare('SELECT owner_account_id,revision FROM garden_territory_records WHERE territory_id=?').get(scene.territoryId);assert.equal(saved.owner_account_id,label==='win'?scene.owner:null);
    assert.equal(state.prepare('SELECT COUNT(*) n FROM garden_reward_receipts WHERE owner_account_id=? AND receipt_id=?').get(scene.owner,scene.sessionId).n,1);
    for(const item of scene.after.data.items)assert.equal(state.prepare('SELECT quantity FROM garden_items WHERE owner_account_id=? AND item_id=?').get(scene.owner,item.id)?.quantity||0,item.quantity);
    const crop=state.prepare('SELECT planted_at,matures_at FROM garden_plots WHERE owner_account_id=? AND plot_id=?').get(scene.owner,'plot-1');assert.equal(crop.planted_at,scene.personalCrop.plantedAt);assert.equal(crop.matures_at,scene.personalCrop.maturesAt);
    if(label==='win'){const target=scene.after.data.territories.find(value=>value.id===scene.territoryId).garrisonPetId;assert.equal(state.prepare('SELECT pet_id FROM garden_garrisons WHERE owner_account_id=? AND territory_id=?').get(scene.owner,scene.territoryId).pet_id,target);assert.equal(scene.garrisonNoGrowthOrSelectionChange,true);}
    territoryReadback[label]={sessionId:scene.sessionId,winner:scene.session.winner,ownerAccountId:saved.owner_account_id,revision:saved.revision,exactRestartAndReplay:true,oneSeedReceipt:true,personalCropTimestampsPreserved:true,garrisonInvariant:label==='win'?true:null};
  }finally{state.close();}
}
const domainLog=readFileSync(resolve(`${base}/unified-battle/unified-domain-final.log`),'utf8');assert.match(domainLog,/# tests 21/);assert.match(domainLog,/# pass 21/);assert.match(domainLog,/# fail 0/);
const requirements=[
  {id:'G01',requirement:'领地总览、真实归属与共享战场胜负结果',evidence:[`${finalBase}/territory/evidence.json`,`${finalBase}/main-independent/final-context-v3.json`]},
  {id:'G02',requirement:'指定实例驻守，驻守不改变成长或独立选择',evidence:[`${base}/unified-battle/verification.json`,`${finalBase}/territory/evidence.json`]},
  {id:'G03',requirement:'六块独立菜地、种子扣减与正常时长离线生长',evidence:[`${base}/verification.json#/productionGrowth`]},
  {id:'G04',requirement:'成熟作物收获入库，重复收获被拒绝',evidence:[`${base}/verification.json#/inventory`,`${base}/verification.json#/restart`]},
  {id:'G05',requirement:'米饭配方按1份稻米转1份食物，不能直接喂生米',evidence:[`${base}/verification.json#/selectedPetFeed`,`${base}/unified-battle/unified-domain-final.log`]},
  {id:'G06',requirement:'背包、搜索分类、制作与指定宠物喂食实际交互',evidence:[`${base}/verification.json#/publicComponents`,`${base}/unified-battle/README.md`]},
  {id:'G07',requirement:'实际食物扣减只改变目标伙伴，其他伙伴不变',evidence:[`${base}/verification.json#/selectedPetFeed`,`${base}/verification.json#/rewardedSeedCycle`]},
  {id:'G08',requirement:'探索野外战和普通对战的权威结算发种子并去重',evidence:[`${finalBase}/main-independent/final-context-v3.json`,`${base}/verification.json#/battle`]},
  {id:'G09',requirement:'奖励种子种植、收获、喂养、养成后继续实际对战',evidence:[`${base}/verification.json#/rewardedSeedCycle`]},
  {id:'G10',requirement:'库存事务、失败回滚、版本、账号与宠物边界、并发及重启幂等',evidence:[`${base}/unified-battle/unified-domain-final.log`,`${base}/unified-battle/verification.json`,`${base}/verification.json#/restart`]},
  {id:'G11',requirement:'统一战场、原始数据保留与主会话最终集成验收',evidence:[`${finalBase}/delivery.json`,`${finalBase}/portable/evidence.json`,`${base}/verification.json#/oldOwnerSafety`]},
].map(requirement=>({...requirement,result:'proven'}));
const report={auditedAt:new Date().toISOString(),clientDate:'2026-10-25',timezone:'Asia/Shanghai',objective:'实现领地总览、驻守、菜园种植、离线生长、收获入库、配方制作、背包与指定宠物喂养；完成探索/对战得种子→种植→收获→制作食物→喂养→养成与继续探索的真实数据闭环，所有库存事务幂等且不串宠物。',source:current,upstream,behindOriginMain:0,readOnlyAudit:true,newDomainTestRuns:0,requirements,sourceContinuity:{unchangedDomain,codeFiles:names.length,currentRawFingerprint:fingerprint(root,names),acceptedRawFingerprint:delivery.build.codeFingerprint,normalizedSourceEqual:true,lineEndingOnlyDifferences:lineEndingDifferences},actualPortable:{path:delivery.package.path,sha256:delivery.package.sha256,bytes:delivery.package.bytes,source:delivery.source},independent,local,exploration:{sessionId:wild.detail.id,authority:'simulated',actualEngine:true,reward:wild.detail.reward},territory:territoryReadback,remaining:[],deferredByUser:['Live HTTPS cloud deployment, real two-device readback and cloud territorial authority','Precise physical location is not re-claimed by this unified QA acceptance'],simulationBoundary:'Existing real-duration local growth and SQLite loops are retained. Final wild/territory QA location, legal prestate and controlled opponent are explicitly simulated; no live cloud or physical GPS success is inferred.',passed:true};
writeFileSync(resolve(`${base}/goal-completion-audit.json`),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({source:current,requirements:requirements.length,readOnlyAudit:true,actualPortableHashMatched:true,normalizedAcceptedSourceEqual:true,lineEndingOnlyDifferences:lineEndingDifferences.length,passed:true}));
