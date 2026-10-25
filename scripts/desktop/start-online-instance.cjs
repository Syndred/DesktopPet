const { spawn } = require('node:child_process');
const { existsSync, mkdirSync } = require('node:fs');
const { resolve, join } = require('node:path');

const role = (process.argv[2] || 'A').toUpperCase();
if (!['A', 'B'].includes(role)) throw new Error('Choose client A or B.');
const root = resolve(__dirname, '../..');
if (!existsSync(join(root, 'apps/pc-app/dist/build-manifest.json'))) throw new Error('Run npm run build:pc first.');
// New additive directories. Never reuse/delete the old shared JSON or auth files.
const profile = join(root, 'profiles', 'cloud-clients', role);
const env = { ...process.env, PET_USER_DATA_DIR: profile, LINGJING_PUBLIC_CONFIG: process.env.LINGJING_PUBLIC_CONFIG || join(root, 'config/lingjing-cloud-public.json') };
for (const key of Object.keys(env)) if (/^(?:SUPABASE_|LINGJING_QA_|LINGJING_LEGACY_AUTH$|PET_RUNTIME_DATA_FILE$|PET_SESSION_DATA_FILE$|ELECTRON_RUN_AS_NODE$|ELECTRON_RENDERER_URL$)/.test(key)) delete env[key];
if (process.argv.includes('--verify-only')) { console.log(JSON.stringify({ role, profile, publicConfig: env.LINGJING_PUBLIC_CONFIG, legacyEnvironmentLoaded: false, profileCreated: false })); }
else {
  mkdirSync(profile, { recursive: true });
  const child = spawn(require('electron'), [root], { cwd: root, env, stdio: 'inherit', windowsHide: true });
  child.on('error', error => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', code => process.exit(code ?? 1));
}
