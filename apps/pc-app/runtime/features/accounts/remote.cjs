const { AccountError, invariant } = require("./errors.cjs");

function normalizeRemoteUser(user) {
  invariant(user && typeof user.id === "string" && user.id.length > 0 && typeof user.account === "string"
    && typeof user.sessionToken === "string" && user.sessionToken.length >= 16,
  "INVALID_CLOUD_IDENTITY", "云端返回的登录身份不完整，请重新登录。");
  return { id: user.id, account: user.account, username: user.username || user.account,
    sessionToken: user.sessionToken, createdAt: user.createdAt };
}
function cloudError(error) {
  if (error instanceof AccountError) return error;
  const text = String(error?.message || error || "").toLowerCase();
  if (/invalid (old )?password/.test(text)) return new AccountError("INVALID_PASSWORD", "密码不正确。");
  if (text.includes("account already exists")) return new AccountError("ACCOUNT_EXISTS", "账号已存在。");
  if (text.includes("account not found")) return new AccountError("ACCOUNT_NOT_FOUND", "账号不存在。");
  if (/session invalidated|invalid session token|session token is required/.test(text)) return new AccountError("SESSION_INVALIDATED", "云端登录已失效，请重新登录。");
  return new AccountError("CLOUD_UNAVAILABLE", "云端服务暂时不可用，请检查网络后重试。");
}

/** Reuses the existing runtime_accounts authentication protocol, never auth.uid(). */
function createRemoteAdapter(online) {
  const enabled = Boolean(online?.enabled);
  const invokeAuth = async (op, payload) => {
    invariant(enabled, "CLOUD_UNAVAILABLE", "云端账号服务未配置。");
    try {
      // Same existing Edge function and protocol. Scope errors to this request, rather
      // than allowing an old request to invalidate OnlineDuelService's new active user.
      const response = await online.client.functions.invoke(online.functionName, { body: { op, ...payload } });
      if (response.error) {
        let body;
        try { body = await response.error.context?.json?.(); } catch { /* Non-JSON network error. */ }
        throw new Error(body?.error?.message || body?.message || response.error.message);
      }
      const body = response.data;
      if (body?.ok === false) throw new Error(body.error?.message || "cloud request rejected");
      const data = body?.ok === true ? body.data : body;
      invariant(data && typeof data === "object", "CLOUD_UNAVAILABLE", "云端账号响应不完整。");
      return data;
    } catch (error) { throw cloudError(error); }
  };
  return {
    enabled,
    async login(account, password) { return normalizeRemoteUser((await invokeAuth("login_account", { account, password })).currentUser); },
    async register(account, password, username) { return normalizeRemoteUser((await invokeAuth("register_account", { account, password, username })).currentUser); },
    async verify(user) {
      await invokeAuth("search_accounts", { userId: user.id, sessionToken: user.sessionToken, keyword: user.account, limit: 1 });
      return user;
    },
    async update(user, changes) {
      const result = await invokeAuth("update_account", { userId: user.id, sessionToken: user.sessionToken, ...changes });
      return normalizeRemoteUser(result.currentUser);
    },
    setCurrentUser(user) { online?.setCurrentUser?.(user); },
    onInvalidated(listener) {
      return online?.onEvent?.(event => { if (event.type === "session-invalidated") listener(event.payload); });
    },
    async signOut(session) {
      const roomId = online?.room?.id;
      online?.setCurrentUser?.(null);
      if (roomId && session?.sessionToken && online.client) {
        // Capture old credentials/room and never mutate the new connection on completion.
        await online.client.functions.invoke(online.functionName, { body: { op: "leave_room", userId: session.id,
          sessionToken: session.sessionToken, roomId, reason: "logout" } }).catch(() => {});
      }
    },
    async cloudSave(op, session, payload = {}) {
      invariant(enabled && online?.client, "SYNC_UNAVAILABLE", "云存档服务未配置。");
      let response;
      try {
        response = await online.client.functions.invoke(process.env.SUPABASE_ACCOUNTS_FUNCTION || "accounts-sync", {
          body: { ...payload, op, userId: session.id, sessionToken: session.sessionToken }
        });
      } catch { throw new AccountError("SYNC_UNAVAILABLE", "云存档服务连接失败，已保留待重试记录。"); }
      if (response.error) {
        let data;
        try { data = await response.error.context?.json?.(); } catch { /* Network/proxy errors have no JSON body. */ }
        if (data?.code) throw new AccountError(data.code, data.message || "云端拒绝了存档请求。");
        throw new AccountError("SYNC_UNAVAILABLE", "云存档端点尚不可用，待同步数据已保留。");
      }
      const data = response.data;
      invariant(data?.ok, data?.code || "SYNC_UNAVAILABLE", data?.message || "云存档端点未返回有效结果。");
      return data.data;
    }
  };
}
module.exports = { createRemoteAdapter, normalizeRemoteUser, cloudError };
