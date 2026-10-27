import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join, sep } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export async function verifyPortableDefaultConfig({ executable, expectedSource, output, inspect }) {
  const directory = join(output, 'ordinary-config'); mkdirSync(directory, { recursive: true });
  const profile = join(directory, 'fresh-profile'); mkdirSync(profile);
  const env = { ...process.env, PET_USER_DATA_DIR: profile };
  for (const key of Object.keys(env)) if (/^(?:SUPABASE_|LINGJING_SUPABASE_|LINGJING_QA_|LINGJING_PUBLIC_CONFIG$|LINGJING_LEGACY_AUTH$|PET_RUNTIME_DATA_FILE$|ELECTRON_RUN_AS_NODE$|ELECTRON_RENDERER_URL$)/.test(key)) delete env[key];
  const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done)); const port = server.address().port; await new Promise(done => server.close(done));
  const child = spawn(executable, [`--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let failure, logs = ''; child.on('error', error => { failure = error; }); let browser;
  for (const stream of [child.stdout, child.stderr]) stream?.on('data', value => { logs = (logs + value.toString()).slice(-12000); });
  const proof = { scope: 'Ordinary actual portable SFX launch with a fresh local profile, no QA marker and no cloud configuration environment variables. Configuration availability, not a live-cloud transaction.', profile, pid: child.pid };
  try {
    let ready = false;
    for (let count = 0; count < 240; count++) {
      if (failure) throw failure;
      try { const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(300) }); if (response.ok && (await response.json()).some(target => target.type === 'page')) { ready = true; break; } } catch { /* Wait for owned SFX and its business window before attaching. */ }
      await new Promise(done => setTimeout(done, 250));
    }
    assert.ok(ready, `Ordinary portable business window failed to start: ${logs.slice(-2000)}`); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
    let page;
    for (let count = 0; count < 100; count++) { page = browser.contexts().flatMap(context => context.pages()).find(value => value.url().includes('/app.asar/') && value.url().includes('/ui/index.html')); if (page) break; await new Promise(done => setTimeout(done, 100)); }
    assert.ok(page); await page.waitForFunction(() => Boolean(window.lingjing));
    const session = await page.evaluate(() => window.lingjing.invoke('accounts', 'session', {}));
    assert.equal(session.ok, true); assert.equal(session.data.dataMode, 'live'); assert.equal(session.data.scenario, null); assert.equal(session.data.currentUser, null); assert.equal(session.data.defaultProvider, 'runtime', 'Cloud account must be configured without shell environment');
    const info = await page.evaluate(() => window.lingjing.invoke('app', 'info', {})); assert.equal(info.ok, true); assert.equal(info.data.build.sourceCommit, expectedSource);
    assert.equal(info.data.build.publicCloud.projectRef, 'jbvrdmrkwpznbrvteive');
    const loadedFile = fileURLToPath(page.url().split('#')[0]), boundary = loadedFile.indexOf(`${sep}app.asar${sep}`);
    assert.ok(boundary > 0 && !loadedFile.includes('win-unpacked'), 'Configuration smoke must use the extracted actual portable SFX');
    const resourceDirectory = loadedFile.slice(0, boundary), bytes = readFileSync(join(resourceDirectory, 'lingjing-cloud-public.json')), actualCloud = JSON.parse(bytes);
    const actualSha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actualSha, info.data.build.publicCloud.sha256); assert.equal(actualCloud.projectRef, info.data.build.publicCloud.projectRef); assert.equal(actualCloud.url, info.data.build.publicCloud.url);
    if (inspect) proof.focusedInspection = await inspect({ page, info: info.data, profile });
    proof.actualCloudConfig = { projectRef: actualCloud.projectRef, url: actualCloud.url, sha256: actualSha, resourceDirectory };
    proof.publicCloud = info.data.build.publicCloud; proof.electron = info.data.runtime.electron; proof.defaultProvider = session.data.defaultProvider; proof.passed = true;
    return proof;
  } catch (error) { proof.failure = String(error); throw error; }
  finally {
    if (browser) await Promise.race([(async () => { try { await (await browser.newBrowserCDPSession()).send('Browser.close'); } catch { /* Closing CDP may disconnect before reply. */ } await browser.close().catch(() => {}); })(), new Promise(done => setTimeout(done, 3000))]);
    if (child.exitCode === null) await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => setTimeout(done, 2500))]);
    if (child.exitCode === null && child.pid) try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* Already exited. */ }
    proof.completedAt = new Date().toISOString(); writeFileSync(join(directory, 'evidence.json'), JSON.stringify(proof, null, 2));
    writeFileSync(join(directory, 'launcher.log'), logs);
  }
}
