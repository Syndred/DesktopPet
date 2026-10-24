// Real Electron self-acceptance for U02/U05/U07: compact copy, five elements,
// canonical portraits, keyboard hints and actual local error/state operations.
// No mock model response, no external model endpoint, no normal user profile.
import { _electron as electron } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

const catalog = JSON.parse(readFileSync(resolve('apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json'), 'utf8'));
const requiredElements = ['metal', 'wood', 'water', 'fire', 'earth'];
assert.ok(requiredElements.every(element => catalog.characters.some(character => character.element === element)), 'The canonical roster must cover all five elements.');
const output = resolve('artifacts/conversations/compact', `run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: join(output, 'qa-profile') };
delete env.ELECTRON_RUN_AS_NODE;
const qaKey = 'synthetic-local-error-acceptance-key';
// Reserve, then release, an ordinary local port so fetch reaches the actual
// connection-refused path rather than a browser's restricted-port check.
const unavailableBaseUrl = await new Promise((done, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(error => error ? reject(error) : done(`http://127.0.0.1:${port}/v1`));
  });
});
let app;
let page;
let settingsLayout;
const errors = [];
const operations = [];
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sourceFiles = ['apps/pc-app/runtime/features/conversations/service.cjs', 'apps/pc-app/ui/src/features/conversations/components.tsx',
  'apps/pc-app/ui/src/features/conversations/chat-page.tsx', 'apps/pc-app/ui/src/features/conversations/settings-page.tsx',
  'apps/pc-app/ui/src/features/conversations/assistant-thread.tsx', 'apps/pc-app/ui/src/features/conversations/styles.css',
  'apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json'];
