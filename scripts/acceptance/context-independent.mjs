import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const source = resolve(process.argv[2]), output = resolve(process.argv[3]); mkdirSync(output, { recursive: true });
const { _electron: electron } = createRequire(join(source, 'package.json'))('playwright');
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { cwd: source, encoding: 'utf8' }));
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), scenario, provenance: 'Independent actual Electron wild and territory entries. Explicit simulated location and legal charged prestate/opponent action. Real shared screen, original rules, capture, ownership, inventory and persistent receipts. No live GPS/cloud claim.', checks: [], scenes: [], errors: [] };
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const check = (id, passed, detail) => { proof.checks.push({ id, passed: Boolean(passed), detail }); save(); assert.ok(passed, id); };
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
const app = await electron.launch({ args: [source], cwd: source, env }); let page;
async function invoke(feature, command, payload = {}) { const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload }); assert.equal(result.ok, true, `${feature}.${command}: ${JSON.stringify(result)}`); return result.data; }
async function route(path) { await page.evaluate(path => { location.hash = `#${path}`; }, path); await page.waitForTimeout(250); }
async function current(id) { return invoke('battle', 'snapshot', { sessionId: id }); }
async function view(mode, label) {
  const screen = page.locator(`[data-battle-screen="shared-v1"][data-battle-mode="${mode}"]`); await screen.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.battle-stage .resource-stage[data-status="ready"]').length === 2);
  const id = await screen.getAttribute('data-session-id'), session = await current(id);
  const metrics = await screen.evaluate(root => ({ mode: root.getAttribute('data-battle-mode'), authority: root.getAttribute('data-authority'), hud: root.querySelectorAll('.combatant-status').length, actors: [...root.querySelectorAll('.battle-stage .resource-stage')].map(element => ({ resource: element.getAttribute('data-resource-id'), canvas: element.querySelectorAll('canvas').length, fallback: element.getAttribute('data-fallback') })), skills: [...root.querySelectorAll('.battle-move')].map(element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }; }), height: innerHeight, duplicated: document.querySelectorAll('.discovery-arena,.discovery-combatants,.discovery-battle-actions').length }));
  check(`${label}:same-screen-identity-and-controls`, metrics.hud === 2 && metrics.authority === 'simulated' && metrics.skills.length === 4 && metrics.skills.every(skill => skill.bottom <= metrics.height) && metrics.duplicated === 0 && metrics.actors.every((actor, index) => actor.canvas === 1 && actor.fallback === 'false' && actor.resource === (session[index ? 'enemy' : 'player'].resource?.resourceId || session[index ? 'enemy' : 'player'].appearance2d)), metrics);
  await page.screenshot({ path: join(output, `${label}.png`) }); proof.scenes.push({ label, id, mode, session, metrics }); save(); return session;
}
async function act(session, action) {
  await page.locator(`.battle-move.${action}`).click();
  await page.waitForFunction(({ id, round }) => document.querySelector('[data-session-id]')?.getAttribute('data-session-id') === id && Number(document.querySelector('.battle-stage')?.getAttribute('data-round')) === round + 1, { id: session.id, round: session.snapshot.round });
  await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
  return current(session.id);
}
async function charged(session) {
  await invoke('battle', 'qaPreset', { sessionId: session.id, preset: 'charged', enemyAction: 'dodge' });
  await route('/companions'); await route(`/battle/session/${encodeURIComponent(session.id)}`);
  await page.waitForFunction(() => document.querySelector('.battle-meter-row.anger b')?.textContent === '50/100'); return current(session.id);
}
async function finish(session) {
  session = await act(session, 'ultimate');
  for (let step = 0; step < 12 && session.status === 'active'; step++) session = await act(session, 'element_attack');
  check(`${session.mode}:real-kernel-victory`, session.status === 'finished' && session.winner === 'player' && session.reward.applied, session);
  await page.screenshot({ path: join(output, `${session.mode}-result.png`) }); return session;
}
try {
  page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844)); await page.waitForFunction(() => Boolean(window.lingjing));
  const password = `Qa-${randomUUID()}!`; await invoke('accounts', 'register', { provider: 'local', account: `root_context_${Date.now()}`, username: '来源战场独立验收', password, confirmPassword: password, rememberSession: false });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const roster = await invoke('companions', 'list'), metal = roster.templates.find(template => template.element === 'metal'), wood = roster.templates.find(template => template.element === 'wood');
  await invoke('companions', 'adopt', { templateId: metal.templateId, name: metal.name, showOnDesktop: false, actionId: randomUUID() });
  const pet = (await invoke('companions', 'list')).pets[0]; await invoke('battle', 'selectPet', { petId: pet.petId, actionId: randomUUID() });
  const owner = (await invoke('accounts', 'session')).currentUser.id;
  await route('/discovery'); await invoke('discovery', 'setExploring', { active: true });
  const nearby = await invoke('discovery', 'qaTarget', { templateId: wood.templateId }), spawn = nearby.spawns.find(spawn => spawn.templateId === wood.templateId && spawn.inRange); assert.ok(spawn);
  await route(`/discovery/wild/${spawn.id}`); await page.getByRole('button', { name: '开始挑战', exact: true }).click();
  let wild = await view('wild', 'wild-entry'); wild = await charged(wild); wild = await act(wild, 'ultimate');
  const snapshot = wild.snapshot; await page.locator('.battle-screen-toolbar').getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('.discovery-resume').getByRole('button', { name: '继续', exact: false }).click();
  await page.locator(`[data-session-id="${wild.id}"]`).waitFor();
  check('wild-return-and-resume-exact-session', JSON.stringify((await current(wild.id)).snapshot) === JSON.stringify(snapshot) && await page.locator('[data-animation-phase]').getAttribute('data-animation-phase') === 'rest', { id: wild.id, round: snapshot.round });
  for (let step = 0; step < 12 && wild.status === 'active'; step++) wild = await act(wild, 'element_attack');
  check('wild-real-victory', wild.status === 'finished' && wild.winner === 'player', wild);
  await page.getByRole('button', { name: '收服', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '收服伙伴', exact: true }); await dialog.getByRole('textbox', { name: '昵称', exact: true }).fill('复验青芽'); await dialog.getByRole('button', { name: '确认', exact: true }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/discovery/result/'));
  const afterCapture = await invoke('discovery', 'snapshot'), captured = afterCapture.captures.find(capture => capture.battleId === wild.id) || afterCapture.captures[0]; assert.ok(captured);
  const capturedPet = (await invoke('companions', 'list')).pets.find(pet => pet.petId === captured.petId);
  check('shared-capture-makes-correct-instance', capturedPet?.templateId === wood.templateId && capturedPet.resource.resourceId === wood.resource.resourceId && capturedPet.origin.battleId === wild.id && capturedPet.origin.encounterId === captured.encounterId, { captured, pet: capturedPet });
  await invoke('battle', 'settleContext', { sessionId: wild.id, actionId: `context:${wild.id}`, name: '复验青芽' });
  await invoke('battle', 'settleContext', { sessionId: wild.id, actionId: `context:${wild.id}:repeat`, name: '复验青芽' });
  check('capture-repeat-single-instance-and-receipt', (await invoke('discovery', 'snapshot')).captures.length === afterCapture.captures.length && (await invoke('companions', 'list')).pets.length === 2, { petId: captured.petId });
  await page.screenshot({ path: join(output, 'wild-captured.png') });
  await route('/garden'); await page.getByRole('button', { name: '查看演练领地', exact: true }).click();
  await page.getByRole('button', { name: '发起领地挑战', exact: true }).waitFor();
  const beforeTerritory = await invoke('garden', 'snapshot');
  const assignedPet=page.locator(`button.garden-pet[data-pet-id="${pet.petId}"]`);await assignedPet.click();assert.equal(await assignedPet.getAttribute('aria-pressed'),'true'); await page.getByRole('button', { name: '发起领地挑战', exact: true }).click();
  let territory = await view('territory', 'territory-entry'); territory = await charged(territory); territory = await finish(territory);
  await page.getByRole('button', { name: '占领', exact: true }).click(); await page.waitForFunction(() => location.hash === '#/garden');
  const afterTerritory = await invoke('garden', 'snapshot'), area = afterTerritory.territories.find(area => area.id === territory.context.territoryId);
  check('territory-confirmed-by-origin', area?.ownerAccountId === owner, { context: territory.context, territory: area });
  const countSeeds = snapshot => snapshot.items.filter(item => item.category === 'seed').reduce((sum, item) => sum + item.quantity, 0);
  check('territory-awards-two-seeds-once', countSeeds(afterTerritory) - countSeeds(beforeTerritory) === 2, { before: countSeeds(beforeTerritory), after: countSeeds(afterTerritory) });
  await invoke('battle', 'settleContext', { sessionId: territory.id, actionId: `context:${territory.id}` }); await invoke('battle', 'settleContext', { sessionId: territory.id, actionId: `context:${territory.id}:repeat` });
  const repeated = await invoke('garden', 'snapshot'); check('territory-repeat-no-stock-or-ownership-change', countSeeds(repeated) === countSeeds(afterTerritory) && repeated.territories.find(entry => entry.id === area.id)?.ownerAccountId === owner, { seedCount: countSeeds(repeated), territoryId: area.id });
  await page.screenshot({ path: join(output, 'territory-confirmed.png') });
  check('no-renderer-errors', proof.errors.length === 0, proof.errors); proof.passed = true; proof.completedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ passed: true, checks: proof.checks.length, output }, null, 2));
} catch (error) { proof.passed = false; proof.failure = String(error); save(); await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); throw error; }
finally { await app.close(); }
