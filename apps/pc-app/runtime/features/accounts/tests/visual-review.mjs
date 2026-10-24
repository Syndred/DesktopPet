import { _electron as electron } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
const directory = resolve(`artifacts/accounts/ui-review-${Date.now()}`); mkdirSync(directory, { recursive: true });
const profile = resolve(process.env.ACCOUNTS_REVIEW_PROFILE || "artifacts/accounts/electron-1792844040129/profile");
const env = { ...process.env, PET_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [resolve(".")], env });
try {
  const page = await application.firstWindow(); await page.getByRole("navigation", { name: "主导航" }).waitFor();
  const records = [];
  for (const [path, image] of [["/account", "account.png"], ["/settings", "settings.png"], ["/settings/privacy", "privacy.png"]]) {
    await page.evaluate(path => { location.hash = `#${path}`; }, path);
    await page.locator(".ac-page-heading").waitFor();
    await page.evaluate(() => { const main = document.querySelector(".main-content"); if (main) main.scrollTop = 0; });
    await page.screenshot({ path: join(directory, image) });
    records.push({ path, image, switches: await page.getByRole("switch").count() });
  }
  await page.evaluate(() => { location.hash = "#/account"; });
  await page.getByRole("button", { name: "退出登录", exact: true }).click(); await page.getByRole("heading", { name: "欢迎回来" }).waitFor();
  await page.screenshot({ path: join(directory, "login.png") });
  writeFileSync(join(directory, "evidence.json"), JSON.stringify({ at: new Date().toISOString(), realElectron: true, records,
    referenceBoards: ["08-desktop-and-ai-settings.png", "09-login-and-account.png"], artworkOnly: "Approved illustration regions; live controls and data are React" }, null, 2));
  console.log("ACCOUNTS_UI_REVIEW", directory);
} finally { await application.close(); }
