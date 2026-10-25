// Run from the repository root. Reads only the explicitly marked QA profiles;
// raw failed runs remain unchanged. Never copies credentials, tokens or databases.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,copyFileSync,realpathSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const target=resolve('docs/implementation/evidence/battle/2026-10-25/cloud-native-v2');
const sources=[
  ['duel-phase','live-1792904347214-4d2d7db8'],
  ['report-training-phase','live-1792904902772-33218d1e'],
  ['device-revoke','live-1792905246701-04be08e6'],
  ['after-retirement','live-1792905608011-236155d6']
];
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const phases=sources.map(([name,run])=>{const file=resolve('artifacts/battle',run,'evidence.json'),proof=json(file);assert.equal(proof.provenance,'real-HTTPS-and-Realtime-acceptance');assert.equal(proof.projectRef,'jbvrdmrkwpznbrvteive');assert.equal(proof.sourceDirty,'');assert.deepEqual(proof.errors,[]);copyFileSync(file,join(target,name+'.json'));return {name,run,sha256:sha(file),sourceCommit:proof.sourceCommit,buildSourceCommit:proof.build.sourceCommit,rawRunPassed:proof.passed,proof};});
const duel=phases[0].proof,training=phases[1].proof,device=phases[2].proof,retired=phases[3].proof;
const roomId=duel.steps.find(step=>step.roomId).roomId,friendSessionId='online-'+roomId;
const trainingStep=training.steps.find(step=>step.name.startsWith('second same-owner native client naturally resumed'));
const trainingId=trainingStep.sessionId;
const original=duel.steps[0],ownerA=original.a.actor.ownerAccountId,ownerB=original.b.actor.ownerAccountId;
assert.equal(duel.steps.filter(step=>/^real HTTPS round \d+ matches on both clients$/.test(step.name)).length,10);
assert.equal(duel.steps.find(step=>step.name.startsWith('both actual private channels')).pushes.length,2);
assert.equal(trainingStep.rounds,20);assert.equal(trainingStep.reward.experience,5);
assert.equal(device.passed,true);assert.equal(retired.passed,true);
assert.equal(training.priorDuelProof.sha256,phases[0].sha256);assert.equal(device.priorTrainingProof.sha256,phases[1].sha256);
const revoke=device.steps.find(step=>step.name.startsWith('actual device-only revoke'));
assert.equal(revoke.denied.authJwtStillValid,true);assert.equal(revoke.denied.realtime,'CHANNEL_ERROR');assert.ok(revoke.denied.rest.every(value=>value.status===403&&value.message==='LJ_SESSION_REVOKED'));assert.equal(revoke.allowed.realtime,'SUBSCRIBED');assert.equal(revoke.allowed.roomCount,1);

