import { _electron as electron } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const root = resolve('.'), require = createRequire(import.meta.url);
const output = resolve(`artifacts/foundation/cloud-engineering/profile-discovery/run-${Date.now()}`);
const appData = join(output, 'isolated-appdata'), original = join(appData, 'qingpet-desktop-runtime'), emptyCurrent = join(appData, 'current-empty');
mkdirSync(original, { recursive: true }); mkdirSync(emptyCurrent, { recursive: true });
const wrapper = join(output, 'discovery-entry.cjs');
// Electron's built-in module supplies app in the child process.
writeFileSync(wrapper, `const {app}=require('electron');app.setPath('appData',${JSON.stringify(appData)});app.setPath('userData',${JSON.stringify(emptyCurrent)});require(${JSON.stringify(join(root, 'apps/pc-app/dist/main/index.cjs'))});\n`);
const env = { ...process.env };
for (const key of ['ELECTRON_RUN_AS_NODE','PET_USER_DATA_DIR','PET_RUNTIME_DATA_FILE','LINGJING_QA_SCENARIO','LINGJING_PUBLIC_CONFIG','LINGJING_SUPABASE_URL','LINGJING_SUPABASE_PUBLISHABLE_KEY','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','LINGJING_LEGACY_AUTH']) delete env[key];
const proof = { at: new Date().toISOString(), scope: 'Actual Windows Electron; locally registered isolated account and SQLite-only old profile. No production account, cloud or physical second device claim.', original, checks: [] };
const account = `profile_${Date.now()}`, password = `Profile-${randomUUID()}!`;
const invoke = async (page, feature, command, payload = {}) => {
  const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
  assert.equal(result.ok, true, JSON.stringify(result)); return result.data;
};
let app;
try {
  app = await electron.launch({ args: [wrapper], cwd: root, env: { ...env, PET_USER_DATA_DIR: original } });
  let page = await app.firstWindow(); await page.waitForFunction(() => Boolean(window.lingjing));
  proof.build = (await invoke(page, 'app', 'info')).build;
  const registered = await invoke(page, 'accounts', 'register', { provider: 'local', account, username: 'SQLite旧档验收', password, confirmPassword: password, rememberSession: true });
  const adopted = await invoke(page, 'companions', 'adopt', { actionId: randomUUID(), templateId: 'animal-wood-deer', name: '只在旧SQLite里的青芽', showOnDesktop: false });
  proof.ownerAccountId = registered.currentUser.id; proof.petId = adopted.pet.petId;
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), original);
  await app.close(); app = null;
  assert.ok(existsSync(join(original, 'lingjing.sqlite'))); assert.equal(existsSync(join(original, 'pet-runtime-data.json')), false);
  assert.equal(existsSync(join(appData, 'Lingjing')), false);
  proof.checks.push({ id: 'explicit-override-seeds-real-sqlite-without-json', ownerAccountId: proof.ownerAccountId, petId: proof.petId });

  app = await electron.launch({ args: [wrapper], cwd: root, env });
  page = await app.firstWindow(); await page.waitForFunction(() => Boolean(window.lingjing));
  assert.equal(await app.evaluate(({ app }) => app.getPath('userData')), original);
  let session = await invoke(page, 'accounts', 'session'); const secureSessionRestored = Boolean(session.currentUser && session.persistence === 'secure');
  if (!session.currentUser) session = await invoke(page, 'accounts', 'login', { provider: 'local', account, password, rememberSession: false });
  assert.equal(session.currentUser.id, proof.ownerAccountId);
  const pet = await invoke(page, 'companions', 'get', { petId: proof.petId });
  assert.equal(pet.petId, proof.petId); assert.equal(pet.name, '只在旧SQLite里的青芽');
  assert.equal(existsSync(join(original, 'pet-runtime-data.json')), false); assert.equal(existsSync(join(appData, 'Lingjing')), false);
  proof.checks.push({ id: 'ordinary-start-discovers-old-sqlite-and-reads-same-account-pet', ownerAccountId: session.currentUser.id, petId: pet.petId, secureSessionRestored });
  await app.close(); app = null;
  const db = new (require('better-sqlite3'))(join(original, 'lingjing.sqlite'), { readonly: true, fileMustExist: true }); db.pragma('query_only = ON');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM account_identities WHERE owner_account_id=?').get(proof.ownerAccountId).n, 1);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok'); db.close();
  proof.passed = true; console.log(JSON.stringify({ passed: true, output, checks: proof.checks.length, petId: proof.petId }));
} catch (error) { proof.failure = String(error); throw error; }
finally { if (app) await app.close().catch(() => {}); proof.completedAt = new Date().toISOString(); writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); mkdirSync(resolve('artifacts/foundation/cloud-engineering/profile-discovery'), { recursive: true }); writeFileSync('artifacts/foundation/cloud-engineering/profile-discovery/latest.json', JSON.stringify(proof, null, 2)); }
