const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const qa = require(path.resolve(__dirname, '../../../manage-qa.cjs'));
const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8').replace(/^\uFEFF/, ''));
const freeze = read('../candidate-freeze.json');
const before = read('local-flow-after-inventory-settings-reward-native-retests-20261026.json');
const rejected = read('local-flow-qa025-natural-win-stale-capture-rejected-20261026.json');
const captured = read('local-flow-qa025-riceball-captured-once-20261026.json');
const reentry = read('local-flow-qa025-after-pokedex-reentry-20261026.json');
const final = read('local-flow-qa025-final-original-selection-restored-20261026.json');
const encounterId = 'encounter-b59f63f6-be49-497f-8f56-6836c4fb8505';
const battleId = 'battle-d8c66d8b-6ec2-4649-a262-367197af214d';
const petId = 'pet-fe04dd7e-78f7-4648-8ce2-8e3b2901468a';
const actingPetId = 'pet-8d67a86f-8053-46fe-93e2-df62ca116a45';
const parse = row => JSON.parse(row.data_json);
assert.equal(before.tables.companion_pets.length, 6);
assert.equal(rejected.tables.companion_pets.length, 6);
assert.equal(rejected.tables.discovery_captures.length, 1);
assert.equal(rejected.tables.discovery_encounters.find(r => r.encounter_id === encounterId).status, 'won');
assert.equal(final.tables.companion_pets.length, 7);
assert.equal(final.tables.discovery_captures.length, 2);
for (const table of Object.keys(captured.digests)) assert.deepEqual(captured.digests[table], reentry.digests[table], 'Repeated visible reads changed ' + table);
for (const table of Object.keys(reentry.digests).filter(t => !['companion_accounts','companion_actions'].includes(t))) assert.deepEqual(reentry.digests[table], final.digests[table], 'Selection restoration changed ' + table);
for(const row of reentry.tables.companion_actions) assert.deepEqual(row,final.tables.companion_actions.find(r=>r.action_id===row.action_id));
const selectionActions=final.tables.companion_actions.filter(r=>!reentry.tables.companion_actions.some(old=>old.action_id===r.action_id));
assert.equal(selectionActions.length,1); assert.equal(selectionActions[0].operation,'select');
assert.equal(JSON.parse(selectionActions[0].result_json).data.pet.petId,'pet-0cb7dabe-58d2-450e-ab0c-4e39bcffbaca');
assert.deepEqual(before.tables.account_settings, final.tables.account_settings);
for (const row of rejected.tables.companion_pets) assert.deepEqual(row, final.tables.companion_pets.find(r => r.pet_id === row.pet_id), 'Existing pet changed after rejected capture');
for (const row of before.tables.companion_pets.filter(r => r.pet_id !== actingPetId)) assert.deepEqual(row, final.tables.companion_pets.find(r => r.pet_id === row.pet_id), 'Nonacting original pet changed');
assert.deepEqual(before.tables.discovery_captures[0], final.tables.discovery_captures[0]);
const capture = final.tables.discovery_captures.filter(r => r.encounter_id === encounterId);
assert.equal(capture.length, 1); assert.equal(capture[0].pet_id, petId);
const companionReceipts=final.tables.companion_capture_receipts.filter(r => r.battle_id===battleId && r.pet_id===petId);
assert.equal(companionReceipts.length,1);
const newPet = parse(final.tables.companion_pets.find(r => r.pet_id === petId));
assert.equal(newPet.templateId, 'big-fish-foodie'); assert.equal(newPet.resource.resourceId, 'builtin:lingjing-fantuan-v1');
assert.equal(newPet.resource.kind, '2d');
assert.ok(final.tables.companion_pets.every(r => parse(r).desktop.visible === false));
assert.deepEqual(JSON.parse(final.tables.companion_accounts[0].selections_json), {chatPetId:'pet-ea1f0cf6-53c8-4f15-bd01-a8cef01adde3', battlePetId:'pet-0cb7dabe-58d2-450e-ab0c-4e39bcffbaca', guardPetId:null});
const battle = parse(final.tables.battle_sessions.find(r => r.id === battleId));
assert.equal(battle.snapshot.round, 9); assert.equal(battle.winner, 'player');
assert.equal(final.tables.battle_reward_receipts.filter(r => r.session_id === battleId).length, 1);
const proof = {at:new Date().toISOString(), sourceCommit:freeze.sourceCommit, exeSha256:freeze.exe.sha256, asarSha256:freeze.asar.sha256,
  scenario:'Original local unified-battle profile; visible simulated QA location, not physical GPS or cloud identity',
  encounterId,battleId,newPetId:petId,rounds:9,won:true,
  stalePositionRejected:{petCount:6,captureCount:1,visibleModalError:'位置已过期，请重新定位',returnExplorationButton:true,noAutomaticRetry:true},
  normalRecovery:'Visible location refresh, same won battle, one explicit confirmation with default 饭团 name',
  final:{petCount:7,captureCount:2,uniqueNewPet:true,uniqueCaptureReceipt:true,uniqueBattleReward:true,templateId:newPet.templateId,resource:newPet.resource,desktopEnabled:0},
  repeatedResultDetailMemoryAndPokedexAll28DigestsExact:true,originalFiveNonactingPetsRawExact:true,originalCaptureRawExact:true,
  rejectedToSuccessOriginalSixPetsRawExact:true,settingsExact:true,originalSelectionsRestored:true,selectionRestoreOnlyNewAction:selectionActions[0].action_id,
  verificationAudit:'Strict checks stopped before proof/ledger writes while adapting ordinary select action receipt and companion_capture_receipts battle_id/pet_id join. Final checks use actual schema; one selection action and all prior rows verified.',
  rootIndependent:'artifacts/qa/user-acceptance/global-serial/root-resume-20261026/bb650b83-9ced-41f1-9a3b-be13d5b7d8e0/c7ad-qa025-capture-independent.json'};
