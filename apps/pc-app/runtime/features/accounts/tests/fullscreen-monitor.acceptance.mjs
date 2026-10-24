import { _electron as electron } from "playwright";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const directory = resolve(`artifacts/accounts/win32-fullscreen-${Date.now()}`); mkdirSync(directory, { recursive: true });
const env = { ...process.env, ACCOUNTS_FULLSCREEN_PROFILE: join(directory, "profile") }; delete env.ELECTRON_RUN_AS_NODE;
let application, monitor;
const evidence = { at: new Date().toISOString(), states: [], source: "actual foreground Win32/DWM monitor; no injected fullscreen state" };
try {
  monitor = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("apps/pc-app/runtime/features/accounts/foreground-fullscreen.ps1")], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let buffer = "", ready = false, full = false;
  monitor.stdout.on("data", chunk => {
    buffer += chunk.toString(); const lines = buffer.split(/\r?\n/); buffer = lines.pop() || "";
    for (const text of lines) if (text === "true" || text === "false") { ready = true; full = text === "true"; evidence.states.push({ full, at: new Date().toISOString() }); console.log("WIN32_FOREGROUND_FULLSCREEN", full); }
  });
  monitor.stderr.on("data", chunk => { evidence.monitorError = chunk.toString(); });
  const wait = async (predicate, seconds) => { const until = Date.now() + seconds * 1000; while (!predicate()) { assert.ok(Date.now() < until, "Native foreground condition was not observed"); await new Promise(resolve => setTimeout(resolve, 100)); } };
  await wait(() => ready, 15);
  application = await electron.launch({ args: [resolve("apps/pc-app/runtime/features/accounts/tests/fullscreen.fixture.cjs")], env });
  const page = await application.firstWindow(); await page.getByRole("heading", { name: "Win32 全屏检测验收" }).waitFor();
  console.log("WAIT_FOR_NATIVE_FOREGROUND", directory);
  await wait(() => full, 120);
  await page.screenshot({ path: join(directory, "fullscreen.png") });
  await application.close(); application = null; await wait(() => !full, 15);
  evidence.passed = true; writeFileSync(join(directory, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log("WIN32_FULLSCREEN_MONITOR_PASSED", directory);
} catch (error) {
  evidence.error = error.message; writeFileSync(join(directory, "failure.json"), JSON.stringify(evidence, null, 2)); console.error(error); process.exitCode = 1;
} finally { monitor?.kill(); await application?.close(); }
