import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { BattleRuntimeService, executeRound, getBattleRules, BATTLE_CORE_VERSION } from '../../../../../infra/supabase/functions/_shared/battle-core.js';
import { resolveRoomRound } from '../../../../../infra/supabase/functions/duel-online/room-core.js';
const require=createRequire(import.meta.url),desktop=require('../../services/battle-runtime.cjs');
const golden=JSON.parse(readFileSync(new URL('./tests/fixtures/core-v1.json',import.meta.url),'utf8'));
assert.deepEqual(getBattleRules(),golden.rules);assert.deepEqual(desktop.getBattleRules(),golden.rules);assert.equal(desktop.BATTLE_CORE_VERSION,BATTLE_CORE_VERSION);
let rounds=0;
for(const value of golden.cases) {
  const engine=new BattleRuntimeService(),native=new desktop.BattleRuntimeService();engine.restore(value.initial);native.restore(value.initial);const outcomes=[];
  for(const actions of value.actions){const result=executeRound(engine.session,...actions),nativeResult=desktop.executeRound(native.session,...actions);assert.deepEqual(nativeResult,result);assert.deepEqual(native.snapshot(),engine.snapshot());outcomes.push({result,state:engine.snapshot()});rounds++;}
  assert.equal(createHash('sha256').update(JSON.stringify(outcomes)).digest('hex'),value.sha256,`${value.player}/${value.enemy}/${value.setup}`);
}
const engine=new BattleRuntimeService(),s=engine.reset({playerElement:'water',enemyElement:'fire'});
const room={rules_version:getBattleRules().id,core_version:BATTLE_CORE_VERSION,last_resolved_round:0,host_element:'water',guest_element:'fire',host_hp:120,guest_hp:120,host_anger:0,guest_anger:0,host_statuses:[],guest_statuses:[],host_free_dodge_used:false,guest_free_dodge_used:false};
const round=resolveRoomRound(room,'normal_attack','normal_attack'),expected=executeRound(s,'normal_attack','normal_attack');assert.equal(round.direct_damage.guest,expected.directDamage.enemy);assert.equal(round.direct_damage.host,expected.directDamage.player);
assert.throws(()=>resolveRoomRound({...room,core_version:'future'},'normal_attack','dodge'),/Unsupported/);
console.log(JSON.stringify({provenance:'deterministic-frozen-regression',baseline:golden.baselineCommit,coreVersion:BATTLE_CORE_VERSION,cases:golden.cases.length,rounds,desktopEdgeEquivalent:true,oldNumericRulesPreserved:true,unknownVersionRejected:true,passed:true}));
