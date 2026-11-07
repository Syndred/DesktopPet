const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createSession, executeRound, getBattleRules } = require('../../../services/battle-runtime.cjs');

const rulesId = 'five-elements-stacked-v2';
const play = (session, player, enemy) => executeRound(session, player, enemy, rulesId);

test('wood drains five percent of current target life per stack and heals the actual loss', () => {
  const session = createSession('wood', 'earth');
  session.player.hp = 65;
  const first = play(session, 'element_attack', 'dodge');
  assert.equal(first.directDamage.enemy, 14);
  assert.deepEqual(first.dotDamageEvents.enemy, [{ type: 'parasite', amount: 5 }]);
  assert.deepEqual(first.healEvents.player, [{ type: 'parasite', amount: 5 }]);
  assert.equal(first.statusesAfter.enemy[0].duration, 2);

  const second = play(session, 'element_attack', 'dodge');
  assert.equal(second.statusesAfter.enemy[0].stacks, 2);
  assert.deepEqual(second.dotDamageEvents.enemy, [{ type: 'parasite', amount: 9 }]);
  const third = play(session, 'dodge', 'dodge');
  assert.deepEqual(third.healEvents.player, [{ type: 'parasite', amount: 8 }]);

  session.player.hp = 119;
  session.enemy.hp = 1;
  session.enemy.statuses[0].duration = 1;
  const finish = play(session, 'dodge', 'dodge');
  assert.equal(finish.hpAfter.enemy, 0);
  assert.deepEqual(finish.healEvents.player, [{ type: 'parasite', amount: 1 }]);
  assert.deepEqual(finish.statusesAfter.enemy, []);
  assert.equal(finish.winner, 'player');
});

test('water stacks ten percent rage drain each round, including rounds without another water skill', () => {
  const session = createSession('water', 'fire');
  session.enemy.anger = 50;
  const first = play(session, 'element_attack', 'element_attack');
  assert.equal(first.statusesAfter.enemy[0].type, 'dampen');
  assert.equal(first.angerLoss.enemy, 6);
  assert.equal(first.angerAfter.enemy, 51);

  const second = play(session, 'element_attack', 'element_attack');
  assert.equal(second.statusesAfter.enemy[0].stacks, 2);
  assert.equal(second.angerLoss.enemy, 12);
  assert.equal(second.angerAfter.enemy, 46);

  const third = play(session, 'normal_attack', 'normal_attack');
  assert.equal(third.angerLoss.enemy, 10);
  assert.equal(third.angerAfter.enemy, 42);
});

test('metal, earth and fire keep percentage stacking and the five-layer limit', () => {
  const metal = createSession('metal', 'wood');
  play(metal, 'element_attack', 'dodge');
  assert.equal(play(metal, 'element_attack', 'dodge').directDamage.enemy, 22);
  assert.equal(play(metal, 'normal_attack', 'normal_attack').directDamage.enemy, 27);

  const earth = createSession('earth', 'water');
  assert.equal(play(earth, 'element_attack', 'element_attack').directDamage.player, 5);
  assert.equal(play(earth, 'element_attack', 'element_attack').directDamage.player, 2);

  const fire = createSession('fire', 'earth');
  assert.equal(play(fire, 'element_attack', 'dodge').dotDamageEvents.enemy[0].amount, 9);
  assert.equal(play(fire, 'element_attack', 'dodge').dotDamageEvents.enemy[0].amount, 14);
  fire.enemy.hp = 120;
  fire.enemy.statuses[0].stacks = 5;
  fire.enemy.statuses[0].duration = 11;
  fire.enemy.anger = 20;
  const capped = play(fire, 'element_attack', 'dodge');
  assert.equal(capped.statusesAfter.enemy[0].stacks, 5);
  assert.equal(capped.statusesAfter.enemy[0].duration, 11);
  assert.equal(capped.dotDamageEvents.enemy[0].amount, 43);
});

test('the new rule is explicit and the legacy rules still produce the original wood and water effects', () => {
  assert.equal(getBattleRules(rulesId).id, rulesId);
  assert.equal(getBattleRules().id, 'five-elements-standard-v1');
  const wood = createSession('wood', 'earth');
  wood.player.hp = 60;
  assert.deepEqual(executeRound(wood, 'element_attack', 'dodge').healEvents.player, [{ type: 'parasite', amount: 2 }]);
  const water = createSession('water', 'fire');
  water.enemy.anger = 50;
  const result = executeRound(water, 'element_attack', 'element_attack');
  assert.equal(result.angerAfter.enemy, 25);
  assert.deepEqual(result.statusesAfter.enemy, []);
});
