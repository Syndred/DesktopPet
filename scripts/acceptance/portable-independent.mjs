import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
const executable = resolve(process.argv[2]), output = resolve(process.argv[3]); mkdirSync(output, { recursive: true });
const profile = join(output, `ordinary-${Date.now()}`), reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve)); const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_QA_SCENARIO; delete env.PET_RUNTIME_DATA_FILE;
const child = spawn(executable, [`--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const proof = { at: new Date().toISOString(), executable, sha256: createHash('sha256').update(readFileSync(executable)).digest('hex'), launcherPid: child.pid, profile, scope: 'Independent launch of the delivered portable SFX, fresh ordinary profile, actual packaged SQLite/IPC/Pixi and one training action; no QA transport or fake cloud', checks: [], errors: [] };
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const check = (id, passed, detail) => { proof.checks.push({ id, passed: Boolean(passed), detail }); save(); assert.ok(passed, id); };
let browser, page, launchError, logs = ''; child.on('error', error => { launchError = error; }); for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { logs = (logs + bytes.toString()).slice(-20000); });
try {
  const endpoint = `http://127.0.0.1:${port}`; let ready = false;
  for (let index = 0; index < 240; index++) { if (launchError) throw launchError; try { if ((await fetch(`${endpoint}/json/version`, { signal: AbortSignal.timeout(300) })).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.ok(ready, 'Portable Electron endpoint did not start'); browser = await chromium.connectOverCDP(endpoint);
  for (let index = 0; index < 100; index++) { page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().includes('/app.asar/') && page.url().includes('/dist/ui/index.html') && !page.url().includes('#/desktop/')); if (page) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(page); page.on('pageerror', error => proof.errors.push(error.message)); await page.waitForFunction(() => Boolean(window.lingjing));
  const invoke = async (feature, command, payload = {}) => { const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload }); assert.equal(result.ok, true, `${feature}.${command}: ${JSON.stringify(result)}`); return result.data; };
  const info = await invoke('app', 'info'); proof.info = info; proof.loadedUrl = page.url();
  check('actual-sfx-asar-and-ordinary-profile', page.url().includes('/app.asar/') && !page.url().includes('win-unpacked') && !info.scenario && info.build.sourceCommit.startsWith('c4ac693'), { url: page.url(), build: info.build });
  check('restricted-renderer-bridge', await page.evaluate(() => typeof window.require === 'undefined' && typeof window.lingjing.send === 'undefined'));
  const password = `Pack-${randomUUID()}!`; await invoke('accounts', 'register', { provider: 'local', account: `pack_${Date.now()}`, username: '便携版独立验收', password, confirmPassword: password, rememberSession: false }); await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const roster = await invoke('companions', 'list'), resources = await invoke('resources', 'list');
  check('packaged-eight-canonical-five-elements', roster.templates.length >= 8 && new Set(roster.templates.map(template => template.resource.resourceId)).size === roster.templates.length && ['metal', 'wood', 'water', 'fire', 'earth'].every(element => roster.templates.some(template => template.element === element)) && roster.templates.every(template => resources.some(resource => resource.id === template.resource.resourceId && resource.availability === 'ready')), roster.templates);
  for (const element of ['wood', 'earth']) {
    const template = roster.templates.find(template => template.element === element); await invoke('companions', 'adopt', { templateId: template.templateId, name: template.name, showOnDesktop: false, actionId: randomUUID() });
    await page.evaluate(() => { location.hash = '#/resources'; }); await page.locator(`.resource-card[data-resource-id="${template.resource.resourceId}"]`).click();
    await page.getByRole('combobox', { name: '预览动作', exact: true }).click(); await page.getByRole('option', { name: '行走', exact: true }).click();
    const stage = page.locator(`.resources-preview .resource-stage[data-resource-id="${template.resource.resourceId}"][data-status="ready"][data-action="walk"][data-fallback="false"]`); await stage.waitFor();
    const first = await stage.locator('.resource-sprite-host').getAttribute('data-frame'); await page.waitForFunction(previous => document.querySelector('.resources-preview .resource-sprite-host')?.getAttribute('data-frame') !== previous, first);
    check(`packaged-${element}-real-pixi-playback`, await stage.locator('canvas').count() === 1, await stage.locator('.resource-sprite-host').evaluate(element => ({ frame: element.dataset.frame, textureFrame: element.dataset.textureFrame, textureKey: element.dataset.textureKey })));
    await page.screenshot({ path: join(output, `${element}-resource.png`) });
  }
  await page.evaluate(() => { location.hash = '#/companions/adopt'; }); await page.locator('.cp-adoption-layout').waitFor(); await page.screenshot({ path: join(output, 'portable-adoption.png') });
  await page.evaluate(() => { location.hash = '#/battle'; }); await page.getByRole('button', { name: '开始', exact: true }).click(); await page.locator('[data-battle-screen="shared-v1"]').waitFor();
  const battle = (await invoke('battle', 'overview')).session; await page.locator('.battle-move.normal_attack').click(); await page.waitForFunction(() => Number(document.querySelector('.battle-stage')?.getAttribute('data-round')) === 1); await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
  const after = await invoke('battle', 'snapshot', { sessionId: battle.id }); check('packaged-shared-battle-actual-action', after.snapshot.round === 1 && after.rounds[0].actions.player === 'normal_attack' && await page.locator('.battle-stage .resource-stage[data-status="ready"]').count() === 2, { id: after.id, player: after.player, enemy: after.enemy, round: after.rounds[0] });
  await page.screenshot({ path: join(output, 'portable-battle.png') }); check('no-renderer-errors', proof.errors.length === 0, proof.errors); proof.passed = true; proof.completedAt = new Date().toISOString(); save(); console.log(JSON.stringify({ passed: true, checks: proof.checks.length, output }, null, 2));
} catch (error) { proof.passed = false; proof.failure = String(error); save(); await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); throw error; }
finally {
  if (browser) await Promise.race([(async () => { try { const cdp = await browser.newBrowserCDPSession(); await cdp.send('Browser.close'); } catch {} await browser.close().catch(() => {}); })(), new Promise(resolve => setTimeout(resolve, 2000))]);
  if (child.exitCode === null && !launchError) await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 2500))]);
  if (child.exitCode === null && Number.isInteger(child.pid)) try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch {}
  save(); writeFileSync(join(output, 'launcher.log'), logs);
}
