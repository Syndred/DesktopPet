import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsDirectory, '../../../..');
const fixturePath = path.join(testsDirectory, 'resources-hook.regressions.jsx');
const hookPath = path.join(repoRoot, 'apps/pc-app/ui/src/features/resources/useResources.ts');
const clientPath = path.join(path.dirname(hookPath), 'client.ts');
const runId = randomUUID(), runDirectory = path.join(repoRoot, 'artifacts/qa/resource-hook-regressions', runId);
fs.mkdirSync(runDirectory, { recursive: true });
const reportPath = path.join(runDirectory, 'report.json');
const report = { format: 'resources-hook.source-regressions.v1', runId, repoRoot, runDirectory,
  startedAt: new Date().toISOString(), status: 'running', nativePassed: false,
  boundary: 'Real React/DOM with controlled in-memory IPC/CAS; no Electron, live account, cloud or SQL',
  expectedCases: 22, exitCode: 1 };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sourceHashes = () => Object.fromEntries([hookPath, clientPath, fixturePath, fileURLToPath(import.meta.url)].map(file => [path.relative(repoRoot, file), hash(file)]));

function browserExecutable(chromium) {
  const explicit = process.env.RESOURCE_HOOK_TEST_CHROME;
  if (explicit) {
    const executable = path.resolve(explicit);
    if (!fs.existsSync(executable) || !fs.statSync(executable).isFile()) throw new Error('RESOURCE_HOOK_TEST_CHROME does not point to an existing browser executable');
    return { executablePath: executable, source: 'RESOURCE_HOOK_TEST_CHROME' };
  }
  const candidates = [{ executablePath: chromium.executablePath(), source: 'installed Playwright Chromium' }];
  if (process.platform === 'win32') {
    for (const root of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push({ executablePath: path.join(root, 'Google/Chrome/Application/chrome.exe'), source: 'installed platform Chrome' });
      candidates.push({ executablePath: path.join(root, 'Chromium/Application/chrome.exe'), source: 'installed platform Chromium' });
    }
  } else if (process.platform === 'darwin') {
    for (const root of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      candidates.push({ executablePath: path.join(root, 'Google Chrome.app/Contents/MacOS/Google Chrome'), source: 'installed platform Chrome' });
      candidates.push({ executablePath: path.join(root, 'Chromium.app/Contents/MacOS/Chromium'), source: 'installed platform Chromium' });
    }
  } else {
    for (const executablePath of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium']) {
      candidates.push({ executablePath, source: 'installed platform Chrome/Chromium' });
    }
  }
  const found = candidates.find(candidate => fs.existsSync(candidate.executablePath) && fs.statSync(candidate.executablePath).isFile());
  if (!found) throw new Error('No installed Chromium/Chrome found. Set RESOURCE_HOOK_TEST_CHROME to an existing executable; this runner never downloads or installs a browser.');
  return found;
}

let context, timer, before;
try {
  before = sourceHashes(); report.sourceHashes = before;
  const require = createRequire(path.join(repoRoot, 'package.json'));
  const { build } = require('esbuild'), { chromium } = require('playwright');
  report.dependencies = Object.fromEntries(['react', 'react-dom', 'esbuild', 'playwright'].map(name => [name, require(`${name}/package.json`).version]));
  const executable = browserExecutable(chromium);
  const bundle = await build({ entryPoints: [fixturePath], bundle: true, write: false, platform: 'browser', format: 'iife', target: 'es2022',
    absWorkingDir: repoRoot, nodePaths: [path.join(repoRoot, 'node_modules')], define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent' });
  fs.writeFileSync(path.join(runDirectory, 'harness.js'), bundle.outputFiles[0].contents);
  context = await chromium.launchPersistentContext(path.join(runDirectory, 'browser-profile'), {
    executablePath: executable.executablePath, headless: true, offline: true, acceptDownloads: false, serviceWorkers: 'block',
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--no-first-run']
  });
  report.browser = { ...executable, version: context.browser()?.version() || 'unknown', offline: true, profileInsideRun: true };
  const pageErrors = [], consoleErrors = [], blockedHttpRequests = [];
  await context.route(/^https?:\/\//, route => { blockedHttpRequests.push(route.request().url()); return route.abort(); });
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto('about:blank'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
  report.cases = await Promise.race([page.evaluate(() => window.runHookRegressions()), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Hook regression timeout after 30 seconds')), 30_000);
  })]);
  clearTimeout(timer);
  report.pageErrors = pageErrors; report.consoleErrors = consoleErrors; report.blockedHttpRequests = blockedHttpRequests;
  if (!Array.isArray(report.cases)) throw new Error('Regression fixture returned no case list');
  report.passed = report.cases.filter(item => item.passed === true).length;
  report.failed = report.cases.length - report.passed;
  report.exitCode = report.cases.length === report.expectedCases && report.failed === 0 && !pageErrors.length && !consoleErrors.length && !blockedHttpRequests.length ? 0 : 1;
  for (const item of report.cases) console.log(`${item.passed ? 'PASS' : 'FAIL'} ${item.name}${item.error ? ': ' + item.error : ''}`);
} catch (error) {
  report.exitCode = 1; report.error = { name: error.name, message: error.message, stack: error.stack };
} finally {
  clearTimeout(timer);
  if (context) {
    try { await context.close(); report.browserClosed = true; }
    catch (error) { report.exitCode = 1; report.closeError = error.message; }
  }
  if (before) {
    try { report.sourceHashesUnchanged = JSON.stringify(before) === JSON.stringify(sourceHashes()); if (!report.sourceHashesUnchanged) report.exitCode = 1; }
    catch (error) { report.exitCode = 1; report.sourceCheckError = error.message; }
  }
  report.completedAt = new Date().toISOString(); report.status = report.exitCode === 0 ? 'passed' : 'failed';
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: reportPath, passed: report.passed ?? 0, failed: report.failed ?? null, nativePassed: false, exitCode: report.exitCode,
    ...(report.error ? { error: report.error.message } : {}) }, null, 2));
}
process.exitCode = report.exitCode;
