import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const source=resolve(process.env.GARDEN_UNIFIED_OUTPUT||'artifacts/garden/unified-battle-v2');
const output=resolve('docs/implementation/evidence/garden/unified-battle');
const proof=JSON.parse(readFileSync(join(source,'evidence.json'),'utf8'));
assert.equal(proof.passed,true);assert.equal(proof.profileGate,'namespaced-v2');assert.deepEqual(proof.errors,[]);
assert.equal(proof.verificationSource.dirty,'','Commit the tested source before accepting final QA evidence');
assert.equal(proof.visual.actorsActuallyReady,true);assert.equal(proof.ordinaryProfile.noScenario,true);assert.equal(proof.ordinaryProfile.qaPresetDisabled,true);
for(const [path,hash]of Object.entries(proof.verificationSource.hashes))assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),hash,`Source/build changed since verification: ${path}`);
const scenes={};
for(const label of ['win','loss']){
  const scene=proof.scenarios[label];assert.ok(scene.completed&&scene.exactRestartAndReplay&&scene.restartRecovered&&scene.confirmedResultUi&&scene.confirmedActorsReady);
  assert.equal(scene.nonTargetPetsUnchanged,true);
  assert.ok(scene.owner.startsWith(`qa:${scene.runId}:`));assert.equal(scene.session.mode,'territory');assert.equal(scene.session.winner,label==='win'?'player':'enemy');assert.equal(scene.session.context.authority,'simulated');
  const db=new DatabaseSync(join(scene.profilePath,'lingjing.sqlite'),{readOnly:true});
  try{
    const challenge=db.prepare('SELECT * FROM garden_territory_challenges WHERE owner_account_id=? AND battle_id=?').get(scene.owner,scene.sessionId);assert.equal(challenge.settled,1);
    const territory=db.prepare('SELECT owner_account_id,revision,data_json FROM garden_territory_records WHERE territory_id=?').get(scene.territoryId);
    assert.equal(JSON.parse(territory.data_json).provenance,'simulated-geographic');assert.equal(territory.owner_account_id,label==='win'?scene.owner:null);
    const rewards=db.prepare('SELECT * FROM garden_reward_receipts WHERE owner_account_id=? AND source=? AND receipt_id=?').all(scene.owner,'battle',scene.sessionId);assert.equal(rewards.length,1);
    const rewardEvents=db.prepare('SELECT item_id,delta,balance,kind FROM garden_events WHERE owner_account_id=? AND action_id=?').all(scene.owner,rewards[0].action_id);assert.equal(rewardEvents.reduce((sum,row)=>sum+row.delta,0),2);
    const confirmed=db.prepare('SELECT action_id,kind,request_hash,result_json FROM garden_actions WHERE owner_account_id=? AND action_id=?').get(scene.owner,scene.confirmInput.actionId);assert.equal(confirmed.kind,'territorySettle');
    const inventory=db.prepare('SELECT item_id,quantity FROM garden_items WHERE owner_account_id=? ORDER BY item_id').all(scene.owner);assert.ok(inventory.every(item=>item.quantity>=0));assert.ok(scene.after.data.items.every(item=>(inventory.find(row=>row.item_id===item.id)?.quantity||0)===item.quantity));
    const crop=db.prepare('SELECT * FROM garden_plots WHERE owner_account_id=? AND plot_id=?').get(scene.owner,'plot-1');assert.equal(crop.planted_at,scene.personalCrop.plantedAt);assert.equal(crop.matures_at,scene.personalCrop.maturesAt);
    const stored=JSON.parse(db.prepare('SELECT data_json FROM battle_sessions WHERE owner_account_id=? AND id=?').get(scene.owner,scene.sessionId).data_json);assert.equal(stored.winner,scene.session.winner);assert.deepEqual(stored.snapshot,scene.session.snapshot);
    scenes[label]={runId:scene.runId,ownerAccountId:scene.owner,provenance:'simulated',simulated:{location:true,prestate:scene.preset,enemyChoice:true},actualEngine:true,session:scene.session,actorIdentities:scene.actorIdentities,animation:scene.animation,midBattleRestartRecovered:true,explicitQaLogin:true,territory:{ownerAccountId:territory.owner_account_id,revision:territory.revision,result:JSON.parse(challenge.result_json)},seedReceipt:rewards[0],rewardEvents,confirmation:confirmed,inventory,crop,exactRestartAndReplay:true,confirmedResultUi:true,garrisonNoGrowthOrSelectionChange:scene.garrisonNoGrowthOrSelectionChange||false};
  }finally{db.close();}
}
const evidence={capturedAt:new Date().toISOString(),scope:'unified-battle-goal U01/U04/U05/U06/U07; garden territory integration',source:proof.verificationSource,readbackCaptureSource:proof.readbackCaptureSource,runtime:proof.runtime,mode:proof.mode,cloudAcceptance:false,physicalGpsAcceptance:false,visual:proof.visual,ordinaryProfile:proof.ordinaryProfile,checks:proof.checks,scenes,mainIndependentReview:'pending'};
mkdirSync(output,{recursive:true});
for(const name of ['A04-1280x844-inventory.png','A04-1440x900-inventory.png','territory-entry-ready.png','win-shared-result.png','loss-shared-result.png','win-confirmed-territory.png','loss-confirmed-territory.png','win-confirmed-battle.png','loss-confirmed-battle.png'])copyFileSync(join(source,name),join(output,name));
writeFileSync(join(output,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
writeFileSync(join(output,'README.md'),`本轮领地模块自验使用源码 ${evidence.source.sha}、Electron ${evidence.runtime.electron}。主会话独立复验仍待完成。\n\n模拟内容：独立 QA 档案中的定位、公开 qaPreset 前态及对手选招。实际按钮、共享 BattleScreen/控制器、原战斗内核、种子和领地事务、驻守、显式重新登录后的重启恢复均走产品服务。不是实时云端或物理 GPS 验收。\n\n胜/负均从领地入口进入确切 sessionId，经页面返回和重启恢复、公共结果按钮确认；之后原请求重放，库存、归属、驻守和伙伴保持一致。胜利的驻守不改变成长或独立选择，失败不提供驻守。每场种子回执各一份。\n\n[完整状态、回执、前态、动作阶段和源码哈希](verification.json)\n\n- [胜利结果](win-shared-result.png)\n- [失败结果](loss-shared-result.png)\n- [确认后重启：胜利](win-confirmed-battle.png)\n- [确认后重启：失败](loss-confirmed-battle.png)\n- [1280×844 背包卡片](A04-1280x844-inventory.png)\n- [1440×900 背包卡片](A04-1440x900-inventory.png)\n\n旧的正式生长和 59m 物理定位证明保留在上一级目录，属于此前版本，不代替本轮统一战场复验。QA 登录凭据只留在 ignored 的本机测试目录，未复制到本证据。\n`);
console.log(JSON.stringify({output,sourceSha:evidence.source.sha,scenarios:Object.keys(scenes),mainReview:'pending'}));
