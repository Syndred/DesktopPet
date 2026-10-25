import { readFileSync, writeFileSync, mkdirSync, copyFileSync, constants, statSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import assert from 'node:assert/strict';
import { releaseVersion, sha256, selectRelease } from './release-store.mjs';
import { authenticode } from './authenticode.mjs';

const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const version = releaseVersion(option('version') || process.env.RELEASE_VERSION || `candidate-${new Date().toISOString().replace(/\D/g, '').slice(0,14)}`);
const auditFile = resolve(option('audit') || 'artifacts/foundation/cloud-engineering/package-audit.json');
const smokeFile = resolve(option('smoke') || 'artifacts/foundation/cloud-engineering/portable/latest.json');
const audit = JSON.parse(readFileSync(auditFile)), smoke = JSON.parse(readFileSync(smokeFile));
assert.equal(audit.passed, true, 'A successful package audit is required'); assert.equal(smoke.passed, true, 'A successful actual portable SFX smoke is required');
const executable = resolve(audit.executable), digest = await sha256(executable);
assert.equal(digest, audit.sha256); assert.equal(digest, smoke.executableSha256, 'Smoke must exercise these exact executable bytes');
assert.equal(smoke.expectedSource, audit.build.sourceCommit); assert.deepEqual(audit.build.sourceDirtyFiles, []);
assert.ok(audit.publicCloud?.sha256 && audit.runtimeClosure?.files, 'Current cloud configuration and runtime dependency closure audit required');
const signature = authenticode(executable);
assert.ok(['Valid','NotSigned'].includes(signature.status), `Invalid or unavailable Authenticode result: ${signature.status}`);
if (process.argv.includes('--require-signed') || process.env.REQUIRE_SIGNED === '1') assert.equal(signature.signed, true, 'A valid Authenticode certificate is required for this channel');
const releasesDirectory = resolve(process.env.RELEASES_DIR || 'releases'), directory = join(releasesDirectory, version);
mkdirSync(releasesDirectory, { recursive: true }); mkdirSync(directory); // Immutable version; refuses replacement.
const name = basename(executable); copyFileSync(executable, join(directory, name), constants.COPYFILE_EXCL);
assert.equal(await sha256(join(directory, name)), digest);
const manifest = { schemaVersion: 2, version, createdAt: new Date().toISOString(), kind: 'windows-portable',
  executable: { file: name, bytes: statSync(executable).size, sha256: digest }, authenticode: signature,
  source: audit.build, publicCloud: audit.publicCloud, runtimeClosure: audit.runtimeClosure,
  audit: { file: 'package-audit.json', sha256: await sha256(auditFile) }, smoke: { file: 'portable-smoke.json', sha256: await sha256(smokeFile), checks: smoke.checks.length },
  dataPolicy: 'Binary rollback only. Preserve user profiles, databases, resources, histories and cloud migrations; cloud schema changes remain forward-only.' };
copyFileSync(auditFile, join(directory, manifest.audit.file), constants.COPYFILE_EXCL); copyFileSync(smokeFile, join(directory, manifest.smoke.file), constants.COPYFILE_EXCL);
writeFileSync(join(directory, `${name}.sha256`), `${digest}  ${name}\n`, { flag: 'wx' });
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
if (process.argv.includes('--select')) await selectRelease({ releasesDirectory, stateDirectory: resolve(process.env.STATE_DIR || 'release-state'), version });
console.log(JSON.stringify({ version, directory, sha256: digest, authenticode: signature.status, selected: process.argv.includes('--select') }));

