const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(process.execPath, [resolve('node_modules/electron-vite/bin/electron-vite.js'), process.argv[2] || 'dev'], { stdio: 'inherit', env, windowsHide: true });
child.on('exit', code => process.exit(code ?? 1));
