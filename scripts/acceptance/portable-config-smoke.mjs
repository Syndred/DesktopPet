import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export async function verifyPortableDefaultConfig({ executable, expectedSource, output }) {
  const directory = join(output, 'ordinary-config'); mkdirSync(directory, { recursive: true });
  const profile = join(directory, 'fresh-profile'); mkdirSync(profile);
  const env = { ...process.env, PET_USER_DATA_DIR: profile };
  for (const key of Object.keys(env)) if (/^(?:SUPABASE_|LINGJING_SUPABASE_|LINGJING_QA_|LINGJING_PUBLIC_CONFIG$|LINGJING_LEGACY_AUTH$|PET_RUNTIME_DATA_FILE$|ELECTRON_RUN_AS_NODE$|ELECTRON_RENDERER_URL$)/.test(key)) delete env[key];
  const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done)); const port = server.address().port; await new Promise(done => server.close(done));
  const child = spawn(executable, [`--remote-debugging-port=${port}`], { env, windowsHide: true, stdio: 'ignore' });
  let failure; child.on('error', error => { failure = error; }); let browser;
  const proof = { scope: 'Ordinary actual portable SFX launch with a fresh local profile, no QA marker and no cloud configuration environment variables. Configuration availability, not a live-cloud transaction.', profile, pid: child.pid };
  try {
    let ready = false;
    for (let count = 0; count < 240; count++) {
      if (failure) throw failure;
      try { if ((await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(300) })).ok) { ready = true; break; } } catch { /* Wait for owned SFX. */ }
      await new Promise(done => setTimeout(done, 250));
    }
    assert.ok(ready, 'Ordinary portable launch failed'); browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    let page;
    for (let count = 0; count < 100; count++) { page = browser.contexts().flatMap(context => context.pages()).find(value => value.url().includes('/app.asar/') && value.url().includes('/ui/index.html')); if (page) break; await new Promise(done => setTimeout(done, 100)); }
    assert.ok(page); await page.waitForFunction(() => Boolean(window.lingjing));
    const session = await page.evaluate(() => window.lingjing.invoke('accounts', 'session', {}));
    assert.equal(session.ok, true); assert.equal(session.data.dataMode, 'live'); assert.equal(session.data.scenario, null); assert.equal(session.data.currentUser, null); assert.equal(session.data.defaultProvider, 'runtime', 'Cloud account must be configured without shell environment');
    const info = await page.evaluate(() => window.lingjing.invoke('app', 'info', {})); assert.equal(info.ok, true); assert.equal(info.data.build.sourceCommit, expectedSource);
    assert.equal(info.data.build.publicCloud.projectRef, 'jbvrdmrkwpznbrvteive');
    proof.publicCloud = info.data.build.publicCloud; proof.electron = info.data.runtime.electron; proof.defaultProvider = session.data.defaultProvider; proof.passed = true;
    return proof;
  } catch (error) { proof.failure = String(error); throw error; }
  finally {
    if (browser) { try { await (await browser.newBrowserCDPSession()).send('Browser.close'); } catch { /* Closing CDP may disconnect before reply. */ } await browser.close().catch(() => {}); }
    if (child.exitCode === null) await Promise.race([new Promise(done => child.once('exit', done)), new Promise(done => setTimeout(done, 2500))]);
    if (child.exitCode === null && child.pid) try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* Already exited. */ }
    proof.completedAt = new Date().toISOString(); writeFileSync(join(directory, 'evidence.json'), JSON.stringify(proof, null, 2));
  }
}
