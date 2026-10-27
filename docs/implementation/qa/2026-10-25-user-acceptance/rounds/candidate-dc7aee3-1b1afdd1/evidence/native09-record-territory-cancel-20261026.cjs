const fs = require('node:fs'), path = require('node:path');
const qa = require(path.resolve(__dirname, '../../../manage-qa.cjs'));
const prefix = 'rounds/candidate-dc7aee3-1b1afdd1/evidence/';
const before = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-flow-territory-prechallenge-20261026.json')));
const after = JSON.parse(fs.readFileSync(path.join(__dirname, 'local-flow-territory-cancel-reentry-stuck-20261026.json')));
const battle = after.tables.battle_sessions.find(r => r.id === 'battle-c6ef8b49-98c2-4cbe-86e3-338ad297a097');
const challenge = after.tables.garden_territory_challenges[0];
const proof = {
  at: new Date().toISOString(), sourceCommit: 'dc7aee379d0fb241e5c4bd4bf43101fa1a85a678',
  nativeActions: ['visible simulated location refresh', 'original owned second fox challenge', 'round0 leave then confirm', 'return to territory', 'continue once into same abandoned session'],
  provenance: 'original LocalA path-bound unified-battle; simulated local location/territory, not live cloud',
  readOnlyComparison: true, battle, challenge,
  territoryAttempts: after.tables.garden_territory_attempts,
  territoryRecords: after.tables.garden_territory_records,
  garrisons: after.tables.garden_garrisons,
  unchangedTables: Object.keys(before.digests).filter(t => before.digests[t].sha256 === after.digests[t].sha256),
  changedTables: Object.keys(before.digests).filter(t => before.digests[t].sha256 !== after.digests[t].sha256),
  originalBattleSelectionRestoredThroughNormalChallenge: true,
  observations: ['1 legitimate daily attempt consumed', 'no occupation/garrison/new capture or reward', 'abandoned challenge stays unsettled and native UI has no result confirmation', 'remaining daily attempt cannot be started for the only available territory'],
  firstStaleRejection: {locationScreenshotUtc:'2026-10-26T07:38:25.538Z', errorScreenshotUtc:'2026-10-26T07:39:03.454Z', elapsedSeconds:37.916, message:'菜园暂时不可用，请稍后重试', inference:'timing exceeds 30s TTL; subsequent freshly located native challenge succeeds. Exact rejected response code not captured.'},
};
fs.writeFileSync(path.join(__dirname, 'g04-territory-cancel-native-readback-20261026.json'), JSON.stringify(proof,null,2)+'\n', {flag:'wx'});
const state = qa.read('issues.json');
if(state.issues.some(r=>r.id==='QA-026')) throw Error('QA-026 already exists; do not overwrite');
state.issues.push({
  id:'QA-026', title:'领地战确认离开后仍挂未结算挑战，原生入口无法恢复',
  owner:'Root review (original 05 territory / 04 battle UI domains)', verifier:'09',
  severity:'P1-release-blocker', blocking:true, status:'open', associatedCases:['G04','G03','G02','C08'],
  sourceCommit:proof.sourceCommit, exeSha256:'90e52d4947d506303bd5741d9e901f1e92b3fa2c948847966c956088724f855d', runId:'1b1afdd1-3d03-4ac6-a193-892533d3c587',
  reproducibleSteps:proof.nativeActions,
  expected:'离开后可通过正常界面确认非胜利结果并恢复可用入口；不占领、不发胜利奖励、不重复扣次。',
  actual:'round0正常离开得到abandoned，但garden_territory_challenges settled=0；领地页仅继续挑战，再入同一已结束局且无确认结果按钮。领地仍owner=null/rev1，剩余1次无法开始；驻守正向被阻断。',
  rootCause:'源码线索：BattleScreen settlement限定finished；TerritoryPanel把abandoned显示继续；snapshot列出所有settled=0。仅为当前代码线索，最终修复由Root审查。',
  evidence:['g04-territory-cancel-native-readback-20261026.json','local-flow-territory-cancel-reentry-stuck-20261026.json','g04-native-territory-leave-confirm-dialog-20261026.png','g04-native-territory-abandoned-confirmed-20261026.png','g04-native-territory-return-after-abandon-20261026.png','g04-native-continue-abandoned-territory-stays-ended-20261026.png'].map(f=>prefix+f),
  rootDecision:'09已报Root确认等级与修复负责；不写DB、不重置次数、不替换原战斗ID。', nativeFixVerified:false, productCandidateUnchanged:true, updatedAt:new Date().toISOString()
});
qa.write('issues.json',state);
qa.updateCase('G01','passed','同一DC7原生领地页加载实际OSM底图；普通缩小/滚轮/平移呈现地理矩形边界，列表与右侧同一未占领演练领地一致；每次2次、选择原有第二狐后地图操作不串宠。可见QA定位入口明确演练来源，不作真实GPS或云权威结论。', ['g01-native-original-localA-garden-territory-entry-20261026.png','g01-native-map-minus-shows-territory-boundary-20261026.png','g01-native-map-pan-preserves-selected-territory-20261026.png','local-flow-territory-prechallenge-20261026.json'].map(f=>prefix+f));
qa.updateCase('G04','failed','QA-026：普通round0离开并确认，未占领/未发胜利奖励正确；但取消后挑战settled=0，领地页仅继续同一abandoned战斗且缺确认结果，剩余1次无法开始。自然失败/他人占领冲突分支未执行。', state.issues.at(-1).evidence);
qa.updateCase('G03','pending','已正常进入原演练领地挑战；QA-026取消后入口被未结算abandoned局占住，无法继续正向自然胜利占领。保留原ID/次数，待新候选正常恢复后补验。',[prefix+'g04-territory-cancel-native-readback-20261026.json']);
qa.updateCase('G02','pending','当前领地仍未占领，QA-026挡住正向占领，因此真实驻守/换宠尚未可执行。未用DB或fixture制造owned领地。',[prefix+'g04-territory-cancel-native-readback-20261026.json']);
const active = qa.read('active-session.json');
active.native09TerritoryCancelCheckpoint = {at:proof.at,battleId:battle.id,challengeSettled:false,remainingAttempts:1,territoryOwned:false,battleSelectionRestored:'pet-0cb7dabe-58d2-450e-ab0c-4e39bcffbaca',issue:'QA-026',evidence:prefix+'g04-territory-cancel-native-readback-20261026.json'};
qa.write('active-session.json', active);
console.log(JSON.stringify({QA026:'recorded',G01:'passed',G04:'failed',G03:'pending',G02:'pending',counts:qa.read('cases.json').cases.reduce((s,r)=>(s[r.status]=(s[r.status]||0)+1,s),{})}));
