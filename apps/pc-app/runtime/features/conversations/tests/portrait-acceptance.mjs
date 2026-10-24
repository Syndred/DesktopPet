// Small real-Electron recheck for A07/A12 portrait composition only.
// Uses the six canonical resources and empty local histories; no model requests.
import { _electron as electron } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const output = resolve('artifacts/conversations/portrait', `run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const catalog = JSON.parse(readFileSync(resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json'), 'utf8'));
const env = { ...process.env, PET_USER_DATA_DIR: join(output, 'profile') };
delete env.ELECTRON_RUN_AS_NODE;
let app;
let page;
const errors = [];
let modelRequests = 0;
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
async function settlePortraits() {
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.app-page-motion')).opacity) > .99);
  await page.evaluate(async () => {
    const urls = [...new Set([...document.querySelectorAll('.cv-avatar svg image')].map(image => image.getAttribute('href')))];
    await Promise.all(urls.map(async url => { const image = new Image(); image.src = url; await image.decode(); }));
  });
}
try {
  app = await electron.launch({ args: [resolve('.')], env });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 844 });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/chat\/completions(?:$|\?)/.test(request.url())) modelRequests++; });
  await page.waitForFunction(() => Boolean(window.lingjing));
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor()), 1);
  await feature('accounts', 'register', { provider: 'local', account: 'conversation_portrait_acceptance', username: '头像构图验收',
    password: 'isolated-portrait-acceptance', confirmPassword: 'isolated-portrait-acceptance', rememberSession: true });
  const pets = [];
  for (const character of catalog.characters) {
    const { pet } = await feature('companions', 'adopt', { templateId: character.templateId, name: character.name, showOnDesktop: false, actionId: randomUUID() });
    assert.equal(pet.resource.resourceId, character.resourceId);
    const display = await feature('resources', 'resolve', { petId: pet.petId, resourceId: pet.resource.resourceId, context: 'desktop', action: 'idle' });
    const name = display.clip?.frameNames?.[0] ?? display.resource.atlas.animations[display.clip?.name]?.[0] ?? 'frame_0';
    pets.push({ petId: pet.petId, name: pet.name, resourceId: pet.resource.resourceId, frame: display.resource.atlas.frames[name].frame });
  }
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '聊天', exact: true }).click();
  await page.getByRole('heading', { name: '想说的话，我都在听。', exact: true }).waitFor();
  await waitUntil(async () => (await page.locator('.cv-pet-option .cv-avatar svg.resource-portrait[data-framing="portrait"] image').count()) === 6, 'six actual atlas portrait images');
  const portraits = await page.locator('.cv-pet-option .cv-avatar').evaluateAll(nodes => nodes.map(node => {
    const svg = node.querySelector('svg.resource-portrait[data-framing="portrait"]');
    return { petId: node.getAttribute('data-pet-id'), resourceId: node.getAttribute('data-resource-id'),
      viewBox: svg.getAttribute('viewBox').split(/\s+/).map(Number), image: decodeURIComponent(svg.querySelector('image').getAttribute('href')),
      transform: getComputedStyle(svg).transform, viewport: { width: node.clientWidth, height: node.clientHeight } };
  }));
  for (const portrait of portraits) {
    const pet = pets.find(pet => pet.petId === portrait.petId);
    assert.equal(portrait.resourceId, pet.resourceId);
    assert.ok(portrait.image.includes(encodeURI(pet.resourceId)) || portrait.image.includes(pet.resourceId));
    assert.equal(portrait.transform, 'none', 'crop belongs to shared geometry, with no extra feature CSS zoom');
    assert.ok(portrait.viewBox[3] > 0 && portrait.viewBox[3] < pet.frame.h * .9, 'portrait crops the subject instead of shrinking the whole body');
  }
  await page.locator('.cv-pet-option').filter({ has: page.locator('strong', { hasText: '礼帽喵' }) }).click();
  await page.getByRole('region', { name: '与礼帽喵的聊天', exact: true }).waitFor();
  await page.locator('.cv-thread-header .cv-avatar svg.resource-portrait[data-framing="portrait"] image').waitFor();
  await settlePortraits();
  assert.equal((await feature('conversations', 'snapshot')).petId, pets.find(pet => pet.name === '礼帽喵').petId);
  assert.equal((await feature('conversations', 'snapshot')).messages.length, 0);
  await page.screenshot({ path: join(output, 'chat-hatcat-1280.png'), fullPage: true });
  await page.locator('.cv-pet-list').screenshot({ path: join(output, 'six-portraits.png') });
  await page.getByRole('link', { name: '对话设置', exact: true }).click();
  await page.getByRole('heading', { name: '给每位伙伴，不同的声音与性格。', exact: true }).waitFor();
  await waitUntil(async () => (await page.locator('.cv-partners .cv-avatar svg.resource-portrait[data-framing="portrait"] image').count()) === 6, 'settings use the same portraits');
  await settlePortraits();
  await page.screenshot({ path: join(output, 'ai-portraits-1280.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '聊天', exact: true }).click();
  await page.getByRole('heading', { name: '想说的话，我都在听。', exact: true }).waitFor();
  await settlePortraits();
  await page.screenshot({ path: join(output, 'chat-hatcat-1440.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(modelRequests, 0);
  assert.deepEqual(errors, []);
  const evidence = { at: new Date().toISOString(), status: 'passed', scope: 'A07/A12 conversation portraits only', realElectron: true,
    isolatedProfile: true, zoomFactor: 1, portraits, pets, modelRequests, fabricatedMessages: false, errors,
    viewports: [{ width: 1280, height: 844 }, { width: 1440, height: 900 }],
    checks: ['Six canonical atlas identities remain unchanged.', 'Shared portrait viewports crop the subject with no extra feature CSS zoom.',
      'Hatcat list/header/empty-state and AI partner selector use close-up portraits.', 'Empty histories remain empty and no model endpoint is called.'] };
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/conversations/portrait/latest.txt'), output);
  console.log(JSON.stringify({ status: 'passed', checks: evidence.checks.length, output }));
} finally { if (app) await app.close(); }
