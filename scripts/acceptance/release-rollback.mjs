import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:net';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readRelease, selectRelease, currentRelease } from '../release/release-store.mjs';
import { pollState } from './poll-state.mjs';

const option = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const previous = option('previous'), candidate = option('candidate'); assert.ok(previous && candidate, 'Pass --previous=<version> --candidate=<version>');
const require = createRequire(import.meta.url), releasesDirectory = resolve('releases');
const output = resolve(`artifacts/foundation/cloud-engineering/rollback/run-${Date.now()}`), stateDirectory = join(output, 'selection'); mkdirSync(output, { recursive: true });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const env = { ...process.env, ...scenario.env, RELEASES_DIR: releasesDirectory, STATE_DIR: stateDirectory }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
const proof = { at: new Date().toISOString(), scope: 'Actual distinct portable EXE selection and launcher, same fresh path-bound QA SQLite profile across versions. Binary/source selection, persisted owner/pet/growth and tamper refusal; no cloud-schema rollback or two-physical-device claim.', scenario, stateDirectory, checks: [] };
const versions = await Promise.all([readRelease(releasesDirectory, previous), readRelease(releasesDirectory, candidate)]);
assert.notEqual(versions[0].manifest.executable.sha256, versions[1].manifest.executable.sha256, 'Rehearsal requires two distinct real binary artifacts');
proof.artifacts = versions.map(value => ({ version: value.version, source: value.manifest.source.sourceCommit, sha256: value.manifest.executable.sha256 }));
proof.sameRuntimeSourceFingerprint = versions[0].manifest.source.canonicalSourceFingerprint === versions[1].manifest.source.canonicalSourceFingerprint;
const account = `qa_rollback_${Date.now()}`, password = `Rollback-${randomUUID()}!`; let pet, owner;

async function launchSelected(first) {
  const selected = await currentRelease(releasesDirectory, stateDirectory);
  const server = createServer(); await new Promise(done => server.listen(0, '127.0.0.1', done)); const port = server.address().port; await new Promise(done => server.close(done));
  const receipt = JSON.parse(execFileSync(process.execPath, ['scripts/release/launch-release.mjs', '--', `--remote-debugging-port=${port}`], { env, encoding: 'utf8', windowsHide: true }));
  assert.equal(receipt.executable, selected.executable); assert.equal(receipt.profile, scenario.profilePath); let browser;
  try {
    await pollState(async () => { try { const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(300) }); return response.ok ? await response.json() : []; } catch { return []; } }, value => value.some(target => target.type === 'page'), { timeoutMs: 60000, label: 'Selected real EXE did not open its business window' });
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 15000 });
    const page = await pollState(async () => browser.contexts().flatMap(context => context.pages()).find(value => value.url().includes('/app.asar/') && value.url().includes('/ui/index.html')), Boolean);
    await page.waitForFunction(() => Boolean(window.lingjing));
    const invoke = async (feature, command, payload = {}) => { const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload }); assert.equal(result.ok, true, JSON.stringify(result)); return result.data; };
    const info = await invoke('app', 'info'); assert.equal(info.build.sourceCommit, selected.manifest.source.sourceCommit); assert.ok(!page.url().includes('win-unpacked'));
    const session = await invoke('accounts', first ? 'register' : 'login', { provider: 'local', account, username: '回滚原档验证', password, confirmPassword: password, rememberSession: false });
    if (first) { owner = session.currentUser.id; pet = (await invoke('companions', 'adopt', { actionId: randomUUID(), templateId: 'animal-wood-deer', name: '回滚保留的青芽', showOnDesktop: false })).pet; }
    else { assert.equal(session.currentUser.id, owner); const restored = await invoke('companions', 'get', { petId: pet.petId }); assert.equal(restored.petId, pet.petId); assert.equal(restored.name, pet.name); assert.deepEqual(restored.growth, pet.growth); }
    proof.checks.push({ id: first ? 'candidate-selected-and-real-launcher-created-owned-data' : 'previous-selected-and-real-launcher-restored-same-owned-data', version: selected.version, source: info.build.sourceCommit, sha256: selected.manifest.executable.sha256, pid: receipt.pid, owner, petId: pet.petId, loadedUrl: page.url(), profile: receipt.profile });
  } finally {
    if (browser) await Promise.race([(async () => { try { await (await browser.newBrowserCDPSession()).send('Browser.close'); } catch {} await browser.close().catch(() => {}); })(), new Promise(done => setTimeout(done, 3000))]);
    await new Promise(done => setTimeout(done, 1200));
    // receipt.pid is the exact SFX process this invocation created, never another app.
    if (receipt.pid) try { execFileSync('taskkill', ['/PID', String(receipt.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); } catch { /* Already exited. */ }
  }
}
function readback() {
  const db = new (require('better-sqlite3'))(join(scenario.profilePath, 'lingjing.sqlite'), { readonly: true, fileMustExist: true }); db.pragma('query_only=ON');
  try { assert.equal(db.pragma('integrity_check', { simple: true }), 'ok'); return { identity: db.prepare('SELECT owner_account_id,account,username FROM account_identities WHERE owner_account_id=?').get(owner), pet: db.prepare('SELECT owner_account_id,pet_id,data_json FROM companion_pets WHERE owner_account_id=? AND pet_id=?').get(owner, pet.petId), legacyJsonExists: existsSync(join(scenario.profilePath, 'pet-runtime-data.json')) }; }
  finally { db.close(); }
}
try {
  await selectRelease({ releasesDirectory, stateDirectory, version: candidate }); await launchSelected(true); const before = readback();
  const selected = await selectRelease({ releasesDirectory, stateDirectory, version: previous, rollback: true }); assert.equal(selected.previousVersion, candidate);
  await launchSelected(false); const after = readback(); assert.deepEqual(after, before); assert.equal(after.legacyJsonExists, false);
  proof.checks.push({ id: 'same-sqlite-domain-rows-and-integrity-after-binary-rollback', owner, petId: pet.petId, before, after });
  const pointer = readFileSync(join(stateDirectory, 'current.json')), badStore = join(output, 'tampered-store'), badVersion = 'tampered-copy', badDirectory = join(badStore, badVersion); mkdirSync(badDirectory, { recursive: true });
  const original = versions[0], badManifest = { ...original.manifest, version: badVersion }; copyFileSync(original.executable, join(badDirectory, badManifest.executable.file)); appendFileSync(join(badDirectory, badManifest.executable.file), Buffer.from('integrity-negative-case')); writeFileSync(join(badDirectory, 'manifest.json'), JSON.stringify(badManifest));
  await assert.rejects(selectRelease({ releasesDirectory: badStore, stateDirectory, version: badVersion, rollback: true }), /hash mismatch/);
  assert.deepEqual(readFileSync(join(stateDirectory, 'current.json')), pointer); proof.checks.push({ id: 'tampered-real-exe-refused-before-pointer-change' });
  proof.passed = true; console.log(JSON.stringify({ passed: true, output, checks: proof.checks.length, previous, candidate, petId: pet.petId }));
} catch (error) { proof.passed = false; proof.failure = String(error); throw error; }
finally { proof.completedAt = new Date().toISOString(); writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); writeFileSync('artifacts/foundation/cloud-engineering/rollback/latest.json', JSON.stringify(proof, null, 2)); }
