/* eslint-disable @typescript-eslint/no-require-imports -- Isolated real canonical SVG/CSS check, without native app input. */
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('node:fs');
const { resolve, dirname, join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const Module = require('node:module');
const { buildSync } = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { chromium } = require('playwright');
const { parseCharacterFile } = require('../../resources/parser.cjs');
const { ROOT, catalog } = require('../../resources/roster.cjs');

// Replay 09's measured wide slot and two smaller scene slots using the actual
// ResourcePortrait implementation, parser and unchanged canonical PNG bytes.
// This is headless component evidence, not final-package/native acceptance.
const baseline = '066f61df2d9b6ef8977756c8b0700c1ba5b01681';
const cssPath = 'apps/pc-app/ui/src/features/conversations/styles.css';
const rendererPath = 'apps/pc-app/ui/src/features/resources/ResourcePortrait.tsx';
const protectedPaths = [rendererPath, 'apps/pc-app/ui/src/features/resources/display.ts',
  'apps/pc-app/ui/src/features/resources/portrait.css', 'apps/pc-app/ui/src/features/companions/styles.css'];
const hash = value => createHash('sha256').update(value).digest('hex');
const protectedHashes = Object.fromEntries(protectedPaths.map(path => [path, hash(readFileSync(path))]));
const output = resolve('artifacts/conversations/qa011', `run-${Date.now()}`);
mkdirSync(output, { recursive: true });
const entry = resolve(rendererPath);
const bundle = buildSync({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic',
  packages: 'external', loader: { '.css': 'empty' }, write: false }).outputFiles[0].text;
const compiled = new Module(entry, module); compiled.filename = entry; compiled.paths = Module._nodeModulePaths(dirname(entry)); compiled._compile(bundle, entry);
const beforeCss = execFileSync('git', ['show', `${baseline}:${cssPath}`], { encoding: 'utf8' });
const afterCss = readFileSync(cssPath, 'utf8');
const portraitCss = readFileSync('apps/pc-app/ui/src/features/resources/portrait.css', 'utf8');
const slots = [{ name: 'wide-native', width: 407.4, height: 225, viewport: 2048 },
  { name: 'narrow-chat', width: 193, height: 210, viewport: 1100 },
  { name: 'narrow-settings', width: 193, height: 190, viewport: 1280 }];

async function measure(page) {
  return page.locator('.cv-pet-scene').evaluate(async node => {
    const svg = node.querySelector('svg'), r = svg.getBoundingClientRect(), p = node.getBoundingClientRect(), v = svg.viewBox.baseVal;
    const scale = Math.max(r.width / v.width, r.height / v.height);
    const left = Math.max(r.left, p.left), right = Math.min(r.right, p.right), top = Math.max(r.top, p.top), bottom = Math.min(r.bottom, p.bottom);
    const x0 = r.left + (r.width - v.width * scale) / 2, y0 = r.top + (r.height - v.height * scale) / 2;
    const clone = svg.cloneNode(true), w = Math.ceil(v.width * 3), h = Math.ceil(v.height * 3);
    // A full authored-viewBox alpha mask identifies actual canonical foreground;
    // map those pixels through the displayed SVG's measured slice transform.
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h)); clone.setAttribute('preserveAspectRatio', 'none');
    const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, w, h);
    const pixels = context.getImageData(0, 0, w, h).data; let foreground = 0, visible = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pixels[(y * w + x) * 4 + 3] > 16) {
      foreground++; const sx = x0 + (x + .5) / w * v.width * scale, sy = y0 + (y + .5) / h * v.height * scale;
      if (sx >= left && sx < right && sy >= top && sy < bottom) visible++;
    }
    return { slot: { width: p.width, height: p.height }, svg: { width: r.width, height: r.height }, viewBox: svg.getAttribute('viewBox'),
      resourceId: svg.dataset.resourceId, frame: svg.dataset.frame, framing: svg.dataset.framing, preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
      visibleViewBoxFraction: Math.min(1, (right - left) / (v.width * scale)) * Math.min(1, (bottom - top) / (v.height * scale)),
      referenceForegroundPixels: foreground, visibleForegroundFraction: visible / foreground,
      cssTransform: getComputedStyle(svg).transform, figureCpPortraitCount: node.querySelectorAll('.cp-portrait').length,
      figureCanvasCount: node.querySelectorAll('canvas').length };
  });
}

