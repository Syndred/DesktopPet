// Actual React battle/report components and CSS with scripted IPC and resource
// rendering boundaries. This is not a native product, live peer or cloud run.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { existsSync, writeFileSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../../../../../..');
const { createBattleDisplayViews } = require(join(root, 'apps/pc-app/runtime/features/battle/display-views.cjs'));
const { BattleRuntimeService, getBattleRules } = require(join(root, 'apps/pc-app/runtime/services/battle-runtime.cjs'));
const owner = 'qa014-render-owner', peer = 'qa014-render-peer', id = randomUUID();
const longNumber = '900719925474099312345678901234567890123456789012345678901234567890';
const ownPet = { petId: 'original-own-pet', petName: '原己方昵称', element: 'water', level: 1, resource: { resourceId: 'builtin:lingjing-xiaohu-v1', kind: '2d' } };
const enemy = { ...ownPet, petId: 'original-peer-pet', petName: '原对方昵称' };
const entry = `
import {createRoot} from 'react-dom/client';
import Battle from './apps/pc-app/ui/src/features/battle/index';
import {ParticipantIdentity} from './apps/pc-app/ui/src/features/battle/identity';
import './apps/pc-app/ui/src/features/battle/battle-v3.css';
const fixture=window.__fixture;window.__calls=[];
// about:blank lacks secure-context randomUUID; use preallocated test action IDs.
if(!crypto.randomUUID)crypto.randomUUID=()=>fixture.actionIds.shift();
window.lingjing={subscribe(){return()=>{};},async invoke(feature,command,payload){window.__calls.push({feature,command,payload});
 if(feature==='resources'&&command==='resolve')return{ok:true,data:{resource:{id:payload.resourceId,kind:'spritesheet'}}};
 if(feature==='battle'&&command==='overview')return{ok:true,data:fixture.overview};
 if(feature==='battle'&&['snapshot','sync','act'].includes(command))return{ok:true,data:fixture.session};
 if(feature==='battle'&&command==='context')return{ok:true,data:null};
 if(feature==='battle'&&command==='selectPet')return{ok:true,data:fixture.session.player};
 if(feature==='battle'&&command==='invitations')return{ok:true,data:{inbound:[],outbound:[]}};
 throw new Error('Unexpected scripted IPC '+feature+':'+command);
}};
const Page=Battle.routes[0].component;
createRoot(document.getElementById('app')).render(<><Page/><aside className="identity-narrow-probe" style={{width:180}}><ParticipantIdentity pet={fixture.session.enemy}/><ParticipantIdentity pet={fixture.practice.enemy}/><ParticipantIdentity pet={fixture.guardian.enemy}/><ParticipantIdentity pet={fixture.legacy.enemy}/></aside></>);
`;
async function main() {
  const runId = randomUUID(), directory = join(root, 'artifacts/qa/qa014-render', runId); mkdirSync(directory, { recursive: true });
  const rules = getBattleRules(), engine = new BattleRuntimeService(); engine.reset({ playerElement: 'water', enemyElement: 'water' }); const turn = engine.act('normal_attack');
  const raw = { id: 'online-' + id, mode: 'friend', status: 'active', side: 'host', room: { id, host_user_id: owner, guest_user_id: peer, host_pet_id: ownPet.petId, guest_pet_id: enemy.petId },
    player: ownPet, enemy, snapshot: turn.state, rounds: [{ ...turn.roundResult, state: turn.state }], rules, historyComplete: true, context: { cloudUserId: owner }, startedAt: '2026-10-25T10:00:00Z' };
  const registry = new Map([['accounts', { privateSession: () => ({ authKind: 'supabase' }) }], ['companions', { readIdentityPet: () => ({ ownerAccountId: owner, petId: ownPet.petId, templateId: 'animal-white-fox', name: ownPet.petName, globalSerial: '7' }) }],
    ['garden', { getBattleSerialViews: async input => ({ format: 'lingjing.territory.serial-views', version: 1, ownerAccountId: owner, namespace: 'qa:render', sessions: input.sessions.map(subject => ({ sessionId: subject.sessionId, player: null, enemy: null, enemyKind: 'guardian' })) }) }]]);
  const services = { session: { getOwnerAccountId: () => owner }, get: name => registry.get(name), events: { emit() {}, on() { return () => {}; } } };
  const online = { cloudProvider: () => {}, onEvent: () => () => {}, invoke: async (_op, input) => ({ format: 'lingjing.battle.serial-views', version: 1, ownerAccountId: owner, namespace: 'qa:render', rooms: input.roomIds.map(roomId => ({ roomId, roomRevision: '3', participants: [
    { side: 'host', ownerAccountId: owner, petId: ownPet.petId, templateId: 'animal-white-fox', globalSerial: '7' }, { side: 'guest', ownerAccountId: peer, petId: enemy.petId, templateId: 'animal-white-fox', globalSerial: longNumber }
  ] })) }) };
  const views = createBattleDisplayViews({ services, online, prepareOnline() {} });
  let data;
  try {
    const session = await views.project(raw, owner), report = await views.project({ ...structuredClone(raw), sessionId: raw.id, status: 'finished', winner: 'player', endedAt: '2026-10-25T10:05:00Z' }, owner);
    const practice = await views.project({ ...structuredClone(raw), mode: 'training', enemy: { ...enemy, petId: 'training-water' } }, owner);
    const guardian = await views.project({ ...structuredClone(raw), id: 'btl-original-guardian', mode: 'territory', enemy: { ...enemy, petId: 'guardian:original-cell', petName: '五行守卫' } }, owner);
    const legacy = await views.project({ ...structuredClone(raw), mode: 'duel', enemy: { ...enemy, petName: '旧报告对手名' } }, owner);
    data = { session, practice, guardian, legacy, actionIds: Array.from({length:10}, () => randomUUID()), overview: { session, rules, pets: [{ ...ownPet, displayIdentity: session.player.displayIdentity }], selectedPetId: ownPet.petId, reports: [report], opponents: [], online: { enabled: false } } };
  } finally { views.dispose(); }
  const built = await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, outdir: directory,
    jsx: 'automatic', platform: 'browser', format: 'iife', loader: { '.png': 'dataurl' }, alias: { '@': join(root, 'apps/pc-app/ui/src') }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
    plugins: [{ name: 'resource-render-fixtures', setup(builder) {
      builder.onResolve({ filter: /\/resources\/Resource(?:Stage|Portrait)$/ }, args => ({ path: args.path.endsWith('ResourceStage') ? 'stage' : 'portrait', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'stage' ? 'export function ResourceStage(){return <span data-resource-fixture="stage"/>;}' : 'export function ResourcePortrait(){return <span data-resource-fixture="portrait"/>;}', loader: 'tsx', resolveDir: root }));
    } }] });
  const js = built.outputFiles.find(file => file.path.endsWith('.js')).text, css = built.outputFiles.find(file => file.path.endsWith('.css')).text;
  const executablePath = existsSync(chromium.executablePath()) ? chromium.executablePath() : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath }); const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  await context.route(/^https?:/, route => route.abort()); const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  const checks = [];
  async function visibleHud() {
    await page.waitForFunction(() => {
      const node = document.querySelector('.battle-arena-top');
      if (!node || node.getBoundingClientRect().width === 0) return false;
      for (let parent = node; parent; parent = parent.parentElement) if (Number(getComputedStyle(parent).opacity) < 0.99) return false;
      return true;
    });
  }
  async function mount(path) {
    await page.goto('about:blank#' + path); await page.setContent('<!doctype html><html><body style="margin:0"><main id="app"></main></body></html>');
    await page.addStyleTag({ content: css }); await page.evaluate(value => { window.__fixture = value; }, data); await page.addScriptTag({ content: js });
  }
  try {
    await mount('/battle/session/' + raw.id); await page.locator('[data-battle-screen]').waitFor(); await visibleHud();
    const hud = page.locator('.battle-arena-top');
    await page.waitForFunction(number => [...document.querySelectorAll('.battle-arena-top .battle-identity-number')].some(node => node.textContent.includes(number)), longNumber);
    assert.ok((await hud.innerText()).includes('编号 0007')); assert.ok((await hud.innerText()).includes('编号 ' + longNumber));
    checks.push({ id: 'actual-both-HUD-identities', passed: true });
    const probe = page.locator('.identity-narrow-probe'); assert.ok((await probe.innerText()).includes('陪练')); assert.ok((await probe.innerText()).includes('守卫'));
    assert.equal((await probe.innerText()).includes('模板角色'), false);
    assert.ok((await probe.innerText()).includes('旧报告对手名')); assert.ok((await probe.innerText()).includes('编号 待同步'));
    checks.push({ id: 'unconfirmed-legacy-template-preserves-readable-historical-name', passed: true });
    const widths = await probe.locator('.battle-identity-number').evaluateAll(nodes => nodes.map(node => ({ text: node.textContent.trim(), width: node.clientWidth, scrollWidth: node.scrollWidth, whiteSpace: getComputedStyle(node).whiteSpace })));
    assert.ok(widths.every(value => value.width > 0 && value.scrollWidth <= value.width + 1 && value.whiteSpace === 'normal'));
    checks.push({ id: 'long-decimal-wrap-and-unissued-practice-guardian', passed: true, widths });
    await mount('/battle/reports/' + data.overview.reports[0].id); await page.getByRole('region', { name: '战报详情' }).waitFor();
    for (const selector of ['.battle-report-item', '.battle-result-portraits', '.battle-replay-card']) {
      assert.ok((await page.locator(selector).innerText()).includes('0007')); assert.ok((await page.locator(selector).innerText()).includes(longNumber));
    }
    checks.push({ id: 'actual-report-list-detail-replay-identities', passed: true });
    await page.getByRole('button', { name: '再来一局', exact: true }).click();
    await page.getByRole('button', { name: '继续本场', exact: true }).waitFor();
    const selections = await page.evaluate(() => window.__calls.filter(call => call.feature === 'battle' && call.command === 'selectPet'));
    assert.equal(selections.length, 1); assert.deepEqual(Object.keys(selections[0].payload).sort(), ['actionId', 'petId']); assert.equal(selections[0].payload.petId, ownPet.petId);
    checks.push({ id: 'report-view-does-not-enter-original-selection-command', passed: true, selectionPayload: selections[0].payload });
    await page.getByRole('button', { name: '继续本场', exact: true }).click(); await page.locator('[data-battle-screen]').waitFor();
    assert.equal(await page.locator('[data-battle-screen]').getAttribute('data-session-id'), raw.id); assert.deepEqual(errors, []);
    checks.push({ id: 'QA012-retains-current-session-after-serial-view-report', passed: true, sessionId: raw.id });
    await visibleHud();
    const result = { format: 'lingjing.battle.qa014.component-review', version: 1, checkedAt: new Date().toISOString(), runId, passed: true, checkedCount: checks.length,
      sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim(), rawSessionSha256: createHash('sha256').update(JSON.stringify(raw)).digest('hex'),
      nativeProductLaunched: false, nativeInputPerformed: false, realCloudVerified: false, fullStageVisualAcceptance: false, verificationScope: 'component DOM, identity label wrapping and actual report/navigation callbacks; not complete product appearance', fixtureBoundaries: ['IPC transport', 'private metadata provider inputs', 'ResourceStage/ResourcePortrait pixels', 'application theme and layout shell not mounted', 'about:blank action UUID availability shim'], actualCss: ['battle.css', 'battle-v3.css', 'identity.css'], checks };
    writeFileSync(join(__dirname, 'ui-checks.json'), JSON.stringify(result, null, 2) + '\n'); console.log(JSON.stringify({ passed: true, checkedCount: checks.length, runId, directory }));
  } catch (error) { console.error('SCRIPTED_UI_FAILURE', await page.evaluate(() => ({calls:window.__calls,text:document.body.innerText.slice(0,600)}))); throw error; }
  finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