fs.writeFileSync(path.join(__dirname,'qa025-c7ad-native-capture-verified-20261026.json'), JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
const prefix='rounds/candidate-c7ad6837-1b1afdd1/evidence/';
const evidence=['qa025-c7ad-native-stale-error-visible-inside-dialog-20261026.png','visible-public-ui-qa025-alert-inside-capture-20261026.json','local-flow-qa025-natural-win-stale-capture-rejected-20261026.json','qa025-c7ad-native-return-exploration-button-outcome-20261026.png','qa025-c7ad-native-recovery-location-refreshed-20261026.png','qa025-c7ad-native-reentered-same-won-battle-20261026.png','qa025-c7ad-native-normal-single-capture-outcome-20261026.png','qa025-c7ad-native-new-riceball-owned-detail-20261026.png','qa025-c7ad-native-riceball-first-meeting-memory-20261026.png','qa025-c7ad-native-same-captured-result-reentered-20261026.png','qa025-c7ad-native-pokedex-both-original-and-new-captures-20261026.png','local-flow-qa025-after-pokedex-reentry-20261026.json','local-flow-qa025-final-original-selection-restored-20261026.json','qa025-c7ad-native-capture-verified-20261026.json'].map(f=>prefix+f);
for(const f of evidence) assert.ok(fs.existsSync(path.join(qa.root,f)), 'Missing evidence '+f);
const state=qa.read('cases.json'),row=state.cases.find(r=>r.id==='M05');
assert.notEqual(row.sourceCommit,freeze.sourceCommit,'Already recorded; do not repeat');
(row.history ||= []).push({roundId:'candidate-dc7aee3-1b1afdd1',sourceCommit:row.sourceCommit,exeSha256:row.exeSha256,runId:row.runId,status:row.status,actual:row.actual,evidence:row.evidence});
Object.assign(row,{sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,verificationRoundId:state.activeRound.id});
qa.write('cases.json',state);
qa.updateCase('M05','passed','c7ad原LocalA明确模拟QA位置，正常饭团88m相遇，原青芽9回合自然胜利。自然30秒位置过期的首次确认被拒，modal内清楚显示位置已过期并提供返回探索（QA025已修复）。正常返回/可见重定位/继续同胜利/确认一次，唯一新增fe04饭团（big-fish-foodie/builtin:lingjing-fantuan-v1/2d），7宠/2capture；详情、首次相遇记忆、同捕捉结果与两卡图鉴重进后28安全表digest全同。旧capture及原5非出战宠raw不变，原6宠从失败到收服全raw不变；settings原样，普通UI恢复chat ea1/battle0cb/guardnull、7宠desktopfalse。Root独立11项回查通过，不冒称真实GPS/cloud编号。',evidence);
qa.updateIssue('QA-025',{status:'verified',nativeFixVerified:true,verifiedSource:freeze.sourceCommit,verifiedExeSha256:freeze.exe.sha256,verifiedAsarSha256:freeze.asar.sha256,verification:'实际c7ad原生收服modal内错误清楚可读，返回探索可用，无自动定位/重试；正常重新定位后同场唯一捕捉成功，详情/记忆/图鉴及原始历史与设置回查闭环。Root独立readOnly SQLite和实际截图核对通过。',verificationEvidence:evidence,productCandidateUnchanged:false});
console.log(JSON.stringify({issue:'QA-025',verified:true,case:'M05',status:'passed',counts:qa.read('cases.json').cases.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})}));
