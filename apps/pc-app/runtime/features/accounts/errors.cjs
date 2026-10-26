class AccountError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "AccountError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function invariant(condition, code, message, details) {
  if (!condition) throw new AccountError(code, message, details);
}

function resultError(error) {
  return {
    ok: false,
    code: error.code || "ACCOUNTS_ERROR",
    message: error.code ? error.message : "操作未完成，请重试。",
    ...(error.details ? { details: error.details } : {})
  };
}

function cloudErrorCategory(code) {
  if(/AUTH|SESSION|DEVICE|OWNER|FORBIDDEN|SCOPE|PERMISSION|LOGIN/.test(code||''))return 'permission';
  if(/CONFLICT|REVIEW_REQUIRED|ACTION_ID/.test(code||''))return 'conflict';
  if(/^(CLOUD_UNAVAILABLE|RECORD_UNAVAILABLE|COMPANION_CLOUD_UNAVAILABLE|NETWORK_ERROR|FETCH_ERROR|TIMEOUT|ETIMEDOUT|ECONNRESET|ECONNREFUSED)$/.test(code||''))return 'network';
  return 'error';
}
module.exports = { AccountError, invariant, resultError, cloudErrorCategory };
