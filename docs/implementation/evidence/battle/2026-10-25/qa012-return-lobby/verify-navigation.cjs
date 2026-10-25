// Headless DOM routing regression, not native product acceptance. The actual
// BattlePage, BattleScreen, navigation, hook, bridge and kit are bundled. IPC,
// arena rendering, friends content and reports content are explicit fixtures.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const { build } = require('esbuild');
const { chromium } = require('playwright');
const root = resolve(__dirname, '../../../../../..');
const baseline = '51ec072294f819eea397ad3063fb59cd854a39b5';
const source = 'apps/pc-app/ui/src/features/battle/index.tsx';
const git = (...args) => execFileSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const entry = `
import {createRoot} from 'react-dom/client';
import Battle from './apps/pc-app/ui/src/features/battle/index';
import {usePath} from './apps/pc-app/ui/src/app/navigation';
const fixture=window.__fixture, subscribers=new Map();
window.__qa={calls:[],trace:[location.hash],errors:[],fixture,emitSession(){for(const listener of subscribers.get('app:session')||[])listener({});}};
addEventListener('hashchange',()=>window.__qa.trace.push(location.hash));
window.lingjing={subscribe(name,listener){const list=subscribers.get(name)||new Set();list.add(listener);subscribers.set(name,list);return()=>list.delete(listener);},async invoke(feature,command,payload){
 window.__qa.calls.push({feature,command,payload});
 if(feature==='discovery'&&command==='setExploring')return{ok:true,data:true};
 if(feature!=='battle')throw new Error('Unexpected fixture feature '+feature);
 if(command==='overview')return{ok:true,data:{...fixture.data,session:structuredClone(fixture.session)}};
 if(command==='snapshot'||command==='sync')return{ok:true,data:structuredClone(fixture.session)};
 if(command==='context')return{ok:true,data:fixture.returnTo?{returnTo:fixture.returnTo}:null};
 throw new Error('Unexpected mutation '+command);
}};
const Page=Battle.routes[0].component;
function Host(){const path=usePath();return path.startsWith('/battle')?<Page/>:<p data-testid="outside">{path}</p>;}
createRoot(document.getElementById('app')).render(<Host/>);
`;
const boundaries = {
  BattleArena: `export function BattleArena({session}){return <div data-testid="arena-fixture">{session.id}</div>;} export function BattlePortrait(){return <span/>;}`,
  FriendsPanel: `export function FriendsPanel(){return <div data-testid="friends-fixture"/>;}`,
  ReportsPanel: `export function ReportsPanel({onBack}){return <div data-testid="reports-fixture"><button onClick={onBack}>返回对战中心</button></div>;}`
};
async function bundle(old) {
  return (await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false,
    jsx: 'automatic', format: 'iife', platform: 'browser', loader: { '.css': 'empty' }, alias: { '@': join(root, 'apps/pc-app/ui/src') },
    define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent', plugins: [{ name: 'explicit-routing-fixtures', setup(builder) {
      builder.onResolve({ filter: /^\.\/(BattleArena|FriendsPanel|ReportsPanel)$/ }, args => ({ path: args.path.slice(2), namespace: 'qa012-boundary' }));
      builder.onLoad({ filter: /.*/, namespace: 'qa012-boundary' }, args => ({ contents: boundaries[args.path], loader: 'tsx', resolveDir: root }));
      if (old) builder.onLoad({ filter: /[/\\]features[/\\]battle[/\\]index\.tsx$/ }, () => ({ contents: git('show', `${baseline}:${source}`), loader: 'tsx', resolveDir: join(root, 'apps/pc-app/ui/src/features/battle') }));
    } }] })).outputFiles[0].text;
}
function fixture(mode = 'training', status = 'active', returnTo) {
  const pet = { petId: 'pet-qa012-original', petName: '原伙伴名字', element: 'water', level: 1, appearance2d: 'builtin:lingjing-xiaohu-v1', displayIdentity: { roleName: '小狐', instanceNumber: '0007' } };
  const rules = { maxHp: 120, maxAnger: 100, ultimateAnger: 50, baseDamage: { normal_attack: 10, element_attack: 12, dodge: 0, ultimate: 20 } };
  return { session: { id: 'battle-qa012-original-session', mode, status, player: pet, enemy: { ...pet, petId: 'enemy-qa012-original' }, rules,
    snapshot: { round: 1, player: { hp: 90, anger: 30 }, enemy: { hp: 80, anger: 40 } }, rounds: [{ round: 1, winner: null }], pendingAction: null,
    context: { authority: 'simulated', scenarioId: 'qa012-headless-routing' } }, returnTo,
    data: { pets: [pet], selectedPetId: pet.petId, reports: [], rules, opponents: [], online: { enabled: false } } };
}
async function main() {
  const runId = randomUUID(), directory = join(root, 'artifacts/qa/battle-qa012-routing', runId);
  mkdirSync(directory, { recursive: true });
  const oldBundle = await bundle(true), fixedBundle = await bundle(false), checks = [];
  const executablePath = existsSync(chromium.executablePath()) ? chromium.executablePath() : 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext();
  await context.route(/^https?:/, route => route.abort());
  async function mount(data, content, path = '/battle/session/battle-qa012-original-session') {
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('about:blank#' + path);
    await page.setContent('<!doctype html><html><body><main id="app"></main></body></html>');
    await page.evaluate(value => { window.__fixture = value; }, data);
    await page.addScriptTag({ content });
    await page.waitForFunction(() => window.__qa?.calls.some(call => call.command === 'overview'));
    return { page, errors };
  }
  const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  async function unchanged(page, original) {
    assert.equal(await page.evaluate(() => JSON.stringify(window.__fixture.session)), original);
    const calls = await page.evaluate(() => window.__qa.calls);
    assert.ok(calls.every(call => call.feature === 'discovery' || ['overview', 'snapshot', 'context', 'sync'].includes(call.command)), 'navigation sends no battle mutation');
    return calls;
  }
  try {
    const old = await mount(fixture(), oldBundle);
    await old.page.getByRole('button', { name: '返回', exact: true }).click();
    await old.page.waitForFunction(() => window.__qa.calls.filter(call => call.command === 'snapshot').length >= 2);
    await old.page.locator('[data-battle-screen]').waitFor();
    assert.equal(await old.page.evaluate(() => location.hash), '#/battle/session/battle-qa012-original-session');
    checks.push({ id: 'before-fix-reproduces-return-loop', passed: true, trace: await old.page.evaluate(() => window.__qa.trace), baseline });
    await old.page.close();

    for (const [mode, status, back] of [['training', 'active', '/battle'], ['friend', 'waiting', '/battle/friends']]) {
      const data = fixture(mode, status, back), original = JSON.stringify(data.session), { page, errors } = await mount(data, fixedBundle);
      await page.getByRole('button', { name: '返回', exact: true }).waitFor(); await settle(page);
      await page.getByRole('button', { name: '返回', exact: true }).click();
      await page.getByRole('button', { name: '继续本场', exact: true }).waitFor(); await settle(page);
      assert.equal(await page.evaluate(() => location.hash), '#' + back);
      assert.equal(await page.getByRole('heading', { name: '对战中心', exact: true }).count(), 1);
      assert.equal(await page.getByRole('button', { name: '开始', exact: true }).count(), 0);
      checks.push({ id: `${mode}-return-stays-in-actionable-lobby`, passed: true, path: back, noParallelStartEntry: true });
      await page.getByRole('button', { name: '继续本场', exact: true }).click();
      await page.locator('[data-battle-screen]').waitFor();
      assert.equal(await page.locator('[data-battle-screen]').getAttribute('data-session-id'), data.session.id);
      await page.getByRole('button', { name: '返回', exact: true }).click();
      await page.getByRole('button', { name: '继续本场', exact: true }).waitFor();
      await page.getByRole('tab', { name: '战报', exact: true }).click();
      await page.getByTestId('reports-fixture').waitFor();
      assert.equal(await page.evaluate(() => location.hash), '#/battle/reports');
      await page.getByRole('button', { name: '返回对战中心', exact: true }).click();
      await page.getByRole('button', { name: '继续本场', exact: true }).waitFor();
      const calls = await unchanged(page, original); assert.deepEqual(errors, []);
      checks.push({ id: `${mode}-restores-same-session-and-reports-remain-accessible`, passed: true, originalSession: data.session.id,
        snapshotSha256: hash(original), trace: await page.evaluate(() => window.__qa.trace), commands: calls, noBattleWrites: true });
      await page.close();
    }
    for (const [mode, back] of [['wild', '/discovery'], ['territory', '/garden']]) {
      const data = fixture(mode, 'active', back), original = JSON.stringify(data.session), { page, errors } = await mount(data, fixedBundle);
      await page.getByRole('button', { name: '返回', exact: true }).waitFor(); await settle(page);
      await page.getByRole('button', { name: '返回', exact: true }).click();
      await page.getByTestId('outside').waitFor(); assert.equal(await page.evaluate(() => location.hash), '#' + back);
      await unchanged(page, original); assert.deepEqual(errors, []);
      checks.push({ id: `${mode}-context-return-preserved`, passed: true, path: back, sessionUnchanged: true }); await page.close();
    }
    const empty = fixture(); empty.session = null;
    const { page, errors } = await mount(empty, fixedBundle, '/battle');
    await page.getByRole('button', { name: '开始', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '继续本场', exact: true }).count(), 0); assert.deepEqual(errors, []);
    checks.push({ id: 'no-active-session-keeps-normal-training-entry', passed: true }); await page.close();
    const result = { format: 'lingjing.battle.qa012.directed-routing', checkedAt: new Date().toISOString(), runId, baseline, passed: true, checkedCount: checks.length,
      source, sourceBlob: git('hash-object', `--path=${source}`, source), sourceSha256: hash(readFileSync(join(root, source))),
      fixtureBoundaries: ['scripted IPC and in-memory session', 'arena/portrait rendering', 'friends panel content', 'reports panel content', 'CSS not rendered'],
      actualModules: ['BattlePage/BattleLobby', 'BattleScreen toolbar', 'useBattleSession', 'request bridge', 'hash navigation', 'kit buttons and tabs'],
      nativeProductLaunched: false, nativeInputPerformed: false, originalQaProcessesTouched: false, realCloudVerified: false,
      pending: '09 native repeat on the next frozen candidate', checks };
    writeFileSync(join(__dirname, 'navigation-checks.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checkedCount: checks.length, runId, nativeProductLaunched: false, evidence: join(__dirname, 'navigation-checks.json') }));
  } finally { await context.close(); await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
