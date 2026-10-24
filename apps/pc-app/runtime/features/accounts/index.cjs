const { migrations } = require("./schema.cjs");
const { AccountsService } = require("./service.cjs");
const { createRemoteAdapter } = require("./remote.cjs");
const { createDesktopHost } = require("./desktop-host.cjs");
const { defaultSettings } = require("./settings.cjs");
const { join } = require("node:path");
const { resolveQaScenario, publicScenario, qaRemoteBoundary } = require("./qa-scenario.cjs");

module.exports = {
  id: "accounts", migrations, publicCommands: ["session", "login", "register", "logout"],
  register(services) {
    const electron = require("electron");
    const preflight = services.get('qaProfile');
    const qaScenario = preflight?.accountContext || resolveQaScenario({ userData: services.paths.userData, legacyDataFile: services.paths.legacyDataFile,
      productionDirectories: ["Lingjing", "qingpet-desktop-runtime", "qingpet-lord-3d"].map(name => join(electron.app.getPath("appData"), name)) });
    const host = createDesktopHost(services, electron);
    const accounts = new AccountsService({ services, host, qaScenario,
      remote: qaScenario ? qaRemoteBoundary() : createRemoteAdapter(services.legacy?.onlineDuelService) });
    const activeHost = accounts.host;
    services.session.setAdapter(accounts);
    services.provide("accounts", accounts);
    services.provide("backups", accounts.backups);
    if (qaScenario) services.provide("qaScenario", Object.freeze({ ...publicScenario(qaScenario),
      id: qaScenario.scenarioId, runId: qaScenario.profileId, provenance: 'simulated', isolated: true, profilePath: qaScenario.directory,
      descriptor: preflight?.descriptor || Object.freeze({ id: qaScenario.scenarioId, runId: qaScenario.profileId, provenance: 'simulated', isolated: true }),
      requireIdentity: () => accounts.requireScenarioIdentity(qaScenario.scenarioId) }));
    services.provide("privacy", { mayUseLocation: () => activeHost.mayUseLocation(), mayCollectEmotion: () => activeHost.mayCollectEmotion(),
      setExploring: active => activeHost.setExploring(active) });
    services.provide("notifications", { notify: input => activeHost.notify(input) });
    const currentOwner = context => {
      const owner = accounts.requireOwner();
      if (context?.ownerAccountId && context.ownerAccountId !== owner) throw Object.assign(new Error("账号已切换。"), { code: "SESSION_CHANGED" });
      return owner;
    };
    return {
      commands: {
        async session() { await accounts.ready; return accounts.session(); },
        login(input) { return accounts.authenticate(input); },
        register(input) { return accounts.authenticate(input, true); },
        logout() { return accounts.logout(); },
        profileSave(input) { return accounts.updateProfile(input); },
        passwordChange(input) { return accounts.updateProfile(input, true); },
        settingsGet() { return { ...accounts.settings(), host: activeHost.status() }; },
        settingsDefaults() { return defaultSettings(); },
        settingsSave(input) { return accounts.saveSettings(input); },
        backupList(_input, context) { return accounts.backups.list(currentOwner(context)); },
        backupExport() { return accounts.exportBackup(); },
        backupPreview() { return accounts.previewBackup(); },
        backupRestore(input) { return accounts.restoreBackup(input); },
        syncStatus(_input, context) { return accounts.sync.status(currentOwner(context)); },
        async syncNow(input, context) {
          const owner = currentOwner(context); accounts.sync.enqueue(owner, input.actionId);
          return { ...await accounts.sync.flush(owner, true), status: accounts.sync.status(owner) };
        },
        async syncRetry(_input, context) {
          const owner = currentOwner(context);
          return { ...await accounts.sync.flush(owner, true), status: accounts.sync.status(owner) };
        },
        cloudPreview(_input, context) { return accounts.sync.previewCloud(currentOwner(context)); },
        testNotification() { return activeHost.notify({ kind: "companions", title: "灵境", body: "伙伴会按你的通知与安静时段设置陪伴。" }); },
        pointer(input) { return { applied: activeHost.setHitTest(input.petId || Number(input.windowId), input.overOpaqueContent === true) }; }
      },
      dispose: () => accounts.dispose()
    };
  }
};
