import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { currentRelease } from './release-store.mjs';
const release = await currentRelease(resolve(process.env.RELEASES_DIR || 'releases'), resolve(process.env.STATE_DIR || 'release-state'));
const { resolveProfilePath } = createRequire(import.meta.url)('../../apps/pc-app/runtime/core/profile-path.cjs');
const packageName = release.manifest.source?.packageName || 'lingjing-desktop';
assert.match(packageName, /^[a-z][a-z0-9._-]{0,79}$/, 'Invalid application profile name');
const profile = process.env.PET_USER_DATA_DIR ? resolve(process.env.PET_USER_DATA_DIR) : process.platform === 'win32' && process.env.APPDATA
  ? resolveProfilePath({ current: join(process.env.APPDATA, packageName), appData: process.env.APPDATA }) : undefined;
if (process.argv.includes('--verify-only')) console.log(JSON.stringify({ passed: true, version: release.version, executable: release.executable, sha256: release.manifest.executable.sha256, profile }));
else {
  // Explicitly preserve discovery when selecting older binaries that only look for legacy JSON.
  const child = spawn(release.executable, [], { detached: true, stdio: 'ignore', windowsHide: true, env: { ...process.env, ...(profile ? { PET_USER_DATA_DIR: profile } : {}) } });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
  console.log(JSON.stringify({ version: release.version, executable: release.executable, pid: child.pid, profile }));
}
