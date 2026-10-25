/* eslint-disable @typescript-eslint/no-require-imports -- Electron feature contract uses CommonJS. */
const { ConversationStore } = require("./store.cjs");
const { ConversationService } = require("./service.cjs");
const { migrations } = require("./schema.cjs");
const { createElectronSecretCodec } = require("./secrets.cjs");
const { createConversationBackupAdapter } = require("./backup.cjs");

const commands = ["snapshot", "select", "history", "profile.save", "connection.save", "connection.test", "connection.cancel",
  "memory.save", "memory.delete", "send", "retry", "cancel", "history.clear", "legacy.preview", "legacy.import"];

// The feature never opens a second database or reads renderer-supplied account IDs.
function createConversationsFeature(services) {
  const service = new ConversationService({ ...services,
    store: new ConversationStore(services.db), secrets: services.secrets || createElectronSecretCodec(services.safeStorage) });
  return { id: "conversations", commands, invoke: service.invoke.bind(service), dispose: service.dispose.bind(service), service };
}
function register(services) {
  let generation = 0;
  const inspect = () => {
    const user = services.session.getCurrentUser();
    return { owner: user?.id ?? null, signature: JSON.stringify([user?.id ?? null, user?.lastLoginAt ?? null]) };
  };
  let observed = inspect();
  const listeners = new Set();
  const changed = (next = inspect()) => {
    generation++;
    observed = next;
    for (const listener of listeners) listener();
    services.events.emit("conversations:session", { accountId: observed.owner });
  };
  const observe = () => {
    const next = inspect();
    if (next.signature !== observed.signature) changed(next);
    return next;
  };
  const unsubscribers = ["accounts:changed", "accounts:session-changed", "accounts:session", "auth:changed", "session:changed"]
    .map((name) => services.events.on(name, () => changed()));
  // A full-save replacement changes the meaning of revisions/cursors even when
  // the verified owner is unchanged. Invalidate old editors and pending reads.
  unsubscribers.push(services.events.on("accounts:save-restored", value => {
    if (value?.ownerAccountId === services.session.getOwnerAccountId()) changed();
  }));
  // The v1 foundation session contract has no mandatory session event. This also
  // catches changes made through the retained legacy login window.
  const sessionWatch = setInterval(observe, 500);
  sessionWatch.unref?.();
  const feature = createConversationsFeature({ db: services.db, safeStorage: services.safeStorage,
    // Observe on every command/chunk too, so rapid A -> B -> A transitions cannot
    // be lost between timer ticks. lastLoginAt also detects a fresh legacy login.
    getSession: () => ({ ownerAccountId: observe().owner, revision: generation }),
    onSessionChanged: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    listPets: (ownerAccountId) => {
      const companions = services.get("companions");
      if (companions?.listPets) return companions.listPets(ownerAccountId);
      // Legacy inventory is already scoped by the verified RuntimeDataStore session.
      if (services.session.getOwnerAccountId() !== ownerAccountId) return [];
      return services.legacy.runtimeDataStore.getInventorySnapshot().pets;
    },
    publish: (value) => services.events.emit("conversations:changed", value),
    setChatActivity: (value) => services.events.emit("conversations:activity", value) });
  services.provide("conversations", {
    createBackupAdapter: () => createConversationBackupAdapter(services),
    hasActive: owner => [...feature.service.active.values()].some(active => active.session.owner === owner),
    getProfile: (ownerAccountId, petId) => feature.service.store.getProfile(ownerAccountId, petId),
    isChatting: (ownerAccountId, petId) => feature.service.active.has(JSON.stringify([ownerAccountId, "chat", petId])),
    // Optional ASR/TTS adapters consume text through commands; no audio data is stored yet.
    capabilities: { text: true, speechInput: false, speechOutput: false }
  });
  return { commands: Object.fromEntries(commands.map((command) => [command, (payload, context) => {
    if (context.ownerAccountId !== services.session.getOwnerAccountId()) return { ok: false, code: "SESSION_CHANGED", message: "账号已切换，请重新操作。" };
    return feature.invoke(command, payload);
  }])), dispose() {
    clearInterval(sessionWatch); for (const off of unsubscribers) off(); feature.dispose();
  } };
}
module.exports = { id: "conversations", commands, migrations, register, createConversationsFeature,
  ConversationService, ConversationStore, createElectronSecretCodec };
