import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';

// Full production Electron/IPC with a fresh marked QA account. The backup is an
// offline fixture: this proves native persistence, not HTTPS/cloud authority.
const require = createRequire(import.meta.url), root = resolve('.');
const { checksum } = require('../../accounts/util.cjs');
const parent = resolve('artifacts/companions'); mkdirSync(parent, { recursive: true });
const output = mkdtempSync(join(parent, 'backup-desktop-'));
const scenario = JSON.parse(execFileSync(process.execPath, ['scripts/acceptance/create-scenario-profile.mjs'], { cwd: root, encoding: 'utf8', windowsHide: true }));
const env = { ...process.env, ...scenario.env }; delete env.ELECTRON_RUN_AS_NODE;
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const evidence = { at: new Date().toISOString(), output, profile: scenario.profilePath,
  runId: scenario.runId, scenario: scenario.scenario, provenance: 'simulated-local-backup-fixture', realCloudAcceptance: false,
  source: { commit: git(['rev-parse','HEAD']), dirty: git(['status','--porcelain']), windowsSha256: sha256(readFileSync('apps/pc-app/runtime/features/companions/windows.cjs')), mainSha256: sha256(readFileSync('apps/pc-app/dist/main/index.cjs')) }, checks: [], errors: [] };
const account = 'backup_desktop', password = 'Local-backup-native-72!';
let app, page, pet, owner;
const ok = result => { assert.equal(result.ok,true,JSON.stringify(result));return result.data; };
const invoke = (feature,command,payload) => page.evaluate(({feature,command,payload})=>window.lingjing.invoke(feature,command,payload),{feature,command,payload});
async function launch() {
  app = await electron.launch({ args: [root,'--force-device-scale-factor=1'], env });
  for(let i=0;i<120;i++) { page=app.windows().find(candidate=>candidate.url().includes('/dist/ui/index.html')&&!candidate.url().includes('#/desktop/'));if(page)break;await delay(100); }
  assert.ok(page);await page.waitForFunction(()=>Boolean(window.lingjing));
  page.on('pageerror',error=>evidence.errors.push(error.message));
}
const readSaved = () => {const db=new DatabaseSync(join(scenario.profilePath,'lingjing.sqlite'),{readOnly:true});try{db.exec('PRAGMA query_only=ON');return JSON.parse(db.prepare('SELECT data_json FROM companion_pets WHERE owner_account_id=? AND pet_id=?').get(owner,pet.petId).data_json);}finally{db.close();}};
async function nativeState() {
  for(let i=0;i<100;i++) {
    const native=app.windows().find(candidate=>candidate.url().includes(`#/desktop/${pet.petId}`));
    if(native) {
      await native.locator('.resource-stage[data-status="ready"] [data-renderer^="pixi"] canvas').waitFor({timeout:15000});
      const state=await app.evaluate(({BrowserWindow,screen},petId)=>{const win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes(`#/desktop/${petId}`));return{windowId:win.id,bounds:win.getBounds(),visible:win.isVisible(),displays:screen.getAllDisplays().map(d=>({id:String(d.id),area:d.workArea}))};},pet.petId);
      if(state.visible)return {native,state};
    }
    await delay(100);
  }
  throw new Error('Native companion window did not become ready');
}
async function exportTo(file) {
  await app.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path});},file);
  ok(await invoke('accounts','backupExport'));
  return JSON.parse(readFileSync(file,'utf8'));
}
async function restoreFrom(file,actionId) {
  await app.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]});},file);
  const preview=ok(await invoke('accounts','backupPreview'));
  return ok(await invoke('accounts','backupRestore',{previewId:preview.previewId,actionId,mode:'replace'}));
}
try {
  await launch();
  ok(await invoke('accounts','register',{provider:'local',account,password,confirmPassword:password,username:'位置恢复验收',rememberSession:false}));
  const state=ok(await invoke('companions','list'));owner=state.ownerAccountId;
  pet=ok(await invoke('companions','adopt',{actionId:'native-position-adopt',templateId:'big-fish-gentle',name:'原坐标鱼丸',showOnDesktop:true})).pet;
  ok(await invoke('companions','desktop',{actionId:'stationary-mode',petId:pet.petId,behavior:'quiet'}));
  const beforeNative=(await nativeState()).state;
  const baseline=await exportTo(join(output,'original.lingjing.json'));
  const rows=baseline.data.modules.companions?.data.tables.companion_pets || baseline.data.tables.companion_pets.rows;
  const row=rows.find(row=>row.pet_id===pet.petId), saved=JSON.parse(row.data_json);
  const originalPosition={x:-2145,y:188,displayId:'original-disconnected-display'};
  // A restore can intentionally replace divergent data at the same pet revision.
  saved.desktop.position=originalPosition;row.data_json=JSON.stringify(saved);
  const {checksum:old,...body}=baseline;void old;baseline.checksum=checksum(body);
  const fixture=join(output,'restored-monitor-fixture.lingjing.json');writeFileSync(fixture,JSON.stringify(baseline));
  await restoreFrom(fixture,'native-restore-monitor');
  let native=await nativeState();assert.notEqual(native.state.bounds.x,originalPosition.x);
  await delay(5600);assert.deepEqual(readSaved().desktop.position,originalPosition);
  native=await nativeState();assert.notDeepEqual(native.state.bounds,beforeNative.bounds,'Same-revision restore must update the existing native window');
  evidence.checks.push('Existing real window applies a same-revision restored off-screen position without persisting local clamp after the five-second save timer');
  evidence.afterRestore={savedPosition:readSaved().desktop.position,native:native.state};
  await app.close();app=null;assert.deepEqual(readSaved().desktop.position,originalPosition);
  await launch();ok(await invoke('accounts','login',{provider:'local',account,password,rememberSession:false}));
  ok(await invoke('companions','list'));native=await nativeState();await delay(5600);
  assert.deepEqual(readSaved().desktop.position,originalPosition);
  assert.equal(readSaved().petId,pet.petId);assert.equal(readSaved().name,pet.name);
  evidence.checks.push('Reopened real Electron process preserves original pet ID/name/coordinates while deriving on-screen bounds');
  await native.native.screenshot({path:join(output,'restored-native-window.png')});
  // An actual drag through production IPC must still persist its chosen bounds.
  ok(await invoke('companions','desktopInput',{petId:pet.petId,action:'drag-start',screenX:100,screenY:100}));
  ok(await invoke('companions','desktopInput',{petId:pet.petId,action:'drag-move',screenX:200,screenY:180}));
  ok(await invoke('companions','desktopInput',{petId:pet.petId,action:'drag-end'}));
  const dragged=readSaved();assert.notDeepEqual(dragged.desktop.position,originalPosition);
  evidence.afterDrag={savedPosition:dragged.desktop.position,native:(await nativeState()).state};
  assert.equal(evidence.afterDrag.savedPosition.x,evidence.afterDrag.native.bounds.x);
  assert.equal(evidence.afterDrag.savedPosition.y,evidence.afterDrag.native.bounds.y);
  evidence.checks.push('Intentional drag through production IPC persists the new coordinates');
  assert.deepEqual(evidence.errors,[]);evidence.passed=true;
}catch(error){evidence.passed=false;evidence.failure={message:error.message,stack:error.stack};throw error;}
finally{if(app)await app.close();writeFileSync(join(output,'evidence.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({output,passed:evidence.passed,checks:evidence.checks,failure:evidence.failure?.message}));}
