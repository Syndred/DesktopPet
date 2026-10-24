import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = resolve('.');
const portable = file => relative(root, file).replaceAll('\\', '/');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
}
function fingerprint(paths) {
  const hash = createHash('sha256');
  for (const file of paths.sort()) { hash.update(portable(file)); hash.update('\0'); hash.update(readFileSync(file)); hash.update('\0'); }
  return hash.digest('hex');
}
const code = ['apps/pc-app/runtime', 'apps/pc-app/ui/src', 'packages/shared-types/src'].flatMap(directory => files(resolve(directory))).filter(file => {
  const path = portable(file);
  return /\.(?:[cm]?js|tsx?|css)$/.test(path) && !/(?:^|\/)(tests|verification|legacy|renderer|auth)\//.test(path) && !/\.(?:test|acceptance)\./.test(path) && !/(?:verify-|smoke\.|prepare-.*fixture|write-evidence|generate-fish)/.test(path);
});
code.push(...['package.json', 'package-lock.json', 'electron.vite.config.ts', 'scripts/desktop/write-build-manifest.mjs'].map(file => resolve(file)));
const built = files(resolve('apps/pc-app/dist')).filter(file => !file.endsWith('build-manifest.json'));
const manifest = {
  schemaVersion: 1, builtAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirtyFiles: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean),
  codeFingerprint: fingerprint(code), compiledFingerprint: fingerprint(built), codeFiles: code.length, compiledFiles: built.length
};
writeFileSync(resolve('apps/pc-app/dist/build-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Build provenance: ${manifest.sourceCommit.slice(0, 12)} · ${manifest.codeFingerprint.slice(0, 12)}`);