const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(resolve(file))).digest('hex')]));
const buildProvenance = JSON.parse(readFileSync(resolve('apps/pc-app/dist/build-manifest.json'), 'utf8'));
assert.equal(buildProvenance.sourceCommit, sourceCommit, 'Build the current source revision before acceptance.');
async function readDatabase(petId) {
  return app.evaluate(({ app }, { output, petId, qaKey }) => {
    const req = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const Database = req('better-sqlite3');
    const db = new Database(output + '/qa-profile/lingjing.sqlite', { readonly: true });
    try {
      const profile = db.prepare('SELECT owner_account_id, pet_id, persona, memory_enabled FROM conversation_profiles WHERE pet_id = ?').get(petId);
      const messages = db.prepare('SELECT role, content, status, error_code, attempt FROM conversation_messages WHERE pet_id = ? ORDER BY sequence').all(petId);
      const memories = db.prepare('SELECT id, content FROM conversation_memories WHERE pet_id = ?').all(petId);
      const connection = db.prepare('SELECT encrypted_key FROM conversation_connections WHERE owner_account_id = ?').get(profile.owner_account_id);
      return { profile, messages, memories, keyEncrypted: Boolean(connection?.encrypted_key) && !connection.encrypted_key.includes(qaKey),
        encryptedKeyBytes: connection?.encrypted_key ? Buffer.from(connection.encrypted_key, 'base64').length : 0 };
    } finally { db.close(); }
  }, { output, petId, qaKey });
}
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
async function settleAnimations() {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {})));
  });
}
async function settle() {
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.app-page-motion')).opacity) > .99);
  await page.evaluate(async () => {
    const urls = [...new Set([...document.querySelectorAll('.cv-root svg.resource-portrait image')].map(image => image.getAttribute('href')))];
    await Promise.all(urls.map(async url => { const image = new Image(); image.src = url; await image.decode(); }));
  });
  await settleAnimations();
}
async function openChat() {
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '聊天', exact: true }).click();
  await page.getByRole('heading', { name: '聊天', exact: true }).waitFor();
}
async function openSettings() {
  await page.getByRole('link', { name: '对话设置', exact: true }).click();
  await page.getByRole('heading', { name: 'AI 对话', exact: true }).waitFor();
}
async function choose(pet) {
  await page.locator('.cv-pet-option').filter({ has: page.locator(`.cv-avatar[data-pet-id="${pet.petId}"]`) }).click();
  await page.getByRole('region', { name: `与${pet.name}的聊天`, exact: true }).waitFor();
  await waitUntil(async () => (await page.locator('.cv-thread-header .cv-avatar').getAttribute('data-resource-id')) === pet.resource.resourceId, 'selected canonical identity');
  await page.locator('.cv-thread-header .resource-portrait image').waitFor();
  await page.locator('.cv-pet-scene .resource-portrait image').waitFor();
}
try {
  app = await electron.launch({ args: [resolve('.')], env });
  page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 844 });
  page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  await feature('accounts', 'register', { provider: 'local', account: 'conversation_compact_qa', username: '聊天自验',
    password: 'isolated-compact-ui', confirmPassword: 'isolated-compact-ui', rememberSession: true });
  const pets = [];
  for (const character of catalog.characters) {
    const { pet } = await feature('companions', 'adopt', { templateId: character.templateId, name: character.name, showOnDesktop: false, actionId: randomUUID() });
    assert.equal(pet.element, character.element); assert.equal(pet.resource.resourceId, character.resourceId); pets.push(pet);
  }
  await openChat();
  const snapshot = await feature('conversations', 'snapshot');
  assert.equal(snapshot.pets.length, catalog.characters.length);
  for (const pet of pets) assert.equal(snapshot.pets.find(item => item.petId === pet.petId).element, pet.element);
  await waitUntil(async () => (await page.locator('.cv-pet-option .cv-avatar svg[data-framing="portrait"] image').count()) === pets.length, 'all canonical portraits');
  const portraitRows = await page.locator('.cv-pet-option').evaluateAll(rows => rows.map(row => ({
    petId: row.querySelector('.cv-avatar').getAttribute('data-pet-id'), resourceId: row.querySelector('.cv-avatar').getAttribute('data-resource-id'),
    element: row.querySelector('[data-element]').getAttribute('data-element'), image: decodeURIComponent(row.querySelector('.resource-portrait image').getAttribute('href'))
  })));
  for (const row of portraitRows) {
    const pet = pets.find(pet => pet.petId === row.petId);
    assert.equal(row.resourceId, pet.resource.resourceId); assert.equal(row.element, pet.element); assert.ok(row.image.includes(row.resourceId));
  }
  assert.equal(new Set(portraitRows.map(row => row.resourceId)).size, catalog.characters.length);
  const removedCopy = ['同样的形象，也有不同的小世界', '你们的故事，从这一句话开始', '仅当前实例', '实例 ·', 'DPAPI', '主进程', 'SSE'];
  const visibleCopy = await page.locator('.cv-root').innerText();
  for (const text of removedCopy) assert.equal(visibleCopy.includes(text), false);
  const projections = [];
  for (const element of requiredElements) {
    const pet = pets.find(item => item.element === element);
    await choose(pet); await settle();
    const projection = await page.locator('.cv-thread-header').evaluate(header => ({
      element: header.querySelector('[data-element]').getAttribute('data-element'),
      resourceId: header.querySelector('.cv-avatar').getAttribute('data-resource-id'),
      image: decodeURIComponent(header.querySelector('.resource-portrait image').getAttribute('href'))
    }));
    assert.equal(projection.element, element); assert.equal(projection.resourceId, pet.resource.resourceId); assert.ok(projection.image.includes(pet.resource.resourceId));
    assert.equal(await page.locator('.cv-pet-scene svg').getAttribute('data-framing'), 'portrait');
    assert.equal((await feature('conversations', 'snapshot')).messages.length, 0);
    projections.push({ petId: pet.petId, name: pet.name, ...projection });
    await page.screenshot({ path: join(output, `chat-${element}.png`), fullPage: true });
  }
  operations.push('All five authoritative elements project into the real chat list/header/side portrait; every canonical resource remains distinct.');

  const selected = pets.find(pet => pet.element === 'wood');
  await choose(selected);
  await page.getByRole('button', { name: '发送快捷键', exact: true }).focus();
  await page.getByRole('tooltip').filter({ hasText: 'Shift+Enter' }).waitFor();
  await settleAnimations();
  await page.screenshot({ path: join(output, 'chat-keyboard-hint.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '添加记忆', exact: true }).click();
  await page.getByRole('dialog').getByLabel('记忆内容', { exact: true }).fill(`QA：仅${selected.name}保留的记忆`);
  await page.getByRole('dialog').getByRole('button', { name: '保存记忆', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await waitUntil(async () => (await feature('conversations', 'snapshot')).memories.length === 1, 'memory persisted');
  const note = (await feature('conversations', 'snapshot')).memories[0];
  await openSettings();
  await settle();
  const settingsHeading = await page.getByRole('heading', { name: 'AI 对话', exact: true }).boundingBox();
  const returnControl = await page.getByRole('link', { name: '回到聊天', exact: true }).boundingBox();
  settingsLayout = { headerControlCenterDifference: Math.abs(settingsHeading.y + settingsHeading.height / 2 - returnControl.y - returnControl.height / 2),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth) };
  assert.ok(settingsLayout.headerControlCenterDifference <= 8); assert.equal(settingsLayout.horizontalOverflow, false);
  await page.getByRole('button', { name: '密钥提示', exact: true }).focus();
  await page.getByRole('tooltip').filter({ hasText: '密钥加密保存在本机' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('group', { name: '请先填写并保存密钥。', exact: true }).focus();
  await page.getByRole('tooltip').filter({ hasText: '请先填写并保存密钥' }).waitFor();
  await settleAnimations();
  await page.screenshot({ path: join(output, 'settings-disabled-hint.png'), fullPage: true });
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '全局连接', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await waitUntil(async () => (await page.getByRole('tab', { name: '独立连接', exact: true }).getAttribute('aria-selected')) === 'true', 'Radix keyboard tab');
  await page.keyboard.press('ArrowLeft');
  await page.getByLabel('性格设定', { exact: true }).fill(`QA：${selected.name}使用简短回复`);
  await page.getByRole('switch', { name: '启用记忆', exact: true }).focus(); await page.keyboard.press('Space');
  await page.getByRole('button', { name: '保存伙伴人设', exact: true }).click();
  await waitUntil(async () => (await feature('conversations', 'snapshot')).profile.memoryEnabled === false, 'profile keyboard change persisted');
  await settle();
  await page.screenshot({ path: join(output, 'ai-compact-1280.png'), fullPage: true });
  operations.push('Shared tooltips expose keyboard/key/disabled reasons on focus; Tabs, Switch, memory save and persona save operate through actual IPC.');

  await page.getByLabel('模型', { exact: true }).fill('qa-local-unavailable');
  await page.getByLabel('API Key', { exact: true }).fill(qaKey);
  await page.getByLabel('接口地址', { exact: true }).fill('http://not-local.invalid/v1');
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await page.locator('.cv-connection [role="alert"]').waitFor();
  assert.equal((await feature('conversations', 'snapshot')).globalConnection, null);
  assert.equal((await page.locator('.cv-connection [role="alert"]').innerText()).includes(qaKey), false);
  await page.getByLabel('接口地址', { exact: true }).fill(unavailableBaseUrl);
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await page.getByPlaceholder('已保存；留空保留', { exact: true }).waitFor();
  const configured = await feature('conversations', 'snapshot');
  assert.equal(configured.globalConnection.hasKey, true); assert.equal(JSON.stringify(configured).includes(qaKey), false);
  operations.push('Invalid non-local HTTP address is rejected before storage; valid local configuration stores only a redacted key state.');

  // Observe real fetch attempts to an unavailable local endpoint. This does not
  // inject a response, simulate an online model, or contact an external model.
  await app.evaluate((_electron, { needle, baseUrl }) => {
    const original = globalThis.fetch;
    globalThis.__conversationCompactNetwork = { attempts: 0, savedMemoryIncluded: [] };
    globalThis.fetch = (...args) => {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url ?? String(args[0]);
      if (String(url).startsWith(baseUrl + '/')) {
        globalThis.__conversationCompactNetwork.attempts++;
        globalThis.__conversationCompactNetwork.savedMemoryIncluded.push(String(args[1]?.body).includes(needle));
      }
      return original(...args);
    };
  }, { needle: note.content, baseUrl: unavailableBaseUrl });
  await openChat();
  await page.getByLabel(`给${selected.name}发消息`, { exact: true }).fill('QA：验证真实本机连接失败状态');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await waitUntil(async () => (await feature('conversations', 'snapshot')).messages.at(-1)?.status === 'failed', 'real local failure');
  await page.getByRole('button', { name: '重新回复', exact: true }).click();
  await waitUntil(async () => { const data = await feature('conversations', 'snapshot'); return data.messages.at(-1)?.status === 'failed' && data.messages.at(-1)?.attempt === 2; }, 'retry icon preserves one user turn');
  const failed = await feature('conversations', 'snapshot');
  assert.equal(failed.messages.length, 2); assert.equal(failed.messages.at(-1).errorCode, 'NETWORK_ERROR');
  assert.equal(failed.messages.at(-1).content, '');
  const network = await app.evaluate(() => globalThis.__conversationCompactNetwork);
  assert.equal(network.attempts, 2); assert.deepEqual(network.savedMemoryIncluded, [false, false]);
  const failedDatabase = await readDatabase(selected.petId);
  assert.equal(failedDatabase.messages.length, 2); assert.equal(failedDatabase.messages[1].attempt, 2);
  assert.equal(failedDatabase.messages[1].error_code, 'NETWORK_ERROR'); assert.equal(failedDatabase.keyEncrypted, true);
  assert.ok(failedDatabase.encryptedKeyBytes > 30);
  await settle(); await page.screenshot({ path: join(output, 'chat-real-local-error.png'), fullPage: true });
  operations.push('Icon send/retry execute two real unavailable-local-endpoint attempts; no assistant reply is fabricated, memory-off excludes the saved note, and one user turn is retained.');
  await page.getByRole('button', { name: '清空当前伙伴聊天记录', exact: true }).click();
  await page.getByRole('dialog').getByText('聊天将清空，人设与记忆保留。', { exact: true }).waitFor();
  await page.getByRole('dialog').getByRole('button', { name: '确认清空', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  const cleared = await feature('conversations', 'snapshot');
  assert.equal(cleared.messages.length, 0); assert.equal(cleared.memories[0].id, note.id);
  assert.equal(cleared.profile.persona, `QA：${selected.name}使用简短回复`);
  const clearedDatabase = await readDatabase(selected.petId);
  assert.equal(clearedDatabase.messages.length, 0); assert.equal(clearedDatabase.memories[0].id, note.id);
  assert.equal(clearedDatabase.profile.memory_enabled, 0); assert.equal(clearedDatabase.profile.persona, cleared.profile.persona);
  assert.equal(await page.evaluate(() => localStorage.length), 0);
  operations.push('Short destructive confirmation remains explicit; real history clear preserves the saved memory/persona and renderer key storage remains empty.');
  await page.setViewportSize({ width: 1440, height: 900 }); await settle();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(output, 'chat-compact-1440.png'), fullPage: true });
  assert.deepEqual(errors, []);
  const evidence = { at: new Date().toISOString(), status: 'passed', sourceCommit, sourceHashes, buildProvenance, realElectron: true, isolatedQaProfile: true, simulation: 'none',
    modelVerification: 'real local connection failure only; no mocked response and no external model', network, operations, portraitRows, projections,
    sqliteReadback: { failed: failedDatabase, cleared: clearedDatabase },
    canonicalCount: catalog.characters.length, coveredElements: requiredElements, rendererErrors: errors, settingsLayout,
    dataReadback: { selectedPetId: cleared.petId, historyAfterClear: cleared.messages.length, savedMemoryRetained: cleared.memories[0].id === note.id,
      personaRetained: true, memoryEnabled: cleared.profile.memoryEnabled, encryptedKeyConfigured: cleared.globalConnection.hasKey, rendererKeyStorage: 0 },
    viewports: [{ width: 1280, height: 844 }, { width: 1440, height: 900 }] };
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/conversations/compact/latest.txt'), output);
  console.log(JSON.stringify({ status: 'passed', operations: operations.length, coveredElements: requiredElements, output }));
} finally { if (app) await app.close(); }
