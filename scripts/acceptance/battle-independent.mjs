import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

const source = resolve(process.argv[2]);
const output = resolve(process.argv[3]);
const { _electron: electron } = createRequire(join(source, 'package.json'))('playwright');
mkdirSync(output, { recursive: true });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { cwd: source, encoding: 'utf8' }));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const proof = {
  at: new Date().toISOString(), source, scenario,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  sourceDirty: execFileSync('git', ['status', '--short'], { cwd: source, encoding: 'utf8' }).trim(),
  build: readdirSync(join(source, 'apps/pc-app/dist/ui/assets')).filter(name => /\.(js|css)$/.test(name)).map(name => ({ name, sha256: hash(join(source, 'apps/pc-app/dist/ui/assets', name)) })),
  provenance: 'Independent actual Electron observations. New verified QA profile, legal charged state and scripted opponent actions; actual public battle rules, resources, persistence and player controls. No live cloud or physical GPS claim.',
  checks: [], sessions: [], errors: []
};
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2));
const check = (id, passed, detail) => { proof.checks.push({ id, passed: Boolean(passed), detail }); save(); assert.ok(passed, id); };
const credentials = { provider: 'local', account: `root_battle_${Date.now()}`, username: '战斗独立验收', password: `Qa-${randomUUID()}!`, rememberSession: false };
let app, page;
const resources = new Map();
async function open() {
  const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.PET_RUNTIME_DATA_FILE;
  app = await electron.launch({ args: [source], cwd: source, env });
  page = await app.firstWindow(); page.on('pageerror', error => proof.errors.push(error.message));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 844));
  await page.waitForFunction(() => Boolean(window.lingjing));
}
async function invoke(feature, command, payload = {}) {
  const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
  assert.equal(result.ok, true, `${feature}.${command}: ${JSON.stringify(result)}`); return result.data;
}
async function route(path) {
  await page.evaluate(path => { location.hash = `#${path}`; }, path);
  await page.waitForFunction(path => location.hash === `#${path}`, path);
  await page.waitForTimeout(220);
}
async function inspect(session, label) {
  const screen = page.locator(`[data-battle-screen="shared-v1"][data-session-id="${session.id}"]`);
  await screen.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('.battle-stage .resource-stage')].length === 2 && [...document.querySelectorAll('.battle-stage .resource-stage')].every(element => element.getAttribute('data-status') === 'ready'));
  await page.evaluate(() => document.fonts.ready);
  const metrics = await screen.evaluate(root => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const styles = element => { const c = getComputedStyle(element); return { font: c.fontFamily, size: c.fontSize, weight: c.fontWeight, gap: c.gap, padding: c.padding, margin: c.margin, boxShadow: c.boxShadow }; };
    return {
      viewport: { width: innerWidth, height: innerHeight }, mode: root.getAttribute('data-battle-mode'), authority: root.getAttribute('data-authority'),
      title: { ...rect(root.querySelector('h1')), ...styles(root.querySelector('h1')), text: root.querySelector('h1').textContent, display: getComputedStyle(root.querySelector('h1')).display },
      moves: [...root.querySelectorAll('.battle-move')].map(element => ({ ...rect(element), ...styles(element), text: element.textContent, disabled: element.disabled, action: element.className })),
      hud: [...root.querySelectorAll('.combatant-status')].map(rect),
      stage: rect(root.querySelector('.battle-stage')), currentLog: rect(root.querySelector('.battle-current-log')),
      resources: [...root.querySelectorAll('.battle-stage .resource-stage')].map(element => ({ resourceId: element.getAttribute('data-resource-id'), action: element.getAttribute('data-action'), fallback: element.getAttribute('data-fallback'), canvas: element.querySelectorAll('canvas').length })),
      portraitCount: root.querySelectorAll('.combatant-status [data-framing="portrait"]').length,
      duplicateArena: document.querySelectorAll('.discovery-arena,.discovery-combatants,.discovery-battle-actions').length,
      phase: root.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase'), text: root.innerText,
      horizontalOverflow: document.querySelector('.main-content').scrollWidth > document.querySelector('.main-content').clientWidth + 1
    };
  });
  await page.screenshot({ path: join(output, `${label}.png`) });
  check(`${label}:shared-layout-and-identity`, metrics.mode === session.mode && metrics.hud.length === 2 && metrics.portraitCount === 2 && metrics.duplicateArena === 0 && !metrics.horizontalOverflow && metrics.resources.every((resource, index) => resource.canvas === 1 && resource.fallback === 'false' && resource.resourceId === (session[index ? 'enemy' : 'player'].resource?.resourceId || session[index ? 'enemy' : 'player'].appearance2d)), metrics);
  // V3 intentionally hides the toolbar heading, replaces the side panel with
  // an in-arena log and uses a larger ultimate orb. Assert that actual contract
  // rather than the retired V2 equal-card/28px-heading design.
  const compact=metrics.viewport.width<=1100, ordinaryWidth=compact?58:64, ultimateWidth=compact?76:86;
  check(`${label}:v3-toolbar-log-and-four-commands`, Boolean(metrics.title.text.trim()) && metrics.title.display==='none' && metrics.currentLog.width>=200 && metrics.currentLog.height>=138 && metrics.moves.length===4 && metrics.moves.every(move=>move.bottom<=metrics.viewport.height+1 && move.y>=0 && Math.abs(move.width-(move.action.split(' ').includes('ultimate')?ultimateWidth:ordinaryWidth))<1 && move.boxShadow==='none'), {title:metrics.title,log:metrics.currentLog,moves:metrics.moves});
  check(`${label}:concise-battle`, !/五行与行动说明|本机训练|电脑对手|选择本回合行动|行动结算后，|规则以.*为准/.test(metrics.text), metrics.text);
  return metrics;
}
async function start(pet, enemyAction = 'dodge') {
  const prior = (await invoke('battle', 'overview')).session;
  if (prior && ['active', 'waiting'].includes(prior.status)) await invoke('battle', 'leave', { sessionId: prior.id, actionId: randomUUID() });
  await invoke('battle', 'selectPet', { petId: pet.petId, actionId: randomUUID() });
  await route('/battle');
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/battle/session/'));
  let session = (await invoke('battle', 'overview')).session;
  await invoke('battle', 'qaPreset', { sessionId: session.id, preset: 'charged', enemyAction });
  // Re-open the real route to hydrate the authoritative charged snapshot before action.
  await route('/companions'); await route(`/battle/session/${encodeURIComponent(session.id)}`);
  await page.locator('[data-battle-screen="shared-v1"]').waitFor();
  await page.waitForFunction(() => document.querySelector('.battle-meter-row.anger b')?.textContent === '50/100' && [...document.querySelectorAll('.battle-stage .resource-stage')].length === 2 && [...document.querySelectorAll('.battle-stage .resource-stage')].every(element => element.getAttribute('data-status') === 'ready'));
  session = await invoke('battle', 'snapshot', { sessionId: session.id });
  check(`start:${pet.element}:${enemyAction}`, session.player.petId === pet.petId && session.player.element === pet.element && session.snapshot.player.anger === 50 && session.context.authority === 'simulated', { id: session.id, player: session.player, context: session.context });
  proof.sessions.push({ id: session.id, petId: pet.petId, element: pet.element, enemyAction }); save(); return session;
}
async function act(session, action, label, screenshot = false) {
  await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
  await page.evaluate(() => {
    const root = document.querySelector('[data-battle-screen="shared-v1"]'), observations = [], begun = performance.now(); let previous = '';
    const sample = () => {
      const state = { phase: root.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase'), key: root.querySelector('[data-animation-key]')?.getAttribute('data-animation-key'),
        actors: [...root.querySelectorAll('.battle-stage .resource-stage')].map(element => ({ action: element.getAttribute('data-action'), clip: element.getAttribute('data-clip'), frame: element.querySelector('.resource-sprite-host')?.getAttribute('data-frame'), textureFrame: element.querySelector('.resource-sprite-host')?.getAttribute('data-texture-frame'), texture: element.querySelector('.resource-sprite-host')?.getAttribute('data-frame-texture'), fallback: element.getAttribute('data-fallback') })),
        events: [...root.querySelectorAll('[data-event-kind]')].map(element => ({ kind: element.getAttribute('data-event-kind'), text: element.textContent })) };
      const next = JSON.stringify(state); if (next !== previous && observations.length < 1500) { observations.push({ ms: performance.now() - begun, ...state }); previous = next; }
    };
    const observer = new MutationObserver(sample); observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true }); sample();
    window.__rootBattleAcceptance = { observations, stop: () => observer.disconnect() };
  });
  try {
    await page.locator(`.battle-move.${action}`).click();
    await page.waitForFunction(() => window.__rootBattleAcceptance.observations.some(value => value.phase !== 'rest'));
    if (screenshot) { await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'impact'); await page.screenshot({ path: join(output, `${label}-impact.png`) }); }
    await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
    const observations = await page.evaluate(() => window.__rootBattleAcceptance.observations);
    const after = await invoke('battle', 'snapshot', { sessionId: session.id }), round = after.rounds.at(-1);
    const phases = [...new Set(observations.map(value => value.phase))];
    check(`${label}:actual-action-and-timeline`, after.snapshot.round === session.snapshot.round + 1 && round.actions.player === action && ['windup', 'release', 'impact', 'effects', 'rest'].every(phase => phases.includes(phase)) && observations.every(value => value.actors.every(actor => actor.fallback === 'false')), { phases, round, observations });
    for (const [index, side] of ['player', 'enemy'].entries()) if (round.directDamage[side] > 0) {
      const actor = session[side], id = actor.resource?.resourceId || actor.appearance2d;
      if (!resources.has(id)) resources.set(id, (await invoke('resources', 'resolve', { resourceId: id, petId: actor.petId, context: 'battle', action: 'hit' })).resource);
      const resource = resources.get(id), clip = resource.clips.find(clip => clip.name === resource.actions.hit);
      const region = resource.atlas.frames[clip.frameNames[0]].frame, expected = [region.x, region.y, region.w, region.h].join(',');
      check(`${label}:${side}:real-hit-texture-at-impact`, observations.some(value => value.phase === 'impact' && value.actors[index]?.textureFrame === expected), { expected, impact: observations.filter(value => value.phase === 'impact').map(value => value.actors[index]) });
    }
    return { after, round, observations };
  } finally { await page.evaluate(() => { window.__rootBattleAcceptance?.stop(); delete window.__rootBattleAcceptance; }); }
}
try {
  await open();
  await invoke('accounts', 'register', { ...credentials, confirmPassword: credentials.password });
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const info = await invoke('app', 'info'); check('verified-scenario', info.scenario?.runId === scenario.runId && info.scenario?.isolated === true, info.scenario);
  let roster = await invoke('companions', 'list');
  for (const template of roster.templates) await invoke('companions', 'adopt', { templateId: template.templateId, name: template.name, showOnDesktop: false, actionId: randomUUID() });
  roster = await invoke('companions', 'list'); proof.roster = roster;
  check('eight-distinct-five-element-instances', roster.templates.length >= 8 && new Set(roster.templates.map(template => template.resource.resourceId)).size === roster.templates.length && ['metal', 'wood', 'water', 'fire', 'earth'].every(element => roster.pets.some(pet => pet.element === element)), roster.templates);
  await route('/companions/adopt'); await page.locator('.cp-adoption-layout').waitFor(); await page.screenshot({ path: join(output, 'eight-adoption.png') });
  for (const element of ['metal', 'wood', 'water', 'fire', 'earth']) {
    const pet = roster.pets.find(pet => pet.element === element);
    let session = await start(pet);
    await inspect(session, `${element}-battle`);
    const ultimate = await act(session, 'ultimate', `${element}-ultimate`, ['wood', 'earth'].includes(element));
    check(`${element}:ultimate-hit-cost-heal`, ultimate.round.actions.enemy === 'dodge' && ultimate.round.directDamage.enemy > 0 && ultimate.round.healEvents.player.some(event => event.amount === 20) && ultimate.after.snapshot.player.anger === 0, ultimate.round);
    const elemental = await act(ultimate.after, 'element_attack', `${element}-element`);
    check(`${element}:trait-feedback`, element === 'water' ? elemental.after.snapshot.enemy.statuses.every(status => !['freeze', 'stun'].includes(status.type)) && elemental.round.visualEvents.some(event => event.kind === 'anger') : elemental.round.visualEvents.some(event => event.kind === 'status'), elemental.round.visualEvents);
  }
  const pet = roster.pets.find(pet => pet.element === 'water');
  let session = await start(pet, 'element_attack');
  let first = await act(session, 'normal_attack', 'normal-interrupt');
  check('interrupt-is-not-dodge', first.round.directDamage.player === 0 && first.round.visualEvents.some(event => event.kind === 'interrupt') && !first.round.visualEvents.some(event => ['miss', 'dodge'].includes(event.kind)), first.round);
  const second = await act(first.after, 'normal_attack', 'repeat-normal');
  check('same-action-replays-new-round', first.observations.some(value => value.phase === 'release') && second.observations.some(value => value.phase === 'release') && first.observations.at(-1).key !== second.observations.at(-1).key, [first.observations.at(-1).key, second.observations.at(-1).key]);
  session = await start(pet, 'normal_attack');
  const dodged = await act(session, 'dodge', 'real-dodge');
  check('dodge-is-real-avoidance', dodged.round.directDamage.player === 0 && dodged.round.visualEvents.some(event => ['miss', 'dodge'].includes(event.kind)) && dodged.observations.some(value => value.actors[0]?.action === 'walk'), dodged.round);
  const beforeRestart = dodged.after;
  await app.close(); app = null; await open(); await invoke('accounts', 'login', credentials);
  await page.getByRole('navigation', { name: '主导航' }).waitFor(); await route(`/battle/session/${encodeURIComponent(beforeRestart.id)}`);
  const recovered = await invoke('battle', 'snapshot', { sessionId: beforeRestart.id });
  await page.waitForTimeout(500);
  check('restart-no-replay-or-extra-round', recovered.snapshot.round === beforeRestart.snapshot.round && JSON.stringify(recovered.snapshot) === JSON.stringify(beforeRestart.snapshot) && await page.locator('[data-animation-phase]').getAttribute('data-animation-phase') === 'rest', { id: recovered.id, round: recovered.snapshot.round });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const disabledRound = recovered.snapshot.round;
  await page.locator('.battle-move.normal_attack').click();
  await page.waitForFunction(async ({ id, round }) => { const result = await window.lingjing.invoke('battle', 'snapshot', { sessionId: id }); return result.ok && result.data.snapshot.round === round + 1; }, { id: recovered.id, round: disabledRound });
  check('reduced-motion-action-finishes', await page.locator('[data-animation-phase]').getAttribute('data-animation-phase') === 'rest', await invoke('battle', 'snapshot', { sessionId: recovered.id }));
  check('no-renderer-errors', proof.errors.length === 0, proof.errors);
  proof.completedAt = new Date().toISOString(); proof.passed = true; save();
  console.log(JSON.stringify({ passed: true, checks: proof.checks.length, output }, null, 2));
} catch (error) {
  proof.failure = String(error); proof.passed = false; save();
  await page?.screenshot({ path: join(output, 'failure.png') }).catch(() => {}); throw error;
} finally { if (app) await app.close(); }
