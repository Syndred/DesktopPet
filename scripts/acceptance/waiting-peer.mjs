import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const root = resolve('.'), output = resolve(`artifacts/foundation/waiting-peer/run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const { startQaDuelServer } = createRequire(import.meta.url)('../../apps/pc-app/runtime/features/battle/tests/qa-duel-server.cjs');
const token = randomBytes(32).toString('hex');
const authority = await startQaDuelServer({ runId: scenario.runId, token, directory: join(output, 'authority') });
writeFileSync(join(scenario.profilePath, 'battle-transport.json'), JSON.stringify({ runId: scenario.runId, token, endpoint: authority.endpoint }));
const proof = { at: new Date().toISOString(), scenario, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Actual production Electron, explicit loopback simulation, one unjoined friend room only; no live-cloud claim or repeated battle suite.', checks: [], errors: [] };
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
let app;
try {
  app = await electron.launch({ args: [root], cwd: root, env });
  const page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  const invoke = async (feature, command, payload = {}) => {
    const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
    assert.equal(result.ok, true, JSON.stringify(result)); return result.data;
  };
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  const password = `Waiting-${randomUUID()}!`;
  await invoke('accounts', 'register', { provider: 'local', account: `waiting_${Date.now()}`, username: '等待呈现复验', password, confirmPassword: password, rememberSession: false });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  proof.runtime = await invoke('app', 'info');
  const { pet } = await invoke('companions', 'adopt', { templateId: 'big-fish-gentle', name: '鱼丸', showOnDesktop: false, actionId: randomUUID() });
  await invoke('battle', 'selectPet', { petId: pet.petId, actionId: randomUUID() });
  await page.evaluate(() => { location.hash = '#/battle'; });
  await page.getByRole('tab', { name: '好友对战', exact: true }).click();
  await page.getByRole('button', { name: '创建房间', exact: true }).click();
  const screen = page.locator('[data-battle-screen="shared-v1"]'); await screen.waitFor();
  const sessionId = await screen.getAttribute('data-session-id'); proof.sessionId = sessionId;
  const inspect = async label => {
    const view = await screen.evaluate(element => ({
      affinity: element.querySelectorAll('.battle-affinity').length,
      enemyBars: element.querySelectorAll('.combatant-status.enemy progress').length,
      enemyResources: element.querySelectorAll('.combatant-status.enemy [data-resource-id], .battle-actor-slot.enemy [data-resource-id]').length,
      enemyCanvases: element.querySelectorAll('.battle-actor-slot.enemy canvas').length,
      placeholder: element.querySelector('.battle-waiting-actor')?.getAttribute('aria-label'),
      hud: element.querySelector('.combatant-status.enemy')?.getAttribute('aria-label')
    }));
    assert.equal(view.affinity, 0); assert.equal(view.enemyBars, 0); assert.equal(view.enemyResources, 0); assert.equal(view.enemyCanvases, 0);
    assert.equal(view.placeholder, label); assert.equal(view.hud, label); return view;
  };
  const waiting = await invoke('battle', 'snapshot', { sessionId });
  assert.equal(waiting.status, 'waiting'); assert.equal(waiting.enemy.petId, 'waiting-peer');
  await page.waitForTimeout(300);
  proof.checks.push({ id: 'waiting-room', state: waiting, view: await inspect('等待好友加入') });
  await page.screenshot({ path: join(output, 'waiting.png') });
  await page.getByRole('button', { name: '离开', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '离开', exact: true }).click();
  await page.getByRole('button', { name: '战报', exact: true }).waitFor();
  const abandoned = await invoke('battle', 'snapshot', { sessionId });
  assert.equal(abandoned.status, 'abandoned'); assert.equal(abandoned.rounds.length, 0);
  proof.checks.push({ id: 'left-before-peer-joined', state: abandoned, view: await inspect('对手未加入') });
  await page.screenshot({ path: join(output, 'abandoned.png') });
  await page.getByRole('button', { name: '战报', exact: true }).click();
  await page.getByRole('region', { name: '战报详情' }).waitFor();
  const unknown = page.locator('.battle-reports-layout [data-pet-id="waiting-peer"]');
  assert.ok(await unknown.count() >= 3);
  for (const portrait of await unknown.all()) {
    assert.equal(await portrait.getAttribute('aria-label'), '对手未加入');
    assert.equal(await portrait.getAttribute('data-resource-id'), null);
    assert.equal(await portrait.locator('canvas, .resource-portrait, .resource-stage').count(), 0);
  }
  const reportPeer = page.locator('.battle-result-portraits > div').last();
  assert.equal(await reportPeer.locator('span').count(), 0);
  assert.equal(await reportPeer.locator('strong').innerText(), '对手未加入');
  const report = await invoke('battle', 'getReport', { reportId: sessionId });
  assert.equal(report.rounds.length, 0); assert.equal(report.enemy.petId, 'waiting-peer');
  proof.checks.push({ id: 'report-has-no-invented-peer', unknownPortraits: await unknown.count(), report });
  await page.screenshot({ path: join(output, 'report.png') });
  assert.deepEqual(proof.errors, []); proof.passed = true;
  console.log(JSON.stringify({ passed: true, checks: proof.checks.length, output }));
} catch (error) { proof.failure = String(error); throw error; }
finally {
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
  if (app) await app.close();
  await authority.close();
}
