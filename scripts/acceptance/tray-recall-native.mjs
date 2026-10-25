import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = resolve('.'), output = resolve(`artifacts/foundation/cloud-engineering/tray-native/run-${Date.now()}`); mkdirSync(output, { recursive: true });
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { encoding: 'utf8' }));
const helper = resolve('apps/pc-app/runtime/core/tray-recall.cjs'), entry = join(output, 'entry.cjs');
writeFileSync(entry, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(scenario.profilePath)});globalThis.trayRecall=require(${JSON.stringify(helper)}).recallDesktopCompanions;globalThis.trayAssert=require('node:assert/strict');globalThis.trayChecks=[];app.whenReady().then(()=>{globalThis.controlWindow=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});void controlWindow.loadURL('data:text/html,<title>Isolated native tray control fixture</title>');});app.on('window-all-closed',()=>{});`);
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE;
const proof = { at: new Date().toISOString(), scope: 'Actual Electron BrowserWindow/MenuItem control with explicitly simulated deferred companion responses/session identities. No real cloud, production-menu or final portable claim.', scenario,
  helperSha256: createHash('sha256').update(readFileSync(helper)).digest('hex'), checks: [] };
let app;
try {
  app = await electron.launch({ args: [entry], cwd: root, env }); await app.firstWindow();
  proof.runtime = await app.evaluate(() => ({ electron: process.versions.electron, node: process.versions.node }));
  proof.checks = await app.evaluate(async ({ BrowserWindow, Menu }) => {
    const check = globalThis.trayAssert;
    async function run(mode) {
      const open = new Map(), closed = [], warnings = []; let owner = 'owner-a', resolveCommand, rejectCommand;
      const make = () => new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      const a = make(), b = make(); open.set('pet-a', a); open.set('pet-b', b);
      const response = new Promise((resolve, reject) => { resolveCommand = resolve; rejectCommand = reject; }); let pending;
      const services = { session: { getOwnerAccountId: () => owner },
        windows: { get: id => open.get(id), close: id => { closed.push(id); open.get(id)?.close(); } },
        events: { emit: (name, value) => warnings.push({ name, value }) },
        get: () => ({ getDesktopWindows: () => [{ ownerAccountId: 'owner-a', petId: 'pet-a', windowId: a.id }, { ownerAccountId: 'owner-b', petId: 'pet-b', windowId: b.id }], recallAll: () => response }) };
      const menu = Menu.buildFromTemplate([{ id: 'recall', label: '收起桌面伙伴', click: () => { pending = globalThis.trayRecall(services, 'original-intent'); } }]);
      let replacement;
      try {
        menu.getMenuItemById('recall').click();
        check.equal(a.isDestroyed(), false); check.equal(b.isDestroyed(), false); check.deepEqual(closed, []);
        if (mode === 'failure') rejectCommand(new Error('PRIVATE-PROVIDER-TOKEN'));
        else { if (mode === 'switched') owner = 'owner-b'; if (mode === 'replaced') { a.destroy(); replacement = make(); open.set('pet-a', replacement); } resolveCommand({ ok: true }); }
        const result = await pending;
        if (mode === 'success') {
          for (let count = 0; count < 40 && !a.isDestroyed(); count++) await new Promise(done => setTimeout(done, 25));
          check.equal(a.isDestroyed(), true); check.deepEqual(closed, ['pet-a']); check.equal(result.ok, true);
        } else if (mode === 'failure') {
          check.equal(a.isDestroyed(), false); check.equal(result.ok, false); check.equal(warnings[0]?.value.code, 'COMPANION_RECALL_UNCONFIRMED');
          check.ok(!JSON.stringify(warnings).includes('PRIVATE-PROVIDER-TOKEN')); check.deepEqual(closed, []);
        } else if (mode === 'switched') { check.equal(a.isDestroyed(), false); check.equal(result.code, 'SESSION_CHANGED'); check.deepEqual(closed, []); }
        else { check.equal(replacement.isDestroyed(), false); check.deepEqual(closed, []); }
        check.equal(b.isDestroyed(), false);
        globalThis.trayChecks.push({ mode, passed: true, originalWindowIds: [a.id, b.id], replacementId: replacement?.id, closed, warnings, result });
      } finally { for (const win of [a, b, replacement].filter(Boolean)) if (!win.isDestroyed()) win.destroy(); }
    }
    for (const mode of ['success','failure','switched','replaced']) await run(mode);
    return globalThis.trayChecks;
  });
  assert.equal(proof.checks.length, 4); assert.ok(proof.checks.every(check => check.passed === true)); proof.passed = true;
  console.log(JSON.stringify({ passed: true, output, checks: proof.checks.length, runtime: proof.runtime }));
} catch (error) { proof.passed = false; proof.failure = String(error); if (app) proof.checks = await app.evaluate(() => globalThis.trayChecks).catch(() => proof.checks); throw error; }
finally { if (app) await app.close().catch(() => {}); proof.completedAt = new Date().toISOString(); writeFileSync(join(output, 'evidence.json'), JSON.stringify(proof, null, 2)); writeFileSync('artifacts/foundation/cloud-engineering/tray-native/latest.json', JSON.stringify(proof, null, 2)); }
