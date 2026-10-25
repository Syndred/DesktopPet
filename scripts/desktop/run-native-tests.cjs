const { spawnSync } = require('node:child_process');
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const walk = root => readdirSync(root, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? ['assets', 'legacy', 'node_modules'].includes(entry.name) ? [] : walk(join(root, entry.name)) : [join(root, entry.name)]);
const args = process.argv.includes('--all') ? ['tests/foundation', 'apps/pc-app/runtime/features'].flatMap(walk).filter(file => file.endsWith('.test.cjs')).sort() : process.argv.slice(2);
if (!args.length) throw new Error('Specify native tests or --all');
const result = spawnSync(require('electron'), ['--test', ...args], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true });
process.exit(result.status ?? 1);
