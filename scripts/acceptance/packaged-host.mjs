import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { pollState } from './poll-state.mjs';

const root = resolve('.'), output = resolve(`artifacts/foundation/cloud-engineering/packaged-host/run-${Date.now()}`); mkdirSync(output, { recursive: true });
const executable = resolve(process.argv[2] || 'artifacts/pc-cloud-upgrade/win-unpacked/Lingjing.exe');
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
const proof = { at: new Date().toISOString(), scope: 'Actual unpacked Windows EXE, embedded ASAR and explicit fresh QA profile. Monitor protocol readiness is read and asserted repeatedly, not inferred from a process or async browser predicate.', executable, scenario, observations: [], checks: [] };
let app;
try {
  app = await electron.launch({ executablePath: executable, cwd: root, env });
  const page = await app.firstWindow(); await page.waitForFunction(() => Boolean(window.lingjing));
  const invoke = async (feature, command, payload = {}) => { const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload }); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
  const password = `Monitor-${randomUUID()}!`;
  await invoke('accounts', 'register', { provider: 'local', account: `qa_monitor_${Date.now()}`, username: '包内就绪回归', password, confirmPassword: password, rememberSession: false });
  proof.info = await invoke('app', 'info'); proof.url = page.url(); assert.ok(proof.url.includes('/app.asar/'));
  const read = async () => { const settings = await invoke('accounts', 'settingsGet'); const state = { at: Date.now(), running: settings.host.fullscreenMonitor, ready: settings.host.fullscreenMonitorReady }; proof.observations.push(state); return state; };
  const ready = await pollState(read, value => value.running === true && value.ready === true, { label: 'Packaged fullscreen monitor never emitted its ready protocol line' });
  assert.equal(ready.running, true); assert.equal(ready.ready, true);
  for (let count = 0; count < 3; count++) { await new Promise(done => setTimeout(done, 500)); const state = await read(); assert.equal(state.running, true); assert.equal(state.ready, true); }
  proof.checks.push({ id: 'actual-asar-powershell-monitor-ready', running: ready.running, ready: ready.ready, stableSamples: 3 });
  proof.passed = true; console.log(JSON.stringify({ passed: true, output, observations: proof.observations.length, source: proof.info.build.sourceCommit }));
} catch (error) { proof.passed = false; proof.failure = String(error); throw error; }
finally { if (app) await app.close().catch(() => {}); proof.completedAt = new Date().toISOString(); writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); writeFileSync('artifacts/foundation/cloud-engineering/packaged-host/latest.json', JSON.stringify(proof, null, 2)); }
