// Real Electron acceptance for typography/spacing and current-resource identity.
// Isolated local accounts only. No model request and no fabricated chat messages.
import { _electron as electron } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const output = resolve('artifacts/conversations/ui-acceptance', `run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: join(output, 'profile') };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let page;
const errors = [];
const modelRequests = [];
const checks = [];
async function feature(name, command, payload = {}) {
  const result = await page.evaluate(async ({ name, command, payload }) => window.lingjing.invoke(name, command, payload), { name, command, payload });
  assert.equal(result.ok, true, result.message);
  return result.data;
}
async function waitUntil(predicate, label) {
  const end = Date.now() + 10000;
  while (!await predicate()) {
    if (Date.now() > end) throw new Error(`Timed out: ${label}`);
    await new Promise(done => setTimeout(done, 40));
  }
}
async function openChat() {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '聊天', exact: true }).click();
  await page.getByRole('heading', { name: '想说的话，我都在听。', exact: true }).waitFor();
}
async function openSettings() {
  await page.getByRole('link', { name: '对话设置', exact: true }).click();
  await page.getByRole('heading', { name: '给每位伙伴，不同的声音与性格。', exact: true }).waitFor();
}
async function select(name) {
  await page.locator('.cv-pet-option').filter({ has: page.locator('strong', { hasText: name }) }).click();
  await page.getByRole('region', { name: `与${name}的聊天`, exact: true }).waitFor();
}
async function boundVisual(selector, resourceId) {
  await waitUntil(async () => page.locator(selector).evaluateAll((nodes, id) => nodes.length > 0 && nodes.every(node => {
    const sheet = node.querySelector('.cp-sheet-thumbnail');
    const illustration = node.querySelector('img[data-resource-illustration]');
    return node.getAttribute('data-resource-id') === id && (
      sheet && decodeURIComponent(getComputedStyle(sheet).backgroundImage).includes(id) ||
      illustration?.getAttribute('data-resource-illustration') === id && id === 'builtin:lingjing-yuwan-v1' && illustration.getAttribute('src').endsWith('companionship-room-v1.png'));
  }), resourceId), `${selector} uses its actual resource image`);
}
async function metrics(route) {
  return page.evaluate(route => {
    const root = document.querySelector('.cv-root');
    const h1 = root.querySelector('h1');
    const title = getComputedStyle(h1);
    const body = getComputedStyle(root.querySelector('.cv-page-header h1 + p'));
    const caption = getComputedStyle(root.querySelector('.cv-caption'));
    const grid = getComputedStyle(root.querySelector(route === 'chat' ? '.cv-chat-grid' : '.cv-settings-grid'));
    const tokens = getComputedStyle(document.documentElement);
    return { route, width: innerWidth, height: innerHeight, devicePixelRatio, title: { size: title.fontSize, weight: title.fontWeight, lineHeight: title.lineHeight },
      body: { size: body.fontSize, weight: body.fontWeight }, caption: { size: caption.fontSize, weight: caption.fontWeight },
      gridGap: grid.gap, pagePadding: getComputedStyle(root).padding,
      cardTitle: getComputedStyle(root.querySelector(route === 'chat' ? '.cv-pet-card h2' : '.cv-connection h2')).fontSize,
      tokens: Object.fromEntries(['--text-title','--text-body','--text-caption','--weight-title','--space-4'].map(name => [name,tokens.getPropertyValue(name).trim()])),
      cards: [...root.querySelectorAll('.cv-card')].map(card => ({ padding: getComputedStyle(card).padding, margin: getComputedStyle(card).margin })),
      partnerCardsFit: [...root.querySelectorAll('.cv-partners button')].every(card => card.scrollWidth <= card.clientWidth + 1),
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth };
  }, route);
}
try {
  app = await electron.launch({ args: [resolve('.')], env });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/chat\/completions(?:$|\?)/.test(request.url())) modelRequests.push(request.url()); });
  await page.waitForFunction(() => Boolean(window.lingjing));
  await feature('accounts', 'register', { provider: 'local', account: 'conversation_visual_acceptance', username: '聊天界面验收',
    password: 'isolated-visual-acceptance', confirmPassword: 'isolated-visual-acceptance', rememberSession: true });
  const one = (await feature('companions', 'adopt', { templateId: 'big-fish-gentle', name: '鱼丸', actionId: randomUUID(), showOnDesktop: false })).pet;
  const two = (await feature('companions', 'adopt', { templateId: 'big-fish-gentle', name: '焰柴', actionId: randomUUID(), showOnDesktop: false })).pet;
  // The file picker is supplied one project-authored package by the harness.
  // Import parsing/copying, ownership, public IPC and appearance binding stay real.
  const shibaPackage = resolve('apps/pc-app/runtime/features/battle/assets/shiba-v1/character.json');
  await app.evaluate(({ dialog }, file) => {
    const original = dialog.showOpenDialog;
    dialog.showOpenDialog = async () => { dialog.showOpenDialog = original; return { canceled: false, filePaths: [file] }; };
  }, shibaPackage);
  const imported = await feature('resources', 'import');
  const shibaId = imported.resource.id;
  await feature('companions', 'appearance', { petId: two.petId, resourceId: shibaId, expectedRevision: two.revision, actionId: randomUUID() });
  await page.setViewportSize({ width: 1280, height: 844 });
  await openChat();
  await boundVisual(`.cv-pet-option .cv-avatar[data-pet-id="${one.petId}"]`, one.resource.resourceId);
  await boundVisual(`.cv-pet-option .cv-avatar[data-pet-id="${two.petId}"]`, shibaId);
  await boundVisual('.cv-pet-scene', one.resource.resourceId);
  assert.equal(await page.locator('.cv-message').count(), 0);
  checks.push('Two publicly adopted instances show their own real Yuwan/Shiba resource images; chat remains empty.');
  await select('焰柴');
  await boundVisual('.cv-thread-header .cv-avatar', shibaId);
  await boundVisual('.cv-pet-scene', shibaId);
  assert.equal(await page.locator('.cv-pet-scene img[src*="companionship-room"]').count(), 0);
  await page.screenshot({ path: join(output, 'chat-shiba.png'), fullPage: true });
  await openSettings();
  await boundVisual('.cv-pet-scene', shibaId);
  await page.screenshot({ path: join(output, 'ai-settings-shiba.png'), fullPage: true });
  checks.push('Selecting Shiba updates thread avatar and right-side character on chat and AI settings; no fixed Yuwan scene.');

  const measurements = [];
  for (const width of [1280, 1440, 980]) {
    await page.setViewportSize({ width, height: width === 1280 ? 844 : 900 });
    measurements.push(await metrics('settings'));
    if (width === 1440) await page.screenshot({ path: join(output, 'ai-settings-shiba-wide.png'), fullPage: true });
    await openChat();
    measurements.push(await metrics('chat'));
    if (width === 1440) await page.screenshot({ path: join(output, 'chat-shiba-wide.png'), fullPage: true });
    await openSettings();
  }
  assert.equal(new Set(measurements.map(value => value.title.size)).size, 1);
  assert.equal(new Set(measurements.map(value => value.title.weight)).size, 1);
  assert.equal(measurements.every(value => value.title.size === '28px' && value.title.weight === '700' && value.body.size === '14px' && value.caption.size === '11px'), true);
  assert.equal(measurements.every(value => value.cardTitle === '16px' && value.partnerCardsFit), true);
  assert.equal(measurements.every(value => value.gridGap === '16px' && value.cards.every(card => card.margin === '0px')), true);
  assert.equal(measurements.every(value => value.tokens['--text-title'] === '28px' && value.tokens['--space-4'] === '16px'), true);
  assert.equal(measurements.every(value => value.noHorizontalOverflow), true);
  checks.push('Chat and AI settings use one fixed title size/weight at 980, 1280 and 1440 CSS pixels; no horizontal overflow.');
  await page.setViewportSize({ width: 1280, height: 844 });
  await openChat();
  const current = await feature('companions', 'get', { petId: two.petId });
  await feature('companions', 'appearance', { petId: two.petId, resourceId: one.resource.resourceId, expectedRevision: current.revision, actionId: randomUUID() });
  await boundVisual('.cv-thread-header .cv-avatar', one.resource.resourceId);
  await boundVisual('.cv-pet-scene', one.resource.resourceId);
  await feature('companions', 'appearance', { petId: two.petId, resourceId: shibaId, expectedRevision: (await feature('companions', 'get', { petId: two.petId })).revision, actionId: randomUUID() });
  await boundVisual('.cv-thread-header .cv-avatar', shibaId);
  await boundVisual('.cv-pet-scene', shibaId);
  assert.equal((await feature('conversations', 'snapshot')).petId, two.petId);
  assert.equal((await feature('conversations', 'snapshot')).messages.length, 0);
  checks.push('Appearance rebinding while chat stays mounted refreshes the selected instance and image; no history reset or fake message.');
  await select('鱼丸');
  await boundVisual('.cv-pet-scene', one.resource.resourceId);
  await page.screenshot({ path: join(output, 'chat-yuwan.png'), fullPage: true });
  assert.deepEqual(modelRequests, []);
  assert.deepEqual(errors, []);
  const evidence = { at: new Date().toISOString(), status: 'passed', checks, measurements, errors, modelRequests: 0,
    fabricatedMessages: false, realElectron: true, isolatedProfile: true,
    importNote: 'Harness supplies one project-original Shiba package to the file-picker adapter; parser, copying, owner checks and public appearance IPC are actual product code.',
    pets: [{ petId: one.petId, resourceId: one.resource.resourceId }, { petId: two.petId, resourceId: shibaId }] };
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/conversations/ui-acceptance/latest.txt'), output);
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, output }));
} finally { if (app) await app.close(); }
