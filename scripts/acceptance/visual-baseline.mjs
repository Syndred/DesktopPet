import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const source = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const { _electron: electron } = createRequire(join(source, 'package.json'))('playwright');
mkdirSync(output, { recursive: true });
const profile = join(output, `profile-${Date.now()}`);
const evidence = {
  startedAt: new Date().toISOString(), source, profile,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  sourceDirtyFiles: execFileSync('git', ['status', '--short'], { cwd: source, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  scope: 'Independent visual acceptance of actual compiled Electron UI using a separate local account; no user profile, cloud success, location or reward state fabricated.',
  viewport: { width: 1280, height: 844 }, views: [], errors: [], blocked: []
};
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [source], cwd: source, env, timeout: 30000 });
let page;
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
try {
  page = await app.firstWindow();
  page.on('pageerror', error => evidence.errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setSize(1280, 844); w.setTitle('灵境 · UI 独立验收 20261024');
  });
  await page.waitForFunction(() => Boolean(window.lingjing));
  evidence.runtime = await app.evaluate(({ app: electronApp }) => ({ appPath: electronApp.getAppPath(), electron: process.versions.electron }));
  const invoke = async (feature, command, payload = {}) => {
    const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
    if (!result.ok) throw new Error(`${feature}.${command}: ${result.code} ${result.message}`);
    return result.data;
  };
  async function capture(label, path) {
    if (path) await page.evaluate(path => { location.hash = `#${path}`; }, path);
    await page.waitForFunction(() => !document.querySelector('.opening-state'));
    await page.waitForTimeout(650);
    await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.main-content')?.scrollTo(0, 0); });
    const metrics = await page.evaluate(() => {
      const number = value => Number.parseFloat(value) || 0;
      function item(element) {
        const r = element.getBoundingClientRect(), c = getComputedStyle(element);
        return {
          tag: element.tagName, classes: element.className?.baseVal ?? String(element.className), text: element.textContent?.trim().slice(0, 100),
          rect: { x: r.x, y: r.y, width: r.width, height: r.height },
          font: { family: c.fontFamily, size: c.fontSize, weight: c.fontWeight, lineHeight: c.lineHeight, color: c.color },
          display: c.display, direction: c.flexDirection, gap: c.gap, columns: c.gridTemplateColumns,
          margin: [c.marginTop, c.marginRight, c.marginBottom, c.marginLeft], padding: [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft],
          radius: c.borderRadius, opacity: c.opacity, slot: element.getAttribute('data-slot')
        };
      }
      const main = document.querySelector('.main-content');
      const important = 'h1,.page-header,.cp-detail-layout,.cp-detail-grid,.cp-adoption-layout,.cp-detail-card,.cp-growth-card,.cp-tabs,.cp-skill-row,.cp-adoption-card,.battle-tabs,.battle-live-layout,.battle-arena,.battle-arena-top,.battle-stage,.battle-moves,.battle-move,.battle-live-sidebar,.card,[data-slot="card"]';
      return {
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        body: item(document.body), sidebar: document.querySelector('.sidebar') ? item(document.querySelector('.sidebar')) : null,
        main: main ? { ...item(main), scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, horizontalOverflow: main.scrollWidth > main.clientWidth + 1 } : null,
        visible: [...document.querySelectorAll(important)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 65).map(item),
        primitiveSlots: [...new Set([...document.querySelectorAll('[data-slot]')].map(e => e.getAttribute('data-slot')))],
        live2dStages: [...document.querySelectorAll('.resource-stage')].map(e => ({ id: e.getAttribute('data-resource-id'), status: e.getAttribute('data-status') })),
        pendingPageOpacity: number(getComputedStyle(document.querySelector('.app-page-motion') || document.body).opacity),
        legacy3dElements: document.querySelectorAll('model-viewer').length
      };
    });
    const file = `${label}.png`;
    await page.screenshot({ path: join(output, file) });
    evidence.views.push({ label, path: path || '(login gate)', file, metrics }); save();
    console.log(`CAPTURED ${label} h1=${metrics.visible.find(x => x.tag === 'H1')?.font.weight} pageOpacity=${metrics.pendingPageOpacity}`);
  }
  await capture('16-login');
  const password = `Visual-${randomUUID()}!`;
  await invoke('accounts', 'register', { provider: 'local', account: `visual_${Date.now()}`, username: 'UI独立验收', password, confirmPassword: password, rememberSession: true });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  evidence.features = (await invoke('app', 'info')).features;
  let snapshot = await invoke('companions', 'list');
  evidence.templates = snapshot.templates;
  for (const template of snapshot.templates.slice(0, 6)) {
    await invoke('companions', 'adopt', { templateId: template.templateId, name: template.name, showOnDesktop: false, actionId: randomUUID() });
  }
  snapshot = await invoke('companions', 'list');
  evidence.pets = snapshot.pets.map(p => ({ petId: p.petId, name: p.name, templateId: p.templateId, resource: p.resource }));
  const first = snapshot.pets[0];
  evidence.resources = (await invoke('resources', 'list')).map(r => ({ id: r.id, name: r.name, clips: r.clips, actions: r.actions, availability: r.availability }));
  await capture('01-companions', '/companions');
  await capture('04-detail', `/companions/${first.petId}`);
  await capture('05-adoption', '/companions/adopt');
  for (const [label, path] of [
    ['08-territory', '/garden'], ['09-inventory', '/inventory'], ['18-garden', '/garden/plots'], ['19-kitchen', '/garden/kitchen'],
    ['13-resources', '/resources'], ['14-desktop-settings', '/settings'], ['15-ai-settings', '/settings/ai'], ['17-account', '/account'],
    ['10-chat', '/chat'], ['02-discovery', '/discovery'], ['11-friends', '/battle/friends']
  ]) await capture(label, path);
  evidence.blocked.push('Real-location capture result page cannot be accepted without a successful real positioning and capture receipt; no fake success state injected.');
  await invoke('battle', 'selectPet', { petId: first.petId, actionId: randomUUID() });
  await capture('03-training', '/battle');
  const battle = await invoke('battle', 'startTraining', { petId: first.petId, enemyElement: 'fire', actionId: randomUUID() });
  evidence.battleSession = { id: battle.id, mode: battle.mode, status: battle.status };
  await capture('03-live-battle', '/battle');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 900));
  await capture('03-live-battle-1440', '/battle');
  await capture('04-detail-1440', `/companions/${first.petId}`);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  await capture('03-live-battle-native-review', '/battle');
  evidence.completedAt = new Date().toISOString(); save();
  console.log('NATIVE_REVIEW_READY', output);
  if (process.argv.includes('--keep-open')) await new Promise(resolve => {
    const timer = setInterval(() => { if (existsSync(join(output, 'close-request.txt'))) { clearInterval(timer); resolve(); } }, 500);
  });
} catch (error) {
  evidence.failure = String(error); save();
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await app.close(); }
