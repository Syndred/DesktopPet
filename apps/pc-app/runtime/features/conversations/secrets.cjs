/* eslint-disable @typescript-eslint/no-require-imports -- Electron feature contract uses CommonJS. */
const { fail } = require("./errors.cjs");

// No plaintext fallback. The codec is only constructed in Electron's main process.
function createElectronSecretCodec(safeStorage) {
  function available() {
    return Boolean(safeStorage?.isEncryptionAvailable()) &&
      safeStorage.getSelectedStorageBackend?.() !== "basic_text";
  }
  return {
    available,
    encrypt(value) {
      if (!available()) fail("SECURE_STORAGE_UNAVAILABLE");
      try { return safeStorage.encryptString(value).toString("base64"); }
      catch { fail("SECURE_STORAGE_UNAVAILABLE"); }
    },
    decrypt(value) {
      if (!available()) fail("SECURE_STORAGE_UNAVAILABLE");
      try { return safeStorage.decryptString(Buffer.from(value, "base64")); }
      catch { fail("KEY_UNAVAILABLE"); }
    }
  };
}
module.exports = { createElectronSecretCodec };
