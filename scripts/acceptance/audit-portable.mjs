import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync, createReadStream } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url), asar = require('@electron/asar');
const builder = JSON.parse(readFileSync('scripts/release/electron-builder.pc.json', 'utf8'));
const base = resolve(process.argv[2] || builder.directories.output);
const archive = join(base, 'win-unpacked/resources/app.asar');
const output = resolve(process.argv[3] || 'artifacts/foundation/cloud-engineering/package-audit.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const extract = path => asar.extractFile(archive, join(...path.split('/')));
const proof = { at: new Date().toISOString(), archive, sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), assets: [], errors: [] };
try {
  const entries = asar.listPackage(archive).map(path => path.replaceAll('\\', '/').replace(/^\/+/, ''));
  proof.entries = entries.length;
  proof.forbidden = entries.filter(path => /\.(?:glb|gltf|vrm|sqlite|pfx|pem|bundle)$/i.test(path) || /(?:^|\/)(?:artifacts|backups|\.env)(?:\/|$)/.test(path) || /^apps\/pc-app\/runtime\/(?:renderer|auth)\//.test(path) || /^apps\/pc-app\/runtime\//.test(path) && (/(?:^|\/)(?:tests|verification|legacy)\//.test(path) || /\.(?:test|acceptance)\.[cm]?js$/.test(path) || /(?:verify-.*\.mjs|.*\.electron\.mjs|prepare-.*-fixture\.mjs|write-evidence\.mjs|testing-adapter\.cjs|generate-fish\.cjs|server-authority\.cjs)$/.test(path)));
  assert.deepEqual(proof.forbidden, []);
  const retiredWorkspaces = entries.filter(path => /^node_modules\/@qingpet\/(?:game-engine|supabase-edge|observability|pc-app)\//.test(path));
  assert.deepEqual(retiredWorkspaces, [], 'Unused workspace prototypes must not enter the desktop package');
  const manifest = JSON.parse(extract('apps/pc-app/dist/build-manifest.json').toString('utf8'));
  proof.build = manifest;
  assert.deepEqual(manifest.sourceDirtyFiles, [], 'Final package must originate from a committed clean build');
  // Non-shipped integration notes can be updated while a frozen candidate compresses.
  // Every actually shipped runtime/build file is still compared byte-for-byte below.
  execFileSync('git', ['diff', '--quiet', manifest.sourceCommit, '--', 'apps/pc-app/runtime', 'apps/pc-app/ui/src', 'packages/shared-types', 'package.json', 'package-lock.json', 'electron.vite.config.ts', 'scripts/desktop', 'scripts/release', 'config', ':(glob,exclude)apps/pc-app/runtime/**/*.md']);
  const closureBytes = extract('apps/pc-app/dist/runtime-closure.json'), closure = JSON.parse(closureBytes);
  assert.equal(hash(closureBytes), manifest.runtimeClosure.sha256); assert.equal(closure.files.length, manifest.runtimeClosure.files);
  for (const file of closure.files) { assert.ok(entries.includes(file.path), `Required runtime dependency missing: ${file.path}`); assert.equal(hash(extract(file.path)), file.sha256, `Runtime closure hash mismatch: ${file.path}`); }
  const runtimeCode = entries.filter(path => /^apps\/pc-app\/runtime\/.*\.(?:[cm]?js|ps1)$/.test(path));
  assert.deepEqual(runtimeCode.filter(path => !closure.files.some(file => file.path === path)), [], 'Unreviewed runtime code entered ASAR');
  proof.runtimeClosure = { files: closure.files.length, edges: closure.edges.length, sha256: hash(closureBytes), jsAndMjs: closure.files.filter(file => /\.(?:js|mjs)$/.test(file.path)).map(file => file.path) };
  proof.runtimeDependencies = require('./runtime-dependencies.cjs').verifyPackagedRuntime(join(base,'win-unpacked'));
  const publicConfigPath = join(base, 'win-unpacked/resources/lingjing-cloud-public.json'), publicBytes = readFileSync(publicConfigPath), publicCloud = JSON.parse(publicBytes);
  assert.equal(hash(publicBytes), manifest.publicCloud.sha256); assert.equal(publicCloud.projectRef, manifest.publicCloud.projectRef);
  assert.deepEqual(Object.keys(publicCloud).sort(), ['schemaVersion','projectRef','url','publishableKey'].sort()); assert.ok(publicCloud.publishableKey.startsWith('sb_publishable_'));
  proof.publicCloud = { projectRef: publicCloud.projectRef, sha256: hash(publicBytes), path: publicConfigPath };
  const native = 'node_modules/better-sqlite3/prebuilds/win32-x64.node';
  assert.equal(hash(readFileSync(join(`${archive}.unpacked`, ...native.split('/')))), hash(readFileSync(native)), 'Packaged SQLite N-API binary differs');
  proof.native = { packageVersion: JSON.parse(extract('node_modules/better-sqlite3/package.json')).version, sha256: hash(readFileSync(native)) };
  assert.equal(proof.native.packageVersion, manifest.toolchain.sqlite);
  const shipped = entries.filter(path => /^apps\/pc-app\/(?:runtime|dist)\//.test(path) && existsSync(resolve(path)) && statSync(resolve(path)).isFile());
  for (const path of shipped) assert.equal(hash(extract(path)), hash(readFileSync(resolve(path))), `Packaged bytes differ from reviewed build: ${path}`);
  proof.reviewedRuntimeAndBuildFiles = shipped.length;
  const rosterPath = 'apps/pc-app/runtime/features/resources/assets/roster-v2';
  const catalog = JSON.parse(extract(`${rosterPath}/catalog.json`).toString('utf8'));
  const record = JSON.parse(extract(`${rosterPath}/source-record.json`).toString('utf8'));
  for (const character of catalog.characters) {
    const source = record.characters.find(entry => entry.id === character.id); assert.ok(source);
    const bytes = extract(`${rosterPath}/${source.file}`), digest = hash(bytes);
    assert.equal(digest, source.sha256); proof.assets.push({ id: character.resourceId, element: character.element, bytes: bytes.length, sha256: digest });
  }
  assert.ok(['metal', 'wood', 'water', 'fire', 'earth'].every(element => proof.assets.some(asset => asset.element === element)));
  proof.licenses = builder.extraFiles.map(file => {
    const path = join(base, 'win-unpacked', file.to); assert.equal(hash(readFileSync(path)), hash(readFileSync(file.from))); return file.to;
  });
  const executables = readdirSync(base).filter(name => /^Lingjing-.*-portable-x64\.exe$/.test(name)); assert.equal(executables.length, 1);
  const executable = join(base, executables[0]), digest = createHash('sha256');
  for await (const chunk of createReadStream(executable)) digest.update(chunk);
  proof.executable = executable; proof.bytes = statSync(executable).size; proof.sha256 = digest.digest('hex'); proof.passed = true;
  console.log(JSON.stringify({ passed: true, output, sha256: proof.sha256, characters: proof.assets.length, files: proof.reviewedRuntimeAndBuildFiles }));
} catch (error) { proof.errors.push(String(error)); throw error; }
finally { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(proof, null, 2)); }
