import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createSession, executeRound, getElementMultiplier, getBattleRules } = require('../../services/battle-runtime.cjs');
const { visualEvents } = require('./presentation.cjs');
const output = resolve(process.argv[2] || `artifacts/battle/unified-rules-${Date.now()}`);
mkdirSync(output, { recursive: true });
const chain = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
const matrix = [], interactions = [], errors = [];
const check = (name, body) => { try { return body(); } catch (error) { errors.push({ name, message: error.message }); } };
for (const player of Object.keys(chain)) for (const enemy of Object.keys(chain)) {
  const multiplier = chain[player] === enemy ? 1.2 : chain[enemy] === player ? .8 : 1;
  check(`${player}/${enemy}/multiplier`, () => assert.equal(getElementMultiplier(player, enemy), multiplier));
  const cases = [];
  for (const [action, base] of [['normal_attack', 10], ['element_attack', 12], ['ultimate', 20]]) {
    const session = createSession(player, enemy); session.player.hp = 100; session.player.anger = 50; session.enemy.anger = 80;
    const before = structuredClone(session), result = executeRound(session, action, action === 'normal_attack' ? 'normal_attack' : 'dodge');
    check(`${player}/${enemy}/${action}`, () => assert.equal(result.directDamage.enemy, Math.round(base * multiplier)));
    cases.push({ action, expectedDirectDamage: Math.round(base * multiplier), before, result, after: session, events: visualEvents({ ...result, state: session }, before) });
  }
  matrix.push({ player, enemy, multiplier, cases });
}
function interaction(name, player, enemy, before, actions, assertions) {
  check(name, () => {
    const session = createSession(player, enemy); before(session);
    const initial = structuredClone(session), rounds = actions.map(pair => executeRound(session, ...pair));
    const events = rounds.map(result => visualEvents({ ...result }, initial));
    assertions(session, rounds, events); interactions.push({ name, initial, actions, rounds, final: session, events });
  });
}
interaction('fire-current-HP-burn-and-stacks', 'fire', 'metal', () => {}, [['element_attack', 'dodge'], ['element_attack', 'dodge']], (s, r) => {
  assert.equal(r[0].directDamage.enemy, 14); assert.equal(r[0].dotDamageEvents.enemy[0].amount, 8);
  assert.equal(r[1].dotDamageEvents.enemy[0].amount, 13); assert.equal(s.enemy.statuses[0].stacks, 2);
});
interaction('wood-drains-and-heals-source', 'wood', 'metal', s => { s.player.hp = 80; }, [['element_attack', 'dodge']], (s, r) => {
  assert.equal(r[0].dotDamageEvents.enemy[0].amount, 2); assert.equal(r[0].healEvents.player[0].amount, 2); assert.equal(s.player.hp, 82);
});
interaction('metal-vulnerability-multiplies-next-damage', 'metal', 'water', () => {}, [['element_attack', 'dodge'], ['normal_attack', 'normal_attack']], (_s, r) => assert.equal(r[1].directDamage.enemy, 15));
interaction('earth-reduces-target-output', 'earth', 'metal', () => {}, [['element_attack', 'dodge'], ['normal_attack', 'normal_attack']], (_s, r) => assert.equal(r[1].directDamage.player, 5));
interaction('water-instant-anger-no-freeze-no-skip', 'water', 'wood', s => { s.enemy.anger = 80; }, [['element_attack', 'element_attack']], (s, r, events) => {
  assert.equal(s.enemy.anger, 40); assert.equal(r[0].directDamage.player, 12); assert.equal(s.enemy.statuses.some(status => status.type === 'freeze'), false);
  assert.equal(events[0].some(event => event.kind === 'anger' && event.side === 'enemy'), true); assert.equal(events[0].some(event => event.status === 'freeze'), false);
});
interaction('normal-interrupt-is-not-dodge', 'metal', 'water', () => {}, [['normal_attack', 'element_attack']], (_s, r, events) => {
  assert.equal(r[0].directDamage.player, 0); assert.equal(events[0].some(event => event.kind === 'interrupt' && event.side === 'enemy'), true); assert.equal(events[0].some(event => event.kind === 'dodge'), false);
});
interaction('successful-dodge-refunds-30', 'metal', 'water', () => {}, [['dodge', 'normal_attack']], (s, _r, events) => {
  assert.equal(s.player.anger, 30); assert.equal(s.player.hp, 120); assert.equal(events[0].some(event => event.kind === 'dodge' && event.side === 'player'), true);
});
interaction('ultimate-hits-dodge-spends-50-heals-20', 'metal', 'water', s => { s.player.hp = 70; s.player.anger = 50; }, [['ultimate', 'dodge']], (s, r, events) => {
  assert.equal(r[0].directDamage.enemy, 20); assert.equal(s.player.anger, 0); assert.equal(s.player.hp, 90); assert.equal(events[0].some(event => event.kind === 'dodge'), false);
});
interaction('three-turn-status-expires', 'fire', 'metal', s => { s.enemy.anger = 100; }, [['element_attack', 'dodge'], ['dodge', 'dodge'], ['dodge', 'dodge']], (s, r) => {
  assert.equal(r[0].statusesAfter.enemy[0].duration, 2); assert.equal(s.enemy.statuses.length, 0);
});
const files = ['apps/pc-app/runtime/services/battle-runtime.cjs', 'apps/pc-app/runtime/features/battle/presentation.cjs'];
const evidence = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), authority: 'runtime/services/battle-runtime.cjs', transport: 'in-process-rule-verification', rules: getBattleRules(), orderedPairs: matrix.length, damageCases: matrix.reduce((sum, pair) => sum + pair.cases.length, 0), interactionCases: interactions.length,
  sourceHashes: files.map(file => ({ file, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') })), matrix, interactions, errors };
writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ output, orderedPairs: evidence.orderedPairs, damageCases: evidence.damageCases, interactionCases: evidence.interactionCases, errors }));
if (errors.length) process.exitCode = 1;
