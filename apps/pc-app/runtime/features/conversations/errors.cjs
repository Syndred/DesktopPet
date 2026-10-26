const messages = {
  AUTH_REQUIRED: "请先登录账号。", SESSION_CHANGED: "账号已切换，本次请求已停止。",
  PET_NOT_FOUND: "找不到这只伙伴，请重新选择。", INVALID_INPUT: "请检查输入内容。",
  SELECTION_FAILED: "伙伴切换暂未确认，请稍后重试。原选择已保留。",
  REVISION_CONFLICT: "内容已发生变化，请刷新后重新编辑。", CONNECTION_REQUIRED: "请先保存模型连接设置。",
  KEY_REQUIRED: "请为此连接保存 API Key。", SECURE_STORAGE_UNAVAILABLE: "系统安全存储暂不可用，密钥未保存。",
  KEY_UNAVAILABLE: "无法解密此连接的密钥，请重新填写。", CONNECTION_INVALID: "请输入有效的 HTTPS 接口地址；本机服务可使用 HTTP。",
  BUSY: "这只伙伴正在回复，请先停止或等待回复完成。", CANCELLED: "回复已停止。",
  INTERRUPTED: "上次回复因应用退出而中断，可以重试。", TIMEOUT: "模型响应超时，请重试。",
  PROVIDER_AUTH: "模型服务拒绝了密钥，请检查连接设置。", RATE_LIMITED: "模型服务请求过于频繁，请稍后重试。",
  PROVIDER_UNAVAILABLE: "模型服务暂时不可用，请稍后重试。", PROVIDER_REJECTED: "模型服务拒绝请求，请检查模型和接口设置。",
  INVALID_RESPONSE: "模型响应不完整或格式不受支持，请重试。", EMPTY_RESPONSE: "模型没有返回文本，请检查模型设置。",
  RESPONSE_TOO_LARGE: "模型回复超过本地安全长度限制。", NETWORK_ERROR: "无法连接模型服务，请检查网络和接口地址。",
  RETRY_NOT_ALLOWED: "只能重试这只伙伴最后一次失败或停止的回复。", NOT_FOUND: "记录不存在或已删除。",
  MEMORY_LIMIT: "这只伙伴已保存 100 条记忆，请先整理已有记忆。",
  CLOUD_SAVE_PENDING: "聊天记录尚未得到云端确认，原内容已保留，请联网后重试。",
  RECORD_CONFLICT: "这条记录已在另一端更新，本机修改已保留；请刷新后重新编辑。",
  RECORD_UNAVAILABLE: "暂时无法读取云端聊天记录，已有内容仍保留。",
  LEGACY_CORRUPT: "旧记录暂时无法读取，原始存档仍保留。", LEGACY_INVALID: "旧记录的归属或格式无法确认，原始存档仍保留。",
  LEGACY_EMPTY: "没有可导入的旧记录。", LEGACY_CONFLICT: "旧记录与当前内容有冲突；可先仅导入聊天，原始存档仍保留。",
  INTERNAL_ERROR: "操作未完成，请稍后重试。"
};
class ConversationError extends Error {
  constructor(code) { super(messages[code] || messages.INTERNAL_ERROR); this.code = code; }
}
function fail(code) { throw new ConversationError(code); }
function publicError(error) {
  const code = error instanceof ConversationError ? error.code : "INTERNAL_ERROR";
  return { ok: false, code, message: messages[code] || messages.INTERNAL_ERROR };
}
module.exports = { ConversationError, fail, publicError, messages };
