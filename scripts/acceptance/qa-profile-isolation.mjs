import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const source = resolve('.');
const output = resolve(`artifacts/foundation/qa-isolation/run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { cwd: source, encoding: 'utf8' }));
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceDirtyFiles: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean), scenario, checks: [], errors: [] };
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
async function launch(profile, sceneEnv = {}) {
  const env = { ...process.env, PET_USER_DATA_DIR: profile, ...sceneEnv };
  delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
  if (!sceneEnv.LINGJING_QA_SCENARIO) delete env.LINGJING_QA_SCENARIO;
  const app = await electron.launch({ args: [source], cwd: source, env });
  const page = await app.firstWindow();
  page.on('pageerror', error => proof.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  const invoke = async (feature, command, payload = {}) => {
    const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
    assert.equal(result.ok, true, JSON.stringify(result)); return result.data;
  };
  return { app, page, invoke };
}
let current, qaLogin;
try {
  current = await launch(join(output, 'ordinary-profile'));
  const info = await current.invoke('app', 'info');
  assert.equal(info.scenario, undefined);
  assert.equal(await current.page.getByRole('button', { name: '隔离验收场景', exact: true }).count(), 0);
  proof.checks.push('Ordinary Electron startup has no simulation descriptor or scene indicator');
  await current.app.close(); current = null;

  current = await launch(scenario.profilePath, scenario.env);
  const qaInfo = await current.invoke('app', 'info');
  assert.deepEqual(qaInfo.scenario, { id: scenario.scenario, runId: scenario.runId, provenance: 'simulated', isolated: true });
  const indicator = current.page.getByRole('button', { name: '隔离验收场景', exact: true });
  await indicator.waitFor(); await indicator.focus();
  await current.page.getByRole('tooltip').filter({ hasText: '隔离验收 · 模拟场景' }).waitFor();
  await current.page.screenshot({ path: join(output, 'qa-indicator.png') });
  const password = `Scenario-${randomUUID()}!`;
  qaLogin = { provider: 'local', account: `qa_${Date.now()}`, password, rememberSession: false };
  const registration = await current.invoke('accounts', 'register', { ...qaLogin, username: '统一战场验收', confirmPassword: password });
  await current.page.getByRole('navigation', { name: '主导航' }).waitFor();
  const owner = (await current.invoke('app', 'info')).user.id;
  assert.ok(owner.startsWith(`qa:${scenario.runId}:`)); proof.owner = owner; proof.registrationOk = Boolean(registration);
  assert.equal((await current.invoke('accounts', 'session')).persistence, 'memory');
  const unavailable = await current.page.evaluate(() => window.lingjing.invoke('app', 'enableScenario', { id: 'unified-battle' }));
  assert.equal(unavailable.ok, false); assert.equal(unavailable.code, 'COMMAND_UNAVAILABLE');
  proof.checks.push('QA is explicitly marked with a keyboard-accessible tooltip and cannot be enabled through IPC');
  await current.app.close(); current = null;

  current = await launch(scenario.profilePath, scenario.env);
  const restored = await current.invoke('accounts', 'session');
  assert.equal(restored.currentUser, null);
  await current.invoke('accounts', 'login', qaLogin);
  assert.equal((await current.invoke('accounts', 'session')).currentUser.id, owner);
  assert.deepEqual((await current.invoke('app', 'info')).scenario, qaInfo.scenario);
  proof.checks.push('QA restart has no automatic login; explicit login restores the same independent account and run provenance');
  assert.deepEqual(proof.errors, []); proof.passed = true;
  console.log(JSON.stringify({ passed: true, evidence: join(output, 'evidence.json'), checks: proof.checks }));
} catch (error) { proof.failure = String(error); throw error; }
finally { save(); if (current) await current.app.close(); }
