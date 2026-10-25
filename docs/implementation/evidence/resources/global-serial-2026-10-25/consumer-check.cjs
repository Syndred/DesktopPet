// Directed fixture acceptance: actual resource component, IPC and SQLite.
// This does not exercise Electron, OS safeStorage, or deployed cloud numbering.
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { mkdirSync, readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join, resolve, relative } = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { createServer } = require('node:http');
const { execFileSync } = require('node:child_process');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = resolve(__dirname, '../../../../..');
const runId = randomUUID();
const output = join(root, 'artifacts/qa/resources-serial-consumer', runId);
mkdirSync(output, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const sha256 = value => createHash('sha256').update(value).digest('hex');
const load = file => require(join(root, file));
const report = {
  format: 'lingjing.resources.global-serial.consumer-check', version: 1, runId,
  startedAt: new Date().toISOString(), source: git('rev-parse', 'HEAD'),
  evidenceKind: 'local fixture: headless Chromium + actual React component + actual IPC + file SQLite',
  nativeDesktopInput: false, liveCloudNumberAllocation: false, cloudDeployedHere: false,
  checks: [], files: {}, passed: false
};
const check = (name, evidence) => report.checks.push({ name, passed: true, evidence });
const productFiles = [
  'apps/pc-app/ui/src/features/resources/ApplyToCompanion.tsx',
  'apps/pc-app/ui/src/features/resources/binding.css',
  'apps/pc-app/runtime/features/companions/index.cjs',
  'apps/pc-app/runtime/features/companions/service.cjs',
  'apps/pc-app/runtime/features/companions/global-serial-cache.cjs',
  'apps/pc-app/runtime/features/companions/display-identity.mjs'
];
for (const file of productFiles) report.files[file] = sha256(readFileSync(join(root, file)));

async function main() {
  const { migrations } = load('apps/pc-app/runtime/features/accounts/schema.cjs');
  const { migrateCompanions } = load('apps/pc-app/runtime/features/companions/migrations.cjs');
  const { CompanionsService } = load('apps/pc-app/runtime/features/companions/service.cjs');
  const { createCompanionBackupAdapter } = load('apps/pc-app/runtime/features/companions/backup.cjs');
  const { createServices } = load('apps/pc-app/runtime/core/services.cjs');
  const { checksum } = load('apps/pc-app/runtime/features/accounts/util.cjs');
  const catalog = load('apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json');
  const original = catalog.characters.find(row => row.templateId === 'big-fish-gentle');
  const target = catalog.characters.find(row => row.templateId === 'animal-shiba');
  assert.ok(original && target);
  const owner = 'qa_resources_consumer_20261025';
  const dbFile = join(output, 'fixture.sqlite');
  const db = new DatabaseSync(dbFile);
  let browser, server, feature, page, cloudEnabled = false;
  const calls = [], browserErrors = [];
  try {
    migrations.forEach(migration => db.exec(migration.sql));
    migrateCompanions(db);
    db.prepare('INSERT INTO account_identities(owner_account_id,provider,subject_id,account,account_key,username,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
      .run(owner, 'runtime', owner, owner, owner, '隔离资源夹具', '2026-10-25', '2026-10-25');
    let number = 0;
    const seed = new CompanionsService({ db, uuid: () => `resource-fixture-${String(++number).padStart(2, '0')}` });
    const pets = Array.from({ length: 3 }, (_, index) => seed.adopt(owner, {
      templateId: original.templateId, name: '相同历史昵称', showOnDesktop: false, actionId: `fixture-adopt-${index}`
    }).data.pet);
    for (const pet of pets) {
      pet.serial = '相同历史编号';
      pet.globalSerial = '777777777'; // Untrusted imported metadata, deliberately wrong.
      db.prepare('UPDATE companion_pets SET data_json=? WHERE owner_account_id=? AND pet_id=?').run(JSON.stringify(pet), owner, pet.petId);
    }
    db.prepare('UPDATE companion_accounts SET legacy_imported_at=? WHERE owner_account_id=?').run('2026-10-25', owner);
    const adapter = createCompanionBackupAdapter(db);
    const before = adapter.export(owner), beforeBytes = JSON.stringify(before);
    const beforeRows = new Map(before.tables.companion_pets.map(row => [row.pet_id, row.data_json]));
    const services = createServices({ db, legacy: {}, paths: { userData: output }, windows: {} });
    services.session.setAdapter({ getCurrentUser: () => ({ id: owner }) });
    // The resource metadata and authority response are fixtures. Domain, cache,
    // IPC handlers, UI bridge and the component below are the actual source.
    services.provide('accounts', {
      identity: () => ({ provider: 'runtime', subject_id: owner }),
      privateSession: () => ({ ownerAccountId: owner, authKind: cloudEnabled ? 'supabase' : 'runtime' })
    });
    services.provide('resources', {
      ready: Promise.resolve(),
      get: async (who, id) => {
        assert.equal(who, owner); assert.equal(id, target.resourceId);
        return { id, kind: 'spritesheet', availability: 'ready' };
      }
    });
    feature = load('apps/pc-app/runtime/features/companions/index.cjs').register(services);
    for (const [command, handler] of Object.entries(feature.commands)) services.ipc.handle(`companions:${command}`, handler);
    const api = services.get('companions');
    const initial = await services.invoke('companions', 'list');
    assert.equal(initial.ok, true, JSON.stringify(initial));
    assert.ok(initial.data.pets.every(pet => pet.globalSerial === undefined));

    const bundle = await build({
      stdin: { contents: `import { createRoot } from 'react-dom/client'; import { ApplyToCompanion } from './apps/pc-app/ui/src/features/resources/ApplyToCompanion'; createRoot(document.getElementById('root')).render(<ApplyToCompanion disabled={false} resource={${JSON.stringify({ id: target.resourceId })}} />);`, resolveDir: root, loader: 'tsx' },
      bundle: true, write: false, outfile: join(output, 'consumer.js'), platform: 'browser', format: 'iife', jsx: 'automatic',
      define: { 'process.env.NODE_ENV': '"test"' }, logLevel: 'silent'
    });
    const javascript = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
    const css = bundle.outputFiles.filter(file => file.path.endsWith('.css')).map(file => file.text).join('\n');
    server = createServer((request, response) => {
      if (request.url === '/consumer.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(javascript); return; }
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><style>body{font-family:Arial,sans-serif;margin:30px}.resource-metadata-popover{width:320px;max-width:calc(100vw - 40px)}${css}</style><div id="root"></div><script src="/consumer.js"></script></html>`);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const executablePath = [process.env.LINGJING_TEST_CHROMIUM, chromium.executablePath(), 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(path => path && existsSync(path));
    assert.ok(executablePath, 'An existing headless browser is required; this check never installs one.');
    browser = await chromium.launch({ executablePath, headless: true });
    page = await browser.newPage({ viewport: { width: 700, height: 700 }, reducedMotion: 'reduce' });
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.exposeFunction('__fixtureInvoke', async (featureId, command, payload) => {
      const result = await services.invoke(featureId, command, payload);
      calls.push({ feature: featureId, command, payload, ok: result.ok });
      return result;
    });
    await page.addInitScript(() => {
      const listeners = new Map();
      window.lingjing = {
        invoke: (...args) => window.__fixtureInvoke(...args),
        subscribe: (name, callback) => {
          if (!listeners.has(name)) listeners.set(name, new Set());
          listeners.get(name).add(callback);
          return () => listeners.get(name).delete(callback);
        }
      };
      window.__fixtureEmit = (name, event) => { for (const callback of listeners.get(name) || []) callback(event); };
    });
    const unsubscribe = services.events.on('companions:changed', event => {
      if (page && !page.isClosed()) void page.evaluate(event => window.__fixtureEmit('companions:changed', event), event).catch(() => {});
    });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.getByRole('button', { name: '应用给伙伴', exact: true }).click();
    const selector = page.getByRole('combobox');
    await selector.filter({ hasText: '待同步' }).waitFor();
    const pendingLabel = await selector.innerText();
    assert.ok(!pendingLabel.includes('777777777') && !pendingLabel.includes(pets[0].petId));
    await page.screenshot({ path: join(output, 'pending-headless-fixture.png') });
    check('Unverified saved numeric metadata displays pending', { label: pendingLabel, originalPetIds: pets.map(pet => pet.petId) });

    const serials = ['1', '10000', '900719925474099312345678901234567890123456789012345678901234567890123456789'];
    const body = { format: 'lingjing-account-save', version: 1, ownerAccountId: owner, identity: { provider: 'runtime', subjectId: owner }, provenance: { mode: 'live' }, createdAt: '2026-10-25T00:00:00.000Z', data: { modules: { companions: { version: 1, data: before } }, tables: {} } };
    const registry = { format: 'lingjing.global-serial.readback', version: 1, ownerAccountId: owner, namespace: 'qa:resource-consumer-fixture', revision: 3, pets: pets.map((pet, index) => ({ ownerAccountId: owner, petId: pet.petId, templateId: pet.templateId, namespace: 'qa:resource-consumer-fixture', globalSerial: serials[index] })) };
    cloudEnabled = true;
    api.applyCloudReadback(owner, { authority: 'live', ownerAccountId: owner, revision: 3, envelope: { ...body, checksum: checksum(body) }, module: { version: 1, data: before }, serialRegistry: registry });
    cloudEnabled = false;
    assert.equal(JSON.stringify(adapter.export(owner)), beforeBytes);
    const projected = await services.invoke('companions', 'list');
    assert.deepEqual(projected.data.pets.map(pet => pet.globalSerial), serials);
    assert.deepEqual(api.listPets(owner).map(pet => pet.globalSerial), serials);
    for (const [index, pet] of pets.entries()) {
      assert.equal(api.getPet(owner, pet.petId).globalSerial, serials[index]);
      assert.equal((await services.invoke('companions', 'get', { petId: pet.petId })).data.globalSerial, serials[index]);
    }
    await selector.filter({ hasText: '0001' }).waitFor();
    await selector.click();
    const options = await page.getByRole('option').allTextContents();
    assert.ok(options.some(text => text.includes('0001')) && options.some(text => text.includes('10000')) && options.some(text => text.includes(serials[2])));
    await page.getByRole('option').filter({ hasText: /编号 10000$/ }).click();
    await page.getByRole('button', { name: `应用给${original.name}（编号 10000）`, exact: true }).click();
    const status = page.getByRole('status');
    await status.filter({ hasText: `已应用给${original.name}（编号 10000）。` }).waitFor();
    const appearance = calls.filter(call => call.command === 'appearance');
    assert.equal(appearance.length, 1);
    assert.equal(appearance[0].ok, true);
    assert.equal(appearance[0].payload.petId, pets[1].petId);
    assert.equal(appearance[0].payload.resourceId, target.resourceId);
    assert.equal(appearance[0].payload.expectedRevision, pets[1].revision);
    assert.ok(typeof appearance[0].payload.actionId === 'string' && appearance[0].payload.actionId.length > 0);
    assert.ok(!Object.hasOwn(appearance[0].payload, 'globalSerial'));
    check('Actual component consumes IPC globalSerial labels without truncation', { options, from: 'actual companions:list / get and main listPets / getPet', syntheticRegistry: registry });
    check('Actual selection sends only the original petId to actual appearance IPC', appearance[0]);
    const afterRows = db.prepare('SELECT pet_id,data_json FROM companion_pets WHERE owner_account_id=? ORDER BY pet_id').all(owner);
    for (const row of afterRows) {
      const beforePet = JSON.parse(beforeRows.get(row.pet_id)), afterPet = JSON.parse(row.data_json);
      if (row.pet_id !== pets[1].petId) assert.equal(row.data_json, beforeRows.get(row.pet_id));
      else {
        assert.equal(afterPet.resource.resourceId, target.resourceId);
        assert.equal(afterPet.revision, beforePet.revision + 1);
        for (const key of ['petId', 'ownerAccountId', 'templateId', 'name', 'serial', 'globalSerial', 'growth', 'desktop', 'origin']) assert.deepEqual(afterPet[key], beforePet[key]);
      }
    }
    for (const receipt of before.tables.companion_actions) assert.deepEqual(adapter.export(owner).tables.companion_actions.find(row => row.action_id === receipt.action_id), receipt);
    check('SQLite changes only the selected appearance; original identity and prior receipts are retained', { selectedPetId: pets[1].petId, originalTemplate: original.templateId, newAppearance: target.resourceId, otherPetJsonBytesUnchanged: true, projectedNumbersWrittenIntoRawJson: false });
    await page.screenshot({ path: join(output, 'applied-headless-fixture.png') });
    await selector.click();
    await page.getByRole('option').filter({ hasText: serials[2] }).click();
    const longLabel = await selector.innerText();
    assert.ok(longLabel.includes(serials[2]));
    await page.screenshot({ path: join(output, 'long-label-headless-fixture.png') });
    check('Numbers above JS precision remain exact text in selected label', { serial: serials[2], selectedLabel: longLabel });
    assert.deepEqual(browserErrors, []);
    for (const file of productFiles) assert.equal(sha256(readFileSync(join(root, file))), report.files[file]);
    check('Product source files unchanged during fixture verification', report.files);
    report.browser = { executablePath, version: browser.version(), headless: true, newIsolatedProfile: true };
    report.sqlite = { file: relative(root, dbFile), fixtureOnly: true, priorCompanionModuleSha256: sha256(beforeBytes), finalPetJsonSha256: afterRows.map(row => ({ petId: row.pet_id, sha256: sha256(row.data_json) })) };
    report.artifacts = ['pending-headless-fixture.png', 'applied-headless-fixture.png', 'long-label-headless-fixture.png'];
    report.passed = true;
    unsubscribe();
  } finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    feature?.dispose();
    db.close();
  }
}
main().catch(error => { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }).finally(() => {
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(output, 'consumer-check.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, evidence: join(output, 'consumer-check.json'), error: report.error?.message }));
});
