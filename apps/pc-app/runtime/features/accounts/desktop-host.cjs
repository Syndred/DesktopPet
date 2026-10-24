const { spawn } = require("node:child_process");
const { join } = require("node:path");
const { isQuiet, notificationPolicy } = require("./settings.cjs");

/** Electron bindings live here; domain services never import Electron in Node tests. */
function createDesktopHost(services, electron) {
  let settings = null, foregroundFullscreen = false, exploring = false;
  let monitor = null, stdout = "", permissionInstalled = false;
  const ignored = new Set(), hiddenByFullscreen = new Set(), hiddenByLimit = new Set();
  const cleanups = [];
  const bindings = new Map();
  const getPetWindows = () => {
    const custom = services.windows?.getPetWindows?.() || services.windows?.listCompanionWindows?.()
      || services.windows?.all?.()?.map(entry => Array.isArray(entry) ? entry[1] : entry) || [];
    const companions = services.get?.("companions")?.getDesktopWindows?.() || [];
    const windows = [...custom, ...companions.map(info => electron.BrowserWindow.fromId(info.windowId))];
    if (windows.length) return [...new Set(windows)].filter(w => w && !w.isDestroyed());
    // This is deliberately NOT BrowserWindow.getAllWindows(): settings/auth must stay clickable.
    return [];
  };
  const publish = () => {
    if (!settings) return;
    services.events?.emit("accounts:behavior", {
      settings, quiet: isQuiet(settings), fullscreen: foregroundFullscreen,
      soundsAllowed: settings.desktop.interactionSounds && !isQuiet(settings), volume: settings.desktop.volume,
      companionLimit: settings.desktop.companionLimit
    });
  };
  const applyWindows = () => {
    if (!settings) return;
    const windows = getPetWindows();
    for (const [index, win] of windows.entries()) {
      if (!bindings.has(win.id)) {
        const binding = { win, original: win.setIgnoreMouseEvents.bind(win), requested: true };
        win.setIgnoreMouseEvents = (ignore, options) => {
          binding.requested = Boolean(ignore);
          const applied = Boolean(settings?.desktop.clickThrough && ignore);
          binding.original(applied, options);
          if (applied) ignored.add(win.id); else ignored.delete(win.id);
        };
        bindings.set(win.id, binding);
      }
      win.setAlwaysOnTop(settings.desktop.alwaysOnTop, settings.desktop.alwaysOnTop ? "floating" : undefined);
      const binding = bindings.get(win.id);
      const ignoredNow = settings.desktop.clickThrough && binding.requested;
      binding.original(ignoredNow, { forward: true });
      if (ignoredNow) ignored.add(win.id); else ignored.delete(win.id);
      const overLimit = index >= settings.desktop.companionLimit;
      if (overLimit && win.isVisible()) { win.hide(); hiddenByLimit.add(win.id); }
      if (!overLimit && hiddenByLimit.has(win.id) && !foregroundFullscreen) { win.showInactive(); hiddenByLimit.delete(win.id); }
      const hide = settings.desktop.hideInFullscreen && foregroundFullscreen;
      if (hide && win.isVisible()) { win.hide(); hiddenByFullscreen.add(win.id); }
      if (!hide && hiddenByFullscreen.has(win.id) && !overLimit) { win.showInactive(); hiddenByFullscreen.delete(win.id); }
    }
    publish();
  };
  function installPermissions() {
    if (permissionInstalled || !electron.session?.defaultSession) return;
    permissionInstalled = true;
    // Deny outside the app's own renderer and scope geolocation to the explicit exploration state.
    const allow = (webContents, permission) => {
      if (permission !== "geolocation" || !settings?.privacy.locationAllowed) return false;
      const trusted = services.windows?.isTrustedWebContents?.(webContents)
        ?? electron.BrowserWindow.getAllWindows().some(w => w.webContents === webContents);
      return Boolean(trusted && (!settings.privacy.locationOnlyWhileExploring || exploring));
    };
    electron.session.defaultSession.setPermissionCheckHandler((contents, permission) => allow(contents, permission));
    electron.session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(allow(contents, permission)));
  }
  let closingApplication = false;
  const onWindow = (_event, win) => {
    win.once("ready-to-show", () => queueMicrotask(applyWindows));
    win.on("close", () => {
      if (!settings || settings.desktop.closeToTray || closingApplication) return;
      if (getPetWindows().includes(win)) return;
      // Foundation's main close handler keeps a tray app alive. A user-selected full exit
      // must go through app.quit(), which also runs foundation's before-quit cleanup.
      if (win.getBounds().width >= 960) { closingApplication = true; electron.app.quit(); }
    });
  };
  electron.app.on("browser-window-created", onWindow);
  cleanups.push(() => electron.app.removeListener("browser-window-created", onWindow));
  if (process.platform === "win32") {
    monitor = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", join(__dirname, "foreground-fullscreen.ps1")],
      { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    monitor.stdout.on("data", chunk => {
      stdout += chunk.toString();
      const lines = stdout.split(/\r?\n/); stdout = lines.pop() || "";
      for (const line of lines) if (line === "true" || line === "false") {
        const next = line === "true";
        if (next !== foregroundFullscreen) { foregroundFullscreen = next; applyWindows(); }
      }
    });
    monitor.on("error", () => services.events?.emit("accounts:host-warning", { code: "FULLSCREEN_MONITOR_UNAVAILABLE" }));
    monitor.on("exit", () => { monitor = null; });
  }
  const everyMinute = setInterval(publish, 30_000);
  everyMinute.unref?.();
  if (services.events?.on) {
    cleanups.push(services.events.on("companions:windows-changed", applyWindows));
    cleanups.push(services.events.on("companions:changed", () => queueMicrotask(applyWindows)));
    cleanups.push(services.events.on("discovery:exploring", value => { exploring = Boolean(value?.active ?? value); }));
  }
  return {
    async apply(next, { explicitStartupChange = false } = {}) {
      // Merely opening settings or logging in must not enable a machine startup task.
      if (explicitStartupChange) electron.app.setLoginItemSettings({ openAtLogin: next.desktop.launchAtLogin, enabled: next.desktop.launchAtLogin });
      settings = next;
      if (!next.privacy.locationAllowed) {
        exploring = false;
        services.get?.("discovery")?.stopLocationWatch?.();
        services.legacy?.mapService?.stopWatch?.();
        services.events?.emit("accounts:location-revoked", {});
      }
      installPermissions(); applyWindows();
      services.windows?.setCloseToTray?.(next.desktop.closeToTray);
      services.windows?.setCompanionLimit?.(next.desktop.companionLimit);
      return this.status();
    },
    setHitTest(windowId, overOpaqueContent) {
      const win = typeof windowId === "string" ? services.windows?.get?.(windowId) : getPetWindows().find(w => w.id === windowId);
      if (!win || !settings) return false;
      const ignore = settings.desktop.clickThrough && !overOpaqueContent;
      win.setIgnoreMouseEvents(ignore, { forward: true });
      if (ignore) ignored.add(windowId); else ignored.delete(windowId);
      return true;
    },
    setExploring(active) { exploring = Boolean(active); },
    mayUseLocation() { return Boolean(settings?.privacy.locationAllowed && (!settings.privacy.locationOnlyWhileExploring || exploring)); },
    mayCollectEmotion() { return Boolean(settings?.privacy.emotionStatistics); },
    async notify({ kind, title, body }) {
      if (!settings) return { delivered: false, reason: "signed-out" };
      const policy = notificationPolicy(settings, kind);
      if (!policy.allowed) return { delivered: false, reason: policy.reason };
      if (!electron.Notification?.isSupported()) return { delivered: false, reason: "unsupported" };
      const notification = new electron.Notification({ title: String(title).slice(0, 100), body: String(body || "").slice(0, 300), silent: policy.silent });
      notification.show();
      return { delivered: true, silent: policy.silent };
    },
    async chooseBackupDestination() {
      const result = await electron.dialog.showSaveDialog({ title: "导出灵境账号备份", defaultPath: `灵境备份-${Date.now()}.lingjing.json`,
        filters: [{ name: "灵境存档", extensions: ["json"] }], properties: ["createDirectory", "showOverwriteConfirmation"] });
      return result.canceled ? null : result.filePath;
    },
    async chooseBackupSource() {
      const result = await electron.dialog.showOpenDialog({ title: "选择灵境账号备份", filters: [{ name: "灵境存档", extensions: ["json"] }], properties: ["openFile"] });
      return result.canceled ? null : result.filePaths[0];
    },
    status() {
      const windows = getPetWindows();
      return { startup: electron.app.getLoginItemSettings?.().openAtLogin ?? false,
        fullscreenMonitor: Boolean(monitor && !monitor.killed), foregroundFullscreen,
        companionWindows: windows.length, clickThroughWindows: [...ignored],
        windows: windows.map(w => ({ id: w.id, alwaysOnTop: w.isAlwaysOnTop(), visible: w.isVisible() })),
        locationAllowed: this.mayUseLocation(), emotionStatistics: this.mayCollectEmotion(),
        closeToTrayConnected: true, companionLimitConnected: true };
    },
    clear() {
      settings = null; exploring = false;
      for (const win of getPetWindows()) { win.setIgnoreMouseEvents(false); win.hide(); }
      ignored.clear(); hiddenByFullscreen.clear(); hiddenByLimit.clear();
    },
    dispose() {
      clearInterval(everyMinute); monitor?.kill(); cleanups.forEach(fn => fn?.());
      for (const binding of bindings.values()) if (!binding.win.isDestroyed()) binding.win.setIgnoreMouseEvents = binding.original;
      bindings.clear();
    }
  };
}
module.exports = { createDesktopHost };
