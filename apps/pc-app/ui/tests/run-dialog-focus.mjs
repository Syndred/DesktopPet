import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const jsdom = process.argv.find(a => a.startsWith('--jsdom='))?.slice(8);
const { JSDOM } = require(jsdom || 'jsdom');
const bundle = await build({ entryPoints: [path.join(root, 'apps/pc-app/ui/tests/dialog-focus.regressions.jsx')], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', tsconfig: path.join(root, 'apps/pc-app/ui/tsconfig.json'), define: { 'process.env.NODE_ENV': '"development"' } });
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true, runScripts: 'outside-only' });
dom.window.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: () => dom.window.setTimeout(() => this.port1.onmessage?.(), 0) }; } };
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
// JSDOM cannot measure CSS layout. Check the source-level centering contract separately;
// the actual browser geometry fixture covers baseline/fixed placement and close reachability.
const cssPath = 'apps/pc-app/ui/src/styles/global.css';
// Optional negative control requires this historical source object. Default testing needs no Git.
const baselineCommit = '90e2958c9c3c7189cdd6bf93d1d3a24ae07fc7eb';
dom.window.dialogGeometrySource = {
  globalCSS: process.argv.includes('--baseline-css')
    ? execFileSync('git', ['show', `${baselineCommit}:${cssPath}`], { cwd: root, encoding: 'utf8' })
    : readFileSync(path.join(root, cssPath), 'utf8'),
  sharedDialog: readFileSync(path.join(root, 'apps/pc-app/ui/src/components/ui/dialog.tsx'), 'utf8')
};
const genericRule = dom.window.dialogGeometrySource.globalCSS.match(/\.app-dialog-content\{[^}]+\}/)?.[0] || '';
// Use the actual production dependency: it previously erased a non-important none
// when combining independent transforms. A hand-written post-build patch cannot pass this gate.
dom.window.dialogGeometrySource.minifiedCSS = require('lightningcss').transform({ filename: 'dialog-contract.css', code: Buffer.from(genericRule), minify: true }).code.toString();
if (process.argv.includes('--compiled-css')) {
  const assets = path.join(root, 'apps/pc-app/dist/ui/assets');
  const builtRules = readdirSync(assets).filter(name => name.endsWith('.css')).flatMap(name => readFileSync(path.join(assets, name), 'utf8').match(/\.app-dialog-content\{[^}]+\}/g) || []);
  if (builtRules.length !== 1) throw Error('Exactly one compiled generic dialog rule required');
  dom.window.dialogGeometrySource.compiledCSS = builtRules[0];
}
try { dom.window.eval(bundle.outputFiles[0].text); console.log(JSON.stringify(await dom.window.runDialogTests())); }
finally { dom.window.close(); }
