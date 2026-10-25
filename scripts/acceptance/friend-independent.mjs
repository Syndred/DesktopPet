import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
const source = resolve(process.argv[2]), output = resolve(process.argv[3]);
mkdirSync(output, { recursive: true });
const require = createRequire(join(source, 'package.json'));
const { _electron: electron } = require('playwright');
const { startQaDuelServer } = require('./apps/pc-app/runtime/features/battle/tests/qa-duel-server.cjs');
const { MARKER, SCENARIO } = require('./apps/pc-app/runtime/core/qa-scenario.cjs');
const runId = randomUUID(), token = randomBytes(32).toString('hex');
const server = await startQaDuelServer({ runId, token, directory: join(output, 'simulated-authority') });
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), provenance: 'Independent two-process actual Electron flow. Explicit loopback transport fixture and charged state; original engine and player controls. This is simulated cloud, not live Supabase or real two-device evidence.', runId, actors: [], rounds: [], checks: [], errors: [] };
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const check = (id, passed, detail) => { proof.checks.push({ id, passed: Boolean(passed), detail }); save(); assert.ok(passed, id); };
const opened = [];
async function open(label, element) {
  const profilePath = join(output, `qa-${label}`); mkdirSync(profilePath);
  writeFileSync(join(profilePath, MARKER), JSON.stringify({ schemaVersion: 1, application: 'lingjing', scenario: SCENARIO, runId, isolated: true, profilePath, createdAt: new Date().toISOString() }));
  writeFileSync(join(profilePath, 'battle-transport.json'), JSON.stringify({ runId, endpoint: server.endpoint, token }));
  const credentials = { provider: 'local', account: `root_${label}_${Date.now()}`, username: `双端验收${label}`, password: `Qa-${randomUUID()}!`, rememberSession: false };
  const env = { ...process.env, PET_USER_DATA_DIR: profilePath, LINGJING_QA_SCENARIO: SCENARIO }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
  const app = await electron.launch({ args: [source], cwd: source, env }); opened.push(app);
  const page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(`${label}: ${error.message}`));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  await page.waitForFunction(() => Boolean(window.lingjing));
  const invoke = async (feature, command, payload = {}) => { const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload }); assert.equal(result.ok, true, `${label} ${feature}.${command}: ${JSON.stringify(result)}`); return result.data; };
  await invoke('accounts', 'register', { ...credentials, confirmPassword: credentials.password });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const template = (await invoke('companions', 'list')).templates.find(template => template.element === element); assert.ok(template);
  await invoke('companions', 'adopt', { templateId: template.templateId, name: template.name, showOnDesktop: false, actionId: randomUUID() });
  const pet = (await invoke('companions', 'list')).pets[0]; await invoke('battle', 'selectPet', { petId: pet.petId, actionId: randomUUID() });
  await page.evaluate(() => { location.hash = '#/battle/friends'; });
  await page.getByRole('button', { name: '创建房间', exact: true }).waitFor();
  proof.actors.push({ label, profilePath, owner: (await invoke('accounts', 'session')).currentUser.id, pet }); save();
  return { label, page, invoke, pet, credentials, profilePath };
}
let a, b;
async function session(actor) { return actor.invoke('battle', 'snapshot', { sessionId: actor.sessionId }); }
async function settledFrame(actor, round) {
  await actor.page.waitForFunction(round => Number(document.querySelector('.battle-stage')?.getAttribute('data-round')) >= round, round);
  await actor.page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
}
async function pair(first, second) {
  const before = await session(a); await settledFrame(a, before.snapshot.round); await settledFrame(b, before.snapshot.round);
  await a.page.locator(`.battle-move.${first}`).click();
  await b.page.locator(`.battle-move.${second}`).click();
  await Promise.all([settledFrame(a, before.snapshot.round + 1), settledFrame(b, before.snapshot.round + 1)]);
  const sa = await session(a), sb = await session(b);
  check(`mirrored-round-${sa.snapshot.round}`, sa.snapshot.round === sb.snapshot.round && sa.snapshot.player.hp === sb.snapshot.enemy.hp && sa.snapshot.enemy.hp === sb.snapshot.player.hp && sa.snapshot.player.anger === sb.snapshot.enemy.anger && sa.snapshot.enemy.anger === sb.snapshot.player.anger, { a: sa.snapshot, b: sb.snapshot });
  proof.rounds.push({ round: sa.snapshot.round, a: sa.rounds.at(-1), b: sb.rounds.at(-1) }); save(); return [sa, sb];
}
try {
  a = await open('A', 'water'); b = await open('B', 'wood');
  await a.page.getByRole('button', { name: '创建房间', exact: true }).click();
  await a.page.locator('[data-battle-screen="shared-v1"]').waitFor();
  const waiting = (await a.invoke('battle', 'overview')).session; a.sessionId = waiting.id;
  await b.page.getByPlaceholder('输入房间码', { exact: true }).fill(waiting.room.room_code);
  await b.page.getByRole('button', { name: '加入房间', exact: true }).click();
  await b.page.locator('[data-battle-screen="shared-v1"]').waitFor();
  b.sessionId = (await b.invoke('battle', 'overview')).session.id;
  for (const actor of [a, b]) await actor.page.getByRole('button', { name: '同步房间', exact: true }).click();
  await a.invoke('battle', 'qaPreset', { sessionId: a.sessionId, preset: 'charged' });
  for (const actor of [a, b]) {
    await actor.page.getByRole('button', { name: '同步房间', exact: true }).click();
    await actor.page.waitForFunction(() => [...document.querySelectorAll('.battle-stage .resource-stage')].length === 2 && [...document.querySelectorAll('.battle-stage .resource-stage')].every(element => element.getAttribute('data-status') === 'ready'));
    const s = await session(actor), metrics = await actor.page.locator('[data-battle-screen="shared-v1"]').evaluate(root => ({ mode: root.getAttribute('data-battle-mode'), authority: root.getAttribute('data-authority'), hud: root.querySelectorAll('.combatant-status').length, moves: [...root.querySelectorAll('.battle-move')].map(element => ({ bottom: element.getBoundingClientRect().bottom, width: element.getBoundingClientRect().width })), height: innerHeight, resources: [...root.querySelectorAll('.battle-stage .resource-stage')].map(element => element.getAttribute('data-resource-id')), duplicate: document.querySelectorAll('.discovery-arena,.discovery-combatants').length }));
    check(`${actor.label}-shared-friend-layout`, metrics.mode === 'friend' && metrics.authority === 'simulated' && metrics.hud === 2 && metrics.moves.length === 4 && metrics.moves.every(move => move.bottom <= metrics.height) && metrics.duplicate === 0 && s.context.scenarioId === runId, metrics);
    await actor.page.screenshot({ path: join(output, `${actor.label}-shared-friend.png`) });
  }
  let [sa, sb] = await pair('ultimate', 'dodge');
  check('friend-ultimate-hits-dodge-and-heals', sa.rounds.at(-1).directDamage.enemy > 0 && sa.rounds.at(-1).healEvents.player.some(event => event.amount === 20), sa.rounds.at(-1));
  [sa, sb] = await pair('element_attack', 'normal_attack');
  check('friend-interrupt-has-correct-event', sa.rounds.at(-1).visualEvents.some(event => event.kind === 'interrupt') && !sa.rounds.at(-1).visualEvents.some(event => ['miss', 'dodge'].includes(event.kind)), sa.rounds.at(-1));
  [sa, sb] = await pair('normal_attack', 'dodge');
  check('friend-dodge-has-correct-event', sa.rounds.at(-1).directDamage.enemy === 0 && sa.rounds.at(-1).visualEvents.some(event => ['miss', 'dodge'].includes(event.kind)), sa.rounds.at(-1));
  for (let index = 0; index < 16 && sa.status === 'active'; index++) [sa, sb] = await pair('normal_attack', 'element_attack');
  check('two-sided-finished-same-authority', sa.status === 'finished' && sb.status === 'finished' && sa.winner === 'player' && sb.winner === 'enemy' && sa.reward?.applied && sb.reward?.applied, { a: sa, b: sb });
  for (const actor of [a, b]) {
    const before = (await actor.invoke('companions', 'list')).pets.find(pet => pet.petId === actor.pet.petId);
    await actor.invoke('battle', 'retrySettlement', { sessionId: actor.sessionId }); await actor.invoke('battle', 'retrySettlement', { sessionId: actor.sessionId });
    const after = (await actor.invoke('companions', 'list')).pets.find(pet => pet.petId === actor.pet.petId);
    check(`${actor.label}-idempotent-growth`, before.growth.experience === after.growth.experience && after.growth.experience - actor.pet.growth.experience === (actor === a ? 20 : 5), { before: before.growth, after: after.growth });
    await actor.page.screenshot({ path: join(output, `${actor.label}-shared-result.png`) });
  }
  check('no-renderer-errors', proof.errors.length === 0, proof.errors); proof.passed = true; proof.completedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ passed: true, rounds: proof.rounds.length, checks: proof.checks.length, output }, null, 2));
} catch (error) { proof.passed = false; proof.failure = String(error); save(); for (const actor of [a, b].filter(Boolean)) await actor.page.screenshot({ path: join(output, `${actor.label}-failure.png`) }).catch(() => {}); throw error; }
finally { for (const app of opened) await app.close().catch(() => {}); await server.close(); }
