import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Actual AdoptionPage + React DOM, with controlled controller/portrait ports in
// a fresh headless Chrome. This is not product-window or live IPC acceptance.
const root = resolve('.'), output = resolve(process.argv[2] || 'artifacts/companions/user-qa/global-serial/adoption-boundary');
mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
const { findTemplate } = require('../templates.cjs');
const template = findTemplate('animal-white-fox'), owner = 'qa_adoption_owner_a';
const receipt = { ownerAccountId: owner, petId: 'original-adopted-pet', templateId: template.templateId, name: '原昵称', serial: 'original-serial', element: template.element, resource: template.resource, globalSerial: '666666666666' };
const readPet = { ...receipt }; delete readPet.globalSerial;
const snapshot = pets => ({ ownerAccountId: owner, pets, templates: [template], selections: { chatPetId: null, battlePetId: null, guardPetId: null }, revision: 1 });
const cases = [
  { name: 'matching-confirmed-read-wins-over-raw-receipt', snapshot: snapshot([{ ...readPet, globalSerial: '7' }]), receipt, expected: '0007' },
  { name: 'matching-unconfirmed-read-stays-pending', snapshot: snapshot([readPet]), receipt, expected: '待同步' },
  { name: 'missing-read-never-promotes-raw-receipt-number', snapshot: snapshot([]), receipt, expected: '待同步' },
  { name: 'foreign-owner-with-same-petId-never-supplies-number', snapshot: snapshot([{ ...readPet, ownerAccountId: 'qa_adoption_owner_b', globalSerial: '42' }]), receipt, expected: '待同步' },
  { name: 'changed-owner-hides-old-adoption-confirmation', snapshot: { ...snapshot([{ ...readPet, ownerAccountId: 'qa_adoption_owner_b', globalSerial: '19' }]), ownerAccountId: 'qa_adoption_owner_b' }, receipt, expected: null },
  { name: 'confirmed-large-number-keeps-every-digit', snapshot: snapshot([{ ...readPet, globalSerial: '9007199254740993' }]), receipt, expected: '9007199254740993' }
];

const ports = {
  controller: 'export function useCompanions(){return window.__controller}',
  portrait: 'import React from "react"; export function CompanionPortrait({name}){return <div role="img" aria-label={name+"的测试形象"}/>}',
  navigation: 'export function navigate(path){window.__navigations.push(path)}',
  motion: 'import React from "react"; export function AnimatedList({children,...props}){return <div {...props}>{children}</div>}'
};
const bundle = await build({
  stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {AdoptionPage} from "./apps/pc-app/ui/src/features/companions/AdoptionPage.tsx"; createRoot(document.getElementById("root")).render(<AdoptionPage/>);', loader: 'tsx', resolveDir: root, sourcefile: 'adoption-boundary-entry.tsx' },
  bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.css': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'controlled-companion-ports', setup(builder) {
    builder.onResolve({ filter: /^\.\// }, args => {
      if (!args.importer.replaceAll('\\', '/').includes('/features/companions/')) return;
      if (args.path === './client') return { path: 'controller', namespace: 'adoption-fixture' };
      if (args.path === './CompanionPortrait') return { path: 'portrait', namespace: 'adoption-fixture' };
    });
    builder.onResolve({ filter: /^\.\.\/\.\.\/(app\/navigation|components\/motion)$/ }, args => {
      if (!args.importer.replaceAll('\\', '/').includes('/features/companions/')) return;
      return { path: args.path.endsWith('navigation') ? 'navigation' : 'motion', namespace: 'adoption-fixture' };
    });
    builder.onLoad({ filter: /.*/, namespace: 'adoption-fixture' }, args => ({ contents: ports[args.path], loader: 'tsx', resolveDir: root }));
  } }]
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const scenario of cases) {
    const page = await browser.newPage();
    try {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
      await page.evaluate(data => {
        window.__scenario = data; window.__calls = []; window.__navigations = [];
        window.__controller = {
          snapshot: data.snapshot, error: '', loading: false, busy: false, refreshing: false,
          reload: async () => {}, petAction: async () => null,
          mutate: async (command, payload) => { window.__calls.push({ command, payload }); return { pet: data.receipt }; }
        };
      }, scenario);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.locator('button[type="submit"]').click({ timeout: 5000 });
      await page.waitForFunction(() => window.__calls.length === 1);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const observed = await page.evaluate(() => ({
        number: document.querySelector('.cp-success [data-instance-number]')?.getAttribute('data-instance-number') ?? null,
        text: document.querySelector('.cp-success')?.textContent ?? null,
        calls: window.__calls, receipt: window.__scenario.receipt
      }));
      assert.deepEqual(errors, []); assert.equal(observed.calls[0].command, 'adopt');
      assert.equal(Object.hasOwn(observed.calls[0].payload, 'globalSerial'), false);
      assert.deepEqual(observed.receipt, scenario.receipt, 'UI must not rewrite an immutable receipt');
      results.push({ name: scenario.name, expected: scenario.expected, observed: observed.number, passed: observed.number === scenario.expected, text: observed.text });
    } finally { await page.close(); }
  }
} finally { await browser.close(); }
const sha256 = path => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');
const report = {
  format: 'lingjing.companions.adoption-display-boundary', version: 1, at: new Date().toISOString(),
  kind: 'Actual React DOM and AdoptionPage with controlled controller/portrait ports; isolated headless Chrome',
  source: { adoptionPage: sha256('apps/pc-app/ui/src/features/companions/AdoptionPage.tsx'), helper: sha256('apps/pc-app/runtime/features/companions/display-identity.mjs') },
  rawReceiptNeverMutated: true, mutationNeverSubmitsGlobalSerial: true,
  liveIpcVerified: false, serverAllocationVerified: false, nativeUiVerified: false,
  passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, results
};
writeFileSync(join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
assert.equal(report.failed, 0, 'Adoption confirmation may consume only matching trusted read metadata');
