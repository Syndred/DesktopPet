import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, copyFileSync, mkdirSync, mkdtempSync, openSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('.'), output = resolve('artifacts/foundation/cloud-engineering/clean-install'); mkdirSync(output, { recursive: true });
const directory = mkdtempSync(join(output, 'install-'));
const npm = process.env.npm_execpath; assert.ok(npm && existsSync(npm), 'Run this verifier with npm run verify:install');
const packages = execFileSync('git', ['ls-files', '*package.json'], { encoding: 'utf8' }).trim().split('\n').filter(file => existsSync(file) && (file === 'package.json' || /^(apps|packages)\//.test(file)));
for (const file of [...packages, 'package-lock.json', 'scripts/desktop/verify-native.cjs']) {
  const destination = join(directory, file); mkdirSync(dirname(destination), { recursive: true }); copyFileSync(join(root, file), destination);
}
const proof = { at: new Date().toISOString(), directory, npm: execFileSync(process.execPath, [npm, '--version'], { encoding: 'utf8' }).trim(),
  node: process.version, scope: 'Fresh independent install, no junction or parent node_modules fallback, no compiler/manual addon copies.', checks: [] };
const run = (name, command, args) => {
  const log = openSync(join(directory, `${name}.log`), 'w'); let result;
  try { result = spawnSync(command, args, { cwd: directory, env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined }, windowsHide: true, stdio: ['ignore', log, log], timeout: 300000 }); }
  finally { closeSync(log); }
  proof.checks.push({ name, exitCode: result.status, error: result.error?.message }); assert.equal(result.status, 0, `${name} failed; see ${directory}/${name}.log`);
};
try {
  run('npm-ci', process.execPath, [npm, 'ci', '--no-audit', '--fund=false']);
  run('native', process.execPath, ['scripts/desktop/verify-native.cjs']);
  proof.native = JSON.parse(readFileSync(join(directory, 'artifacts/foundation/cloud-engineering/native/latest.json')));
  assert.ok(proof.native.passed); proof.passed = true;
  console.log(JSON.stringify({ passed: true, directory, npm: proof.npm, electron: proof.native.electron.versions.electron, sqlite: proof.native.electron.sqlitePackage }));
} catch (error) { proof.failure = String(error); throw error; }
finally { proof.completedAt = new Date().toISOString(); writeFileSync(join(output, 'latest.json'), JSON.stringify(proof, null, 2)); }
