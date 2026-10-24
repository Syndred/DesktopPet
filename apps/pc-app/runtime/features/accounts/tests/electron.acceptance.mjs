import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const output = resolve(process.env.ACCOUNTS_EVIDENCE_DIR || `artifacts/accounts/electron-${Date.now()}`);
const profile = join(output, "profile"); mkdirSync(profile, { recursive: true });
const source = {
  version: 3, users: [
    { id: "legacy-alice", account: "qa_alice", username: "测试甲", passwordHash: createHash("sha256").update("qa-secret-123").digest("hex") },
    { id: "legacy-bobby", account: "qa_bobby", username: "测试乙", passwordHash: createHash("sha256").update("qa-secret-123").digest("hex") }
  ], currentUserId: "legacy-alice", userInventories: {
    "legacy-alice": { pets: [{ id: "same-legacy-pet", name: { zh: "甲的伙伴" }, element: "fire" }], battleReports: [{ id: "alice-report", note: "甲的战报" }], chats: [{ id: "alice-chat", text: "甲的独立记录" }] },
    "legacy-bobby": { pets: [{ id: "same-legacy-pet", name: { zh: "乙的伙伴" }, element: "water" }], battleReports: [{ id: "bobby-report", note: "乙的战报" }], chats: [{ id: "bobby-chat", text: "乙的独立记录" }] }
  }
};
const sourceBytes = JSON.stringify(source, null, 2);
writeFileSync(join(profile, "pet-runtime-data.json"), sourceBytes);
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const errors = [], evidence = { output, at: new Date().toISOString(), checks: [], nativeDialogs: [] };
let application;
const check = (name, data) => { evidence.checks.push({ name, data }); console.log("PASS", name); };
const checkpoint = name => { writeFileSync(join(output, "checkpoint.json"), JSON.stringify({ name, backupFile: join(output, "export.lingjing.json") })); console.log("NATIVE_DIALOG", name, join(output, "export.lingjing.json")); };
async function launch() {
  application = await electron.launch({ args: [resolve(".")], env });
  const page = await application.firstWindow(); page.on("pageerror", error => errors.push(error.message));
  await page.evaluate(() => { document.title = "灵境 · 账号验收（独立数据）"; });
  await page.getByRole("navigation", { name: "主导航" }).waitFor();
  await page.evaluate(() => { location.hash = "#/account"; });
  return page;
}
async function accountLogin(page, account, secret, remember = false) {
  await page.getByLabel("账号类型").selectOption("local");
  await page.getByLabel("账号", { exact: true }).fill(account);
  await page.getByLabel("密码", { exact: true }).fill(secret);
  if (remember) await page.getByRole("checkbox", { name: "保持登录（系统安全存储）" }).check();
  await page.getByRole("button", { name: "登录进入 →" }).click();
  await page.getByRole("heading", { name: "把每一段陪伴，好好保存。" }).waitFor();
}
const ipc = (page, command, payload) => page.evaluate(async ({ command, payload }) => {
  const result = await window.lingjing.invoke("accounts", command, payload);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.data;
}, { command, payload });
async function setVolume(page, amount) {
  const slider = page.getByRole("slider"); await slider.focus(); await slider.press("Home");
  for (let i = 0; i < amount; i++) await slider.press("ArrowRight");
}
try {
  let page = await launch();
  await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
  await page.screenshot({ path: join(output, "01-login.png") });
  const session = await ipc(page, "session"); assert.equal(session.currentUser, null);
  assert.equal(session.migration.imported, 2); check("raw legacy accounts imported before login", session.migration);
  await accountLogin(page, "qa_alice", "qa-secret-123", true);
  const signedIn = await ipc(page, "session"); assert.equal(signedIn.currentUser.ownerAccountId, "local:legacy-alice");
  assert.equal(signedIn.persistence, "secure"); check("local account login and DPAPI-backed session", { user: signedIn.currentUser, persistence: signedIn.persistence });
  await page.getByLabel("用户名", { exact: true }).fill("云朵测试甲"); await page.getByRole("button", { name: "保存资料", exact: true }).click();
  await page.getByText("账号资料已保存。", { exact: true }).waitFor();
  await page.getByLabel("当前密码", { exact: true }).fill("bad-secret");
  await page.getByLabel("新密码", { exact: true }).fill("qa-new-secret-456"); await page.getByLabel("确认新密码", { exact: true }).fill("qa-new-secret-456");
  await page.getByRole("button", { name: "保存密码", exact: true }).click(); await page.getByText("当前密码不正确。", { exact: true }).waitFor();
  await page.getByLabel("当前密码", { exact: true }).fill("qa-secret-123"); await page.getByRole("button", { name: "保存密码", exact: true }).click();
  await page.getByText("密码已更新。", { exact: true }).waitFor(); check("nickname and current-password validation via UI");
  await page.getByRole("link", { name: /桌面与行为/ }).click();
  await page.getByRole("switch", { name: "始终置顶", exact: true }).uncheck();
  await page.getByRole("switch", { name: "透明区域鼠标穿透", exact: true }).uncheck();
  await setVolume(page, 37); await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.getByText("设置已保存，将在下次启动时恢复。", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "02-desktop-settings.png") });
  const settings37 = await ipc(page, "settingsGet"); assert.equal(settings37.document.desktop.volume, 37);
  assert.equal(settings37.document.desktop.alwaysOnTop, false); check("saved desktop preferences through real IPC", settings37);
  await page.getByRole("link", { name: /通知与隐私/ }).click();
  await page.getByLabel("开始时间", { exact: true }).fill("00:00"); await page.getByLabel("结束时间", { exact: true }).fill("00:00");
  await page.getByRole("button", { name: "保存设置", exact: true }).click(); await page.getByText("设置已保存，将在下次启动时恢复。", { exact: true }).waitFor();
  await page.getByRole("button", { name: "测试已保存的通知设置" }).click();
  await page.getByText("当前未发送通知：正处于安静时段。", { exact: true }).waitFor();
  check("quiet hours suppress native notifications via host");
  await page.getByRole("link", { name: /账号与同步/ }).click();
  await page.getByRole("heading", { name: "把每一段陪伴，好好保存。" }).waitFor();
  const exportPending = page.getByRole("button", { name: "↓ 导出本地备份" }).click();
  checkpoint("save-backup"); await exportPending;
  await page.getByText(/备份已导出：/).waitFor({ timeout: 180_000 }); evidence.nativeDialogs.push("native Save As selected real export file");
  const backupFile = join(output, "export.lingjing.json"); assert.equal(existsSync(backupFile), true);
  const backup = JSON.parse(readFileSync(backupFile, "utf8")); assert.equal(backup.ownerAccountId, "local:legacy-alice");
  assert.equal(backup.data.modules.legacy.data.chats[0].id, "alice-chat");
  assert.equal(JSON.stringify(backup).includes("bobby-report"), false); assert.equal(JSON.stringify(backup).includes("password_hash"), false);
  check("native file picker export contains only account A historical records", { checksum: backup.checksum });
  await page.getByRole("link", { name: /桌面与行为/ }).click(); await setVolume(page, 75);
  await page.getByRole("button", { name: "保存设置", exact: true }).click(); await page.getByText("设置已保存，将在下次启动时恢复。", { exact: true }).waitFor();
  await page.getByRole("link", { name: /账号与同步/ }).click();
  const previewPending = page.getByRole("button", { name: "恢复本地备份", exact: true }).click(); checkpoint("open-backup"); await previewPending;
  await page.getByRole("dialog", { name: "预览恢复内容" }).waitFor({ timeout: 180_000 }); evidence.nativeDialogs.push("native Open selected exact export file");
  await page.getByRole("radio", { name: "恢复到此备份版本" }).check(); await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await page.getByText(/恢复已完成。恢复前存档保存在：/).waitFor();
  const restored = await ipc(page, "settingsGet"); assert.equal(restored.document.desktop.volume, 37);
  const receipt = (await ipc(page, "backupList")).find(r => r.reason === "before-restore");
  const preserved = JSON.parse(readFileSync(receipt.filePath, "utf8")); assert.equal(preserved.data.modules.settings.data.desktop.volume, 75);
  check("UI restore reads original snapshot and preserves pre-restore data", { restoredVolume: 37, preservedVolume: 75, filePath: receipt.filePath });
  await page.getByRole("button", { name: "退出登录", exact: true }).click(); await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
  await accountLogin(page, "qa_bobby", "qa-secret-123"); const bSettings = await ipc(page, "settingsGet");
  assert.equal(bSettings.document.desktop.volume, 70); assert.equal(bSettings.document.desktop.alwaysOnTop, true);
  const db = new DatabaseSync(join(profile, "lingjing.sqlite"), { readOnly: true });
  const a = JSON.parse(db.prepare("SELECT document FROM account_legacy_data WHERE owner_account_id=?").get("local:legacy-alice").document);
  const b = JSON.parse(db.prepare("SELECT document FROM account_legacy_data WHERE owner_account_id=?").get("local:legacy-bobby").document);
  assert.equal(a.battleReports[0].id, "alice-report"); assert.equal(b.chats[0].id, "bobby-chat"); db.close();
  check("second real account has isolated preferences and historical data");
  await page.getByRole("button", { name: "退出登录", exact: true }).click(); await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
  await accountLogin(page, "qa_alice", "qa-new-secret-456", true); await page.screenshot({ path: join(output, "03-account-and-backup.png") });
  await application.close(); application = null; page = await launch();
  await page.getByRole("heading", { name: "把每一段陪伴，好好保存。" }).waitFor();
  const afterRestart = await ipc(page, "session"), prefs = await ipc(page, "settingsGet");
  assert.equal(afterRestart.currentUser.username, "云朵测试甲"); assert.equal(afterRestart.persistence, "secure");
  assert.equal(prefs.document.desktop.volume, 37); assert.equal(prefs.document.desktop.clickThrough, false);
  assert.equal(readFileSync(join(profile, "pet-runtime-data.json.before-lingjing.bak"), "utf8"), sourceBytes);
  check("real Electron restart restores verified local session, profile and settings", { session: afterRestart, settings: prefs });
  evidence.electron = await application.evaluate(() => process.versions.electron);
  evidence.errors = errors; assert.deepEqual(errors, []);
  writeFileSync(join(output, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("ACCOUNTS_ELECTRON_ACCEPTANCE_PASSED", output);
  if (process.env.ACCOUNTS_KEEP_OPEN === "1") await new Promise(resolve => application.on("close", resolve));
} catch (error) {
  evidence.error = { message: error.message, stack: error.stack }; writeFileSync(join(output, "failure.json"), JSON.stringify(evidence, null, 2));
  console.error(error); process.exitCode = 1;
} finally { await application?.close(); }
