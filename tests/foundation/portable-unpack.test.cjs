// Schema checks and SIMULATED evaluation of the installed NSIS generator only.
// No SFX/application is launched; actual NSIS compile evidence is separate.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const config = require('../../scripts/release/electron-builder.pc.json');

function actualGeneratorDefines(value) {
  const file = require.resolve('app-builder-lib/out/targets/nsis/NsisTarget');
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const selectors = [];
  const visit = node => {
    if (ts.isIfStatement(node) && node.expression.getText(source).includes('typeof unpackDirName')) selectors.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.equal(selectors.length, 1, 'Recheck portable unpack behavior when changing the builder');
  const defines = {};
  vm.runInNewContext(selectors[0].getText(source), {
    unpackDirName: value, defines, builder_util_1: { generateKsuid: () => 'SIMULATED_SHARED_BUILD_ID' },
  });
  return defines;
}

test('portable configuration passes the installed builder schema', async () => {
  const { validateConfiguration } = require('app-builder-lib/out/util/config/config');
  const { DebugLogger } = require('builder-util');
  await validateConfiguration(config, new DebugLogger(false));
});

test('SIMULATED installed generator: production portable config leaves per-launch PLUGINSDIR selected', () => {
  assert.deepEqual(actualGeneratorDefines(config.portable?.unpackDirName), {});
});

test('SIMULATED installed generator: omitted/false options would regress to a shared build directory', () => {
  for (const value of [undefined, false]) assert.equal(actualGeneratorDefines(value).UNPACK_DIR_NAME, 'SIMULATED_SHARED_BUILD_ID');
  assert.equal(actualGeneratorDefines('fixed-directory').UNPACK_DIR_NAME, 'fixed-directory');
});

