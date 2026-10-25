import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(pkg.main, 'apps/pc-app/dist/main/index.cjs');
assert.equal(pkg.scripts['dev:pc:legacy'], undefined);
for (const file of ['apps/pc-app/runtime/main/index.ts', 'apps/pc-app/runtime/preload/index.ts', 'apps/pc-app/runtime/core/runtime-compat.cjs', 'apps/pc-app/ui/index.html', 'apps/pc-app/ui/src/main.tsx']) assert.ok(existsSync(resolve(file)), file);
for (const file of ['apps/pc-app/runtime/main.cjs', 'apps/pc-app/runtime/main.mjs', 'apps/pc-app/runtime/preload.cjs', 'apps/pc-app/runtime/preload.mjs', 'apps/pc-app/runtime/renderer/index.html', 'apps/pc-app/runtime/auth/index.html']) assert.equal(existsSync(resolve(file)), false, 'Obsolete entry remains: ' + file);
console.log('Formal Electron/React entry and obsolete-source removal checks passed.');
