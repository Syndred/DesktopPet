import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { inspectBattle, observeBattleAction } from './battle-probe.mjs';

const source = resolve('.'), core = createRequire(import.meta.url)('../../apps/pc-app/runtime/services/battle-runtime.cjs');
const output = resolve(`artifacts/foundation/unified-feedback/run-${Date.now()}`); mkdirSync(output, { recursive: true });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const proof = { at: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), scenario,
  scope: 'Actual production Electron screen and UI actions. Explicit isolated QA legal charged prestate and controlled opponent actions; actual engine, no live cloud or natural-game claim.', cases: [], errors: [] };
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
const app = await electron.launch({ args: [source], cwd: source, env });
try {
  const page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  const invoke = async (feature, command, payload = {}) => {
    const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
    assert.equal(result.ok, true, JSON.stringify(result)); return result.data;
  };
  const size = async (width, height) => app.evaluate(({ BrowserWindow }, dimensions) => BrowserWindow.getAllWindows()[0].setSize(...dimensions), [width, height]);
  await size(1280, 844);
  const password = `Feedback-${randomUUID()}!`;
  await invoke('accounts', 'register', { provider: 'local', account: `feedback_${Date.now()}`, username: '共享战场实操', password, confirmPassword: password, rememberSession: false });
  await page.getByRole('navigation', { name: '主导航' }).waitFor(); proof.runtime = await invoke('app', 'info');
  const adoption = await invoke('companions', 'adopt', { templateId: 'big-fish-gentle', name: '鱼丸', showOnDesktop: false, actionId: randomUUID() });
  const pet = adoption.pet || adoption.data?.pet || (await invoke('companions', 'list')).pets[0];
  assert.ok(pet?.petId);
  await invoke('battle', 'selectPet', { petId: pet.petId, actionId: randomUUID() });
  const fixtures = [
    { id: 'water-instant-anger', player: 'element_attack', enemy: 'dodge', expect: 'anger', repeat: true },
    { id: 'normal-interrupts-element', player: 'normal_attack', enemy: 'element_attack', expect: 'interrupt' },
    { id: 'dodge-avoids-normal', player: 'dodge', enemy: 'normal_attack', expect: 'dodge' },
    { id: 'ultimate-hits-dodge', player: 'ultimate', enemy: 'dodge', expect: 'damage' }
  ];
  for (const fixture of fixtures) {
    await page.evaluate(() => { location.hash = '#/battle'; });
    await page.getByRole('combobox', { name: '训练对手五行', exact: true }).waitFor();
    await page.getByRole('combobox', { name: '训练对手五行', exact: true }).click();
    await page.getByRole('option').filter({ hasText: '火' }).first().click();
    await page.getByRole('button', { name: '开始', exact: true }).click();
    const screen = page.locator('[data-battle-screen="shared-v1"]'); await screen.waitFor();
    const sessionId = await screen.getAttribute('data-session-id');
    const before = await invoke('battle', 'qaPreset', { sessionId, preset: 'charged', enemyAction: fixture.enemy });
    await page.reload(); await screen.waitFor();
    const result = { ...fixture, sessionId, before, sizes: [], actions: [] }; proof.cases.push(result);
    for (const width of fixture.id === 'water-instant-anger' ? [1280, 1440] : [1280]) {
      await size(width, width === 1280 ? 844 : 900);
      const view = await inspectBattle(page, { session: before, screenshot: join(output, `${fixture.id}-${width}.png`) });
      assert.ok(!/归一|养成面板|选择本回合|电脑对手|SQLite|actionId/.test(view.displayedText)); result.sizes.push(view);
    }
    await size(1280, 844);
    for (let attempt = 0; attempt < (fixture.repeat ? 2 : 1); attempt++) {
      const previous = await invoke('battle', 'snapshot', { sessionId }), expected = structuredClone(previous.snapshot);
      const engineResult = core.executeRound(expected, fixture.player, fixture.enemy);
      const observing = observeBattleAction(page, fixture.player);
      await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'impact');
      await page.screenshot({ path: join(output, `${fixture.id}-${attempt + 1}-impact.png`) });
      const timeline = await observing;
      const after = await invoke('battle', 'snapshot', { sessionId });
      assert.deepEqual(after.snapshot, expected); assert.equal(after.rounds.at(-1).round, engineResult.round);
      const events = after.rounds.at(-1).visualEvents;
      assert.ok(events.some(event => event.kind === fixture.expect));
      assert.ok(!events.some(event => event.status === 'freeze'));
      if (fixture.id === 'water-instant-anger') {
        assert.ok(events.some(event => event.kind === 'anger' && event.amount === after.snapshot.enemy.anger));
        assert.ok(!after.snapshot.enemy.statuses.some(status => status.type === 'freeze'));
        assert.ok(timeline.entries.some(entry => entry.actors[0]?.action === 'skill' && entry.actors[0]?.frame === '0'));
      }
      if (fixture.id === 'normal-interrupts-element') {
        assert.ok(!events.some(event => event.kind === 'dodge'));
        assert.ok(!timeline.entries.some(entry => entry.phase === 'release' && entry.actors[1]?.action === 'skill'));
      }
      if (fixture.id === 'ultimate-hits-dodge') {
        assert.ok(!events.some(event => event.kind === 'dodge')); assert.equal(after.snapshot.player.hp, 105); assert.equal(after.snapshot.player.anger, 0);
      }
      const visibleKinds = timeline.entries.flatMap(entry => entry.events.map(event => event.kind));
      assert.ok(visibleKinds.includes(fixture.expect));
      result.actions.push({ after, engineResult, timeline });
    }
    await page.getByRole('button', { name: '离开', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '离开', exact: true }).click();
    await page.getByRole('button', { name: '战报', exact: true }).waitFor();
    result.final = await invoke('battle', 'snapshot', { sessionId }); assert.equal(result.final.status, 'abandoned');
  }
  assert.deepEqual(proof.errors, []); proof.passed = true;
  console.log(JSON.stringify({ passed: true, cases: proof.cases.map(result => result.id), output }));
} catch (error) { proof.failure = String(error); throw error; }
finally { writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); await app.close(); }
