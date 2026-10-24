import { _electron as electron } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const output = resolve('artifacts/foundation/shell');
mkdirSync(output, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: resolve(output, 'profile') };
delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [resolve('.')], env });
const errors = [];
try {
  const page = await application.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const info = await page.evaluate(() => window.lingjing.invoke('app', 'info'));
  assert.equal(info.ok, true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.lingjing.send), 'undefined');
  await page.getByRole('button', { name: '设置', exact: true }).click();
  assert.equal(await page.evaluate(() => location.hash), '#/settings');
  await page.screenshot({ path: resolve(output, 'shell.png') });
  const windows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(w => ({ title: w.getTitle(), bounds: w.getBounds(), visible: w.isVisible(), sandbox: w.webContents.getLastWebPreferences().sandbox, contextIsolation: w.webContents.getLastWebPreferences().contextIsolation })));
  assert.equal(windows[0].visible, true);
  assert.equal(windows[0].sandbox, true);
  assert.equal(windows[0].contextIsolation, true);
  assert.deepEqual(errors, []);
  writeFileSync(resolve(output, 'evidence.json'), JSON.stringify({ at: new Date().toISOString(), electron: await application.evaluate(() => process.versions.electron), info, windows, errors }, null, 2));
  console.log('Real Windows Electron shell passed:', output);
  if (process.env.LINGJING_KEEP_OPEN === '1') await new Promise(resolve => application.on('close', resolve));
} finally { await application.close(); }
