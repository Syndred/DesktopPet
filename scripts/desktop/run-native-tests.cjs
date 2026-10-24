const { spawnSync } = require('node:child_process');
const result = spawnSync(require('electron'), ['--test', ...process.argv.slice(2)], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true });
process.exit(result.status ?? 1);
