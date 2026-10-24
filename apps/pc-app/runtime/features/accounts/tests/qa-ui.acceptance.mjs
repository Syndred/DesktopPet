import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { basename, join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const { provisionQaProfile } = require("../qa-scenario.cjs");
const resume = process.env.ACCOUNTS_QA_RESUME_DIR;
const output = resolve(resume || `artifacts/accounts/qa-ui-${Date.now()}`); mkdirSync(output, { recursive: true });
const qaProfile = join(output, "qa-profile"), marker = resume ? JSON.parse(readFileSync(join(qaProfile, ".lingjing-qa-profile.json"), "utf8")) : provisionQaProfile(qaProfile, "unified-battle");
const ordinary = join(output, "ordinary-profile");
const sourceProfile = resolve("artifacts/accounts/electron-1792845865236/profile");
const caches = new Set(["Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "blob_storage"]);
if (!resume) cpSync(sourceProfile, ordinary, { recursive: true, filter: path => !caches.has(basename(path)) });
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const ordinaryBefore = digest(join(sourceProfile, "lingjing.sqlite"));
const evidence = resume ? JSON.parse(readFileSync(join(output, "failure.json"), "utf8")) : { at: new Date().toISOString(), sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  scope: "accounts QA boundary and unchanged backup implementation; not a simulated friend-PK or real-cloud success claim", marker, checks: [], dialogs: [] };
if (resume) { evidence.resumedAfterHarnessFailure = { reason: evidence.error.message, correction: "backupList public field is filePath; actual restore and IPC settings readback had already succeeded" }; delete evidence.error; }
const check = (name, data) => { evidence.checks.push({ name, data }); console.log("PASS", name); };
const checkpoint = (name, file) => { evidence.dialogs.push({ name, file }); console.log("NATIVE_DIALOG", name, file); };
let application;
async function launch(profile, qa = false) {
  const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  delete env.LINGJING_QA_SCENARIO; if (qa) env.LINGJING_QA_SCENARIO = "unified-battle";
  application = await electron.launch({ args: [resolve(".")], env });
  const page = await application.firstWindow(); await page.waitForLoadState("domcontentloaded");
  await page.evaluate(qa => { document.title = qa ? "灵境 · QA 身份与备份验收（独立场景）" : "灵境 · 正常账号文案验收（独立副本）"; location.hash = "#/account"; }, qa);
  await page.locator(".ac-auth, .ac-page-heading").first().waitFor();
  return page;
}
async function register(page, name) {
  await page.getByRole("tab", { name: "注册", exact: true }).click();
  await page.getByLabel("用户名", { exact: true }).fill(name);
  await page.getByLabel("账号", { exact: true }).fill(name);
  await page.getByLabel("密码", { exact: true }).fill("qa-secret-789");
  await page.getByLabel("确认密码", { exact: true }).fill("qa-secret-789");
  await page.getByRole("button", { name: "创建账号 →", exact: true }).click();
  await page.getByRole("heading", { name: "把每一段陪伴，好好保存。" }).waitFor();
}
const invoke = (page, command, payload) => page.evaluate(({ command, payload }) => window.lingjing.invoke("accounts", command, payload), { command, payload });
async function volume(page, value) {
  await page.evaluate(() => { location.hash = "#/settings"; });
  const slider = page.getByRole("slider", { name: "音量" }); await slider.waitFor();
  await slider.focus(); await page.keyboard.press("Home");
  for (let i = 0; i < value; i++) await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.getByText("设置已保存。", { exact: true }).waitFor();
}
try {
  let page = await launch(qaProfile, true);
  let sessionA;
  const backupFile = join(output, "qa-save.lingjing.json");
  if (resume) {
    await page.getByLabel("账号", { exact: true }).fill("qa_alice");
    await page.getByLabel("密码", { exact: true }).fill("qa-secret-789");
    await page.getByRole("button", { name: "登录进入 →", exact: true }).click();
    await page.getByRole("heading", { name: "把每一段陪伴，好好保存。" }).waitFor();
    sessionA = await invoke(page, "session");
    assert.equal((await invoke(page, "settingsGet")).data.document.desktop.volume, 31);
    const receipts = await invoke(page, "backupList"), preserved = receipts.data.find(row => row.reason === "before-restore");
    assert.equal(JSON.parse(readFileSync(preserved.filePath, "utf8")).data.modules.settings.data.desktop.volume, 89);
    check("restart readback confirms native restore to 31 and preserved pre-restore volume 89", { preserved, session: sessionA.data });
  } else {
  assert.equal(await page.getByRole("checkbox", { name: "保持登录", exact: true }).isDisabled(), true);
  await page.getByLabel("测试场景", { exact: true }).focus();
  await page.getByRole("tooltip").filter({ hasText: "隔离测试" }).waitFor();
  await page.screenshot({ path: join(output, "qa-login-tooltip.png") }); await page.keyboard.press("Escape");
  const startupBefore = await application.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin);
  await register(page, "qa_alice");
  sessionA = await invoke(page, "session");
  assert.equal(sessionA.data.dataMode, "simulated"); assert.equal(sessionA.data.currentUser.dataMode, "simulated");
  assert.ok(sessionA.data.currentUser.id.startsWith(`qa:${marker.runId}:`));
  assert.equal(sessionA.data.persistence, "memory"); assert.equal(sessionA.data.defaultProvider, "local");
  check("real Electron registration yields a verified namespaced memory-only QA identity and a focusable scene tooltip", sessionA.data);
  const blocked = await invoke(page, "login", { provider: "runtime", account: "qa_alice", password: "qa-secret-789" });
  assert.equal(blocked.ok, false); assert.equal(blocked.code, "SIMULATED_SESSION_ONLY");
  assert.equal((await invoke(page, "session")).data.currentUser.id, sessionA.data.currentUser.id);
  check("real cloud authentication is explicitly rejected without changing the active QA owner", blocked);
  await page.screenshot({ path: join(output, "qa-account.png") });
  await volume(page, 31);
  await page.getByRole("switch", { name: "开机启动", exact: true }).click();
  await page.getByRole("switch", { name: "允许附近探索使用位置", exact: true }).click();
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await page.getByText("设置已保存。", { exact: true }).waitFor();
  assert.equal(await application.evaluate(({ app }) => app.getLoginItemSettings().openAtLogin), startupBefore);
  const prefs = await invoke(page, "settingsGet"); assert.equal(prefs.data.host.locationAllowed, false);
  const notification = await invoke(page, "testNotification"); assert.equal(notification.data.reason, "qa-scenario");
  check("saved QA preferences cannot change OS startup, acquire real location or send a native notification", { startupBefore, prefs: prefs.data, notification });
  await page.screenshot({ path: join(output, "qa-settings.png") });

  await page.evaluate(() => { location.hash = "#/account"; });
  await page.getByRole("button", { name: "导出本地备份", exact: true }).click(); checkpoint("qa-export", backupFile);
  await page.getByText("备份已导出。", { exact: true }).waitFor({ timeout: 180_000 });
  const backup = JSON.parse(readFileSync(backupFile, "utf8"));
  assert.deepEqual(backup.provenance, { mode: "simulated", runId: marker.runId, scenarioId: "unified-battle" });
  assert.equal(JSON.stringify(backup).includes("qa-secret-789"), false);
  await volume(page, 89);
  await page.evaluate(() => { location.hash = "#/account"; });
  await page.getByRole("button", { name: "恢复本地备份", exact: true }).click(); checkpoint("qa-restore", backupFile);
  const dialog = page.getByRole("dialog", { name: "预览恢复内容" }); await dialog.waitFor({ timeout: 180_000 });
  await page.getByRole("combobox", { name: "恢复方式", exact: true }).click();
  await page.getByRole("option", { name: "恢复到此备份版本", exact: true }).click();
  await page.getByRole("listbox").waitFor({ state: "hidden" });
  await page.getByText("当前存档将替换为此备份版本。", { exact: true }).waitFor();
  await page.screenshot({ path: join(output, "qa-restore-warning.png") });
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await page.getByText("恢复完成，原存档已备份。", { exact: true }).waitFor();
  assert.equal((await invoke(page, "settingsGet")).data.document.desktop.volume, 31);
  const receipts = await invoke(page, "backupList");
  const preserved = receipts.data.find(row => row.reason === "before-restore");
  assert.equal(JSON.parse(readFileSync(preserved.filePath, "utf8")).data.modules.settings.data.desktop.volume, 89);
  check("real native export/restore retains QA provenance, restores owner settings and preserves the before-restore save", { checksum: backup.checksum, preserved });
  }

  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByRole("heading", { name: "欢迎回来", exact: true }).waitFor();
  await register(page, "qa_bobby");
  const sessionB = await invoke(page, "session"), prefsB = await invoke(page, "settingsGet");
  assert.notEqual(sessionB.data.currentUser.id, sessionA.data.currentUser.id); assert.equal(prefsB.data.document.desktop.volume, 70);
  await page.getByRole("button", { name: "恢复本地备份", exact: true }).click(); checkpoint("qa-reject-other-owner", backupFile);
  await page.getByRole("alert").filter({ hasText: "此备份属于其他账号" }).waitFor({ timeout: 180_000 });
  check("second real QA login keeps settings isolated and rejects the first owner's file", { sessionB: sessionB.data, prefsB: prefsB.data });
  assert.equal(digest(join(ordinary, "lingjing.sqlite")), ordinaryBefore);
  check("QA execution leaves a separate ordinary-profile database byte-for-byte unchanged");
  await application.close(); application = null;

  page = await launch(qaProfile, true); await page.getByRole("heading", { name: "欢迎回来", exact: true }).waitFor();
  assert.equal((await invoke(page, "session")).data.currentUser, null);
  check("QA process restart does not resume a remembered or remote session");
  await application.close(); application = null;

  page = await launch(ordinary); await page.getByRole("heading", { name: "把每一段陪伴，好好保存。" }).waitFor();
  const normalSession = await invoke(page, "session");
  assert.equal(normalSession.data.dataMode, "live"); assert.equal(normalSession.data.scenario, null);
  assert.equal(await page.getByLabel("测试场景", { exact: true }).count(), 0);
  await page.getByLabel("本机存档", { exact: true }).focus(); await page.getByRole("tooltip").filter({ hasText: "可导出备份" }).waitFor();
  await page.screenshot({ path: join(output, "normal-account-tooltip.png") }); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "恢复本地备份", exact: true }).click(); checkpoint("normal-reject-qa", backupFile);
  await page.getByRole("alert").filter({ hasText: "测试存档与正式存档不能互相恢复" }).waitFor({ timeout: 180_000 });
  await page.screenshot({ path: join(output, "normal-reject-qa.png") });
  check("ordinary account stays live, uses short shared-toolip status and rejects a simulated save through native file picking", normalSession.data);
  evidence.passed = true; writeFileSync(join(output, "evidence.json"), JSON.stringify(evidence, null, 2)); console.log("ACCOUNTS_QA_UI_PASSED", output);
} catch (error) {
  evidence.error = { message: error.message, stack: error.stack }; writeFileSync(join(output, "failure.json"), JSON.stringify(evidence, null, 2));
  console.error(error); process.exitCode = 1;
} finally { if (application) await application.close(); }
