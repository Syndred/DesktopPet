// Verify one existing captured instance against the actual companions/resources
// services, in a copy of the completed controlled-flow profile.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const previous = JSON.parse(readFileSync(resolve('artifacts/discovery/latest-2d-evidence.json'), 'utf8'));
const output = resolve(`artifacts/discovery/appearance-${Date.now()}`), profile = join(output, 'profile');
mkdirSync(output, { recursive: true }); cpSync(join(previous.output, 'controlled-profile'), profile, { recursive: true });
const env = { ...process.env, PET_USER_DATA_DIR: profile, LINGJING_CONTROLLED_LOCATION: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.LINGJING_DISCOVERY_CLOUD;
const app = await electron.launch({ args: [resolve('apps/pc-app/runtime/features/discovery/verification/host.cjs')], env });
const evidence = { at: new Date().toISOString(), copiedControlledProfile: true, physicalLocationAcceptance: false };
let page;
const invoke = (feature, command, payload = {}) => page.evaluate(({ feature, command, payload }) => window.lingjing.invoke(feature, command, payload), { feature, command, payload });
try {
  for (let i = 0; i < 150; i++) {
    page = app.windows().find(window => window.url().includes('/dist/ui/index.html') && !window.url().includes('/desktop/'));
    if (page) break; await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page);
  await page.getByRole('button', { name: '获取系统位置', exact: true }).click();
  const before = await invoke('discovery', 'snapshot'); assert.equal(before.ok, true);
  const capture = before.data.captures[0]; assert.ok(capture);
  const pet = await invoke('companions', 'get', { petId: capture.petId }); assert.equal(pet.ok, true);
  const listed = await invoke('resources', 'list'); assert.equal(listed.ok, true);
  const available = listed.data.filter(resource => resource.kind === 'spritesheet' && resource.availability === 'ready' && resource.id !== pet.data.resource.resourceId);
  const next = available.find(resource => /柴/.test(resource.name)) || available[0]; assert.ok(next);
  assert.notEqual(next.id, pet.data.resource.resourceId);
  const changed = await invoke('companions', 'appearance', { petId: capture.petId, resourceId: next.id, expectedRevision: pet.data.revision, actionId: randomUUID() }); assert.equal(changed.ok, true, JSON.stringify(changed));
  const after = await invoke('discovery', 'snapshot'); assert.equal(after.ok, true);
  const current = after.data.captures.find(value => value.petId === capture.petId);
  evidence.petId = capture.petId; evidence.originalResource = pet.data.resource.resourceId; evidence.currentResource = next.id;
  assert.equal(current.resourceId, next.id, 'Capture view must follow the current instance resource');
  const pokedex = await invoke('discovery', 'pokedex'); assert.equal(pokedex.ok, true); assert.equal(pokedex.data.find(value => value.petId === capture.petId).resourceId, next.id);
  for (const other of before.data.pets.filter(value => value.petId !== capture.petId)) assert.equal(after.data.pets.find(value => value.petId === other.petId).resource.resourceId, other.resource.resourceId);
  await page.getByRole('button', { name: '查看相遇图鉴', exact: true }).click();
  await page.getByRole('heading', { name: capture.name, exact: true }).click();
  await page.getByText('新伙伴已加入', { exact: true }).waitFor();
  await page.locator(`.discovery-postcard [data-resource-id="${next.id}"][data-status="ready"] canvas`).waitFor();
  await page.locator(`.discovery-result-profile [data-resource-id="${next.id}"] .discovery-atlas-thumbnail`).waitFor();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.app-page-motion')).opacity) === 1);
  const layout = await page.locator('.discovery-result-details').evaluate(element => ({ gap: getComputedStyle(element).rowGap, cards: [...element.querySelectorAll('.card')].map(card => ({ top: card.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom, marginBottom: getComputedStyle(card).marginBottom })) }));
  assert.equal(layout.gap, '16px'); assert.ok(layout.cards.every(card => card.marginBottom === '0px'));
  await page.screenshot({ path: join(output, 'current-instance-resource.png') });
  evidence.passed = true; evidence.otherInstancesUnchanged = true; evidence.layout = layout;
  writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  writeFileSync(resolve('artifacts/discovery/latest-appearance-evidence.json'), JSON.stringify({ ...evidence, output }, null, 2));
  console.log(JSON.stringify({ ...evidence, output }, null, 2));
} catch (error) {
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  writeFileSync(join(output, 'failure.json'), JSON.stringify({ ...evidence, error: error.message }, null, 2)); throw error;
} finally { await app.close(); }
