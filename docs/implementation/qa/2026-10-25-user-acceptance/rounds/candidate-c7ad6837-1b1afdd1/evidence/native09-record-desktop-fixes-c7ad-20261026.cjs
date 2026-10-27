const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const qa=require(path.resolve(__dirname,'../../../manage-qa.cjs'));
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8').replace(/^\uFEFF/,''));
const freeze=read('../candidate-freeze.json'),before=read('local-flow-qa025-final-original-selection-restored-20261026.json'),after=read('local-flow-d01-p03-all-original-controls-restored-20261026.json');
const desktops=label=>read('desktop-readonly-'+label+'-20261026.json');
const zero=desktops('d01-p03-all-original-controls-restored'),four=desktops('qa016-five-enabled-four-visible'),one=desktops('qa016-p03-five-enabled-limit1-volume0-saved'),reordered=desktops('qa016-reshown-first-waits-second-visible');
const visible=r=>r.state.settings.data.host.windows.filter(w=>w.visible).length;
const enabled=r=>r.state.companions.pets.filter(p=>p.desktop.visible).length;
assert.equal(enabled(four),5);assert.equal(visible(four),4);assert.equal(four.state.companions.desktopDisplay.pets.filter(p=>p.state==='waiting').length,1);
assert.equal(enabled(one),5);assert.equal(visible(one),1);assert.equal(one.state.companions.desktopDisplay.pets.filter(p=>p.state==='waiting').length,4);
assert.equal(one.state.settings.data.document.desktop.volume,0);
assert.equal(desktops('p03-limit4-volume100-zero-visible').state.settings.data.document.desktop.volume,100);
assert.equal(reordered.state.companions.desktopDisplay.pets.find(p=>p.petId==='pet-ea1f0cf6-53c8-4f15-bd01-a8cef01adde3').state,'waiting');
assert.equal(reordered.state.companions.desktopDisplay.pets.find(p=>p.petId==='pet-0cb7dabe-58d2-450e-ab0c-4e39bcffbaca').state,'visible');
assert.equal(desktops('d01-two-enabled-two-visible').state.settings.data.host.windows.filter(w=>w.visible).length,2);
assert.equal(desktops('d01-three-enabled-three-visible').state.settings.data.host.windows.filter(w=>w.visible).length,3);
assert.equal(desktops('d01-four-enabled-four-visible').state.settings.data.host.windows.filter(w=>w.visible).length,4);
assert.equal(enabled(zero),0);assert.equal(visible(zero),0);assert.equal(zero.state.settings.data.host.companionWindows,0);
const geometry=[];
for(const [scale,hwnd] of [[1,4327366],[2,6686700]]){
 const a=desktops('qa015-before-first-drag-scale'+scale).geometry[0],b=desktops('qa015-after-first-drag-scale'+scale).geometry[0];
 const wa=read('native-window-bounds-qa015-before-first-drag-scale'+scale+'-20261026.json').windows.find(w=>w.windowId===hwnd);
 const wb=read('native-window-bounds-qa015-after-first-drag-scale'+scale+'-20261026.json').windows.find(w=>w.windowId===hwnd);
 assert.deepEqual(a.inner,b.inner);assert.deepEqual(a.canvas,b.canvas);assert.deepEqual([wa.width,wa.height],[wb.width,wb.height]);
 assert.deepEqual([wb.left-wa.left,wb.top-wa.top],[-50,30]);assert.equal(a.dpr,b.dpr);assert.equal(a.ready,'complete');assert.equal(b.ready,'complete');
 geometry.push({scale,windowId:hwnd,win32:[wa.width,wa.height],inner:a.inner,canvas:[a.canvas[0].width,a.canvas[0].height],dpr:a.dpr,positionBefore:a.screen,positionAfter:b.screen,outerBefore:a.outer,outerAfter:b.outer});
}
assert.equal(before.tables.account_settings[0].document,after.tables.account_settings[0].document);
assert.equal(after.tables.account_settings[0].revision,before.tables.account_settings[0].revision+3);
assert.equal(before.tables.companion_accounts[0].selections_json,after.tables.companion_accounts[0].selections_json);
assert.equal(after.tables.companion_pets.length,7);
for(const row of before.tables.companion_pets){
 const a=JSON.parse(row.data_json),b=JSON.parse(after.tables.companion_pets.find(r=>r.pet_id===row.pet_id).data_json);
 assert.deepEqual(a.desktop,b.desktop,'Original complete desktop controls differ');
 const strip=p=>{const {revision,updatedAt,...rest}=p;return rest;};assert.deepEqual(strip(a),strip(b),'Pet content changed outside normal control revisions');
}
const changedAllowed=['account_settings','companion_pets','companion_accounts','companion_actions'];
const protectedTables=Object.keys(before.digests).filter(t=>!changedAllowed.includes(t));
for(const table of protectedTables)assert.deepEqual(before.digests[table],after.digests[table],'Protected table changed '+table);
for(const row of before.tables.companion_actions)assert.deepEqual(row,after.tables.companion_actions.find(r=>r.action_id===row.action_id));
const additions=after.tables.companion_actions.filter(r=>!before.tables.companion_actions.some(old=>old.action_id===r.action_id));assert.ok(additions.every(r=>r.operation==='desktop'));
const proof={at:new Date().toISOString(),sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,asarSha256:freeze.asar.sha256,scenario:'Original local simulated QA profile, actual Windows native clicks/drags/keyboard',
  issues:['QA-015','QA-016'],geometry,geometryLimit:'Actual Win32/inner/canvas stable; renderer outer one-DIP variation retained. Electron Main bounds/contentBounds not obtained; no mixed-DPI/multiple-monitor claim.',
  counts:{four:{enabled:5,windows:5,visible:4,waiting:1},one:{enabled:5,windows:5,visible:1,waiting:4},actualReorderedPet:'second original fox visible; first re-opened at end waits',nativeDesktopFilterActualFourOnly:true,unsavedLimitNotApplied:true},
  settings:{legalLimits:[1,2,3,4],savedVolume:[100,0],restoredVolume:70,restoredLimit:3,fullDocumentExact:true,revisionBefore:24,revisionAfter:27,hearingNotClaimed:true},
  restoration:{pets:7,allDesktopFieldsExact:true,allNonRevisionPetContentExact:true,originalSelectionsExact:true,newCapturePetsUntouched:true,protectedTablesExact:protectedTables,newActionsOnlyDesktop:additions.length,hostCompanionWindows:0},
  captureFilenameAudit:'qa015...scale100-restored-before-count-suite was an intended label on a still-200% frame because overlay intercepted main clicks; preserved. Used visible desktop 收回, then qa015...scale100-confirmed-after-native-retract proves100%. p03...before-final-save first frame volume68 corrected by two Right keys to70 before final save.',
  rootReviews:['artifacts/qa/user-acceptance/global-serial/root-resume-20261026/bb650b83-9ced-41f1-9a3b-be13d5b7d8e0/c7ad-qa015-evidence-independent-review.json','artifacts/qa/user-acceptance/global-serial/root-resume-20261026/bb650b83-9ced-41f1-9a3b-be13d5b7d8e0/c7ad-qa016-evidence-independent-review.json']};
