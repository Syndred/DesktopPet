const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSession, executeRound, getBattleRules } = require('../../../services/battle-runtime.cjs');

const rulesId = 'five-elements-stacked-v3';
function fight(playerAnger, enemyAnger, enemyAction, rule = rulesId) {
  const session = createSession('metal', 'metal');
  session.player.anger = playerAnger;
  session.enemy.anger = enemyAnger;
  return executeRound(session, 'dodge', enemyAction, rule);
}

test('fixed dodge eligibility starts at 10 and a double dodge spends exactly 10 on both sides', () => {
  assert.deepEqual([getBattleRules(rulesId).dodgeMinAnger, getBattleRules(rulesId).dodgeMaxCost, getBattleRules(rulesId).dodgeRefund], [10, 10, 20]);
  for (const anger of [0, 9]) {
    const round = fight(anger, 10, 'dodge');
    assert.equal(round.actions.player, 'normal_attack');
    assert.equal(round.angerAfter.player, anger);
  }
  const round = fight(10, 25, 'dodge');
  assert.deepEqual(round.actions, { player: 'dodge', enemy: 'dodge' });
  assert.deepEqual(round.angerAfter, { player: 0, enemy: 15 });
});

test('dodge repays 20 on normal attack only and clamps to the maximum', () => {
  const success = fight(10, 0, 'normal_attack');
  assert.equal(success.angerAfter.player, 20);
  assert.equal(success.directDamage.player, 0);
  assert.equal(fight(95, 0, 'normal_attack').angerAfter.player, 100);
  const element = fight(10, 0, 'element_attack');
  assert.equal(element.directDamage.player, 12);
  assert.equal(element.angerAfter.player, 6);
  const ultimate = fight(10, 50, 'ultimate');
  assert.equal(ultimate.directDamage.player, 20);
  assert.equal(ultimate.angerAfter.player, 10);
});

test('legacy v1 and v2 keep their free first dodge and original refund', () => {
  for (const rule of ['five-elements-standard-v1', 'five-elements-stacked-v2']) {
    assert.equal(getBattleRules(rule).dodgeMinAnger, undefined);
    const free = fight(0, 0, 'normal_attack', rule);
    assert.equal(free.actions.player, 'dodge');
    assert.equal(free.angerAfter.player, 30);
    assert.equal(fight(20, 20, 'dodge', rule).angerAfter.player, 0);
  }
});
