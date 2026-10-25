const { test } = require('node:test');
const assert = require('node:assert/strict');
const { join, resolve } = require('node:path');
const { resolveProfilePath } = require('../../apps/pc-app/runtime/core/profile-path.cjs');

test('profile discovery gives explicit override, then current SQLite, then old SQLite, then JSON precedence', () => {
  const current = resolve('current'), appData = resolve('isolated-appdata');
  const old = join(appData, 'qingpet-desktop-runtime'), modern = join(appData, 'Lingjing');
  const files = new Set([join(current, 'lingjing.sqlite'), join(old, 'lingjing.sqlite'), join(modern, 'pet-runtime-data.json')]);
  const options = { current, appData, isFile: file => files.has(file) };
  assert.equal(resolveProfilePath({ ...options, override: 'explicit' }), resolve('explicit'));
  assert.equal(resolveProfilePath(options), current);
  files.delete(join(current, 'lingjing.sqlite')); assert.equal(resolveProfilePath(options), old);
  files.delete(join(old, 'lingjing.sqlite')); assert.equal(resolveProfilePath(options), modern);
  files.clear(); assert.equal(resolveProfilePath(options), modern);
});
