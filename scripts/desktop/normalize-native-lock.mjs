import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const file = 'package-lock.json', lock = JSON.parse(readFileSync(file, 'utf8'));
const entry = lock.packages['node_modules/better-sqlite3'];
assert.equal(entry.version, '13.0.3', 'Review the native lock policy before changing better-sqlite3 versions');
// npm/cli#9837: a lock-driven install can lose this published package field,
// infer an install script from binding.gyp and require a compiler unnecessarily.
if (process.argv.includes('--check')) assert.equal(entry.gypfile, false, 'Run npm run deps:lock after regenerating the lockfile');
else { entry.gypfile = false; writeFileSync(file, JSON.stringify(lock, null, 2) + '\n'); }
console.log('Native lock metadata verified: bundled N-API SQLite, gypfile=false.');
