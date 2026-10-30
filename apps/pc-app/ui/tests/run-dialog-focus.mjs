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
try { dom.window.eval(bundle.outputFiles[0].text); console.log(JSON.stringify(await dom.window.runDialogTests())); }
finally { dom.window.close(); }
