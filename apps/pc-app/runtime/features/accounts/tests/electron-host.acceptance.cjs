const { app, BrowserWindow, Notification, dialog, session } = require("electron");
const { mkdirSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { EventEmitter } = require("node:events");
const assert = require("node:assert/strict");
const { createDesktopHost } = require("../desktop-host.cjs");
const { defaultSettings } = require("../settings.cjs");

const output = resolve(process.env.ACCOUNTS_HOST_EVIDENCE_DIR || `artifacts/accounts/host-${Date.now()}`);
mkdirSync(output, { recursive: true });
app.setPath("userData", resolve(output, "profile"));
app.setName("LingjingAccountsAdapterTest");
const evidence = { at: new Date().toISOString(), checks: [], productionUI: false,
  scope: "Native Electron host adapter integration; separate production UI acceptance covers real account IPC and dialogs" };
const waitFor = async (condition, name) => {
  const until = Date.now() + 15_000;
  while (!condition()) { assert.ok(Date.now() < until, `Timed out: ${name}`); await new Promise(resolve => setTimeout(resolve, 100)); }
};
const record = (name, data) => { evidence.checks.push({ name, data }); console.log("PASS", name); };
let host, finishing = false;
app.whenReady().then(async () => {
  const bus = new EventEmitter(), pets = new Map();
  bus.on("accounts:fullscreen-diagnostic", value => { evidence.fullscreenDiagnostic = value; console.log("FOREGROUND", value.bounds); });
  const services = { events: { emit: (name, data) => bus.emit(name, data), on: (name, callback) => { bus.on(name, callback); return () => bus.off(name, callback); } },
    windows: { all: () => [...pets] }, get() {} };
  host = createDesktopHost(services, { app, BrowserWindow, Notification, dialog, session });
  const main = new BrowserWindow({ width: 1000, height: 720, show: true, title: "灵境 · 桌面设置宿主验收", webPreferences: { contextIsolation: true, sandbox: true } });
  main.on("close", event => { if (!finishing) { event.preventDefault(); main.hide(); } });
  await main.loadURL("data:text/html;charset=utf-8,<title>灵境 · 桌面设置宿主验收</title><h1>桌面设置宿主验收</h1><p>隔离的原生 API 测试窗口</p>");
  for (let i = 0; i < 2; i++) {
    const win = new BrowserWindow({ width: 200, height: 240, x: 80 + i * 240, y: 120, show: true,
      transparent: true, frame: false, focusable: false, title: `账号宿主测试伙伴 ${i + 1}`, webPreferences: { contextIsolation: true, sandbox: true } });
    pets.set(`pet-${i}`, win); await win.loadURL(`data:text/html,<p>Desktop adapter fixture ${i + 1}</p>`);
  }
  const [first, second] = [...pets.values()];
  if (process.env.ACCOUNTS_DEBUG_HOST === "1") {
    for (const win of [first, second]) for (const method of ["setAlwaysOnTop", "setIgnoreMouseEvents", "showInactive"]) {
      const native = win[method].bind(win);
      win[method] = (...args) => { const result = native(...args); console.log("NATIVE", win.id, method, JSON.stringify(args), "top", win.isAlwaysOnTop(), "visible", win.isVisible()); return result; };
    }
  }
  const settings = defaultSettings(), startupBefore = app.getLoginItemSettings().openAtLogin;
  settings.desktop.alwaysOnTop = false; settings.desktop.clickThrough = false; settings.desktop.companionLimit = 1;
  settings.notifications.quietStart = "00:00"; settings.notifications.quietEnd = "00:00";
  await host.apply(settings);
  assert.equal(first.isAlwaysOnTop(), false); assert.equal(second.isVisible(), false);
  first.setIgnoreMouseEvents(true, { forward: true }); assert.equal(host.status().clickThroughWindows.includes(first.id), false);
  assert.equal(app.getLoginItemSettings().openAtLogin, startupBefore);
  record("actual topmost/count APIs and pointer policy; startup unchanged without explicit opt-in", host.status());
  settings.desktop.alwaysOnTop = true; settings.desktop.clickThrough = true; settings.desktop.companionLimit = 2;
  await host.apply(settings);
  await waitFor(() => first.isAlwaysOnTop() && second.isVisible(), "native topmost and count application");
  assert.equal(first.isAlwaysOnTop(), true); assert.equal(second.isVisible(), true);
  assert.equal(host.status().clickThroughWindows.includes(first.id), true);
  first.setIgnoreMouseEvents(false); assert.equal(host.status().clickThroughWindows.includes(first.id), false);
  record("actual native windows restore count and opaque hit area stays clickable", host.status());
  assert.deepEqual(await host.notify({ kind: "garden", title: "Fixture" }), { delivered: false, reason: "quiet-hours" });
  assert.equal(host.mayUseLocation(), false); assert.equal(host.mayCollectEmotion(), false);
  settings.privacy.locationAllowed = true; settings.privacy.emotionStatistics = true; await host.apply(settings);
  assert.equal(host.mayUseLocation(), false); host.setExploring(true); assert.equal(host.mayUseLocation(), true);
  host.setExploring(false); assert.equal(host.mayUseLocation(), false); assert.equal(host.mayCollectEmotion(), true);
  record("quiet notifications and host privacy gates follow saved policy");
  main.close(); assert.equal(main.isVisible(), false); assert.equal(main.isDestroyed(), false); main.show();
  record("close-to-tray true retains native main window");
  const full = new BrowserWindow({ show: true, fullscreen: true, title: "灵境 · 全屏检测测试", webPreferences: { contextIsolation: true, sandbox: true } });
  await full.loadURL("data:text/html,<title>灵境 · 全屏检测测试</title><h1>全屏检测测试</h1>");
  full.show(); full.focus();
  evidence.fullscreenWindow = { fullscreen: full.isFullScreen(), focused: full.isFocused(), bounds: full.getBounds() };
  await waitFor(() => host.status().foregroundFullscreen && !first.isVisible(), "native foreground fullscreen hide");
  record("focused fullscreen hides actual companion windows", host.status());
  full.destroy(); main.show(); main.focus();
  await waitFor(() => !host.status().foregroundFullscreen && first.isVisible(), "native foreground fullscreen restore");
  record("leaving fullscreen restores only the hidden companion windows", host.status());
  settings.desktop.closeToTray = false; await host.apply(settings);
  finishing = true; evidence.requestedRealQuit = true;
  writeFileSync(resolve(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  // No test stub replaces app.quit. The host close policy calls the real Electron lifecycle.
  finishing = false; main.close();
}).catch(error => {
  evidence.error = { message: error.message, stack: error.stack, host: host?.status() };
  writeFileSync(resolve(output, "failure.json"), JSON.stringify(evidence, null, 2));
  console.error(error); finishing = true; host?.dispose(); app.exit(1);
});
app.on("before-quit", () => {
  finishing = true; host?.dispose(); evidence.realBeforeQuit = true;
  writeFileSync(resolve(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("ACCOUNTS_NATIVE_HOST_PASSED", output);
});
app.on("window-all-closed", () => {});