(async () => {
  const executablePath = [process.env.LINGJING_QA_BROWSER_PATH, chromium.executablePath(),
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => path && existsSync(path));
  assert.ok(executablePath, 'Provide an existing headless Chromium executable; this check never installs dependencies.');
  const browser = await chromium.launch({ executablePath, headless: true });
  const rows = [], art = [], assetHashes = {};
  try {
    const page = await browser.newPage({ viewport: { width: 2048, height: 1151 }, deviceScaleFactor: 1.25 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const definition of catalog.characters) {
      const pack = await parseCharacterFile(join(ROOT, definition.manifest));
      const resource = { ...pack.resource, id: definition.resourceId };
      const png = pack.files.get(resource.entryAsset); assetHashes[resource.id] = hash(png);
      const svg = renderToStaticMarkup(React.createElement(compiled.exports.ResourcePortrait, { resource,
        assetUrl: () => `data:image/png;base64,${png.toString('base64')}` }));
      art.push({ name: definition.name, svg });
      for (const slot of slots) {
        await page.setViewportSize({ width: slot.viewport, height: 1151 });
        const wrapper = slot.name.includes('settings') ? 'cv-persona' : 'cv-pet-card';
        const html = css => `<style>*{box-sizing:border-box}body{margin:0}${portraitCss}${css}</style><div class="cv-root"><section class="${wrapper}"><figure class="cv-pet-scene cv-custom-scene" style="width:${slot.width}px;height:${slot.height}px">${svg}</figure></section></div>`;
        await page.setContent(html(beforeCss)); const before = await measure(page);
        if (definition.id === 'xiaohu' && slot.name === 'wide-native') await page.locator('figure').screenshot({ path: join(output, 'fox-before-wide.png') });
        await page.setContent(html(afterCss)); const after = await measure(page);
        assert.equal(after.resourceId, definition.resourceId); assert.equal(after.frame, before.frame); assert.equal(after.viewBox, before.viewBox);
        assert.equal(after.framing, 'portrait'); assert.equal(after.preserveAspectRatio, 'xMidYMid slice'); assert.equal(after.cssTransform, 'none');
        assert.ok(after.referenceForegroundPixels > 2500, 'Require real decoded canonical pixels, not a placeholder.');
        assert.ok(after.visibleViewBoxFraction > .999, `${definition.id}/${slot.name}: authored viewport must fit.`);
        assert.ok(after.visibleForegroundFraction > .999, `${definition.id}/${slot.name}: canonical foreground must fit.`);
        assert.equal(after.figureCpPortraitCount, 0); assert.equal(after.figureCanvasCount, 0);
        rows.push({ character: definition.id, slot: slot.name, before, after });
        if (definition.id === 'xiaohu') await page.locator('figure').screenshot({ path: join(output, `fox-after-${slot.name}.png`) });
      }
      assert.equal(hash(readFileSync(join(dirname(join(ROOT, definition.manifest)), resource.entryAsset))), assetHashes[resource.id]);
    }
    await page.setViewportSize({ width: 1400, height: 800 });
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;padding:16px}${portraitCss}${afterCss}.sheet{display:grid;grid-template-columns:repeat(4,300px);gap:12px}.sample{background:#edf3fe;padding:8px}.sample figure{width:284px;height:225px;margin:0}</style><div class="sheet">${art.map(item => `<section class="sample"><div>${item.name}</div><figure class="cv-pet-scene cv-custom-scene">${item.svg}</figure></section>`).join('')}</div>`);
    await page.locator('.sheet').screenshot({ path: join(output, 'eight-canonical-portraits-after.png') });
    assert.deepEqual(errors, []);
    for (const [path, expected] of Object.entries(protectedHashes)) assert.equal(hash(readFileSync(path)), expected);
    const evidence = { format: 'lingjing.conversations.qa011.component-verification', at: new Date().toISOString(), issue: 'QA011', status: 'source-fix-verified-native-pending',
      scope: 'Actual canonical ResourcePortrait and CSS in headless Chromium; measured native wide slot replay plus smaller component slots. No actual app route, account, database, provider or native input.',
      baseline, browser: await browser.version(), headless: true, deviceScaleFactor: 1.25, cases: rows.length, rows,
      protectedHashes, canonicalPngSha256: assetHashes, beforeCssSha256: hash(beforeCss), afterCssSha256: hash(afterCss),
      nativeAcceptance: 'Pending 09 on the final integrated executable. Earlier 312 failure and native evidence remain unchanged.', errors };
    writeFileSync(join(output, 'verification.json'), JSON.stringify(evidence, null, 2));
    console.log(JSON.stringify({ output, cases: rows.length, minimumVisibleViewBoxFraction: Math.min(...rows.map(row => row.after.visibleViewBoxFraction)),
      minimumVisibleForegroundFraction: Math.min(...rows.map(row => row.after.visibleForegroundFraction)), status: evidence.status }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
