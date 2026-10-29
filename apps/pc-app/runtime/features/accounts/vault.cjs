const { readFileSync, existsSync, unlinkSync } = require("node:fs");
const { join } = require("node:path");
const { atomicWrite } = require("./util.cjs");
const { AccountError } = require("./errors.cjs");

/** Never persist cloud tokens or remembered passwords as renderer/localStorage plaintext. */
class SessionVault {
  constructor({ safeStorage, userData }) {
    this.safeStorage = safeStorage;
    this.file = join(userData, "accounts", "verified-session.bin");
  }
  available() {
    try {
      return Boolean(this.safeStorage?.isEncryptionAvailable?.()) &&
        this.safeStorage.getSelectedStorageBackend?.() !== "basic_text";
    } catch { return false; }
  }
  save(session) {
    if (!this.available()) throw new AccountError("SECURE_STORAGE_UNAVAILABLE", "系统安全存储不可用，登录仅在本次运行中保持。");
    atomicWrite(this.file, this.safeStorage.encryptString(JSON.stringify({ version: 1, ...session })));
  }
  load() {
    if (!this.available() || !existsSync(this.file)) return null;
    try {
      const data = JSON.parse(this.safeStorage.decryptString(readFileSync(this.file)));
      if (data.version !== 1 || typeof data.ownerAccountId !== "string" || typeof data.proof !== "string") return null;
      return data;
    } catch { return null; }
  }
  clear() { if (existsSync(this.file)) unlinkSync(this.file); }
}
module.exports = { SessionVault };
