/* eslint-disable @typescript-eslint/no-require-imports -- Electron feature contract uses CommonJS. */
const { randomUUID } = require("node:crypto");
const { fail } = require("./errors.cjs");

const defaultProfile = () => ({ persona: "", replyStyle: "natural", memoryEnabled: true,
  pauseWhileChatting: true, useOverride: false, revision: 0 });
function profile(row) {
  return row ? { persona: row.persona, replyStyle: row.reply_style, memoryEnabled: Boolean(row.memory_enabled),
    pauseWhileChatting: Boolean(row.pause_while_chatting), useOverride: Boolean(row.use_override),
    revision: row.revision } : defaultProfile();
}
function message(row) {
  return { id: row.id, sequence: row.sequence, actionId: row.action_id, petId: row.pet_id,
    role: row.role, content: row.content, status: row.status, errorCode: row.error_code,
    provider: row.provider, model: row.model, attempt: row.attempt,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function memory(row) {
  return { id: row.id, petId: row.pet_id, content: row.content, revision: row.revision,
    createdAt: row.created_at, updatedAt: row.updated_at };
}
function connection(row, includeSecret = false) {
  if (!row) return null;
  return { provider: row.provider, baseUrl: row.base_url, model: row.model,
    contextChars: row.context_chars, maxOutputTokens: row.max_output_tokens,
    hasKey: Boolean(row.encrypted_key), revision: row.revision,
    ...(includeSecret ? { encryptedKey: row.encrypted_key } : {}) };
}

class ConversationStore {
  constructor(db) { this.db = db; this.savepoint = 0; }
  // SAVEPOINT works both standalone and inside a foundation-owned transaction.
  transaction(fn) {
    const name = `conversation_${++this.savepoint}`;
    this.db.exec(`SAVEPOINT ${name}`);
    try { const value = fn(); this.db.exec(`RELEASE SAVEPOINT ${name}`); return value; }
    catch (error) { this.db.exec(`ROLLBACK TO SAVEPOINT ${name}`); this.db.exec(`RELEASE SAVEPOINT ${name}`); throw error; }
  }
  getProfile(owner, petId) {
    return profile(this.db.prepare("SELECT * FROM conversation_profiles WHERE owner_account_id=? AND pet_id=?").get(owner, petId));
  }
  saveProfile(owner, petId, value, revision) {
    return this.transaction(() => {
      if (this.getProfile(owner, petId).revision !== revision) fail("REVISION_CONFLICT");
      this.db.prepare(`INSERT INTO conversation_profiles
        (owner_account_id,pet_id,persona,reply_style,memory_enabled,pause_while_chatting,use_override,revision,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_account_id,pet_id) DO UPDATE SET
        persona=excluded.persona,reply_style=excluded.reply_style,memory_enabled=excluded.memory_enabled,
        pause_while_chatting=excluded.pause_while_chatting,use_override=excluded.use_override,
        revision=excluded.revision,updated_at=excluded.updated_at`).run(owner, petId, value.persona,
        value.replyStyle, +value.memoryEnabled, +value.pauseWhileChatting, +value.useOverride, revision + 1, Date.now());
      return this.getProfile(owner, petId);
    });
  }
  getConnection(owner, petId = null, includeSecret = false) {
    // The live row remains authoritative for older clients that can edit/clear
    // keys. The vault is consulted only by an explicit archive restoration.
    return connection(this.db.prepare(`SELECT * FROM conversation_connections
      WHERE owner_account_id=? AND scope=? AND scope_id=?`).get(owner, petId === null ? "account" : "pet", petId ?? ""), includeSecret);
  }
  saveConnection(owner, petId, value, revision) {
    return this.transaction(() => {
      if ((this.getConnection(owner, petId)?.revision ?? 0) !== revision) fail("REVISION_CONFLICT");
      this.db.prepare(`INSERT INTO conversation_connections
        (owner_account_id,scope,scope_id,provider,base_url,model,encrypted_key,context_chars,max_output_tokens,revision,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_account_id,scope,scope_id) DO UPDATE SET
        provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,encrypted_key=excluded.encrypted_key,
        context_chars=excluded.context_chars,max_output_tokens=excluded.max_output_tokens,
        revision=excluded.revision,updated_at=excluded.updated_at`).run(owner, petId === null ? "account" : "pet", petId ?? "",
        value.provider, value.baseUrl, value.model, value.encryptedKey, value.contextChars,
        value.maxOutputTokens, revision + 1, Date.now());
      // User edits explicitly replace/clear this device's key. Cloud restoration
      // uses the archive adapter and never deletes this local-only credential vault.
      const scope = petId === null ? "account" : "pet", scopeId = petId ?? "";
      this.db.prepare("DELETE FROM conversation_credentials WHERE owner_account_id=? AND scope=? AND scope_id=?").run(owner, scope, scopeId);
      if (value.encryptedKey) this.db.prepare("INSERT INTO conversation_credentials VALUES(?,?,?,?,?,?,?)")
        .run(owner, scope, scopeId, value.provider, value.baseUrl, value.encryptedKey, Date.now());
      return this.getConnection(owner, petId);
    });
  }
  listMemories(owner, petId) {
    return this.db.prepare(`SELECT * FROM conversation_memories WHERE owner_account_id=? AND pet_id=?
      ORDER BY updated_at DESC,id DESC`).all(owner, petId).map(memory);
  }
  saveMemory(owner, petId, value) {
    return this.transaction(() => {
      const now = Date.now();
      if (value.id) {
        const result = this.db.prepare(`UPDATE conversation_memories SET content=?,revision=revision+1,updated_at=?
          WHERE owner_account_id=? AND pet_id=? AND id=? AND revision=?`).run(value.content, now, owner, petId, value.id, value.revision);
        if (!result.changes) fail("REVISION_CONFLICT");
      } else {
        const count = this.db.prepare("SELECT COUNT(*) AS count FROM conversation_memories WHERE owner_account_id=? AND pet_id=?").get(owner, petId).count;
        if (count >= 100) fail("MEMORY_LIMIT");
        this.db.prepare(`INSERT INTO conversation_memories (id,owner_account_id,pet_id,content,created_at,updated_at)
          VALUES (?,?,?,?,?,?)`).run(randomUUID(), owner, petId, value.content, now, now);
      }
      return this.listMemories(owner, petId);
    });
  }
  deleteMemory(owner, petId, id, revision) {
    const result = this.db.prepare(`DELETE FROM conversation_memories
      WHERE owner_account_id=? AND pet_id=? AND id=? AND revision=?`).run(owner, petId, id, revision);
    if (!result.changes) fail("REVISION_CONFLICT");
    return this.listMemories(owner, petId);
  }
  history(owner, petId, before = Number.MAX_SAFE_INTEGER, limit = 50) {
    const rows = this.db.prepare(`SELECT * FROM conversation_messages WHERE owner_account_id=? AND pet_id=?
      AND sequence<? ORDER BY sequence DESC LIMIT ?`).all(owner, petId, before, limit + 1);
    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit).reverse().map(message);
    return { messages, nextCursor: hasMore ? messages[0].sequence : null };
  }
  contextPairs(owner, petId) {
    return this.db.prepare(`SELECT u.content AS user_content,a.content AS assistant_content FROM conversation_messages u
      JOIN conversation_messages a ON a.owner_account_id=u.owner_account_id AND a.pet_id=u.pet_id
      AND a.action_id=u.action_id AND a.role='assistant' AND a.status='complete'
      WHERE u.owner_account_id=? AND u.pet_id=? AND u.role='user' ORDER BY u.sequence DESC LIMIT 24`).all(owner, petId);
  }
  getTurn(owner, petId, actionId) {
    return this.db.prepare(`SELECT * FROM conversation_messages WHERE owner_account_id=? AND pet_id=?
      AND action_id=? ORDER BY sequence`).all(owner, petId, actionId).map(message);
  }
  createTurn(owner, petId, actionId, text, config) {
    return this.transaction(() => {
      const existing = this.getTurn(owner, petId, actionId);
      if (existing.length) {
        if (existing[0].content !== text) fail("INVALID_INPUT");
        return { existing: true, messages: existing };
      }
      const now = Date.now();
      const stmt = this.db.prepare(`INSERT INTO conversation_messages
        (id,owner_account_id,pet_id,action_id,role,content,status,provider,model,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      stmt.run(randomUUID(), owner, petId, actionId, "user", text, "complete", null, null, now, now);
      stmt.run(randomUUID(), owner, petId, actionId, "assistant", "", "pending", config.provider, config.model, now, now);
      return { existing: false, messages: this.getTurn(owner, petId, actionId) };
    });
  }
  retryTurn(owner, petId, actionId, config) {
    const last = this.db.prepare(`SELECT * FROM conversation_messages WHERE owner_account_id=? AND pet_id=?
      ORDER BY sequence DESC LIMIT 1`).get(owner, petId);
    if (!last || last.action_id !== actionId || !["failed", "cancelled"].includes(last.status)) fail("RETRY_NOT_ALLOWED");
    this.db.prepare(`UPDATE conversation_messages SET status='pending',content='',error_code=NULL,
      attempt=attempt+1,provider=?,model=?,updated_at=? WHERE id=?`).run(config.provider, config.model, Date.now(), last.id);
    return this.getTurn(owner, petId, actionId);
  }
  updateReply(owner, petId, actionId, content, status, errorCode = null) {
    this.db.prepare(`UPDATE conversation_messages SET content=?,status=?,error_code=?,updated_at=?
      WHERE owner_account_id=? AND pet_id=? AND action_id=? AND role='assistant'`).run(content, status, errorCode, Date.now(), owner, petId, actionId);
  }
  recoverInterrupted() {
    this.db.prepare(`UPDATE conversation_messages SET status='cancelled',error_code='INTERRUPTED',updated_at=?
      WHERE role='assistant' AND status IN ('pending','streaming')`).run(Date.now());
  }
  clearHistory(owner, petId) {
    this.db.prepare("DELETE FROM conversation_messages WHERE owner_account_id=? AND pet_id=?").run(owner, petId);
  }
  getSelectedPet(owner) {
    return this.db.prepare("SELECT selected_pet_id AS petId FROM conversation_preferences WHERE owner_account_id=?").get(owner)?.petId ?? null;
  }
  selectPet(owner, petId) {
    this.db.prepare(`INSERT INTO conversation_preferences VALUES (?,?)
      ON CONFLICT(owner_account_id) DO UPDATE SET selected_pet_id=excluded.selected_pet_id`).run(owner, petId);
  }
  summaries(owner, petIds) {
    const stmt = this.db.prepare(`SELECT content,status,created_at AS createdAt FROM conversation_messages
      WHERE owner_account_id=? AND pet_id=? ORDER BY sequence DESC LIMIT 1`);
    return Object.fromEntries(petIds.map((id) => [id, stmt.get(owner, id) ?? null]));
  }
}
module.exports = { ConversationStore, defaultProfile };
