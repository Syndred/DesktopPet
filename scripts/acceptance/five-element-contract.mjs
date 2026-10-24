import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const source = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const core = createRequire(join(source, 'package.json'))('./apps/pc-app/runtime/services/battle-runtime.cjs');
mkdirSync(output, { recursive: true });
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), mode: 'controlled-domain-fixtures; actual public runtime engine, not live cloud or UI acceptance', engine: 'apps/pc-app/runtime/services/battle-runtime.cjs', rules: core.getBattleRules(), matrix: [], properties: [], failures: [] };
proof.engineSha256 = createHash('sha256').update(readFileSync(join(source, proof.engine))).digest('hex');
proof.engineWorkingTree = execFileSync('git', ['status', '--porcelain', '--', proof.engine], { cwd: source, encoding: 'utf8' }).trim();
const elements = ['metal', 'wood', 'earth', 'water', 'fire'];
// Independent acceptance contract for the existing product rule, not values
// obtained by calling the engine's multiplier helper under test.
const beats = { metal: 'wood', wood: 'earth', earth: 'water', water: 'fire', fire: 'metal' };
const baseDamage = { normal_attack: 10, element_attack: 12, ultimate: 20 };
const record = (id, run) => { try { proof.properties.push({ id, passed: true, details: run() }); } catch (error) { proof.properties.push({ id, passed: false, error: String(error) }); proof.failures.push(id); } };
for (const attacker of elements) for (const defender of elements) {
  const factor = beats[attacker] === defender ? 1.2 : beats[defender] === attacker ? 0.8 : 1;
  const row = { attacker, defender, expectedFactor: factor, actions: [] };
  for (const action of Object.keys(baseDamage)) {
    const session = core.createSession(attacker, defender);
    if (action === 'ultimate') session.player.anger = 50;
    const result = core.executeRound(session, action, action === 'normal_attack' ? 'element_attack' : 'dodge');
    const expected = Math.round(baseDamage[action] * factor), actual = result.directDamage.enemy;
    row.actions.push({ action, expected, actual, passed: actual === expected });
    if (actual !== expected) proof.failures.push(`${attacker}/${defender}/${action}`);
  }
  proof.matrix.push(row);
}
record('fire-current-hp-burn-and-stack', () => {
  const s = core.createSession('fire', 'metal');
  const first = core.executeRound(s, 'element_attack', 'dodge');
  assert.equal(first.directDamage.enemy, 14); assert.equal(first.dotDamageEvents.enemy[0].amount, 8); assert.equal(s.enemy.hp, 98);
  const second = core.executeRound(s, 'element_attack', 'dodge');
  assert.equal(second.directDamage.enemy, 14); assert.equal(second.dotDamageEvents.enemy[0].amount, 13); assert.equal(s.enemy.hp, 71);
  assert.equal(s.enemy.statuses.find(x => x.type === 'burn').stacks, 2);
  return { first, second };
});
record('wood-parasite-drains-and-heals-source', () => {
  const s = core.createSession('wood', 'metal'); s.player.hp = 80;
  const r = core.executeRound(s, 'element_attack', 'dodge');
  assert.equal(r.directDamage.enemy, 10); assert.equal(r.dotDamageEvents.enemy[0].amount, 2); assert.equal(r.healEvents.player[0].amount, 2);
  assert.equal(s.player.hp, 82); assert.equal(s.enemy.hp, 108);
  return r;
});
record('metal-vulnerability-multiplies-subsequent-damage', () => {
  const s = core.createSession('metal', 'wood');
  const first = core.executeRound(s, 'element_attack', 'dodge');
  const second = core.executeRound(s, 'element_attack', 'dodge');
  assert.equal(first.directDamage.enemy, 14); assert.equal(second.directDamage.enemy, 22);
  assert.equal(s.enemy.statuses.find(x => x.type === 'vulnerability').stacks, 2);
  return { firstDamage: first.directDamage.enemy, secondDamage: second.directDamage.enemy, statuses: s.enemy.statuses };
});
record('earth-petrify-halves-target-output', () => {
  const s = core.createSession('earth', 'water'); core.executeRound(s, 'element_attack', 'dodge');
  const r = core.executeRound(s, 'dodge', 'element_attack');
  assert.equal(r.directDamage.player, 5); assert.equal(s.enemy.statuses.find(x => x.type === 'petrify').stacks, 1);
  return r;
});
record('water-halves-rage-and-prevents-hurt-rage', () => {
  const s = core.createSession('water', 'fire'); s.enemy.anger = 80;
  const r = core.executeRound(s, 'element_attack', 'ultimate');
  assert.equal(s.enemy.anger, 15); // (80 - valid ultimate cost 50) / 2; no hurt gain.
  assert.equal(s.enemy.statuses.some(x => x.type === 'freeze' || x.type === 'stun'), false);
  return r;
});
record('normal-interrupts-element-attack', () => {
  const s = core.createSession('water', 'fire'); const r = core.executeRound(s, 'normal_attack', 'element_attack');
  assert.equal(r.directDamage.player, 0); assert.equal(r.directDamage.enemy, 12); assert.equal(s.player.statuses.length, 0);
  return r;
});
record('first-dodge-avoids-normal-and-refunds-thirty', () => {
  const s = core.createSession('water', 'fire'); const r = core.executeRound(s, 'dodge', 'normal_attack');
  assert.equal(s.player.hp, 120); assert.equal(s.player.anger, 30); assert.equal(s.player.freeDodgeUsed, true);
  return r;
});
record('ultimate-hits-dodge-costs-fifty-and-heals-twenty', () => {
  const s = core.createSession('water', 'wood'); s.player.hp = 70; s.player.anger = 50;
  const r = core.executeRound(s, 'ultimate', 'dodge');
  assert.equal(r.actions.player, 'ultimate'); assert.equal(r.directDamage.enemy, 20); assert.equal(s.player.anger, 0); assert.equal(s.player.hp, 90);
  return r;
});
record('status-duration-expires-without-reapplication', () => {
  const s = core.createSession('wood', 'earth'); core.executeRound(s, 'element_attack', 'dodge');
  assert.equal(s.enemy.statuses.find(x => x.type === 'parasite').duration, 2);
  core.executeRound(s, 'dodge', 'dodge'); core.executeRound(s, 'dodge', 'dodge');
  assert.equal(s.enemy.statuses.some(x => x.type === 'parasite'), false);
  return { round: s.round, statuses: s.enemy.statuses };
});
proof.matrixCases = proof.matrix.reduce((n, x) => n + x.actions.length, 0);
proof.passed = proof.failures.length === 0;
writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
console.log(JSON.stringify({ matrixCases: proof.matrixCases, propertyCases: proof.properties.length, failures: proof.failures, evidence: join(output, 'evidence.json') }, null, 2));
assert.equal(proof.passed, true, 'Five-element acceptance contract failed');
