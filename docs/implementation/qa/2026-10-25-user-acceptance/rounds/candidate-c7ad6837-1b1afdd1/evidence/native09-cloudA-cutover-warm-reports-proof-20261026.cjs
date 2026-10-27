const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8').replace(/^\uFEFF/,''));
const owner='account:99efc8c1-c420-47f3-9a5c-91aa302d5630',uid='524c5302-19a2-43ec-aa72-b8894bd48efe',device='41de040e-a134-487f-b1d3-76b5254a8f97';
const freeze=read('../candidate-freeze.json'),runtime=read('cloudA-c7ad-actual-runtime-identity-20261026.json'),launch=read('cloudA-c7ad-original-normal-launch-20261026.json'),exited=read('cloudA-original-dc7-normal-exit-before-c7ad-20261026.json');
const labels=['original-dc7-before-close-change','dc7-close-false-single-save-auto-record','c7ad-first-secure-start-before-restore-close','c7ad-resume-before-any-restore-save','c7ad-original-close-true-single-save-auto-record','c7ad-original-close-true-normal-timer-record','c7ad-after-existing-report-first-and-last-replay','c7ad-warm-report-reentry-complete-final'];
const frames=labels.map(l=>read('cloudA-flow-'+l+'-20261026.json')),before=frames[0],after=frames.at(-1),restored=frames[5],preRestore=frames[3];
const settings=f=>f.tables.account_settings.find(r=>r.owner_account_id===owner);
assert.equal(exited.bothOriginalProcessesGone,true);assert.equal(exited.cdpFree,true);
assert.deepEqual([runtime.mainPid,runtime.wrapperPid,runtime.cdpPort],[20308,12788,57218]);assert.equal(runtime.asarSha256,freeze.asar.sha256);assert.ok(runtime.oldMainGone&&runtime.oldWrapperGone&&runtime.cdpOwnedByMain);
assert.equal(launch.wrapperPid,12788);assert.ok(launch.scenarioInjected===false&&launch.runInjected===false&&launch.proxyInjected===false&&launch.portWasFree&&launch.oldMainGone&&launch.oldWrapperGone);
const oldApp=read('cloudA-app-info-original-dc7-before-cutover-20261026.json'),newApp=read('cloudA-app-info-c7ad-warm-report-reentry-complete-final-20261026.json');
assert.equal(oldApp.result.build.sourceCommit,'dc7aee379d0fb241e5c4bd4bf43101fa1a85a678');
assert.equal(newApp.result.build.sourceCommit,freeze.sourceCommit);assert.equal(newApp.result.build.sourceTree,'e021c60cf8bfe120ca5054986f09a0ab521037b3');
for(const app of [oldApp,newApp]){assert.equal(app.result.user.ownerAccountId,owner);assert.equal(app.result.user.authUserId,uid);assert.equal(app.result.scenario,null);assert.equal(app.result.publicSession.persistence,'secure');assert.equal(app.result.publicSession.dataMode,'live');}
assert.equal(settings(before).revision,14);assert.equal(settings(preRestore).revision,15);assert.equal(settings(after).revision,16);assert.equal(settings(before).document,settings(after).document);
for(const f of frames){assert.equal(f.deviceId,device);assert.equal(f.ordinaryProfileNoMarker,true);assert.equal(f.credentialValuesRead,false);assert.equal(f.vaultValuesRead,false);assert.deepEqual(f.tables.companion_pets,before.tables.companion_pets);assert.deepEqual(f.tables.companion_accounts,before.tables.companion_accounts);}
assert.equal(before.tables.companion_pets.filter(p=>p.owner_account_id===owner).length,4);assert.equal(before.tables.companion_pets.length,8);
assert.deepEqual(before.tables.account_settings.filter(r=>r.owner_account_id!==owner),after.tables.account_settings.filter(r=>r.owner_account_id!==owner));
const jobs=after.tables.account_sync_outbox.filter(j=>!before.tables.account_sync_outbox.some(o=>o.action_id===j.action_id));assert.equal(jobs.length,2);
assert.deepEqual(jobs.map(j=>[j.action_id,j.base_revision,j.status,j.attempts,j.last_error]),[['auto:0271accf-03fe-482f-a357-d71a42141c09',30,'verified',0,null],['auto:696bea29-9a54-44bd-b01f-aceabe614e97',31,'verified',0,null]]);
for(const j of jobs)assert.ok(j.verified_at);
for(const old of before.tables.account_sync_outbox)assert.ok(after.tables.account_sync_outbox.some(j=>JSON.stringify(j)===JSON.stringify(old)),'Original outbox row changed');
assert.equal(after.tables.account_sync_state[0].cloud_revision,32);assert.equal(after.tables.account_sync_state[0].last_checksum,jobs[1].checksum);
const bd=JSON.parse(settings(before).document),j1=JSON.parse(jobs[0].document),j2=JSON.parse(jobs[1].document);assert.equal(j1.data.modules.settings.data.desktop.closeToTray,false);assert.deepEqual(j2.data.modules.settings.data,bd);
for(const module of Object.keys(j1.data.modules).filter(k=>k!=='settings'))assert.deepEqual(j1.data.modules[module],j2.data.modules[module]);
const nonAccountCoreExact=Object.keys(before.digests).filter(t=>!t.startsWith('account_')&&!['lingjing_meta','lingjing_resource_files'].includes(t));
for(const t of nonAccountCoreExact)assert.deepEqual(before.digests[t],after.digests[t]);
for(const t of Object.keys(before.digests).filter(t=>t.startsWith('battle_')))assert.deepEqual(before.tables[t],after.tables[t]);
const reportRows=after.tables.battle_reports_v2.map(r=>({owner:r.owner_account_id,id:r.id,sessionId:r.session_id,endedAt:r.ended_at}));
assert.equal(reportRows.filter(r=>r.owner===owner&&r.sessionId==='online-d79b783a-b5a5-4715-8e58-ba95483b2d67').length,1);
const aPet='pet-97410828-fdf6-4253-8246-4c5f389d8fba',bPet='pet-2ec1523d-1a84-43f5-bfdb-c6f50689fc0a';
const uiLabels=['existing-friend-report-first-loaded','existing-friend-report-last-round12-replay','existing-friend-report-warm-reentry-loaded'];
const ui=uiLabels.map(l=>read('cloudA-battle-public-ui-'+l+'-20261026.json'));
for(const frame of ui){assert.equal(frame.result.route,'#/battle/reports');for(const text of ['小狐 vs 小狐','我方编号 0004','对方编号 0005','编号 0004','编号 0005','12 回合','经验 +20','番茄种子 +2'])assert.ok(frame.result.visibleText.includes(text),text);assert.deepEqual([...new Set(frame.result.dataNodes.map(n=>n.petId).filter(Boolean))],[aPet,bPet]);}
assert.ok(ui[1].result.visibleText.includes('第 12 回合'));assert.ok(ui[2].result.visibleText.includes('第 1 回合'));
const detail=read('cloudA-battle-public-ui-original-fox4-detail-loaded-20261026.json');assert.equal(detail.result.route,'#/companions/'+aPet);assert.ok(detail.result.visibleText.includes('编号 0004')&&detail.result.visibleText.includes('20 / 100 经验'));
const changedTables=Object.keys(before.digests).filter(t=>JSON.stringify(before.digests[t])!==JSON.stringify(after.digests[t]));
const warmChangedTables=Object.keys(restored.digests).filter(t=>JSON.stringify(restored.digests[t])!==JSON.stringify(after.digests[t]));
const proof={at:new Date().toISOString(),status:'native_original_cloudA_cutover_restoration_and_warm_report_observation_complete_awaiting_root_independent_review',approvalRef:'root-c7ad-cloudA-normal-cutover-warm-reports-1148',sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,asarSha256:runtime.asarSha256,
 runtime:{mainPid:runtime.mainPid,wrapperPid:runtime.wrapperPid,windowId:6947910,actualExe:runtime.actualExe,cdp:57218,oldMainAndWrapperNormallyExited:true,singleLaunch:true,ordinaryProfileNoMarker:true,noQaScenarioOrRun:true,noProxyOrHelper:true},
 identity:{owner,uid,device,scenario:null,dataMode:'live',persistence:'secure',originalSecureLoginReused:true,credentialValuesRead:false,rememberAndKeepControlsUntouched:true,secureSessionFileMetadataMayRefreshNormally:true},
 settings:{originalRevision:14,temporaryCloseFalseRevision:15,finalRevision:16,finalDocumentRawExact:true,closeToTray:true,syncEnabled:true,volume:70,saves:2},
 generated:jobs.map((j,i)=>({actionId:j.action_id,baseRevision:j.base_revision,cloudRevision:31+i,checksum:j.checksum,status:j.status,attempts:j.attempts,verifiedAt:j.verified_at})),
 retention:{all8OriginalCachedPetsRawExactAcross8Frames:true,originalA4AndB4OwnerRowsRetained:true,bothOwnerSelectionsRawExact:true,otherOwnerSettingsRawExact:true,all13OriginalOutboxRowsRawExact:true,otherAccountSaveModulesExactBetweenTwoSettingsSaves:true,allOriginalBattleRowsRawExact:true,nonAccountCoreExact},
 tableAudit:{count:Object.keys(before.digests).length,changedTables,warmChangedTables,noNewBattleSessions:true,noNewBattleReports:true,noNewRewards:true,battleCounts:Object.fromEntries(Object.keys(before.digests).filter(t=>t.startsWith('battle_')).map(t=>[t,after.digests[t].count])),accountMetadataAndResourcePathRefreshNotClaimedRawExact:true},
 warmReports:{sessionId:'online-d79b783a-b5a5-4715-8e58-ba95483b2d67',reportRows,firstListDetail:true,firstRoundReplay:true,lastRoundReplay:true,leftForOriginalFox4DetailAndReentered:true,uiFrames:ui.map((f,i)=>({label:uiLabels[i],at:f.at})),a:{petId:aPet,name:'小狐',displayNumber:'0004'},b:{petId:bPet,name:'小狐',displayNumber:'0005'},namesAndNumbersPresentInListDetailAndRoundSidebar:true,oldOutcomeAndRewardDisplayPreserved:true},
 limits:{ledgerNotChangedForQA023:true,noNewInvitation:true,noNewBattle:true,noAdoptionOrCapture:true,noHelperStarted:true,noManualSyncRetryMergeOrRestore:true,rootIndependentPgAndMetadataAttributionPending:true,all98CasesNotClaimedPassed:true},
 uiStoppedAt:'#/battle/reports'};
const output=path.join(__dirname,'cloudA-c7ad-native-cutover-settings-restored-and-warm-reports-20261026.json');fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...proof}));
