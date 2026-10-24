const { migrations } = require("./schema.cjs");
const { AccountsService } = require("./service.cjs");
const { createRemoteAdapter } = require("./remote.cjs");
const { createDesktopHost } = require("./desktop-host.cjs");
const { defaultSettings } = require("./settings.cjs");

module.exports = {
  id: "accounts", migrations, publicCommands: ["session", "login", "register", "logout"],
  register(services) {
    const electron = require("electron");
    const host = createDesktopHost(services, electron);
    const accounts = new AccountsService({ services, host, remote: createRemoteAdapter(services.legacy?.onlineDuelService) });
    services.session.setAdapter(accounts);
    services.provide("accounts", accounts);
    services.provide("backups", accounts.backups);
    services.provide("privacy", { mayUseLocation: () => host.mayUseLocation(), mayCollectEmotion: () => host.mayCollectEmotion(),
      setExploring: active => host.setExploring(active) });
    services.provide("notifications", { notify: input => host.notify(input) });
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
        settingsGet() { return { ...accounts.settings(), host: host.status() }; },
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
        testNotification() { return host.notify({ kind: "companions", title: "灵境", body: "伙伴会按你的通知与安静时段设置陪伴。" }); },
        pointer(input) { return { applied: host.setHitTest(input.petId || Number(input.windowId), input.overOpaqueContent === true) }; }
      },
      dispose: () => accounts.dispose()
    };
  }
};
