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

module.exports = { AccountError, invariant, resultError };
