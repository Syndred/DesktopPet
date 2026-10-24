import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const source = resolve(process.argv[2]);
const previous = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8'));
const output = resolve(process.argv[4]);
mkdirSync(output, { recursive: true });
const { _electron: electron } = createRequire(join(source, 'package.json'))('playwright');
const evidence = { startedAt: new Date().toISOString(), source, profile: previous.profile, commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(), scope: 'Final focused portrait/HUD and real battle-button interaction recheck; existing isolated local account only.', actions: [], screenshots: [], errors: [] };
const env = { ...process.env, PET_USER_DATA_DIR: previous.profile }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [source], cwd: source, env });
let page;
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
try {
  page = await app.firstWindow(); page.on('pageerror', e => evidence.errors.push(e.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  const invoke = async (feature, command, payload = {}) => {
    const result = await page.evaluate(i => window.lingjing.invoke(i.feature, i.command, i.payload), { feature, command, payload });
    assert.equal(result.ok, true, JSON.stringify(result)); return result.data;
  };
  const capture = async (file, path, delay = 650) => {
    if (path) await page.evaluate(p => { location.hash = `#${p}`; }, path);
    await page.waitForTimeout(delay);
    await page.evaluate(() => document.querySelector('.main-content')?.scrollTo(0, 0));
    await page.screenshot({ path: join(output, file) });
    evidence.screenshots.push({ file, path: await page.evaluate(() => location.hash) }); save();
  };
  const pets = (await invoke('companions', 'list')).pets;
  const pet = pets.find(p => /喵|猫/.test(p.name)) || pets[0];
  await capture('adoption-portraits.png', '/companions/adopt');
  await capture('selected-pet-detail.png', `/companions/${pet.petId}`);
  const talk = page.getByRole('button', { name: '聊聊天', exact: true });
  if (await talk.count() === 1) await talk.click();
  await capture('chat-portraits.png', '/chat');
  let session = (await invoke('battle', 'overview')).session;
  if (session?.status === 'active') await invoke('battle', 'leave', { sessionId: session.id, actionId: randomUUID() });
  await invoke('battle', 'selectPet', { petId: pet.petId, actionId: randomUUID() });
  session = await invoke('battle', 'startTraining', { petId: pet.petId, enemyElement: 'fire', actionId: randomUUID() });
  await capture('battle-start.png', '/battle');
  evidence.session = { id: session.id, player: session.player, enemy: session.enemy };
  evidence.initialUltimateDisabled = await page.locator('.battle-move.ultimate').isDisabled();
  assert.equal(evidence.initialUltimateDisabled, true, 'Uncharged ultimate must be disabled');
  for (const action of ['normal_attack', 'dodge', 'element_attack', 'ultimate']) {
    session = await invoke('battle', 'snapshot', { sessionId: session.id });
    if (session.status !== 'active') { evidence.earlyFinish = session.status; break; }
    const button = page.locator(`.battle-move.${action}`);
    if (action === 'ultimate') {
      evidence.extraChargeSteps = [];
      for (let attempt = 0; attempt < 4 && await button.isDisabled(); attempt++) {
        const beforeRound = session.snapshot.round;
        await page.locator('.battle-move.element_attack').click();
        for (let poll = 0; poll < 150; poll++) {
          session = await invoke('battle', 'snapshot', { sessionId: session.id });
          if (session.status !== 'active' || session.snapshot.round > beforeRound) break;
          await page.waitForTimeout(40);
        }
        evidence.extraChargeSteps.push({ action: 'element_attack', round: session.snapshot.round, anger: session.snapshot.player.anger, status: session.status });
        await page.waitForTimeout(700);
        if (session.status !== 'active') break;
      }
    }
    assert.equal(await button.isEnabled(), true, `${action} should be available in this actual state`);
    const before = { round: session.snapshot.round, hp: session.snapshot.player.hp, anger: session.snapshot.player.anger, enemyHp: session.snapshot.enemy.hp };
    if (action === 'normal_attack') { await button.focus(); await page.keyboard.press('Enter'); }
    else await button.click();
    await capture(`${evidence.actions.length + 1}-${action}-animation.png`, null, 160);
    for (let attempt = 0; attempt < 150; attempt++) {
      session = await invoke('battle', 'snapshot', { sessionId: session.id });
      if (session.status !== 'active' || session.snapshot.round > before.round) break;
      await page.waitForTimeout(40);
    }
    assert.ok(session.status !== 'active' || session.snapshot.round > before.round, 'Actual rule snapshot must advance after the UI command');
    await page.waitForTimeout(700);
    const selected = await button.getAttribute('aria-pressed').catch(() => null);
    const stages = await page.locator('.resource-stage').evaluateAll(nodes => nodes.map(e => Object.fromEntries([...e.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value]))));
    const after = { round: session.snapshot.round, hp: session.snapshot.player.hp, anger: session.snapshot.player.anger, enemyHp: session.snapshot.enemy.hp, status: session.status };
    evidence.actions.push({ action, input: action === 'normal_attack' ? 'keyboard Enter' : 'pointer', before, after, selected, stages });
    await capture(`${evidence.actions.length}-${action}-result.png`, null, 100);
    console.log(`ACTION ${action}: round ${before.round} -> ${after.round}, anger ${before.anger} -> ${after.anger}`);
  }
  evidence.finalHud = await page.locator('.combatant-status').evaluateAll(nodes => nodes.map(e => {
    const s = getComputedStyle(e), before = getComputedStyle(e, '::before');
    return { text: e.textContent.trim(), clipPath: s.clipPath, decorativeClipPath: before.clipPath, background: s.backgroundColor };
  }));
  evidence.finalSkills = await page.locator('.battle-move').evaluateAll(nodes => nodes.map(e => ({ text: e.textContent, disabled: e.disabled, selected: e.getAttribute('aria-pressed'), outline: getComputedStyle(e).outline, border: getComputedStyle(e).borderColor })));
  assert.deepEqual(new Set(evidence.actions.map(a => a.action)), new Set(['element_attack', 'ultimate', 'dodge', 'normal_attack']), 'All four skill controls must execute using actual gameplay state');
  assert.deepEqual(evidence.errors, []);
  evidence.completedAt = new Date().toISOString(); save();
  console.log('Focused battle/portrait interaction acceptance passed.');
} catch (error) {
  evidence.failure = String(error); save();
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await app.close(); }
