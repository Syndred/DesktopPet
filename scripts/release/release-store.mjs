import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, createReadStream, realpathSync } from 'node:fs';
import { resolve, join, basename, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

export function releaseVersion(version) {
  assert.ok(typeof version === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(version), 'Invalid release version'); return version;
}
export async function sha256(file) { const hash = createHash('sha256'); for await (const bytes of createReadStream(file)) hash.update(bytes); return hash.digest('hex'); }
export function atomicJson(file, data) { mkdirSync(resolve(file, '..'), { recursive: true }); const temporary = `${file}.${randomUUID()}.tmp`; writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n'); renameSync(temporary, file); }
export async function readRelease(releasesDirectory, version) {
  releaseVersion(version);
  const root = realpathSync(releasesDirectory), directory = realpathSync(join(root, version));
  assert.ok(directory.startsWith(root + sep), 'Release directory escapes the store');
  const manifestPath = realpathSync(join(directory, 'manifest.json'));
  assert.ok(manifestPath.startsWith(directory + sep), 'Manifest escapes the release directory');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 2, 'Only verified binary release manifests are accepted'); assert.equal(manifest.version, version);
  assert.ok(manifest.executable?.file && !/[\\/]/.test(manifest.executable.file) && basename(manifest.executable.file) === manifest.executable.file && manifest.executable.file.endsWith('.exe'), 'Invalid release executable name');
  const executable = realpathSync(join(directory, manifest.executable.file)); assert.ok(executable.startsWith(directory + sep), 'Executable escapes the release directory');
  assert.equal(await sha256(executable), manifest.executable.sha256, 'Release executable hash mismatch');
  return { version, directory, manifestPath, manifest, executable, manifestSha256: await sha256(manifestPath) };
}
export async function selectRelease({ releasesDirectory, stateDirectory, version, rollback = false }) {
  const release = await readRelease(releasesDirectory, version), currentFile = join(stateDirectory, 'current.json');
  let previousVersion = null; if (existsSync(currentFile)) { try { previousVersion = JSON.parse(readFileSync(currentFile, 'utf8')).version || null; } catch { /* A valid selected release can recover a damaged pointer. */ } }
  const selection = { schemaVersion: 2, version, selectedAt: new Date().toISOString(), executable: release.executable,
    executableSha256: release.manifest.executable.sha256, manifestSha256: release.manifestSha256, rollback, previousVersion };
  atomicJson(currentFile, selection);
  if (rollback) atomicJson(join(stateDirectory, 'last-rollback.json'), { ...selection, dataPolicy: 'Binary selection only. No user database, cloud schema, history or backup is restored or deleted.' });
  return selection;
}
export async function currentRelease(releasesDirectory, stateDirectory) {
  const selection = JSON.parse(readFileSync(join(stateDirectory, 'current.json'), 'utf8'));
  const release = await readRelease(releasesDirectory, selection.version);
  assert.equal(selection.manifestSha256, release.manifestSha256, 'Selected release manifest was modified');
  assert.equal(selection.executableSha256, release.manifest.executable.sha256, 'Selected binary was modified'); return release;
}
