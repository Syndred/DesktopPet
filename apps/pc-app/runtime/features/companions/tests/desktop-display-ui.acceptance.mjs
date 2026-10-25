import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Actual page components and client hooks, controlled IPC, portrait/motion/battle
// ports and isolated headless Chrome. No Electron/product/native UI is started.
const root = resolve('.'), output = resolve(process.argv[2] || 'artifacts/companions/user-qa/qa016-effective-display-20261026/components');
mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url), { DatabaseSync } = require('node:sqlite');
const { migrateCompanions } = require('../migrations.cjs'), { CompanionsService } = require('../service.cjs');
const { projectDesktopDisplay } = require('../desktop-display.cjs'), { defaultSettings } = require('../../accounts/settings.cjs');
const db = new DatabaseSync(':memory:'); migrateCompanions(db);
const owner = 'qa_display_ui_a', foreign = 'qa_display_ui_b'; let sequence = 0;
const service = new CompanionsService({ db, uuid: () => `ui-display-${++sequence}` });
const pets = ['animal-white-fox', 'animal-white-fox', 'animal-wood-deer', 'animal-wood-deer', 'animal-shiba'].map((templateId, index) => ({ ...service.adopt(owner, { actionId: `ui-adopt-${index}`, templateId, name: '原名字', showOnDesktop: true }).data.pet, globalSerial: String(index + 1) }));
const templates = service.templates(); db.close();
function packet({ limit = 4, fullscreen = false, order = [0, 1, 2, 3, 4], who = owner, values = pets } = {}) {
  const document = defaultSettings(); document.desktop.companionLimit = limit;
  const windows = order.map((petIndex, index) => ({ id: index + 4, alwaysOnTop: true, visible: index < limit && !fullscreen,
    slotAllocated: index < limit, hiddenReason: index >= limit ? 'limit' : fullscreen ? 'fullscreen' : null }));
  const host = { ownerAccountId: who, startup: false, fullscreenMonitor: true, fullscreenMonitorReady: true, foregroundFullscreen: fullscreen,
    fullscreenSource: fullscreen ? 'win32' : null, companionWindows: windows.length, companionLimit: limit, clickThroughWindows: [], windows,
    locationAllowed: false, emotionStatistics: false, closeToTrayConnected: true, companionLimitConnected: true };
  const snapshot = { ownerAccountId: who, pets: structuredClone(values), templates, selections: { chatPetId: null, battlePetId: null, guardPetId: null }, revision: 7 };
  snapshot.desktopDisplay = projectDesktopDisplay({ ownerAccountId: who, currentOwnerAccountId: who, pets: snapshot.pets,
    windows: order.map((petIndex, index) => ({ petId: values[petIndex].petId, ownerAccountId: who, windowId: index + 4 })), host });
  return { snapshot, settings: { document, revision: 7, updatedAt: '2026-10-26', host } };
}
const ports = {
  portrait: 'import React from "react";export function CompanionPortrait({name}){return <div role="img" aria-label={name+"的测试形象"}/>}',
  action: 'import React from "react";export function ActionPreview(){return <div/>}',
  navigation: 'export function usePath(){return window.__qa.path}export function navigate(path){window.__qa.navigations.push(path)}',
  motion: 'import React from "react";export function AnimatedList({children,...props}){return <div {...props}>{children}</div>}',
  battle: 'import React from "react";export function ElementMark({element}){return <i aria-hidden="true" data-element={element}/>}export function BattleSkillSummary(){return <div/>}'
};
const bundle = await build({ stdin: { contents: 'import React from "react";import{createRoot}from"react-dom/client";import{CompanionsPage}from"./apps/pc-app/ui/src/features/companions/CompanionsPage.tsx";import{PetDetailPage}from"./apps/pc-app/ui/src/features/companions/PetDetailPage.tsx";import{SettingsPage}from"./apps/pc-app/ui/src/features/accounts/settings-page.tsx";window.__root=createRoot(document.getElementById("root"));window.__root.render(window.__qa.page==="settings"?<SettingsPage/>:window.__qa.page==="detail"?<PetDetailPage/>:<CompanionsPage/>);', loader: 'tsx', resolveDir: root, sourcefile: 'desktop-display-entry.tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.css': 'empty', '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'non-display-ports', setup(builder) {
    builder.onResolve({ filter: /^\.\/(CompanionPortrait|ActionPreview)$/ }, args => args.importer.replaceAll('\\', '/').includes('/features/companions/') ? { path: args.path.endsWith('CompanionPortrait') ? 'portrait' : 'action', namespace: 'ports' } : undefined);
    builder.onResolve({ filter: /^\.\.\/\.\.\/(app\/navigation|components\/motion)$/ }, args => ({ path: args.path.endsWith('navigation') ? 'navigation' : 'motion', namespace: 'ports' }));
    builder.onResolve({ filter: /^\.\.\/battle\/BattleMoves$/ }, () => ({ path: 'battle', namespace: 'ports' }));
    builder.onLoad({ filter: /.*/, namespace: 'ports' }, args => ({ contents: ports[args.path], loader: 'tsx', resolveDir: root }));
  } }] });
