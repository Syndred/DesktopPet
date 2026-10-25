import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
const source = resolve(process.argv[2]), output = resolve(process.argv[3]);
mkdirSync(output, { recursive: true });
const { _electron: electron } = createRequire(join(source, 'package.json'))('playwright');
const env = { ...process.env, PET_USER_DATA_DIR: join(output, `ordinary-${Date.now()}`) };
delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_QA_SCENARIO; delete env.PET_RUNTIME_DATA_FILE;
const app = await electron.launch({ args: [source], cwd: source, env });
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), profile: env.PET_USER_DATA_DIR, mode: 'actual platform font used by Chromium, independent ordinary profile', views: [], errors: [] };
try {
  const page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  await page.waitForFunction(() => Boolean(window.lingjing));
  const password = `Font-${randomUUID()}!`;
  const result = await page.evaluate(input => window.lingjing.invoke('accounts', 'register', input), { provider: 'local', account: `font_${Date.now()}`, username: '字体独立验收', password, confirmPassword: password, rememberSession: false });
  if (!result.ok) throw new Error(JSON.stringify(result));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const cdp = await page.context().newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  for (const route of ['/settings', '/account', '/settings/ai']) {
    await page.evaluate(route => { location.hash = `#${route}`; }, route); await page.waitForTimeout(500); await page.evaluate(() => document.fonts.ready);
    const { root } = await cdp.send('DOM.getDocument'); const samples = [];
    for (const selector of ['.main-content h1', '.ac-setting-row strong', '.ac-setting-row small', '.ac-card h2', '.ac-form label', '.cv-root label', '.main-content input', '.main-content button']) {
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector }); if (!nodeId) continue;
      const fonts = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
      const metrics = await page.locator(selector).first().evaluate(element => { const c = getComputedStyle(element), r = element.getBoundingClientRect(); return { text: element.textContent?.slice(0, 80), family: c.fontFamily, size: c.fontSize, weight: c.fontWeight, lineHeight: c.lineHeight, x: r.x, y: r.y, width: r.width, height: r.height }; });
      samples.push({ selector, ...metrics, actualFonts: fonts.fonts });
    }
    await page.screenshot({ path: join(output, `${route.slice(1).replaceAll('/', '-')}.png`) }); proof.views.push({ route, samples });
  }
  console.log(JSON.stringify(proof.views.map(view => ({ route: view.route, samples: view.samples.map(sample => ({ selector: sample.selector, size: sample.size, fonts: sample.actualFonts.map(font => ({ family: font.familyName, glyphs: font.glyphCount })) })) })), null, 2));
} finally { writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); await app.close(); }
