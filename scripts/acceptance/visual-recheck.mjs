import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const source = resolve(process.argv[2]);
const baseline = JSON.parse(readFileSync(resolve(process.argv[3]), 'utf8'));
const output = resolve(process.argv[4]);
const { _electron: electron } = createRequire(join(source, 'package.json'))('playwright');
mkdirSync(output, { recursive: true });
const hash = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const evidence = {
  startedAt: new Date().toISOString(), source, profile: baseline.profile,
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim(),
  buildFiles: readdirSync(join(source, 'apps/pc-app/dist/ui/assets')).filter(f => /\.(js|css)$/.test(f)).map(file => ({ file, sha256: hash(join(source, 'apps/pc-app/dist/ui/assets', file)) })),
  scope: 'Focused recheck of A01-A12 against actual Electron and the baseline local account; no fake inventory, location, remote service or battle outcome injected.',
  views: [], checks: [], errors: []
};
const env = { ...process.env, PET_USER_DATA_DIR: baseline.profile }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: [source], cwd: source, env });
let page;
const save = () => writeFileSync(join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
const check = (id, passed, details) => evidence.checks.push({ id, passed: Boolean(passed), details });
try {
  page = await app.firstWindow(); page.on('pageerror', error => evidence.errors.push(error.message));
  await page.waitForFunction(() => Boolean(window.lingjing));
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  const size = async (width = 1280, height = 844) => app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setSize(bounds.width, bounds.height), { width, height });
  await size();
  const invoke = async (feature, command, payload = {}) => {
    const result = await page.evaluate(input => window.lingjing.invoke(input.feature, input.command, input.payload), { feature, command, payload });
    if (!result.ok) throw new Error(`${feature}.${command}: ${result.code} ${result.message}`);
    return result.data;
  };
  const capture = async (label, path) => {
    await page.evaluate(path => { location.hash = `#${path}`; }, path);
    await page.waitForTimeout(800); await page.evaluate(async () => { await document.fonts.ready; document.querySelector('.main-content')?.scrollTo(0, 0); });
    const metrics = await page.evaluate(() => {
      const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const style = e => { const s = getComputedStyle(e); return { family: s.fontFamily, fontSize: s.fontSize, weight: s.fontWeight, lineHeight: s.lineHeight, gap: s.gap, marginBottom: s.marginBottom, padding: s.padding, display: s.display, translate: s.translate, transform: s.transform }; };
      const main = document.querySelector('.main-content'), title = document.querySelector('h1');
      const switches = [...document.querySelectorAll('[data-slot="switch"]')].map(e => { const thumb = e.querySelector('[data-slot="switch-thumb"]'); return { state: e.getAttribute('data-state'), track: rect(e), thumb: thumb ? rect(thumb) : null, thumbStyle: thumb ? style(thumb) : null }; });
      const boxes = [...document.querySelectorAll('.garden-item-grid>.garden-item')].map(e => {
        const r = rect(e), all = [...e.querySelectorAll('*')].filter(n => n.getBoundingClientRect().width && n.getBoundingClientRect().height).map(rect);
        const contentBottom = Math.max(r.bottom, ...all.map(x => x.bottom));
        return { name: e.textContent.trim(), rect: r, contentBottom, contentOverflows: contentBottom > r.bottom + 2 };
      });
      const collisions = [];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (Math.min(a.rect.right, b.rect.right) > Math.max(a.rect.x, b.rect.x) + 2 && Math.min(a.contentBottom, b.contentBottom) > Math.max(a.rect.y, b.rect.y) + 2) collisions.push([i, j]);
      }
      const cards = [...document.querySelectorAll('.battle-live-sidebar .card')].map(e => ({ rect: rect(e), style: style(e) }));
      return {
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        title: title ? { rect: rect(title), style: style(title) } : null,
        main: main ? { rect: rect(main), scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, horizontalOverflow: main.scrollWidth > main.clientWidth + 1 } : null,
        switches, inventoryCards: boxes, inventoryCollisions: collisions,
        petChoices: [...document.querySelectorAll('.garden-pet-picker .garden-pet')].map(e => ({ rect: rect(e), style: style(e) })),
        battleCards: cards, battleCardGap: cards.length > 1 ? cards[1].rect.y - cards[0].rect.bottom : null,
        skills: [...document.querySelectorAll('.battle-move')].map(e => ({ text: e.textContent, disabled: e.disabled, rect: rect(e), style: style(e), selected: e.getAttribute('aria-pressed'), classes: e.className })),
        typographyRoles: [...document.querySelectorAll('.main-content h1,.main-content h2,.main-content h3,.cp-skill-row strong,.cp-skill-row p,.battle-move strong,.battle-move small,.garden-item strong,.ac-setting-row strong')].filter(e => e.getBoundingClientRect().width > 0).map(e => ({ tag: e.tagName, text: e.textContent.trim().slice(0, 80), rect: rect(e), style: style(e) })),
        stageResources: [...document.querySelectorAll('.resource-stage')].map(e => ({ resourceId: e.getAttribute('data-resource-id'), action: e.getAttribute('data-action'), status: e.getAttribute('data-status') })),
        statRuleExplanations: [...document.querySelectorAll('.main-content p,.main-content small,.main-content summary')].map(e => e.textContent.trim()).filter(t => /(?:标准|归一|训练).*(?:生命|HP)|(?:生命|HP).*(?:标准|归一|训练)/i.test(t)),
        opacity: getComputedStyle(document.querySelector('.app-page-motion') || document.body).opacity,
        legacy3dCount: document.querySelectorAll('model-viewer').length
      };
    });
    await page.screenshot({ path: join(output, `${label}.png`) });
    evidence.views.push({ label, path, metrics }); save();
    console.log(`RECHECK ${label} title=${metrics.title?.style.fontSize}/${metrics.title?.style.weight} opacity=${metrics.opacity}`);
    return metrics;
  };
  let snapshot = await invoke('companions', 'list');
  for (const t of snapshot.templates.filter(t => !snapshot.pets.some(p => p.templateId === t.templateId))) await invoke('companions', 'adopt', { templateId: t.templateId, name: t.name, showOnDesktop: false, actionId: randomUUID() });
  snapshot = await invoke('companions', 'list');
  evidence.templates = snapshot.templates; evidence.pets = snapshot.pets;
  const resources = await invoke('resources', 'list'); evidence.resources = resources;
  const ids = new Set(snapshot.templates.map(t => t.resource.resourceId));
  check('A07-six-distinct-template-resources', ids.size >= 6, { templates: snapshot.templates.length, distinct: ids.size });
  const first = snapshot.pets[0];
  await capture('01-overview', '/companions');
  await capture('04-detail', `/companions/${first.petId}`);
  await capture('05-adoption', '/companions/adopt');
  const alternate = snapshot.pets.find(p => p.templateId !== first.templateId && /猫|喵|狐/.test(p.name));
  if (alternate) {
    await capture('04-alternate-detail', `/companions/${alternate.petId}`);
    const talk = page.getByRole('button', { name: '聊聊天', exact: true });
    if (await talk.count() === 1) {
      await talk.click(); await page.waitForTimeout(700);
      await capture('10-alternate-chat', '/chat');
    }
  }
  const inventory = await capture('09-inventory', '/inventory');
  check('A04-no-inventory-overlap', inventory.inventoryCards.length > 0 && inventory.inventoryCollisions.length === 0 && inventory.inventoryCards.every(x => !x.contentOverflows), inventory);
  check('A04-pet-choice-height', inventory.petChoices.length > 0 && inventory.petChoices.every(x => x.rect.height >= 100), inventory.petChoices);
  const settings = await capture('14-settings', '/settings');
  const within = settings.switches.every(x => x.thumb && x.thumb.x >= x.track.x && x.thumb.right <= x.track.right + 1 && x.thumb.y >= x.track.y && x.thumb.bottom <= x.track.bottom + 1);
  check('A05-switch-thumb-contained', settings.switches.length > 0 && within, settings.switches);
  await capture('15-ai-settings', '/settings/ai');
  await capture('10-chat', '/chat');
  const discovery = await capture('02-discovery', '/discovery');
  check('A02-discovery-page-insets', discovery.title.rect.x - discovery.main.rect.x >= 20 && discovery.title.rect.y - discovery.main.rect.y >= 20, discovery.title);
  await capture('18-garden', '/garden/plots');
  let battle = (await invoke('battle', 'overview')).session;
  if (!battle || battle.status !== 'active') battle = await invoke('battle', 'startTraining', { petId: first.petId, enemyElement: 'fire', actionId: randomUUID() });
  const combat = await capture('03-battle', '/battle');
  check('A03-battle-card-gap', combat.battleCardGap === null || combat.battleCardGap <= 20, combat.battleCardGap);
  check('A09-core-skills-visible', combat.skills.length === 4 && combat.skills.every(x => x.rect.bottom <= combat.viewport.height && x.rect.y >= 0), combat.skills);
  const maxHp = battle.snapshot?.player?.maxHp;
  const explained = combat.statRuleExplanations.some(t => t.includes(String(maxHp)));
  check('A11-combat-hp-derivation', first.growth?.stats?.hp === maxHp || explained, { companionHp: first.growth?.stats?.hp, actor: battle.snapshot?.player, explanation: combat.statRuleExplanations });
  await size(1440, 900); await capture('03-battle-1440', '/battle'); await capture('04-detail-1440', `/companions/${first.petId}`);
  const primaryTitles = evidence.views.filter(v => !v.label.includes('1440')).map(v => ({ page: v.label, fontSize: v.metrics.title?.style.fontSize, weight: v.metrics.title?.style.weight }));
  const mainTitleSizes = primaryTitles.filter(x => !['14-settings', '15-ai-settings'].includes(x.page)).map(x => Number.parseFloat(x.fontSize));
  check('A01-consistent-page-titles', Math.max(...mainTitleSizes) - Math.min(...mainTitleSizes) <= 2 && primaryTitles.every(x => Number(x.weight) >= 650), primaryTitles);
  const missing = [];
  for (const template of snapshot.templates) {
    const resource = resources.find(r => r.id === template.resource.resourceId);
    for (const action of ['idle', 'blink', 'walk', 'wave', 'eat', 'attack_windup', 'attack_release', 'attack', 'hit', 'skill', 'victory', 'sleep']) {
      const clip = resource?.actions?.[action];
      if (!clip || !resource.clips.some(c => c.name === clip && (c.frames?.length || c.frameNames?.length))) missing.push({ template: template.name, action });
    }
  }
  check('A08-required-actions-present', missing.length === 0, missing);
  if (alternate) {
    await invoke('battle', 'leave', { sessionId: battle.id, actionId: randomUUID() });
    await invoke('battle', 'selectPet', { petId: alternate.petId, actionId: randomUUID() });
    const alternateBattle = await invoke('battle', 'startTraining', { petId: alternate.petId, enemyElement: 'fire', actionId: randomUUID() });
    await size();
    const alternateView = await capture('03-alternate-battle', '/battle');
    const expected = snapshot.templates.find(t => t.templateId === alternate.templateId)?.resource.resourceId;
    check('A08-alternate-pet-battle-identity', alternateBattle.player.petId === alternate.petId && alternateView.stageResources.some(r => r.resourceId === expected && r.status === 'ready'), { expected, player: alternateBattle.player, stages: alternateView.stageResources });
  }
  check('runtime-no-page-errors', evidence.errors.length === 0, evidence.errors);
  evidence.completedAt = new Date().toISOString(); save();
  console.log(JSON.stringify(evidence.checks.map(x => ({ id: x.id, passed: x.passed })), null, 2));
} catch (error) {
  evidence.failure = String(error); save();
  if (page) await page.screenshot({ path: join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally { await app.close(); }