const prefix='rounds/candidate-c7ad6837-1b1afdd1/evidence/';
const dimensions=['qa015-c7ad-actual-desktop-fox-before-first-drag-20261026.png','qa015-c7ad-actual-desktop-fox-after-first-drag-20261026.png','qa015-c7ad-actual-scale200-before-first-drag-20261026.png','qa015-c7ad-actual-scale200-after-first-drag-20261026.png',...[1,2].flatMap(s=>['before','after'].flatMap(when=>['desktop-readonly-qa015-'+when+'-first-drag-scale'+s+'-20261026.json','native-window-bounds-qa015-'+when+'-first-drag-scale'+s+'-20261026.json'])),'qa015-c7ad-scale100-confirmed-after-native-retract-20261026.png'].map(f=>prefix+f);
const counts=['d01-c7ad-native-seven-owned-zero-enabled-baseline-20261026.png','d01-c7ad-native-two-enabled-two-visible-20261026.png','d01-c7ad-native-three-enabled-three-visible-20261026.png','d01-c7ad-native-four-enabled-four-visible-20261026.png','qa016-c7ad-native-five-enabled-four-visible-fire-waiting-20261026.png','qa016-c7ad-native-desktop-filter-excludes-waiting-fire-20261026.png','qa016-c7ad-native-settings-actual-four-of-four-20261026.png','qa016-c7ad-native-unsaved-limit1-keeps-applied-four-20261026.png','qa016-p03-c7ad-native-saved-limit1-volume0-actual-one-of-one-20261026.png','qa016-c7ad-native-five-enabled-one-visible-four-waiting-20261026.png','qa016-c7ad-native-reshown-first-waits-actual-second-displays-20261026.png','desktop-readonly-qa016-five-enabled-four-visible-20261026.json','desktop-readonly-qa016-p03-five-enabled-limit1-volume0-saved-20261026.json','desktop-readonly-qa016-reshown-first-waits-second-visible-20261026.json'].map(f=>prefix+f);
const settings=['p03-c7ad-native-only-legal-limits-one-to-four-20261026.png','p03-c7ad-native-limit4-volume100-saved-20261026.png','desktop-readonly-p03-limit4-volume100-zero-visible-20261026.json','p03-c7ad-native-original-limit3-volume70-exact-restored-20261026.png','desktop-readonly-d01-p03-all-original-controls-restored-20261026.json','local-flow-d01-p03-all-original-controls-restored-20261026.json'].map(f=>prefix+f);
for(const f of [...dimensions,...counts,...settings])assert.ok(fs.existsSync(path.join(qa.root,f)),'Missing '+f);
fs.writeFileSync(path.join(__dirname,'desktop-c7ad-native-fixes-and-restoration-verified-20261026.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
const common=prefix+'desktop-c7ad-native-fixes-and-restoration-verified-20261026.json';
function targeted(id,status,actual,evidence){const state=qa.read('cases.json'),row=state.cases.find(r=>r.id===id);assert.notEqual(row.sourceCommit,freeze.sourceCommit,'Already recorded');(row.history ||= []).push({roundId:'candidate-dc7aee3-1b1afdd1',sourceCommit:row.sourceCommit,exeSha256:row.exeSha256,runId:row.runId,status:row.status,actual:row.actual,evidence:row.evidence});Object.assign(row,{sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,verificationRoundId:state.activeRound.id});qa.write('cases.json',state);qa.updateCase(id,status,actual,evidence.concat(common));}
targeted('D01','passed','c7ad现有7宠不新增领养，原生依次1/2/3/4显示；开启第五焰柴时5请求/4实际，焰柴等待空位，桌面筛选仅4。正常保存上限1后设置1/1、主页5开启/1显示、4等待；隐藏第一狐自动补第二，再开启第一时其在队尾等待，public真实host映射/UI一致（QA016已修复）。桌面形象无名字/编号文字。全部7宠desktop完整字段、原选择和settings文档均正常恢复，24保护表digest exact。',counts.concat(settings));
targeted('P03','passed','c7ad原生上限仅1–4；正常保存limit4/volume100与limit1/volume0，实际host/UI上限一致；同第一狐scale1与scale2两档可见尺寸正确，首拖Win32/inner/canvas不变（QA015/016修复）。最终全settings文档精确恢复limit3/volume70，仅合法三次保存rev24→27；原7宠完整desktop字段含scale/behavior/x/y/displayId均恢复，24保护表digest全同。不以截图证明听感；跨屏/混合DPI仍属D05未验范围。',settings.concat(dimensions,counts));
for(const [id,evidence,text]of [['QA-015',dimensions,'同实际c7ad原生首拖，scale1和2各自Win32/inner/canvas保持稳定，实际位移-50/+30；正常恢复原scale1及1343,478。renderer outer1DIP读值差异和不可得Main几何如实保留，Root独立复核通过。'],['QA-016',counts,'原生5开启4实际/5开启1实际、逐宠等待、桌面筛选、未保存设置与重开首狐队尾均正确跟随真实host；原设置与7宠desktop全恢复，Root12项独立复核通过。']])qa.updateIssue(id,{status:'verified',nativeFixVerified:true,verifiedSource:freeze.sourceCommit,verifiedExeSha256:freeze.exe.sha256,verifiedAsarSha256:freeze.asar.sha256,verification:text,verificationEvidence:evidence.concat(settings,common)});
const state=qa.read('cases.json');for(const id of ['D02','D06']){const row=state.cases.find(r=>r.id===id);(row.targetedChecks ||= []).push({at:proof.at,roundId:state.activeRound.id,sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,scope:'QA015 scale1/2 first-drag geometry only; original complete case status/source retained',passed:true,evidence:dimensions.concat(common)});}qa.write('cases.json',state);qa.render();
console.log(JSON.stringify({issuesNativeVerified:proof.issues,casesPassed:['D01','P03'],counts:state.cases.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})}));
