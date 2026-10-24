import assert from 'node:assert/strict';

/** Read-only observations of the production DOM and public controls. */
export async function inspectBattle(page, { session, screenshot }) {
  const screen = page.locator(`[data-battle-screen="shared-v1"][data-session-id="${session.id}"]`);
  await screen.waitFor();
  assert.equal(await screen.getAttribute('data-battle-mode'), session.mode);
  await screen.locator('.battle-stage .resource-stage[data-status="ready"]').nth(1).waitFor();
  const view = await screen.evaluate(root => {
    const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const box = selector => [...root.querySelectorAll(selector)].map(element => ({ ...rect(element), text: element.textContent?.trim(), font: getComputedStyle(element).fontFamily }));
    return {
      viewport: { width: innerWidth, height: innerHeight }, authority: root.getAttribute('data-authority'),
      arenas: root.querySelectorAll('.battle-arena').length, hud: box('.combatant-status'), moves: box('.battle-move'),
      stages: [...root.querySelectorAll('.battle-stage .resource-stage')].map(element => ({ ...rect(element), resourceId: element.getAttribute('data-resource-id'), action: element.getAttribute('data-action'), clip: element.getAttribute('data-clip'), fallback: element.getAttribute('data-fallback'), canvasCount: element.querySelectorAll('canvas').length })),
      portraits: root.querySelectorAll('.combatant-status [data-framing="portrait"]').length,
      smallCanvasCount: root.querySelectorAll('.combatant-status canvas').length,
      duplicateWildArenas: document.querySelectorAll('.discovery-arena,.discovery-combatants,.discovery-battle-actions').length,
      animation: { phase: root.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase'), key: root.querySelector('[data-animation-key]')?.getAttribute('data-animation-key') },
      displayedText: root.innerText
    };
  });
  assert.equal(view.arenas, 1); assert.equal(view.hud.length, 2); assert.equal(view.stages.length, 2);
  assert.equal(view.portraits, 2); assert.equal(view.smallCanvasCount, 0); assert.equal(view.duplicateWildArenas, 0);
  assert.ok(view.stages.every(stage => stage.canvasCount === 1 && stage.fallback === 'false'));
  for (const [index, side] of ['player', 'enemy'].entries()) {
    const pet = session[side], resourceId = pet.resource?.resourceId || pet.appearance2d || pet.resourceRef;
    if (resourceId) assert.equal(view.stages[index].resourceId, resourceId, `${side} canonical identity`);
  }
  if (session.status === 'active') {
    assert.equal(view.moves.length, 4);
    assert.ok(view.moves.every(move => move.width > 60 && move.bottom <= view.viewport.height + 1));
    assert.ok(Math.max(...view.moves.map(move => move.width)) - Math.min(...view.moves.map(move => move.width)) < 1);
  }
  if (screenshot) await page.screenshot({ path: screenshot });
  return view;
}

/** Records phases, actual resource clips/frames and effect events around one UI click. */
export async function observeBattleAction(page, action) {
  await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
  await page.evaluate(() => {
    const root = document.querySelector('[data-battle-screen="shared-v1"]');
    if (!root) throw new Error('Shared battle screen missing');
    const entries = [], start = performance.now(); let last = '';
    const sample = () => {
      const stage = root.querySelector('[data-animation-phase]');
      const value = { phase: stage?.getAttribute('data-animation-phase'), key: stage?.getAttribute('data-animation-key'),
        actors: [...root.querySelectorAll('.battle-stage .resource-stage')].map(element => { const sprite = element.querySelector('.resource-sprite-host'); return { resourceId: element.getAttribute('data-resource-id'), action: element.getAttribute('data-action'), clip: element.getAttribute('data-clip'), frame: sprite?.getAttribute('data-frame'), frameTexture: sprite?.getAttribute('data-frame-texture'), textureFrame: sprite?.getAttribute('data-texture-frame'), contentBounds: sprite?.getAttribute('data-content-bounds'), fallback: element.getAttribute('data-fallback') }; }),
        events: [...root.querySelectorAll('[data-event-kind]')].map(element => ({ kind: element.getAttribute('data-event-kind'), id: element.getAttribute('data-event-id'), text: element.textContent, icons: [...element.querySelectorAll('svg')].map(icon => icon.getAttribute('class')) })) };
      const key = JSON.stringify(value);
      if (key !== last && entries.length < 1000) { entries.push({ ms: performance.now() - start, ...value }); last = key; }
    };
    const observer = new MutationObserver(sample); observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true }); sample();
    window.__lingjingBattleProbe = { entries, stop: () => observer.disconnect() };
  });
  try {
    await page.locator(`.battle-move.${action}`).click();
    await page.waitForFunction(() => window.__lingjingBattleProbe.entries.some(entry => entry.phase !== 'rest'));
    await page.waitForFunction(() => document.querySelector('[data-animation-phase]')?.getAttribute('data-animation-phase') === 'rest');
    const entries = await page.evaluate(() => window.__lingjingBattleProbe.entries);
    const phases = [...new Set(entries.map(entry => entry.phase))];
    for (const phase of ['windup', 'release', 'impact', 'effects', 'rest']) assert.ok(phases.includes(phase), `Missing animation phase ${phase}`);
    assert.ok(entries.every(entry => entry.actors.every(actor => actor.fallback === 'false')));
    return { action, phases, entries };
  } finally {
    await page.evaluate(() => { window.__lingjingBattleProbe?.stop(); delete window.__lingjingBattleProbe; });
  }
}
