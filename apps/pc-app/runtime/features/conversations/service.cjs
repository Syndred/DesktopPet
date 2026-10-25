/* eslint-disable @typescript-eslint/no-require-imports -- Electron feature contract uses CommonJS. */
const { randomUUID } = require("node:crypto");
const { fail, publicError, ConversationError } = require("./errors.cjs");
const { normalizeConnection, requestCompletion } = require("./transport.cjs");
const { buildContext, styles } = require("./context.cjs");
const { buildLegacyConversationImport, importLegacyConversations } = require("./legacy-import.cjs");

function string(value, max, optional = false) {
  if (optional && value === "") return "";
  if (typeof value !== "string" || !value.trim() || value.length > max || value.includes("\0")) fail("INVALID_INPUT");
  return value.trim();
}
function revision(value) { if (!Number.isSafeInteger(value) || value < 0) fail("INVALID_INPUT"); return value; }
function scopeKey(owner, petId, kind = "chat") { return JSON.stringify([owner, kind, petId]); }

class ConversationService {
  constructor({ store, secrets, getSession, listPets, getChatSelection, selectChatPet, onSessionChanged, publish = () => {}, setChatActivity = () => {}, transport = requestCompletion }) {
    this.store = store; this.secrets = secrets; this.getSession = getSession; this.listPets = listPets;
    this.publish = publish; this.setChatActivity = setChatActivity; this.transport = transport; this.active = new Map(); this.epoch = 0; this.disposed = false;
    this.getChatSelection = getChatSelection; this.selectChatPet = selectChatPet;
    this.store.recoverInterrupted();
    this.unsubscribe = onSessionChanged?.(() => { this.epoch++; this.abortAll("SESSION_CHANGED"); });
  }
  session() {
    const value = this.getSession();
    if (!value?.ownerAccountId) fail("AUTH_REQUIRED");
    return { owner: value.ownerAccountId, key: value.sessionId ?? value.revision ?? value.ownerAccountId, epoch: this.epoch };
  }
  current(session) {
    const value = this.getSession();
    return value?.ownerAccountId === session.owner &&
      (value.sessionId ?? value.revision ?? value.ownerAccountId) === session.key && session.epoch === this.epoch;
  }
  pets(session) {
    // Main-process authoritative adapter must filter by this owner; renderer never supplies an owner.
    return this.listPets(session.owner).filter((pet) => (pet.ownerAccountId ?? session.owner) === session.owner);
  }
  pet(session, id) {
    const petId = string(id, 160);
    const pet = this.pets(session).find((item) => (item.petId ?? item.id) === petId);
    if (!pet) fail("PET_NOT_FOUND");
    return pet;
  }
  emit(session, value) {
    if (this.current(session)) {
      // Integration must deliver only to renderer(s) of the current verified session.
      try { this.publish({ ...value, accountId: session.owner }); } catch { /* A closed window is harmless. */ }
    }
  }
  activity(value) {
    try { this.setChatActivity(value); } catch { /* Optional desktop observers cannot break a reply. */ }
  }
  abort(owner, petId, reason = "CANCELLED") {
    for (const active of this.active.values()) {
      if (active.session.owner === owner && (petId === null || active.petId === petId)) {
        active.reason = reason; active.controller.abort();
      }
    }
  }
  abortAll(reason) {
    for (const active of this.active.values()) { active.reason = reason; active.controller.abort(); }
  }
  effectiveConnection(session, petId) {
    const profile = this.store.getProfile(session.owner, petId);
    const config = this.store.getConnection(session.owner, profile.useOverride ? petId : null, true);
    if (!config) fail("CONNECTION_REQUIRED");
    if (!config.encryptedKey) fail("KEY_REQUIRED");
    return { config, apiKey: this.secrets.decrypt(config.encryptedKey) };
  }
  snapshot(session, payload) {
    const pets = this.pets(session).map((pet) => ({ petId: pet.petId ?? pet.id,
      name: typeof pet.name === "string" ? pet.name : pet.name?.zh || "灵宠",
      templateId: pet.templateId ?? null, avatarUrl: pet.avatarUrl ?? pet.resource?.thumbnailUrl ?? null, level: pet.level ?? pet.growth?.level ?? 1,
      element: ["metal", "wood", "earth", "water", "fire"].includes(pet.element) ? pet.element : null,
      ...(pet.resource ? { resource: { resourceId: pet.resource.resourceId, kind: pet.resource.kind } } : {}) }));
    // The shared companion chat slot is authoritative when integrated. A local
    // preference from an older client is only a compatibility hint.
    const selected = payload.petId ?? (this.getChatSelection ? this.getChatSelection(session.owner) : this.store.getSelectedPet(session.owner));
    const petId = pets.some((pet) => pet.petId === selected) ? selected : pets[0]?.petId ?? null;
    return { accountId: session.owner, sessionRevision: session.epoch, pets, petId, summaries: this.store.summaries(session.owner, pets.map((p) => p.petId)),
      globalConnection: this.store.getConnection(session.owner), secureStorageAvailable: this.secrets.available(),
      ...(petId ? this.readPet(session, petId) : {}) };
  }
  readPet(session, petId) {
    this.pet(session, petId);
    return { profile: this.store.getProfile(session.owner, petId),
      connection: this.store.getConnection(session.owner, petId),
      memories: this.store.listMemories(session.owner, petId), ...this.store.history(session.owner, petId) };
  }
  saveConnection(session, payload) {
    const petId = payload.petId == null ? null : string(payload.petId, 160);
    if (petId !== null) this.pet(session, petId);
    const value = normalizeConnection(payload.connection);
    const old = this.store.getConnection(session.owner, petId, true);
    const nextRevision = revision(payload.revision);
    if ((old?.revision ?? 0) !== nextRevision) fail("REVISION_CONFLICT");
    let encryptedKey = old?.encryptedKey ?? null;
    if (payload.clearKey === true) encryptedKey = null;
    else if (payload.apiKey != null && payload.apiKey !== "") {
      const apiKey = string(payload.apiKey, 4096);
      if (/[\r\n]/.test(apiKey)) fail("INVALID_INPUT");
      encryptedKey = this.secrets.encrypt(apiKey);
    } else if (old && (old.baseUrl !== value.baseUrl || old.provider !== value.provider)) {
      // Never forward a key saved for a different host/provider without explicitly entering it again.
      encryptedKey = null;
    }
    const result = this.store.saveConnection(session.owner, petId, { ...value, encryptedKey }, nextRevision);
    this.abort(session.owner, petId);
    this.emit(session, { type: "changed", petId });
    return result;
  }
  saveProfile(session, payload) {
    const petId = string(payload.petId, 160); this.pet(session, petId);
    const value = payload.profile;
    if (!value || !Object.hasOwn(styles, value.replyStyle) || typeof value.memoryEnabled !== "boolean" ||
        typeof value.pauseWhileChatting !== "boolean" || typeof value.useOverride !== "boolean") fail("INVALID_INPUT");
    const result = this.store.saveProfile(session.owner, petId, { ...value, persona: string(value.persona, 2000, true) }, revision(payload.revision));
    this.abort(session.owner, petId);
    this.emit(session, { type: "changed", petId });
    return result;
  }
  async testConnection(session, payload) {
    const petId = payload.petId == null ? null : string(payload.petId, 160);
    if (petId !== null) this.pet(session, petId);
    const config = this.store.getConnection(session.owner, petId, true);
    if (!config) fail("CONNECTION_REQUIRED");
    if (!config.encryptedKey) fail("KEY_REQUIRED");
    const key = scopeKey(session.owner, petId, "test");
    if (this.active.has(key) || this.active.size >= 4) fail("BUSY");
    const active = { session, petId, kind: "test", actionId: randomUUID(), controller: new AbortController() };
    this.active.set(key, active);
    const started = Date.now();
    try {
      await this.transport({ connection: { ...config, maxOutputTokens: 64 }, apiKey: this.secrets.decrypt(config.encryptedKey),
        messages: [{ role: "user", content: "这是连接测试。请只回复 OK。" }], signal: active.controller.signal, timeoutMs: 30000 });
      if (!this.current(session)) fail("SESSION_CHANGED");
      if (active.controller.signal.aborted) fail(active.reason || "CANCELLED");
      return { provider: config.provider, model: config.model, elapsedMs: Date.now() - started, receivedText: true, testedAt: Date.now() };
    } catch (error) {
      if (active.reason) fail(active.reason);
      throw error;
    } finally { this.active.delete(key); }
  }
  async send(session, payload, retry = false) {
    const petId = string(payload.petId, 160);
    const pet = this.pet(session, petId);
    const actionId = string(payload.actionId, 160);
    const existing = this.store.getTurn(session.owner, petId, actionId);
    if (!retry && existing.length) {
      if (existing[0].content !== string(payload.text, 8000)) fail("INVALID_INPUT");
      return { messages: existing, duplicate: true };
    }
    const key = scopeKey(session.owner, petId);
    if (this.active.has(key) || this.active.size >= 4) fail("BUSY");
    const { config, apiKey } = this.effectiveConnection(session, petId);
    const prompt = retry ? existing[0]?.content : string(payload.text, 8000);
    if (!prompt) fail("NOT_FOUND");
    if (retry) this.store.retryTurn(session.owner, petId, actionId, config);
    else this.store.createTurn(session.owner, petId, actionId, prompt, config);
    const context = buildContext({ pet, profile: this.store.getProfile(session.owner, petId),
      memories: this.store.listMemories(session.owner, petId), pairs: this.store.contextPairs(session.owner, petId), prompt, budget: config.contextChars });
    const active = { session, petId, actionId, controller: new AbortController() };
    this.active.set(key, active);
    this.activity({ ownerAccountId: session.owner, petId, active: true,
      pauseWhileChatting: this.store.getProfile(session.owner, petId).pauseWhileChatting });
    let partial = "";
    let lastSaved = 0;
    this.emit(session, { type: "reply", petId, actionId, status: "pending", content: "" });
    try {
      const reply = await this.transport({ connection: config, apiKey, messages: context.messages,
        signal: active.controller.signal, onDelta: (text) => {
          if (!this.current(session)) { active.reason = "SESSION_CHANGED"; active.controller.abort(); return; }
          if (active.controller.signal.aborted) return;
          partial = text;
          active.partial = partial;
          if (Date.now() - lastSaved > 250) {
            this.store.updateReply(session.owner, petId, actionId, partial, "streaming"); lastSaved = Date.now();
          }
          this.emit(session, { type: "reply", petId, actionId, status: "streaming", content: partial });
        } });
      if (!this.current(session)) fail("SESSION_CHANGED");
      if (active.controller.signal.aborted) fail(active.reason || "CANCELLED");
      this.store.updateReply(session.owner, petId, actionId, reply, "complete");
      this.emit(session, { type: "reply", petId, actionId, status: "complete", content: reply });
      return { messages: this.store.getTurn(session.owner, petId, actionId),
        context: { chars: context.chars, includedMemories: context.includedMemories, includedTurns: context.includedTurns } };
    } catch (error) {
      const code = active.reason || (error instanceof ConversationError ? error.code : "INTERNAL_ERROR");
      const status = ["CANCELLED", "SESSION_CHANGED"].includes(code) ? "cancelled" : "failed";
      if (!this.disposed) this.store.updateReply(session.owner, petId, actionId, partial, status, code);
      this.emit(session, { type: "reply", petId, actionId, status, content: partial, errorCode: code });
      throw new ConversationError(code);
    } finally {
      if (this.active.get(key) === active) this.active.delete(key);
      this.activity({ ownerAccountId: session.owner, petId, active: false, pauseWhileChatting: false });
    }
  }
  async invoke(command, payload = {}) {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) fail("INVALID_INPUT");
      const session = this.session();
      // Optional renderer freshness checks can reject stale UI actions, but can
      // never select or authorize an owner. The verified main session does that.
      if ((payload.expectedAccountId != null && payload.expectedAccountId !== session.owner) ||
          (payload.expectedSessionRevision != null && payload.expectedSessionRevision !== session.epoch)) fail("SESSION_CHANGED");
      let data;
      switch (command) {
        case "snapshot": data = this.snapshot(session, payload); break;
        case "select": {
          const petId = string(payload.petId, 160); this.pet(session, petId);
          if (this.selectChatPet) {
            try { await this.selectChatPet(session.owner, petId, payload.actionId == null ? randomUUID() : string(payload.actionId, 160)); }
            catch (error) { if (!this.current(session)) fail('SESSION_CHANGED'); if (error instanceof ConversationError) throw error; fail('SELECTION_FAILED'); }
            if (!this.current(session)) fail('SESSION_CHANGED');
            if (this.getChatSelection && this.getChatSelection(session.owner) !== petId) fail('REVISION_CONFLICT');
          }
          this.store.selectPet(session.owner, petId); data = this.snapshot(session, { petId }); break;
        }
        case "history": {
          const petId = string(payload.petId, 160); this.pet(session, petId);
          const before = payload.before ?? Number.MAX_SAFE_INTEGER;
          if (!Number.isSafeInteger(before) || before < 1) fail("INVALID_INPUT");
          data = this.store.history(session.owner, petId, before); break;
        }
        case "profile.save": data = this.saveProfile(session, payload); break;
        case "connection.save": data = this.saveConnection(session, payload); break;
        case "connection.test": data = await this.testConnection(session, payload); break;
        case "connection.cancel": {
          const petId = payload.petId == null ? null : string(payload.petId, 160);
          if (petId !== null) this.pet(session, petId);
          for (const active of this.active.values()) {
            if (active.kind === "test" && active.session.owner === session.owner && active.petId === petId) {
              active.reason = "CANCELLED"; active.controller.abort();
            }
          }
          data = { cancelled: true }; break;
        }
        case "memory.save": {
          const petId = string(payload.petId, 160); this.pet(session, petId);
          const note = payload.memory;
          if (!note || typeof note !== "object") fail("INVALID_INPUT");
          data = this.store.saveMemory(session.owner, petId, { content: string(note.content, 1000),
            ...(note.id ? { id: string(note.id, 160), revision: revision(note.revision) } : {}) });
          this.abort(session.owner, petId); this.emit(session, { type: "changed", petId }); break;
        }
        case "memory.delete": {
          const petId = string(payload.petId, 160); this.pet(session, petId);
          data = this.store.deleteMemory(session.owner, petId, string(payload.id, 160), revision(payload.revision));
          this.abort(session.owner, petId); this.emit(session, { type: "changed", petId }); break;
        }
        case "send": data = await this.send(session, payload); break;
        case "retry": data = await this.send(session, payload, true); break;
        case "cancel": {
          const petId = payload.petId == null ? null : string(payload.petId, 160);
          if (petId !== null) this.pet(session, petId);
          this.abort(session.owner, petId); data = { cancelled: true }; break;
        }
        case "history.clear": {
          const petId = string(payload.petId, 160); this.pet(session, petId);
          this.abort(session.owner, petId); this.store.clearHistory(session.owner, petId);
          data = { cleared: true }; this.emit(session, { type: "changed", petId }); break;
        }
        case "legacy.preview": case "legacy.import": {
          if (payload.includeSettings != null && typeof payload.includeSettings !== "boolean") fail("INVALID_INPUT");
          const options = { db:this.store.db, owner:session.owner, pets:this.pets(session).map(pet=>({...pet,petId:pet.petId ?? pet.id,name:typeof pet.name === "string" ? pet.name : pet.name?.zh || "伙伴"})),store:this.store,
            unassignedPetId:payload.unassignedPetId == null ? null : string(payload.unassignedPetId,160) };
          try {
            if (command === "legacy.preview") data = buildLegacyConversationImport(options).preview;
            else {
              data = importLegacyConversations({...options,sourceHash:string(payload.sourceHash,160),includeSettings:payload.includeSettings !== false,
                hasActive:[...this.active.values()].some(active=>active.session.owner === session.owner)});
              this.emit(session,{type:"changed",petId:null});
            }
          } catch (error) {
            if (error instanceof ConversationError) throw error;
            fail(error.code === "CONVERSATION_BUSY" ? "BUSY" : error.code === "CONVERSATION_MERGE_CONFLICT" || error.code === "CONVERSATION_ORDER_CONFLICT" ? "LEGACY_CONFLICT" : "LEGACY_INVALID");
          }
          break;
        }
        default: fail("INVALID_INPUT");
      }
      if (!this.current(session)) fail("SESSION_CHANGED");
      return { ok: true, data };
    } catch (error) { return publicError(error); }
  }
  dispose() {
    if (this.disposed) return;
    this.epoch++; this.abortAll("INTERRUPTED"); this.unsubscribe?.();
    for (const active of this.active.values()) if (active.kind !== "test") {
      this.store.updateReply(active.session.owner, active.petId, active.actionId, active.partial ?? "", "cancelled", "INTERRUPTED");
    }
    this.disposed = true;
  }
}
module.exports = { ConversationService };
