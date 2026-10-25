import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { sha256 } from '../release/release-store.mjs';
import { verifyPortableDefaultConfig } from './portable-config-smoke.mjs';

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve('.'), config = JSON.parse(readFileSync('scripts/release/electron-builder.pc.json')), version = JSON.parse(readFileSync('package.json')).version;
const executable = resolve(option('executable') || join(config.directories.output, `Lingjing-${version}-portable-x64.exe`));
const expectedSource = option('source') || JSON.parse(readFileSync('apps/pc-app/dist/build-manifest.json')).sourceCommit;
const expectedElectron = option('electron') || '44.9.3';
const output = resolve(`artifacts/foundation/cloud-engineering/portable/run-${Date.now()}`); mkdirSync(output, { recursive: true });
const ordinaryConfig = await verifyPortableDefaultConfig({ executable, expectedSource, output });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const reservation = createServer(); await new Promise(done => reservation.listen(0, '127.0.0.1', done)); const port = reservation.address().port; await new Promise(done => reservation.close(done));
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
const child = spawn(executable, [`--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let launchError, logs = ''; child.on('error', error => { launchError = error; });
for (const stream of [child.stdout, child.stderr]) stream?.on('data', value => { logs = (logs + value.toString()).slice(-12000); });
const proof = { at: new Date().toISOString(), executable, executableSha256: await sha256(executable), expectedSource, ordinaryConfig, scenario, launcherPid: child.pid,
  scope: 'Actual portable SFX and extracted ASAR, fresh explicit isolated QA profile. Native/renderer smoke, not live Supabase or second physical device evidence.', checks: [], errors: [] };
let browser;
try {
  let ready = false;
  for (let n = 0; n < 240; n++) {
    if (launchError) throw launchError;
    try { const result = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(300) }); if (result.ok) { ready = true; break; } } catch { /* Wait for SFX extraction. */ }
    await new Promise(done => setTimeout(done, 250));
  }
  assert.ok(ready, 'Portable SFX did not start its embedded Electron'); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page;
  for (let n = 0; n < 100; n++) { page = browser.contexts().flatMap(context => context.pages()).find(value => value.url().includes('/app.asar/') && value.url().includes('/ui/index.html')); if (page) break; await new Promise(done => setTimeout(done, 100)); }
  assert.ok(page); page.setDefaultTimeout(20000); page.on('pageerror', error => proof.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  const invoke = async (feature, command, payload = {}) => { const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload }); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
  const password = `Portable-${randomUUID()}!`;
  await invoke('accounts', 'register', { provider: 'local', account: `qa_exe_${Date.now()}`, username: 'EXE工程验收', password, confirmPassword: password, rememberSession: false });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  proof.info = await invoke('app', 'info'); proof.loadedUrl = page.url();
  const actualElectron = await page.evaluate(() => /Electron\/([^ ]+)/.exec(navigator.userAgent)?.[1]); assert.equal(actualElectron, expectedElectron);
  assert.equal(proof.info.build.sourceCommit, expectedSource); assert.deepEqual(proof.info.build.sourceDirtyFiles, []); assert.equal(proof.info.features.length, 7);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined'); assert.equal(await page.evaluate(() => typeof window.lingjing.send), 'undefined');
  proof.checks.push({ id: 'actual-sfx-asar-source-and-secure-preload', electron: actualElectron, build: proof.info.build });
  const resources = await invoke('resources', 'list'); assert.ok(['metal', 'wood', 'earth', 'water', 'fire'].every(element => resources.some(resource => resource.element === element && resource.availability === 'ready')));
  assert.ok(resources.filter(resource => resource.availability === 'ready').length >= 8);
  proof.checks.push({ id: 'eight-characters-five-elements', resources: resources.map(resource => ({ id: resource.id, element: resource.element, availability: resource.availability })) });
  let selected;
  for (const [templateId, name] of [['animal-wood-deer', '包内青芽'], ['animal-earth-pangolin', '包内岩团']]) {
    const { pet } = await invoke('companions', 'adopt', { actionId: randomUUID(), templateId, name, showOnDesktop: false }); selected ||= pet;
    await page.locator('.sidebar').getByRole('button', { name: '角色资源', exact: true }).click();
    await page.locator(`.resource-card[data-resource-id="${pet.resource.resourceId}"]`).click();
    await page.getByRole('combobox', { name: '预览动作', exact: true }).click(); await page.getByRole('option', { name: '行走', exact: true }).click();
    const stage = page.locator('.resources-preview .resource-stage[data-status="ready"][data-action="walk"][data-fallback="false"]'); await stage.waitFor();
    assert.equal(await stage.locator('canvas').count(), 1); await page.waitForTimeout(300);
    const identity = await stage.evaluate(element => ({ id: element.getAttribute('data-resource-id'), clip: element.getAttribute('data-clip'), texture: element.querySelector('.resource-sprite-host')?.getAttribute('data-texture-key') }));
    assert.equal(identity.id, pet.resource.resourceId); assert.ok(identity.texture); proof.checks.push({ id: `packaged-${pet.element}-walk`, petId: pet.petId, identity });
    await page.screenshot({ path: join(output, `${pet.element}-walk.png`) });
  }
  await invoke('battle', 'selectPet', { actionId: randomUUID(), petId: selected.petId });
  await page.evaluate(() => { location.hash = '#/battle'; }); await page.getByRole('button', { name: '开始', exact: true }).click();
  const screen = page.locator('[data-battle-screen="shared-v1"]'); await screen.waitFor(); const sessionId = await screen.getAttribute('data-session-id');
  await page.getByRole('button', { name: '普通攻击', exact: true }).click();
  await page.waitForFunction(async id => { const result = await window.lingjing.invoke('battle', 'snapshot', { sessionId: id }); return result.ok && result.data.snapshot.round === 1; }, sessionId);
  const battle = await invoke('battle', 'snapshot', { sessionId }); assert.equal(battle.rounds.length, 1); assert.equal(battle.rounds[0].actions.player, 'normal_attack');
  proof.checks.push({ id: 'packaged-shared-training-round', sessionId, round: battle.snapshot.round, player: battle.player.petId, hp: battle.rounds[0].hpAfter });
  assert.deepEqual(proof.errors, []); proof.passed = true; console.log(JSON.stringify({ passed: true, output, executableSha256: proof.executableSha256, checks: proof.checks.length }));
} catch (error) { proof.failure = String(error); throw error; }
finally {
  proof.completedAt = new Date().toISOString(); writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
  if (browser) { const close = (async () => { try { const session = await browser.newBrowserCDPSession(); await session.send('Browser.close'); } catch { /* Process may close before reply. */ } await browser.close().catch(() => {}); })(); await Promise.race([close, new Promise(done => setTimeout(done, 3000))]); }
  if (child.exitCode === null) await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => setTimeout(done, 2500))]);
  if (child.exitCode === null && child.pid) { try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); proof.ownedProcessTreeStopped = true; } catch { /* Already exited. */ } }
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); writeFileSync(join(output, 'launcher.log'), logs);
  writeFileSync(resolve('artifacts/foundation/cloud-engineering/portable/latest.json'), JSON.stringify(proof, null, 2));
}
