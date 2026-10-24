// Standard Web Request handler; the entry point injects the existing Supabase service client.
const headers = { "content-type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const canonical = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
};
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)))))
  .map(b => b.toString(16).padStart(2, "0")).join("");
const reply = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const assert = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { code }); };

export function createAccountsHandler(createClient) {
  return async request => {
    if (request.method === "OPTIONS") return new Response("ok", { headers });
    if (request.method !== "POST") return reply({ ok: false, code: "METHOD_NOT_ALLOWED", message: "仅支持 POST。" }, 405);
    try {
      // Check a bounded stream as well as Content-Length; chunked bodies cannot bypass this limit.
      const chunks = [], reader = request.body?.getReader(); let length = 0;
      if (reader) {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          length += part.value.byteLength; assert(length <= 26 * 1024 * 1024, "SAVE_TOO_LARGE"); chunks.push(part.value);
        }
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
      let payload;
      try { payload = JSON.parse(new TextDecoder().decode(bytes)); } catch { assert(false, "INVALID_REQUEST"); }
      const userId = payload?.userId, sessionToken = payload?.sessionToken;
      assert(typeof userId === "string" && userId.length > 0 && userId.length <= 160
        && typeof sessionToken === "string" && sessionToken.length >= 16 && sessionToken.length <= 1024, "SESSION_INVALIDATED");
      const supabase = createClient();
      const account = await supabase.from("runtime_accounts").select("id,session_token").eq("id", userId).maybeSingle();
      assert(!account.error && account.data?.session_token === sessionToken, "SESSION_INVALIDATED");
      if (payload.op === "push") {
        assert(typeof payload.actionId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(payload.actionId)
          && Number.isSafeInteger(payload.baseRevision) && payload.baseRevision >= 0, "INVALID_REQUEST");
        const envelope = payload.envelope;
        assert(envelope?.format === "lingjing-account-save" && envelope.version === 1 && envelope.ownerAccountId === userId
          && envelope.identity?.provider === "runtime" && envelope.identity.subjectId === userId, "SAVE_OWNER_MISMATCH");
        const { checksum, ...body } = envelope;
        assert(typeof checksum === "string" && checksum === await digest(body), "SAVE_CHECKSUM_MISMATCH");
        assert(envelope.data?.modules && envelope.data?.tables, "INVALID_SAVE");
        const result = await supabase.rpc("accounts_push_save", { p_user_id: userId, p_session_token: sessionToken,
          p_action_id: payload.actionId, p_base_revision: payload.baseRevision, p_envelope: envelope });
        if (result.error) {
          const code = ["SYNC_CONFLICT", "ACTION_ID_REUSED", "SESSION_INVALIDATED", "INVALID_SAVE"].find(c => String(result.error.message).includes(c));
          assert(false, code || "SYNC_UNAVAILABLE");
        }
        return reply({ ok: true, data: result.data });
      }
      if (payload.op === "read") {
        const table = payload.actionId ? "runtime_account_save_actions" : "runtime_account_saves";
        let query = supabase.from(table).select("action_id,revision,checksum,envelope").eq("owner_account_id", userId);
        if (payload.actionId) {
          assert(typeof payload.actionId === "string" && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{7,127}$/.test(payload.actionId), "INVALID_REQUEST");
          query = query.eq("action_id", payload.actionId);
        }
        const result = await query.maybeSingle(); assert(!result.error, "SYNC_UNAVAILABLE");
        if (!result.data) return reply({ ok: true, data: null });
        return reply({ ok: true, data: { actionId: result.data.action_id, revision: Number(result.data.revision), checksum: result.data.checksum, envelope: result.data.envelope } });
      }
      assert(false, "UNSUPPORTED_OP");
    } catch (error) {
      const code = error.code || "SYNC_UNAVAILABLE";
      const messages = { SESSION_INVALIDATED: "登录已失效，请重新登录。", SYNC_CONFLICT: "云端存档版本较新，请先预览云端版本。",
        ACTION_ID_REUSED: "操作标识已用于另一份存档。", SAVE_OWNER_MISMATCH: "存档不属于当前账号。",
        SAVE_CHECKSUM_MISMATCH: "存档完整性校验失败。", SAVE_TOO_LARGE: "存档超过大小限制。" };
      return reply({ ok: false, code, message: messages[code] || "云存档请求未完成。" }, code === "SESSION_INVALIDATED" ? 401 : code === "SYNC_CONFLICT" ? 409 : 400);
    }
  };
}
