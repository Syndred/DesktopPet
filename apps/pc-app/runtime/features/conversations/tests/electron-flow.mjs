// Real production Electron/React/preload/feature-host/DPAPI/SQLite acceptance.
// The HTTP endpoint below is an explicitly local protocol fixture, not a cloud model.
import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const output = resolve('artifacts/conversations/electron', `run-${Date.now()}`);
const profileDir = join(output, 'profile');
mkdirSync(profileDir, { recursive: true });
const password = 'local-fixture-password';
let a, b, petOneId, petTwoId;

let mode = 'success';
let requestCount = 0;
let abortedStreams = 0;
const wireContexts = [];
const server = createServer(async (request, response) => {
  let input = '';
  for await (const chunk of request) input += chunk;
  const body = JSON.parse(input);
  requestCount++; wireContexts.push(body.messages);
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  const delta = content => response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
  delta('本机协议验收：');
  if (mode === 'wait') { response.on('close', () => abortedStreams++); return; }
  delta('已收到测试消息。'); response.end('data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
const env = { ...process.env, PET_USER_DATA_DIR: profileDir };
delete env.ELECTRON_RUN_AS_NODE;
let application;
let page;
const errors = [];
const checks = [];
const forbiddenAssetRequests = [];
async function launch(setup = false) {
  application = await electron.launch({ args: [resolve('.')], env });
  page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\.(glb|gltf|vrm)(?:$|\?)/i.test(request.url())) forbiddenAssetRequests.push(request.url()); });
  await page.waitForFunction(() => Boolean(window.lingjing));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setTitle('灵境 · 会话验收（独立数据）'));
  if (setup) return;
  await openChat();
}
async function openChat() {
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '聊天', exact: true }).click();
  await page.getByRole('heading', { name: '聊天' }).waitFor();
  await page.locator('.cv-pet-option').first().waitFor();
}
async function openSettings() {
  await page.getByRole('link', { name: '对话设置', exact: true }).click();
  await page.getByRole('heading', { name: 'AI 对话', exact: true }).waitFor();
  await page.getByRole('tab', { name: '全局连接', exact: true }).waitFor();
}
async function feature(feature, command, payload = {}) {
  const result = await page.evaluate(async ({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
  assert.equal(result.ok, true, result.message); return result.data;
}
async function invoke(command, payload = {}) {
  const result = await page.evaluate(async ({ command, payload }) => window.lingjing.invoke('conversations', command, payload), { command, payload });
  assert.equal(result.ok, true, result.message); return result.data;
}
async function choose(name) {
  await page.locator('.cv-pet-option').filter({ has: page.locator('strong', { hasText: name }) }).click();
  await page.getByRole('region', { name: `与${name}的聊天` }).waitFor();
}
async function waitUntil(predicate, label) {
  const end = Date.now() + 10000;
  while (!await predicate()) { if (Date.now() > end) throw new Error(`Timed out: ${label}`); await new Promise(done => setTimeout(done, 40)); }
}
async function switchAccount(account) {
  await feature('accounts', 'login', { account, password, provider: 'local', rememberSession: true });
}
try {
  await launch(true);
  const registration = { password, confirmPassword: password, provider: 'local', rememberSession: true };
  b = await feature('accounts', 'register', { ...registration, account: 'conversation_test_b', username: '会话验收乙' });
  await feature('companions', 'adopt', { templateId: 'big-fish-gentle', name: '鱼丸', actionId: randomUUID(), showOnDesktop: false });
  a = await feature('accounts', 'register', { ...registration, account: 'conversation_test_a', username: '会话验收甲' });
  const one = await feature('companions', 'adopt', { templateId: 'big-fish-gentle', name: '鱼丸', actionId: randomUUID(), showOnDesktop: false });
  const two = await feature('companions', 'adopt', { templateId: 'big-fish-gentle', name: '小蓝', actionId: randomUUID(), showOnDesktop: false });
  await feature('companions', 'adopt', { templateId: 'big-fish-gentle', name: '饭团', actionId: randomUUID(), showOnDesktop: false });
  petOneId = one.pet.petId; petTwoId = two.pet.petId;
  assert.equal(one.pet.templateId, two.pet.templateId); assert.equal(one.pet.resource.kind, '2d');
  await openChat();
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const preferences = await application.evaluate(({ BrowserWindow, safeStorage }) => ({
    secureStorage: safeStorage.isEncryptionAvailable(), preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(), electron: process.versions.electron
  }));
  assert.equal(preferences.secureStorage, true); assert.equal(preferences.preferences.contextIsolation, true); assert.equal(preferences.preferences.sandbox, true);
  checks.push('production window: sandbox + contextIsolation + real Electron safeStorage');

  await openSettings();
  await page.getByRole('tab', { name: '全局连接', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await waitUntil(async () => (await page.getByRole('tab', { name: '独立连接', exact: true }).getAttribute('aria-selected')) === 'true', 'Radix tabs keyboard activation');
  await page.keyboard.press('ArrowLeft');
  await waitUntil(async () => (await page.getByRole('tab', { name: '全局连接', exact: true }).getAttribute('aria-selected')) === 'true', 'Radix tabs keyboard return');
  const memorySwitch = page.getByRole('switch', { name: '启用记忆', exact: true });
  await memorySwitch.focus(); await page.keyboard.press('Space'); assert.equal(await memorySwitch.getAttribute('aria-checked'), 'false');
  await page.keyboard.press('Space'); assert.equal(await memorySwitch.getAttribute('aria-checked'), 'true');
  await page.getByRole('combobox', { name: '服务提供商', exact: true }).click();
  await page.getByRole('listbox').waitFor();
  await page.getByRole('option', { name: 'DeepSeek', exact: true }).focus();
  await page.keyboard.press('End');
  await waitUntil(async () => page.evaluate(() => document.activeElement?.textContent?.includes('OpenAI 兼容')), 'Select keyboard focus');
  await page.keyboard.press('Enter');
  assert.match(await page.getByRole('combobox', { name: '服务提供商', exact: true }).innerText(), /OpenAI 兼容/);
  checks.push('shared Radix Tabs, Select and Switch respond to arrow keys, End, Enter and Space');
  await page.getByLabel('API Key', { exact: true }).fill('synthetic-electron-fixture-key');
  await page.getByLabel('接口地址', { exact: true }).fill(baseUrl);
  await page.getByLabel('模型', { exact: true }).fill('local-protocol-fixture');
  await page.getByRole('button', { name: '保存连接', exact: true }).click();
  await page.getByPlaceholder('已保存；留空保留').waitFor();
  await page.getByRole('button', { name: '测试连接', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '可用' }).waitFor();
  await page.getByLabel(/性格设定/).fill('验收人设：鱼丸喜欢安静地分享日常。');
  await page.getByRole('button', { name: '保存伙伴人设', exact: true }).click();
  await waitUntil(async () => (await invoke('snapshot')).profile.persona.includes('验收人设'), 'persona save');
  await page.screenshot({ path: join(output, 'ai-settings.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const snapshot = await invoke('snapshot');
  assert.doesNotMatch(JSON.stringify(snapshot), /synthetic-electron-fixture-key|encryptedKey/);
  const encrypted = await application.evaluate(({ app }, output) => {
    const req = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
    const Database = req('better-sqlite3');
    const db = new Database(output + '/profile/lingjing.sqlite', { readonly: true });
    const key = db.prepare('SELECT encrypted_key AS key FROM conversation_connections').get().key;
    db.close();
    return { encrypted: !key.includes('synthetic-electron-fixture-key'), bytes: Buffer.from(key, 'base64').length };
  }, output);
  assert.equal(encrypted.encrypted, true); assert.ok(encrypted.bytes > 30);
  checks.push('settings buttons -> IPC -> DPAPI encrypted SQLite connection; HTTP connection test returned text');

  await openChat();
  const addMemory = page.getByRole('button', { name: '添加记忆', exact: true });
  for (let cycle = 0; cycle < 3; cycle++) {
    await addMemory.click();
    await page.getByRole('dialog').waitFor();
    for (let index = 0; index < 7; index++) await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('dialog').evaluate(dialog => dialog.contains(document.activeElement)), true);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    await waitUntil(async () => addMemory.evaluate(button => button === document.activeElement), 'Radix close autofocus returns to caller');
  }
  await page.getByRole('button', { name: '选择表情', exact: true }).click();
  await page.getByRole('button', { name: '😊', exact: true }).click();
  assert.equal(await page.getByLabel('给鱼丸发消息').inputValue(), '😊');
  await page.getByLabel('给鱼丸发消息').fill('');
  checks.push('shared Dialog traps focus, Escape closes and returns focus; Popover inserts emoji into assistant-ui composer');
  await page.getByRole('button', { name: '添加记忆', exact: true }).click();
  await page.getByRole('dialog').getByLabel('记忆内容', { exact: true }).fill('仅鱼丸记住：验收喜欢蓝色书签。');
  await page.getByRole('dialog').getByRole('button', { name: '保存记忆' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByLabel('给鱼丸发消息').fill('这是一条实际 IPC 与本地 HTTP 协议验收消息。');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await waitUntil(async () => (await invoke('snapshot')).messages.at(-1)?.status === 'complete', 'first UI reply');
  await page.getByRole('log', { name: '聊天记录' }).getByText('本机协议验收：已收到测试消息。', { exact: true }).waitFor();
  await page.locator('.cv-companion-reaction canvas').waitFor();
  assert.equal(await page.locator('model-viewer').count(), 0);
  assert.equal(await page.evaluate(() => typeof customElements.get('model-viewer')), 'undefined');
  assert.match(JSON.stringify(wireContexts.at(-1)), /仅鱼丸记住/);
  await page.screenshot({ path: join(output, 'chat-with-memory.png'), fullPage: true });
  checks.push('real compose + send + streamed rendering + user-added memory in outbound context');

  await choose('小蓝');
  const second = await invoke('snapshot');
  assert.equal(second.petId, petTwoId); assert.equal(second.messages.length, 0); assert.equal(second.memories.length, 0); assert.equal(second.profile.persona, '');
  await page.getByLabel('给小蓝发消息').fill('同形象第二只伙伴的独立验收。');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  await waitUntil(async () => (await invoke('snapshot')).messages.at(-1)?.status === 'complete', 'second instance reply');
  assert.doesNotMatch(JSON.stringify(wireContexts.at(-1)), /仅鱼丸记住|验收人设/);
  checks.push('two publicly adopted pets share one 2D template but keep independent persona, memory and history');

  mode = 'wait';
  await page.getByLabel('给小蓝发消息').fill('取消验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await page.getByRole('button', { name: '停止回复', exact: true }).waitFor();
  await waitUntil(async () => (await invoke('snapshot')).messages.at(-1)?.status === 'streaming', 'stream before cancel');
  await page.getByRole('button', { name: '停止回复', exact: true }).click();
  await page.getByRole('button', { name: '重新回复', exact: true }).waitFor();
  assert.equal((await invoke('snapshot')).messages.at(-1).status, 'cancelled');
  mode = 'success'; await page.getByRole('button', { name: '重新回复', exact: true }).click();
  await waitUntil(async () => (await invoke('snapshot')).messages.at(-1)?.status === 'complete', 'UI retry');
  assert.equal((await invoke('snapshot')).messages.length, 4);
  checks.push('stop button aborts real HTTP stream; retry reuses one user message');

  await application.close(); application = null;
  await launch();
  const restored = await invoke('snapshot');
  assert.equal(restored.petId, petTwoId); assert.equal(restored.messages.length, 4); assert.equal(restored.globalConnection.hasKey, true);
  await choose('鱼丸');
  const oneRestored = await invoke('snapshot');
  assert.equal(oneRestored.messages.length, 2); assert.equal(oneRestored.memories.length, 1); assert.match(oneRestored.profile.persona, /验收人设/);
  checks.push('actual Electron process restart restores both histories, selection, persona, notes and decryptable credential');

  const note = oneRestored.memories[0];
  await invoke('memory.delete', { petId: petOneId, id: note.id, revision: note.revision });
  await waitUntil(async () => (await page.locator('.cv-memories li').count()) === 0, 'deleted note UI readback');
  await invoke('send', { petId: petOneId, actionId: 'after-deletion', text: '删除记忆后的新消息。' });
  assert.doesNotMatch(JSON.stringify(wireContexts.at(-1)), /仅鱼丸记住/);
  checks.push('real IPC note deletion updates UI and removes note from the next model context');

  mode = 'wait';
  await page.getByLabel('给鱼丸发消息').fill('切换账号时停止。'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await waitUntil(async () => (await invoke('snapshot')).messages.at(-1)?.status === 'streaming', 'stream before account switch');
  await page.getByLabel('给鱼丸发消息').fill('旧账号未发送的私密草稿');
  await page.getByRole('button', { name: '添加记忆', exact: true }).click();
  await page.getByRole('dialog').getByLabel('记忆内容').fill('旧账号未保存的记忆草稿');
  // Switch the retained local session in the real main process. Cloud login is
  // outside this fixture; synthetic credentials must never be sent to that service.
  // The feature's
  // session observer must invalidate the mounted renderer and abort the old owner.
  await switchAccount('conversation_test_b');
  await waitUntil(async () => (await invoke('snapshot')).accountId === b.currentUser.id, 'new owner');
  await waitUntil(async () => (await page.locator('.cv-memories li').count()) === 0 && (await page.locator('.cv-message').count()) === 0, 'new owner UI cleared');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.getByLabel('给鱼丸发消息').inputValue(), '');
  assert.equal(await page.getByText('旧账号未保存的记忆草稿').count(), 0);
  const clean = await invoke('snapshot');
  assert.equal(clean.messages.length, 0); assert.equal(clean.memories.length, 0); assert.equal(clean.globalConnection, null);
  await switchAccount('conversation_test_a');
  await waitUntil(async () => (await invoke('snapshot')).accountId === a.currentUser.id, 'original owner returns');
  await waitUntil(async () => (await invoke('snapshot')).messages.at(-1)?.status === 'cancelled', 'old request persisted cancelled');
  await page.screenshot({ path: join(output, 'restored-after-switch.png'), fullPage: true });
  checks.push('retained local main session switch clears mounted UI, aborts pending response, and restores original owner on return');

  await openSettings();
  await page.getByLabel('API Key', { exact: true }).fill('synthetic-unsaved-old-session');
  await page.getByRole('button', { name: '添加记忆', exact: true }).click();
  await page.getByRole('dialog').getByLabel('记忆内容').fill('设置页旧账号的私密草稿');
  await switchAccount('conversation_test_b');
  await waitUntil(async () => (await page.getByRole('dialog').count()) === 0, 'settings dialog discarded on account switch');
  assert.equal(await page.getByLabel('API Key', { exact: true }).inputValue(), '');
  await switchAccount('conversation_test_a');
  await waitUntil(async () => (await invoke('snapshot')).accountId === a.currentUser.id, 'account A settings returns');
  assert.equal(await page.getByRole('dialog').count(), 0);
  checks.push('chat drafts, settings dialogs and unsaved keys never reappear in another account or login');
  await openChat();

  mode = 'success';
  await page.getByRole('button', { name: '重新回复', exact: true }).click();
  await waitUntil(async () => (await invoke('snapshot')).messages.at(-1)?.status === 'complete', 'reply before motion verification');
  await page.locator('.cv-companion-reaction canvas').waitFor();
  const preference = await feature('accounts', 'settingsGet');
  await feature('accounts', 'settingsSave', { document: { ...preference.document, desktop: { ...preference.document.desktop, animationsEnabled: false } },
    revision: preference.revision, actionId: randomUUID() });
  await page.locator('.cv-companion-reaction .cp-sheet-thumbnail').waitFor();
  assert.equal(await page.locator('.cv-companion-reaction canvas').count(), 0);
  await openSettings();
  await waitUntil(async () => (await page.locator('.app-page-motion').getAttribute('data-motion')) === 'reduced', 'app animation preference');
  const disabled = await feature('accounts', 'settingsGet');
  await feature('accounts', 'settingsSave', { document: { ...disabled.document, desktop: { ...disabled.document.desktop, animationsEnabled: true } },
    revision: disabled.revision, actionId: randomUUID() });
  await openChat();
  const sprite = page.locator('.cv-companion-reaction [data-renderer="pixi-spritesheet"]');
  await sprite.waitFor();
  const movingFrame = await sprite.getAttribute('data-frame');
  await waitUntil(async () => (await sprite.getAttribute('data-frame')) !== movingFrame, 'actual Pixi frames advance');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await waitUntil(async () => (await page.locator('.app-page-motion').getAttribute('data-motion')) === 'reduced', 'live system reduced motion');
  const stoppedFrame = await sprite.getAttribute('data-frame');
  await new Promise(done => setTimeout(done, 350));
  assert.equal(await sprite.getAttribute('data-frame'), stoppedFrame);
  assert.deepEqual(forbiddenAssetRequests, []);
  checks.push('app animation-off switches the actual character to a still frame; live OS reduced motion freezes advancing Pixi frames; no 3D element or model asset request');

  await page.setViewportSize({ width: 980, height: 750 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const flat = await page.locator('.cv-root button').evaluateAll(buttons => buttons.every(button => getComputedStyle(button).boxShadow === 'none' && getComputedStyle(button).transform === 'none'));
  assert.equal(flat, true); assert.deepEqual(errors, []);
  assert.ok(abortedStreams >= 2);
  const evidence = { at: new Date().toISOString(), status: 'passed', cloudModelTest: 'not-run-no-authorized-model-config',
    transport: 'AI SDK 7 + local HTTP protocol fixture; not a cloud model', electron: preferences.electron, checks, requestCount, abortedStreams,
    reused: { assistantUi: '0.15.31', aiSdk: '7.0.152', openaiCompatible: '3.0.77', radix: '1.8.1', motion: '14.6.0', pixi: '8.22.0' },
    twoDOnly: { modelViewerElements: 0, modelViewerRegistered: false, modelAssetRequests: forbiddenAssetRequests.length, actualPixiCanvas: true },
    sqliteFile: join(profileDir, 'lingjing.sqlite'), window: { sandbox: true, contextIsolation: true, safeStorage: true },
    noRendererKeyStorage: await page.evaluate(() => localStorage.length === 0), errors };
  assert.equal(evidence.noRendererKeyStorage, true);
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/conversations/electron/latest.txt'), output);
  console.log(JSON.stringify({ status: 'passed', checks: checks.length, output }));
  if (process.env.CONVERSATIONS_KEEP_OPEN === '1') {
    console.log('Window remains open for native visual verification. Create close-requested in the output directory to finish.');
    const until = Date.now() + 120000;
    while (!existsSync(join(output, 'close-requested')) && Date.now() < until) await new Promise(done => setTimeout(done, 500));
  }
} finally {
  if (application) await application.close();
  server.closeAllConnections(); await new Promise(done => server.close(done));
}
