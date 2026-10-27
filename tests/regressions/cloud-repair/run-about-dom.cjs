// Optional source-level DOM check, not a native Electron/Windows acceptance.
// JSDOM_MODULE may point to an isolated engineering-only jsdom installation.
const { MessageChannel } = require('node:worker_threads');
const { createRequire } = require('node:module');
const requireRepo = createRequire(process.cwd() + '/package.json');
const { JSDOM } = require(process.env.JSDOM_MODULE || 'jsdom');
(async () => {
  const bundle = await requireRepo('esbuild').build({ entryPoints: ['tests/regressions/cloud-repair/about.regressions.jsx'], bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' } });
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://fixture.invalid' });
  const channels = [];
  dom.window.MessageChannel = class extends MessageChannel { constructor() { super(); channels.push(this); } };
  try {
    dom.window.eval(bundle.outputFiles[0].text);
    const results = await dom.window.runAboutRegressions();
    console.log(JSON.stringify({ kind: 'jsdom-source-only', nativePassed: false, results }, null, 2));
    process.exitCode = results.every(result => result.passed) ? 0 : 1;
  } finally { dom.window.close(); for (const channel of channels) { channel.port1.close(); channel.port2.close(); } }
})().catch(error => { console.error(error); process.exitCode = 1; });
