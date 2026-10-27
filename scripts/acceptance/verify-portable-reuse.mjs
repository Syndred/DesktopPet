// Reuse an already audited immutable Windows SFX for additional test-only flows.
// This is not a new product build and never inherits per-case test conclusions.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,statSync,copyFileSync,lstatSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const source=process.argv.find(value=>value.startsWith('--source='))?.slice(9);
assert.match(source||'',/^[a-f0-9]{40}$/,'An exact previously audited source commit is required');
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
git('merge-base','--is-ancestor',source,'HEAD');
const changes=git('diff','--name-only',source,'HEAD').split('\n').filter(Boolean);
const testOnly=file=>file.startsWith('docs/')||file.startsWith('tests/')||file.startsWith('scripts/acceptance/')||file.startsWith('.github/workflows/')||file==='.gitignore';
assert.deepEqual(changes.filter(file=>!testOnly(file)),[],'Product/dependency/build changes require a new audited package, not reuse');
assert.equal(git('diff','--name-only'),'', 'Tracked working tree must be clean before native package reuse');
const baseline=resolve('artifacts/qa/native-baseline');
const baselineFile=path=>{const file=join(baseline,path);assert.ok(lstatSync(file).isFile()&&!lstatSync(file).isSymbolicLink());return file;};
const manifestPath='apps/pc-app/dist/build-manifest.json',auditPath='artifacts/foundation/cloud-engineering/package-audit.json',closurePath='apps/pc-app/dist/runtime-closure.json';
const build=JSON.parse(readFileSync(baselineFile(manifestPath)));
const audit=JSON.parse(readFileSync(baselineFile(auditPath)));
assert.equal(build.sourceCommit,source);assert.equal(build.sourceTree,git('rev-parse',`${source}^{tree}`));assert.deepEqual(build.sourceDirtyFiles,[]);
assert.equal(audit.passed,true);assert.deepEqual(audit.errors,[]);assert.deepEqual(audit.forbidden,[]);assert.equal(audit.sourceCommit,source);assert.deepEqual(audit.build,build);
assert.equal(audit.runtimeDependencies.passed,true);
const closureBytes=readFileSync(baselineFile(closurePath));assert.equal(createHash('sha256').update(closureBytes).digest('hex'),build.runtimeClosure.sha256);
const config=JSON.parse(readFileSync('scripts/release/electron-builder.pc.json'));
const version=JSON.parse(readFileSync('package.json')).version;
const executablePath=join(config.directories.output,`Lingjing-${version}-portable-x64.exe`),executable=baselineFile(executablePath);
const executableSha256=createHash('sha256').update(readFileSync(executable)).digest('hex');
assert.equal(statSync(executable).size,audit.bytes);assert.equal(executableSha256,audit.sha256);
// Copy only these four validated package files. Prior run proof remains isolated
// so a new artifact cannot silently re-upload old failures as new observations.
for(const path of[manifestPath,auditPath,closurePath,executablePath]){mkdirSync(dirname(resolve(path)),{recursive:true});copyFileSync(baselineFile(path),resolve(path));}
const result={scope:'Immutable audited Windows package reused for new test-only harness. No previous acceptance conclusion automatically inherited.',harnessCommit:git('rev-parse','HEAD'),packageSourceCommit:source,packageSourceTree:build.sourceTree,compiledFingerprint:build.compiledFingerprint,executableSha256,packageBytes:audit.bytes,changedTestOnlyPaths:changes,productPathsUnchanged:true,auditReceiptVerified:true,runtimeClosureVerified:true,verifiedAt:new Date().toISOString()};
mkdirSync('artifacts/qa/native-continuation',{recursive:true});writeFileSync(join('artifacts/qa/native-continuation','package-reuse.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
