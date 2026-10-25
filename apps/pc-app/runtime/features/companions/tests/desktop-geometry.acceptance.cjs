/** Native geometry check only. No product profile, IPC drag, mouse or keyboard automation. */
const { join, resolve, dirname } = require('node:path');
const { mkdirSync, writeFileSync, mkdtempSync, readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { tmpdir } = require('node:os');

if (!process.versions.electron || process.type !== 'browser') {
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(require('electron'), [__filename, ...process.argv.slice(2)], { env, windowsHide: true, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

const { app, BrowserWindow, screen } = require('electron');
const { placeDesktopWindow } = require('../windows.cjs');
const output = resolve(process.argv[2] || 'artifacts/companions/user-qa/native-geometry-fixed.json');
const profile = mkdtempSync(join(tmpdir(), 'lingjing-companions-geometry-'));
app.setPath('userData', profile);
app.setName('Lingjing Companions Geometry QA');
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));
const windows = new Set();
app.on('window-all-closed', () => {});
const hashFile = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const git = args => execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
const report = { kind: 'isolated-native-window-geometry', realMouseDrag: false, profile, electron: process.versions.electron,
  startedAt: new Date().toISOString(), source: { commit: git(['rev-parse','HEAD']), dirty: git(['status','--porcelain']),
    windowsSha256: hashFile(join(__dirname,'../windows.cjs')), harnessSha256: hashFile(__filename) }, measurements: [] };
app.whenReady().then(async () => {
  report.displays = screen.getAllDisplays().map(({ id, scaleFactor, workArea }) => ({ id, scaleFactor, workArea }));
  for (const display of report.displays) for (const scale of [.75, 1, 1.35]) for (const method of ['setPosition', 'placeDesktopWindow']) {
    const pet = { desktop: { scale, position: { x: display.workArea.x + 60, y: display.workArea.y + 60, displayId: String(display.id) } } };
    const canonical = { width: Math.round(230 * scale), height: Math.round(280 * scale) };
    const origin = { x: display.workArea.x + 60, y: display.workArea.y + 60 };
    const win = new BrowserWindow({ ...origin, ...canonical, transparent: true, frame: false, resizable: false,
      hasShadow: false, skipTaskbar: true, backgroundColor: '#00000000', alwaysOnTop: true, show: false,
      focusable: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    windows.add(win);
    await win.loadURL('data:text/html,<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}</style>');
    await pause(50);
    const initial = win.getBounds(); const samples = [];
    for (let i = 0; i < 240; i++) {
      const position = { x: origin.x + i % 40, y: origin.y + Math.floor(i / 40) % 2 };
      if (method === 'setPosition') win.setPosition(position.x, position.y, false);
      else placeDesktopWindow(win, pet, screen, { ...position, displayId: String(display.id) });
      await pause(2);
      samples.push({ move: i, requested: { ...position, ...canonical }, bounds: win.getBounds(), contentBounds: win.getContentBounds() });
    }
    const viewport = await win.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})');
    const byPosition = new Map();
    for (const sample of samples) {
      const key = `${sample.requested.x}:${sample.requested.y}`;
      const sizes = byPosition.get(key) || new Set(); sizes.add(`${sample.bounds.width}:${sample.bounds.height}`); byPosition.set(key,sizes);
    }
    const samePositionStable = [...byPosition.values()].every(sizes => sizes.size === 1);
    const maxRoundingDip = Math.max(...samples.flatMap(item => [Math.abs(item.bounds.width-canonical.width), Math.abs(item.bounds.height-canonical.height)]));
    report.measurements.push({ displayId: display.id, displayScaleFactor: display.scaleFactor, savedScale: scale, method,
      canonical, initial, final: samples.at(-1).bounds, viewport, savedScaleAfter: pet.desktop.scale, samePositionStable, maxRoundingDip,
      widths: [...new Set(samples.map(item => item.bounds.width))], heights: [...new Set(samples.map(item => item.bounds.height))], samples });
    win.destroy(); windows.delete(win);
  }
  report.completedAt = new Date().toISOString();
  // Win32 rounds enclosing DIP rectangles at fractional DPI. Compare repeated
  // identical positions, not different pixel phases of the enclosing rectangle.
  report.fixedSizeStable = report.measurements.filter(item => item.method === 'placeDesktopWindow').every(item => item.samePositionStable && item.maxRoundingDip <= 3 && item.savedScale === item.savedScaleAfter);
  report.legacyGrowthReproduced = report.measurements.some(item => item.method === 'setPosition' && (item.final.width > item.initial.width + 2 || item.final.height > item.initial.height + 2));
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, fixedSizeStable: report.fixedSizeStable, legacyGrowthReproduced: report.legacyGrowthReproduced,
    measurements: report.measurements.map(({ method, savedScale, canonical, initial, final, displayScaleFactor }) => ({ method, savedScale, canonical, initial, final, displayScaleFactor })) }));
  app.exit(report.fixedSizeStable ? 0 : 1);
}).catch(error => { console.error(error); for (const win of windows) if (!win.isDestroyed()) win.destroy(); app.exit(1); });