const browser = await chromium.launch({ channel: 'chrome', headless: true }), results = [];
async function run(name, configuration, check) {
  const page = await browser.newPage(), errors = [];
  page.setDefaultTimeout(5000);
  try {
    page.on('pageerror', error => errors.push(error.message));
    await page.route('http://127.0.0.1/**', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="root"></div></body></html>' }));
    await page.goto('http://127.0.0.1/display-check');
    await page.evaluate(config => {
      const listeners = new Map(), qa = { ...config, calls: [], navigations: [], held: [] };
      qa.emit = (name, value) => { for (const listener of [...(listeners.get(name) || [])]) listener(value); };
      qa.listenerCount = () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0);
      qa.session = () => ({ currentUser: { id: qa.sessionId || qa.snapshot.ownerAccountId, ownerAccountId: qa.snapshot.ownerAccountId, username: '测试用户', account: 'qa', provider: 'local' }, scenario: null });
      qa.policy = () => ({ ownerAccountId: qa.snapshot.ownerAccountId, desktopDisplayFingerprint: JSON.stringify(qa.settings.host.windows.map(w => [w.id, w.visible, w.slotAllocated, w.hiddenReason])), companionLimit: qa.settings.host.companionLimit, fullscreen: qa.settings.host.foregroundFullscreen, settings: qa.settings.document });
      qa.reply = (data, revision = 7) => ({ ok: true, data: structuredClone(data), revision });
      window.__qa = qa;
      window.lingjing = { subscribe(name, listener) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(listener); return () => listeners.get(name).delete(listener); },
        async invoke(feature, command, payload = {}) {
          qa.calls.push({ feature, command, payload });
          if (feature === 'companions' && command === 'list') {
            const reply = qa.reply(qa.snapshot);
            if (qa.holdNextList) { qa.holdNextList = false; return new Promise(resolve => qa.held.push(() => resolve(reply))); }
            if (qa.broadcastOnList) queueMicrotask(() => qa.emit('accounts:behavior', qa.policy()));
            return reply;
          }
          if (feature === 'companions' && command === 'desktop') {
            qa.snapshot = structuredClone(payload.visible ? qa.toggleOn : qa.toggleOff);
            return qa.reply({ pet: qa.snapshot.pets.find(pet => pet.petId === payload.petId), selections: qa.snapshot.selections });
          }
          if (feature === 'companions' && command === 'combatProfile') return qa.reply({ petId: payload.petId, rules: { label: '测试规则', maxHp: 120 } });
          if (feature === 'accounts' && command === 'session') return qa.reply(qa.session());
          if (feature === 'accounts' && command === 'settingsGet') {
            const reply = qa.reply(qa.settings);
            if (qa.holdNextSettings) { qa.holdNextSettings = false; return new Promise(resolve => qa.held.push(() => resolve(reply))); }
            if (qa.broadcastOnSettings) queueMicrotask(() => qa.emit('accounts:behavior', qa.policy()));
            return reply;
          }
          if (feature === 'accounts' && command === 'settingsSave') {
            qa.settings = { ...qa.settings, document: structuredClone(payload.document), revision: qa.settings.revision + 1,
              host: structuredClone(qa.savedHost) };
            qa.emit('accounts:behavior', qa.policy()); return qa.reply(qa.settings);
          }
          return { ok: false, message: '未提供的组件端口', code: 'FIXTURE_UNAVAILABLE' };
        }, window: { minimize() {}, maximize() {}, close() {} } };
    }, configuration);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.waitForSelector(configuration.page === 'settings' ? '.ac-preview-caption' : configuration.page === 'detail' ? '.cp-detail-badges' : '.cp-roster');
    await check(page);
    await page.evaluate(() => window.__root.unmount());
    assert.equal(await page.evaluate(() => window.__qa.listenerCount()), 0, 'event listeners must be removed on unmount');
    assert.deepEqual(errors, []); results.push({ name, passed: true });
  } catch (error) { results.push({ name, passed: false, error: error.message }); }
  finally { console.log('DESKTOP_UI_CASE ' + JSON.stringify(results.at(-1))); await page.close(); }
}
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  const normal = packet();
  await run('five-preferences-four-visible-and-filter-by-real-view', { ...normal, page: 'overview', path: '/companions' }, async page => {
    assert.match(await page.locator('.page-header').innerText(), /已开启陪伴 5 只.*桌面显示 4 只/);
    assert.match(await page.locator(`[data-pet-id="${pets[4].petId}"] .cp-pet-card-title`).innerText(), /等待空位/);
    await page.getByRole('button', { name: '桌面中 4', exact: true }).click();
    assert.equal(await page.locator('.cp-pet-card').count(), 4); assert.equal(await page.locator(`.cp-pet-card[data-pet-id="${pets[4].petId}"]`).count(), 0);
  });
  await run('same-preferences-fullscreen-actual-zero-retains-switches', { ...packet({ fullscreen: true }), page: 'overview', path: '/companions' }, async page => {
    assert.match(await page.locator('.page-header').innerText(), /已开启陪伴 5 只.*桌面显示 0 只/);
    assert.equal(await page.getByRole('switch').isChecked(), true); assert.match(await page.locator('.cp-presence').innerText(), /全屏/);
    await page.getByRole('button', { name: '桌面中 0', exact: true }).click(); assert.equal(await page.locator('.cp-pet-card').count(), 0);
  });
  await run('allocation-order-is-not-the-pet-list-first-four', { ...packet({ order: [4, 1, 3, 0, 2] }), page: 'overview', path: '/companions' }, async page => {
    await page.getByRole('button', { name: '桌面中 4', exact: true }).click();
    assert.equal(await page.locator(`.cp-pet-card[data-pet-id="${pets[4].petId}"]`).count(), 1);
    assert.equal(await page.locator(`.cp-pet-card[data-pet-id="${pets[2].petId}"]`).count(), 0);
  });
  const off = structuredClone(normal.snapshot); off.pets[4].desktop.visible = false; off.desktopDisplay.pets[4] = { petId: pets[4].petId, state: 'off', reason: null };
  await run('detail-and-switch-feedback-use-the-same-trusted-state', { ...normal, page: 'detail', path: `/companions/${pets[4].petId}`, toggleOff: off, toggleOn: normal.snapshot }, async page => {
    assert.match(await page.locator('.cp-detail-badges').innerText(), /等待空位/);
    await page.getByRole('tab', { name: '外观', exact: true }).click();
    const control = page.getByRole('switch'); assert.equal(await control.isChecked(), true);
    await control.click(); await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false');
    await control.click(); await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true');
    const calls = await page.evaluate(() => window.__qa.calls.filter(call => call.command === 'desktop'));
    assert.deepEqual(calls.map(call => [call.payload.petId, call.payload.visible]), [[pets[4].petId, false], [pets[4].petId, true]]);
    assert.ok(calls.every(call => typeof call.payload.actionId === 'string' && !Object.hasOwn(call.payload, 'desktopDisplay')));
    assert.match(await page.locator('.cp-desktop-controls [role="status"]').innerText(), /空出位置/);
  });
  await run('settings-visible-count-is-not-created-count-and-draft-limit-is-not-applied-limit', { ...packet({ limit: 1 }), page: 'settings', path: '/preferences', savedHost: normal.settings.host }, async page => {
    assert.match(await page.locator('.ac-preview-caption').innerText(), /当前显示 1 \/ 1/);
    await page.getByRole('combobox', { name: '桌面陪伴数量', exact: true }).click(); await page.getByRole('option', { name: '4', exact: true }).click();
    assert.match(await page.locator('.ac-preview-caption').innerText(), /当前显示 1 \/ 1/);
    await page.getByRole('button', { name: '保存设置', exact: true }).click(); await page.waitForFunction(() => document.querySelector('.ac-preview-caption')?.textContent.includes('当前显示 4 / 4'));
    const call = await page.evaluate(() => window.__qa.calls.find(value => value.command === 'settingsSave'));
    assert.equal(call.payload.document.desktop.companionLimit, 4); assert.equal(Object.hasOwn(call.payload.document, 'host'), false);
  });
  await run('settings-visible-fact-changes-refresh-but-identical-periodic-policy-does-not-loop', { ...packet(), page: 'settings', path: '/preferences', broadcastOnSettings: true }, async page => {
    assert.match(await page.locator('.ac-preview-caption').innerText(), /当前显示 4 \/ 4/); await frames(page);
    const before = await page.evaluate(() => window.__qa.calls.filter(call => call.command === 'settingsGet').length);
    await page.evaluate(() => { for (let i = 0; i < 100; i++) window.__qa.emit('accounts:behavior', window.__qa.policy()); }); await frames(page);
    const after = await page.evaluate(() => window.__qa.calls.filter(call => call.command === 'settingsGet').length);
    assert.equal(after, before); assert.equal(await page.evaluate(() => window.__qa.calls.filter(call => call.command === 'settingsSave').length), 0);
    await page.evaluate(() => { for (const w of window.__qa.settings.host.windows) w.visible = false; window.__qa.emit('accounts:behavior', window.__qa.policy()); });
    await page.waitForFunction(() => document.querySelector('.ac-preview-caption')?.textContent.includes('当前显示 0 / 4'));
    const changed = await page.evaluate(() => window.__qa.calls.filter(call => call.command === 'settingsGet').length);
    assert.equal(changed, after + 1);
  });
  const b = packet({ who: foreign, order: [0], values: [{ ...pets[0], petId: 'pet-owner-b-only', ownerAccountId: foreign }] });
  await run('late-old-owner-companion-view-cannot-replace-the-new-owner', { ...normal, page: 'overview', path: '/companions', broadcastOnList: true }, async page => {
    await frames(page); await page.evaluate(() => { window.__qa.holdNextList = true; window.__qa.emit('companions:windows-changed', { ownerAccountId: window.__qa.snapshot.ownerAccountId }); });
    await page.waitForFunction(() => window.__qa.held.length === 1);
    await page.evaluate(next => { window.__qa.snapshot = next.snapshot; window.__qa.settings = next.settings; window.__qa.emit('app:session', {}); }, b);
    await page.waitForSelector('.cp-pet-card[data-pet-id="pet-owner-b-only"]');
    await page.evaluate(() => window.__qa.held.shift()()); await frames(page);
    assert.equal(await page.locator('.cp-pet-card').count(), 1); assert.equal(await page.locator('.cp-pet-card[data-pet-id="pet-owner-b-only"]').count(), 1);
  });
  await run('late-settings-host-view-cannot-cross-owner-even-with-a-stable-legacy-id', { ...normal, page: 'settings', path: '/preferences', sessionId: 'stable-legacy-ui-id' }, async page => {
    await page.evaluate(() => { window.__qa.holdNextSettings = true; window.__qa.emit('companions:windows-changed', { ownerAccountId: window.__qa.snapshot.ownerAccountId }); });
    await page.waitForFunction(() => window.__qa.held.length === 1);
    const nextOwner = packet({ who: foreign, limit: 1, order: [0], values: [{ ...pets[0], petId: 'pet-owner-b-only', ownerAccountId: foreign }] });
    await page.evaluate(next => { window.__qa.snapshot = next.snapshot; window.__qa.settings = next.settings; window.__qa.emit('app:session', {}); }, nextOwner);
    await page.waitForFunction(() => document.querySelector('.ac-preview-caption')?.textContent.includes('当前显示 1 / 1'));
    await page.evaluate(() => window.__qa.held.shift()()); await frames(page);
    assert.match(await page.locator('.ac-preview-caption').innerText(), /当前显示 1 \/ 1/);
    assert.equal(await page.getByRole('combobox', { name: '桌面陪伴数量', exact: true }).innerText(), '1');
  });
  const unknown = structuredClone(normal); unknown.snapshot.desktopDisplay.ownerAccountId = foreign;
  await run('unmatched-runtime-owner-is-pending-not-requested-count', { ...unknown, page: 'overview', path: '/companions' }, async page => {
    assert.match(await page.locator('.page-header').innerText(), /桌面显示 待确认/);
    assert.ok((await page.locator('.cp-pet-card-title').allTextContents()).every(text => text.includes('状态待确认')));
  });
} finally { await browser.close(); }
const report = { format: 'lingjing.companions.qa016.component-checks', at: new Date().toISOString(), kind: 'Actual React DOM and client hooks with controlled IPC in isolated headless Chrome; visual/battle/motion ports replaced', nativeProductUiVerified: false,
  passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results };
writeFileSync(join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report)); assert.equal(report.failed, 0);
