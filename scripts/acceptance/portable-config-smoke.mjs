import { launchPortableSession } from './portable-session.mjs';
import { join, sep } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

export async function verifyPortableDefaultConfig({ executable, expectedSource, output, inspect }) {
  const directory = join(output, 'ordinary-config'); mkdirSync(directory, { recursive: true });
  const profile = join(directory, 'fresh-profile'); mkdirSync(profile);
  let owned;
  const proof = { scope: 'Ordinary actual portable SFX launch with a fresh local profile, no QA marker and no cloud configuration environment variables. Configuration availability, not a live-cloud transaction.', profile };
  try {
    // Reuse the real SFX driver: its loopback Node inspector controls only the
    // process whose PET_USER_DATA_DIR is verified to equal this fresh profile.
    // Browser.getWindowForTarget is not implemented by Electron's browser CDP.
    owned = await launchPortableSession({ executable, profile, expectedSource, label: 'ordinary-config' });
    const { page, main } = owned;
    proof.pid = owned.launcherPid; proof.runtimePid = owned.runtime.pid;
    const session = await page.evaluate(() => window.lingjing.invoke('accounts', 'session', {}));
    assert.equal(session.ok, true); assert.equal(session.data.dataMode, 'live'); assert.equal(session.data.scenario, null); assert.equal(session.data.currentUser, null); assert.equal(session.data.defaultProvider, 'runtime', 'Cloud account must be configured without shell environment');
    const info = await page.evaluate(() => window.lingjing.invoke('app', 'info', {})); assert.equal(info.ok, true); assert.equal(info.data.build.sourceCommit, expectedSource);
    assert.equal(info.data.build.publicCloud.projectRef, 'jbvrdmrkwpznbrvteive');
    const loadedFile = fileURLToPath(page.url().split('#')[0]), boundary = loadedFile.indexOf(`${sep}app.asar${sep}`);
    assert.ok(boundary > 0 && !loadedFile.includes('win-unpacked'), 'Configuration smoke must use the extracted actual portable SFX');
    const resourceDirectory = loadedFile.slice(0, boundary), bytes = readFileSync(join(resourceDirectory, 'lingjing-cloud-public.json')), actualCloud = JSON.parse(bytes);
    const actualSha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(actualSha, info.data.build.publicCloud.sha256); assert.equal(actualCloud.projectRef, info.data.build.publicCloud.projectRef); assert.equal(actualCloud.url, info.data.build.publicCloud.url);
    if (inspect) proof.focusedInspection = await inspect({ page, main, info: info.data, profile });
    proof.actualCloudConfig = { projectRef: actualCloud.projectRef, url: actualCloud.url, sha256: actualSha, resourceDirectory };
    proof.publicCloud = info.data.build.publicCloud; proof.electron = info.data.runtime.electron; proof.defaultProvider = session.data.defaultProvider; proof.passed = true;
    return proof;
  } catch (error) { proof.failure = String(error); throw error; }
  finally {
    if (owned) await owned.stop();
    proof.completedAt = new Date().toISOString(); writeFileSync(join(directory, 'evidence.json'), JSON.stringify(proof, null, 2));
  }
}
