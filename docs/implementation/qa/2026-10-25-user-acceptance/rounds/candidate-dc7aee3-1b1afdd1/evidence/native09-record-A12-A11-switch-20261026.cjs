const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const qa=path.resolve(__dirname,'../../..');
const before=JSON.parse(fs.readFileSync(path.join(__dirname,'native09-cloudA-before-native-B-switch-20261026.json'),'utf8'));
const after=JSON.parse(fs.readFileSync(path.join(__dirname,'native09-cloudA-after-native-B-switch-20261026.json'),'utf8'));
const rootAuthPath='C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/global-serial/root-resume-20261026/bb650b83-9ced-41f1-9a3b-be13d5b7d8e0/native-R-normal-logout-independent-auth.json';
const rootAuth=JSON.parse(fs.readFileSync(rootAuthPath,'utf8'));
if(!rootAuth.r_physical_auth_gone||!rootAuth.r_logout_ledger||!rootAuth.r_core_revoked)throw Error('Root R logout proof incomplete');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const sort=x=>x.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const quote=x=>'"'+x.replaceAll('"','""')+'"';
const aOwner=before.owner,bOwner='account:e1c9004a-2b10-4ff0-8d9e-b338d49ad3d6';
const db=new DatabaseSync(path.join(after.profile,'lingjing.sqlite'),{readOnly:true});
const aScope={},bCounts={};let bSettings,bSelection;
try{
 db.exec('PRAGMA query_only=ON');
 for(const t of Object.keys(before.tables).filter(t=>/^(battle_|companion_|conversation_|discovery_|garden_|lingjing_resource)/.test(t)&&t!=='conversation_credentials')){
  const cols=db.prepare('PRAGMA table_info('+quote(t)+')').all().map(c=>c.name);
  const safe=cols.filter(c=>!/(encrypted|password|proof|token|secret|private_key)/i.test(c));
  const owned=cols.includes('owner_account_id');
  const rows=db.prepare('SELECT '+safe.map(quote).join(',')+' FROM '+quote(t)+(owned?' WHERE owner_account_id=? OR owner_account_id IS NULL':'')).all(...(owned?[aOwner]:[]));
  aScope[t]={count:rows.length,exactBefore:hash(sort(rows))===before.tables[t].sha256};
  if(owned)bCounts[t]=db.prepare('SELECT count(*) n FROM '+quote(t)+' WHERE owner_account_id=?').get(bOwner).n;
 }
 bSettings=db.prepare('SELECT owner_account_id,revision,document FROM account_settings WHERE owner_account_id=?').all(bOwner);
 bSelection=db.prepare('SELECT owner_account_id,revision,selections_json FROM companion_accounts WHERE owner_account_id=?').all(bOwner);
}finally{db.close();}
const proofBase='rounds/candidate-dc7aee3-1b1afdd1/evidence/';
const a12Proof=proofBase+'a12-complete-native-and-root-auth-20261026.json';
fs.writeFileSync(path.join(qa,a12Proof),JSON.stringify({at:new Date().toISOString(),caseId:'A12',candidate:'dc7aee3',nativeRevokedOldOReturnedLogin:true,nativeNormalRLogoutOnce:true,nativePrivateContentCleared:true,nativeBackAttemptStayedLogin:true,rootAuthPath,rootRAuthPhysicalGone:true,rootRCoreRevoked:true,rootRExplicitLogoutLedger:true,rootConfirmedBusinessPreserved:true,keepOriginalTrueRestoreStillRequired:true,passed:true,scope:'This exact DC7 candidate only; later candidate requires appropriate native retest'},null,2)+'\n');
const a11Proof=proofBase+'a11-B-on-A-physical-device-partial-safe-readback-20261026.json';
const report={at:new Date().toISOString(),caseId:'A11',profile:after.profile,physicalDeviceId:'41de040e-a134-487f-b1d3-76b5254a8f97',existingBAccount:'uat_1025_b09_28e3d0',ownerB:bOwner,authUserB:'2028f0af-f501-47f5-9abb-de59487dad46',nativeLoginCount:1,keepSignedIn:false,rememberAccount:true,credentialFileRamReadOnce:true,passwordPrinted:false,passwordHashed:false,passwordLengthMeasured:false,passwordSavedToEvidence:false,profileCreated:false,deviceFileCopied:false,grantExpanded:false,normalBAccountPageVisible:true,bPetPageEmpty:true,bPetPageWarning:'暂时无法连接云端，正在显示本机缓存。',exactTransportErrorNotObserved:true,noAPetsVisible:true,retryClicked:false,downloadConfirmed:false,forcedApply:false,bLogoutAttempted:false,backALoginAttempted:false,aOriginalSettingsExact:JSON.stringify(before.settings)===JSON.stringify(after.settings),aOriginalPetsExact:JSON.stringify(before.pets)===JSON.stringify(after.pets),aOriginalSelectionsExact:JSON.stringify(before.selections)===JSON.stringify(after.selections),aProtectedScope:aScope,allAProtectedExact:Object.values(aScope).every(s=>s.exactBefore),bCounts,bSettings,bSelection,physicalBSessionRootReviewPending:true,caseComplete:false};
fs.writeFileSync(path.join(qa,a11Proof),JSON.stringify(report,null,2)+'\n');
const m=require(path.join(qa,'manage-qa.cjs'));
m.updateCase('A12','passed','原CloudA旧O经正常撤销后原生回登录并提示请重新登录；原生登录R后账号页退出按钮一次即时清私有导航/资料/桌面宠，Alt+Left仍为登录页。Root独立确认R真实Auth行gone、Core revoked与explicit-device-revoke账本，原A/B heads及宠物/历史/资源保持。仅此DC7候选通过；原keeptrue仍待账号切换最后恢复。',[a12Proof,rootAuthPath]);
m.updateCase('A11','running','原CloudA同物理device41正常登录既有B一次，真实账号页显示云验收乙09/正确B账号，keepfalse/remembertrue。B灵宠页0只本机空态及暂时无法连接云端提示，没有A原4宠/桌面内容；未点确认/重试/同步或扩grant。A所有归属业务raw/设置/选择与前基线exact；Root新B会话/隔离复核后再正常退出B并回A，当前未完成整条切换。',[a11Proof,proofBase+'a11-native-existing-B-on-original-A-device-first-result-20261026.png',proofBase+'a11-native-B-companions-settled-scope-boundary-20261026.png']);
const sessionPath=path.join(qa,'active-session.json');
const session=JSON.parse(fs.readFileSync(sessionPath,'utf8'));
session.phase='A11-B-on-original-A-physical-profile-await-root-review';
session.uiRoute='Original CloudA physical profile logged B #/companions; 0 local B pets with cloud warning; LocalA wild2303 round0 preserved';
session.resume.cloudANormalLogout.rootPhysicalAuthCleanupPending=false;
session.resume.cloudANormalLogout.rootProof=rootAuthPath;
session.resume.a12={passed:true,proof:a12Proof,restorationPending:'Original A keeptrue at final approved A login'};
session.resume.cloudBInA={at:report.at,proof:a11Proof,ownerAccountId:bOwner,normalNativeOnce:true,keep:false,remember:true,uiFrozen:true};
const state=m.read('cases.json');
session.counts=Object.fromEntries([...new Set(state.cases.map(c=>c.status))].map(k=>[k,state.cases.filter(c=>c.status===k).length]));
fs.writeFileSync(sessionPath,JSON.stringify(session,null,2)+'\n');
console.log(JSON.stringify({a12:'passed',a11:'running',allAProtectedExact:report.allAProtectedExact,bPetCount:bCounts.companion_pets,bSettings,bSelection,counts:session.counts}));
