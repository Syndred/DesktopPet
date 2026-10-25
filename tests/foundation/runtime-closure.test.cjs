const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, dirname } = require('node:path');

// Resolver/build fixtures only; actual domain/EXE acceptance is separate.
test('desktop closure follows required MJS/JS/JSON and refuses test-only dependencies', async () => {
  const { runtimeClosure } = await import('../../scripts/desktop/runtime-closure.mjs');
  const root = mkdtempSync(join(tmpdir(), 'lingjing-closure-'));
  const prefix = 'apps/pc-app/runtime/';
  const put = (name, source) => { const file = join(root, prefix, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, source); };
  put('core/entry.cjs', "require('../features/companions/growth.mjs');");
  put('features/companions/index.cjs', "require('./growth.mjs');");
  put('features/companions/growth.mjs', "import './reducer.js'; export const fixture = true;");
  put('features/companions/reducer.js', "const value = require('./catalog.json'); module.exports = value;");
  put('features/companions/catalog.json', '{"fixture":true}');
  put('features/accounts/foreground-fullscreen.ps1', '# fixture data helper');
  put('features/discovery/windows-location.ps1', '# fixture data helper');
  const closure = runtimeClosure(root), paths = closure.files.map(file => file.path);
  for (const path of ['growth.mjs','reducer.js','catalog.json']) assert.ok(paths.includes(`${prefix}features/companions/${path}`));
  assert.ok(closure.edges.some(edge => edge.specifier === './growth.mjs'));
  put('features/companions/tests/hidden.cjs', 'module.exports = {};');
  put('features/companions/reducer.js', "require('./tests/hidden.cjs');");
  assert.throws(() => runtimeClosure(root), /Unsupported desktop dependency/);
});
