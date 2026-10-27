const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const qa=path.resolve(__dirname,'../../..');
const before=JSON.parse(fs.readFileSync(path.join(__dirname,'native09-cloudA-before-native-B-switch-20261026.json'),'utf8'));
const after=JSON.parse(fs.readFileSync(path.join(__dirname,'native09-cloudA-after-native-B-logout-return-A-complete-20261026.json'),'utf8'));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const sort=x=>x.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const bOwner='account:e1c9004a-2b10-4ff0-8d9e-b338d49ad3d6';
const db=new DatabaseSync(path.join(after.profile,'lingjing.sqlite'),{readOnly:true});
const aScope={},bRows={};let bSettings;
try{
 db.exec('PRAGMA query_only=ON');
 for(const t of Object.keys(before.tables).filter(t=>/^(battle_|companion_|conversation_|discovery_|garden_|lingjing_resource)/.test(t)&&t!=='conversation_credentials')){
  const cols=db.prepare('PRAGMA table_info('+quote(t)+')').all().map(c=>c.name);
  const safe=cols.filter(c=>!/(encrypted|password|proof|token|secret|private_key)/i.test(c));
  const owned=cols.includes('owner_account_id');
  const rows=db.prepare('SELECT '+safe.map(quote).join(',')+' FROM '+quote(t)+(owned?' WHERE owner_account_id=? OR owner_account_id IS NULL':'')).all(...(owned?[before.owner]:[]));
  aScope[t]={count:rows.length,exactBefore:hash(sort(rows))===before.tables[t].sha256};
  if(owned)bRows[t]=db.prepare('SELECT count(*) n FROM '+quote(t)+' WHERE owner_account_id=?').get(bOwner).n;
 }
 bSettings=db.prepare('SELECT owner_account_id,revision,document FROM account_settings WHERE owner_account_id=?').all(bOwner);
}finally{db.close();}
const base='rounds/candidate-dc7aee3-1b1afdd1/evidence/';
const rel=base+'a11-native-A-B-A-restored-complete-await-root-20261026.json';
const report={at:new Date().toISOString(),profile:after.profile,mainPid:11360,windowId:655548,port:57218,ownerAccountA:before.owner,authUserA:'524c5302-19a2-43ec-aa72-b8894bd48efe',deviceId:'41de040e-a134-487f-b1d3-76b5254a8f97',originalBSession:'4f247eb2-7a31-4329-b5dc-218df195621a',nativeBReadonlyChatEmpty:true,nativeBReportsDisplayed:false,nativeBReportsState:'正在准备… / 重试',nativeBReportsRetryClicked:false,nativeBSettingsSyncOff:true,nativeBLogoutOnce:true,nativeBClearedPrivateViews:true,nativeReturnALoginOnce:true,credentialOriginalAFileOneRamRead:true,passwordNotOutputOrHashedOrMeasuredOrSaved:true,rememberRestoredTrue:true,keepRestoredTrue:true,closeToTrayOriginalTrueRetained:true,settingsSaveDuringReturn:0,originalA4PetsAndNumbersVisible:true,nativeNoBPetsInA:true,nativeOriginalADesktopFoxRestored:true,aPetsExact:JSON.stringify(before.pets)===JSON.stringify(after.pets),aSelectionsExact:JSON.stringify(before.selections)===JSON.stringify(after.selections),aSettingsExact:JSON.stringify(before.settings)===JSON.stringify(after.settings),aScope,allAProtectedExact:Object.values(aScope).every(s=>s.exactBefore),bNewLocalRows:bRows,bSettings,qualification:'B began with zero local pets and later product background hydration added four existing B-owned pets and historical records while only normal readonly routes were visited. No confirmation, retry, new reward command, or manual apply. This is not a full B cloud-download pass.',rootBPhysicalCleanupPending:true,rootNewASessionAndBusinessReviewPending:true,casePassed:false,screenshots:['a11-native-B-chat-empty-no-A-history-20261026.png','a11-native-B-report-scope-limited-settled-20261026.png','a11-native-B-own-sync-off-before-normal-logout-20261026.png','a11-native-B-normal-logout-once-before-return-A-20261026.png','a11-native-return-A-original-remember-keep-true-20261026.png','a11-native-return-A-four-pets-settled-20261026.png','a11-native-return-A-original-close-to-tray-settings-restored-20261026.png']};
fs.writeFileSync(path.join(qa,rel),JSON.stringify(report,null,2)+'\n');
const m=require(path.join(qa,'manage-qa.cjs'));
m.updateCase('A11','running','原A物理档案正常A退出→B登录：B身份、syncfalse、空chat独立，战报页因受限停准备/重试，未操作重试。后台随后自动载入原B4宠/历史且全部ownerB，没确认/强制apply或伪造奖励。正常B退出一次→原A登录一次，原4宠/数字/桌面狐、设置14及所有A归属raw/选择/历史exact；remember/keep/close原true恢复。A11可见隔离路径已执行，等Root B物理会话清理/新A与完整业务复核后终判，不把B受限下载当通过。',[rel,...report.screenshots.map(f=>base+f)]);
const sessionPath=path.join(qa,'active-session.json');
const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
session.phase='A11-return-A-original-data-restored-await-root-final-readback';
session.uiRoute='Original CloudA account A #/settings; 4 original pets/desktop1 restored; LocalA wild2303 round0 retained';
session.resume.a11={at:report.at,proof:rel,nativeABAComplete:true,rootAfterPending:true,casePassed:false};
session.resume.cloudBInA.loggedOutNormally=true;
session.resume.cloudBInA.backgroundBHydrationObserved=true;
session.resume.cloudA.finalRemember=true;session.resume.cloudA.finalKeep=true;session.resume.cloudA.finalCloseToTray=true;
for(const restoration of session.requiredRestorations){if(restoration.field==='keepSignedIn'&&restoration.scope?.includes('CloudA'))Object.assign(restoration,{current:true,restored:true,restoredAt:report.at,proof:rel});}
fs.writeFileSync(sessionPath,JSON.stringify(session,null,2)+'\n');
console.log(JSON.stringify({proof:rel,allAProtectedExact:report.allAProtectedExact,aSettingsExact:report.aSettingsExact,aPetsExact:report.aPetsExact,bPetRows:bRows.companion_pets,rootAfterPending:true}));