const catalog=json('apps/pc-app/runtime/features/garden/catalog.json'),readbacks=[];
for(const [phaseIndex,phase] of phases.entries())for(const profile of phase.proof.profiles){
  const directory=realpathSync(profile.profilePath),marker=json(join(directory,'.lingjing-live-battle-profile.json'));
  assert.equal(marker.profilePath,directory);assert.equal(marker.runId,phase.proof.runId);assert.equal(marker.simulated,false);
  const db=new DatabaseSync(join(directory,'lingjing.sqlite'),{readOnly:true});db.exec('PRAGMA query_only=ON');
  try {
    const owner=profile.owner,expected=owner===ownerA&&phaseIndex>0?[friendSessionId,trainingId]:[friendSessionId];assert.ok([ownerA,ownerB].includes(owner));
    const rewards=db.prepare('SELECT owner_account_id,session_id,pet_id,action_id,data_json FROM battle_reward_receipts WHERE owner_account_id=? ORDER BY session_id').all(owner).map(row=>({...row,reward:JSON.parse(row.data_json),data_json:undefined}));
    assert.deepEqual(rewards.map(row=>row.session_id).sort(),expected.toSorted());
    const pets=db.prepare('SELECT pet_id,data_json FROM companion_pets WHERE owner_account_id=? ORDER BY pet_id').all(owner).map(row=>{const pet=JSON.parse(row.data_json);assert.equal(pet.ownerAccountId,owner);assert.equal(pet.petId,row.pet_id);return {petId:pet.petId,element:pet.element,growth:pet.growth};});assert.equal(pets.length,1);
    const growth=db.prepare("SELECT action_id,result_json FROM companion_actions WHERE owner_account_id=? AND operation='growth' ORDER BY action_id").all(owner).map(row=>({actionId:row.action_id,reward:JSON.parse(row.result_json).data.battleReward}));assert.equal(growth.length,expected.length);assert.deepEqual(growth.map(row=>row.actionId).sort(),rewards.map(row=>row.action_id).sort());assert.ok(rewards.every(row=>row.pet_id===pets[0].petId));assert.equal(pets[0].growth.experience,growth.reduce((total,row)=>total+row.reward.experience,0));
    const reports=db.prepare('SELECT id,session_id,data_json FROM battle_reports_v2 WHERE owner_account_id=? ORDER BY session_id').all(owner).map(row=>{const report=JSON.parse(row.data_json);assert.equal(report.status,'finished');assert.equal(report.reward.applied,true);assert.equal(report.historyComplete,true);assert.equal(report.rounds.length,row.session_id===friendSessionId?10:20);return {id:row.id,sessionId:row.session_id,rounds:report.rounds.length,reward:report.reward};});assert.deepEqual(reports.map(row=>row.sessionId).sort(),expected.toSorted());
    const seeds=db.prepare('SELECT source,receipt_id,action_id,result_json FROM garden_reward_receipts WHERE owner_account_id=? ORDER BY receipt_id').all(owner).map(row=>({...row,result:JSON.parse(row.result_json),result_json:undefined}));assert.equal(seeds.length,expected.length);assert.deepEqual(seeds.map(row=>row.receipt_id).sort(),expected.map(id=>id.replace(/^online-/, '')).sort());assert.ok(seeds.every(row=>row.source==='battle'&&row.result.quantity===2));
    const items=db.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=? ORDER BY item_id').all(owner);
    const expectedStock=Object.fromEntries(Object.values(catalog.CROPS).map(crop=>[crop.seedItemId,catalog.STARTER_SEEDS]));for(const row of seeds)expectedStock[row.result.itemId]=(expectedStock[row.result.itemId]||0)+row.result.quantity;
    assert.deepEqual(Object.fromEntries(items.map(row=>[row.item_id,row.quantity])),expectedStock,'Inventory must equal starter stock plus one reward per actual battle; retries cannot add more');
    readbacks.push({phase:phase.name,profile:profile.index,owner,pet:pets[0],rewards,growth,reports,seeds,items,queryOnly:true,markerRunId:marker.runId});
  } finally {db.close();}
}
writeFileSync(join(target,'sqlite-readback.json'),JSON.stringify({at:new Date().toISOString(),provenance:'actual-marked-native-QA-SQLite-read-only',assertions:'exact owned pet, original action IDs, one XP/seed/report receipt per actual finished battle; inventory equals starter stock plus unique rewards; 10 friend and20 training rounds persisted',readbacks,passed:true},null,2));
const pictures=[
  [0,'accepted-waiting.png'],[0,'pending-before-native-restart.png'],
  [1,'finished-host.png'],[1,'report-1.png'],[1,'report-2.png'],
  [1,'training-recovered-on-second-device.png'],[1,'cloud-training-finished.png'],
  [3,'after-retirement-completed-battle.png']
];
const files=[];for(const [index,name] of pictures){const file=resolve('artifacts/battle',sources[index][1],name);copyFileSync(file,join(target,name));files.push({name,sha256:sha(file)});}
copyFileSync('artifacts/battle/cloud-deployed-metadata.json',join(target,'cloud-deployed-metadata.json'));
copyFileSync('artifacts/battle/postgres-evidence.json',join(target,'modern-postgres.json'));
copyFileSync('artifacts/battle/retired-transport-tests.log',join(target,'transport-tests.txt'));
copyFileSync('artifacts/battle/retired-native-tests.log',join(target,'native-tests.txt'));
const core=JSON.parse(readFileSync('artifacts/battle/retired-shared-core.log','utf8').trim().split(/\r?\n/).at(-1));assert.equal(core.passed,true);writeFileSync(join(target,'core-regression.json'),JSON.stringify(core,null,2));
const manifest={at:new Date().toISOString(),acceptanceChainComplete:true,singleUninterruptedRunPassed:false,projectRef:'jbvrdmrkwpznbrvteive',deployedBattleVersion:2,physicalMachines:1,independentOpponentProcesses:2,friendRounds:10,trainingRounds:20,trainingWinner:'enemy',ownerAExperience:25,ownerBExperience:5,seedsPerCompletedBattle:2,rawFailedRunsPreserved:true,noAdminSeeding:true,noDeploymentByThisChat:true,sourceAfterRetirement:retired.sourceCommit,phases:phases.map(({proof,...value})=>value),pictures:files,checks:{nativeCases:18,transportAndIntentCases:12,modernPostgresChecks:15,frozenCoreCases:1200,frozenCoreRounds:7162},limits:['One Windows host; two physical devices were not tested','Duel and training original runs keep failed status at later UI/script blockers. Their completed scopes and exact hashes are linked to subsequent stage proofs. No prior failed run was relabeled as passed.','Coordinator owns pending08 hydration/fingerprint integration, final product acceptance, old Edge/SQL retirement and deployment.']};
writeFileSync(join(target,'evidence.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({acceptanceChainComplete:true,singleUninterruptedRunPassed:false,profilesChecked:readbacks.length,pictures:files.length,friendRounds:10,trainingRounds:20,output:target}));
