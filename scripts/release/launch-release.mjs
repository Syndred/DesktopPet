import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { currentRelease } from './release-store.mjs';
const release = await currentRelease(resolve(process.env.RELEASES_DIR || 'releases'), resolve(process.env.STATE_DIR || 'release-state'));
if (process.argv.includes('--verify-only')) console.log(JSON.stringify({ passed: true, version: release.version, executable: release.executable, sha256: release.manifest.executable.sha256 }));
else {
  const child = spawn(release.executable, [], { detached: true, stdio: 'ignore', windowsHide: true, env: process.env });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); }); child.unref();
  console.log(JSON.stringify({ version: release.version, executable: release.executable, pid: child.pid }));
}
