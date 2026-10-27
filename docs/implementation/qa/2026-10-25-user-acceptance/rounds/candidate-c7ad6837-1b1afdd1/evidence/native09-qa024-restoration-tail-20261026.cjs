const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8').replace(/^\uFEFF/,''));
const frames={
 login:read('cloudB2-flow-first-normal-login-auto-pull-20261026.json'),
 volume71:read('cloudB2-flow-volume71-saved-before-sync-enable-20261026.json'),
 syncOn:read('cloudB2-flow-normal-sync-enabled-initial-cycle-20261026.json'),
 beforePositive:read('cloudB2-flow-draft106-persisted-base1-before-single-save-20261026.json'),
 positive:read('cloudB2-flow-single-scale106-save-auto-sync-first-record-20261026.json'),
 restoreInitial:read('cloudB2-flow-single-restore105-save-auto-sync-first-record-20261026.json'),
 restored:read('cloudB2-flow-single-restore105-save-normal-timer-record-20261026.json'),
 syncOff:read('cloudB2-flow-sync-restored-false-before-volume70-save-20261026.json'),
 final:read('cloudB2-flow-qa024-original-settings70-syncfalse-restoration-final-20261026.json')
};
const id='866b735a-9351-414f-a797-6bab290144c2',other='ee33b6a6-2bd1-4d79-bbfe-166498a4950f',oldAction='ad163d25-f061-4546-863b-057c680516a7';
const pref=f=>f.tables.lingjing_resource_preference_state.find(r=>r.resource_id===id);
const outbox=(f,id)=>f.tables.lingjing_resource_preference_outbox.find(r=>r.action_id===id);
const settings=f=>f.tables.account_settings[0];
const settingSequence=[frames.login,frames.volume71,frames.syncOn,frames.syncOff,frames.final].map(f=>{const s=settings(f),d=JSON.parse(s.document);return{at:f.at,revision:s.revision,volume:d.desktop.volume,sync:d.sync.enabled};});
assert.deepEqual(settingSequence.map(s=>[s.revision,s.volume,s.sync]),[[3,70,false],[4,71,false],[5,71,true],[6,71,false],[7,70,false]]);
assert.equal(settings(frames.login).document,settings(frames.final).document);
for(const f of Object.values(frames)){
 assert.deepEqual(f.tables.companion_pets,frames.login.tables.companion_pets);
 assert.deepEqual(f.tables.companion_accounts,frames.login.tables.companion_accounts);
 assert.equal(f.ordinaryProfileNoMarker,true);assert.equal(f.credentialValuesRead,false);assert.equal(f.vaultValuesRead,false);
}
assert.equal(frames.login.tables.companion_pets.length,4);
const conflictBefore=outbox(frames.login,oldAction),conflictAfter=outbox(frames.final,oldAction);
assert.equal(conflictBefore.status,'conflict');assert.equal(conflictAfter.status,'superseded');
assert.deepEqual({...conflictBefore,status:'superseded'},conflictAfter);assert.equal(conflictAfter.verified_at,null);
const positive=outbox(frames.final,'0879f2f8-a834-4080-ba2b-d3b284ef943a'),restore=outbox(frames.final,'908592f4-3814-4cd4-b9e8-897b66f6984b');
assert.deepEqual([positive.local_revision,positive.base_revision,positive.status,positive.attempts,positive.last_error],[2,1,'verified',0,null]);
assert.deepEqual([restore.local_revision,restore.base_revision,restore.status,restore.attempts,restore.last_error],[3,2,'verified',0,null]);
assert.ok(positive.verified_at);assert.ok(restore.verified_at);
assert.deepEqual(outbox(frames.positive,positive.action_id),positive);
assert.equal(outbox(frames.restoreInitial,restore.action_id).status,'pending');
assert.deepEqual(outbox(frames.restored,restore.action_id),restore);
assert.equal(frames.final.tables.lingjing_resource_preference_outbox.length,frames.login.tables.lingjing_resource_preference_outbox.length+2);
const originalDoc=JSON.parse(pref(frames.login).document_json),positiveDoc=JSON.parse(positive.document_json),restoredDoc=JSON.parse(restore.document_json);
assert.equal(originalDoc.calibration.desktop.scale,1.05);assert.equal(positiveDoc.calibration.desktop.scale,1.06);positiveDoc.calibration.desktop.scale=1.05;
assert.deepEqual(positiveDoc,originalDoc);assert.deepEqual(restoredDoc,originalDoc);
assert.equal(pref(frames.final).document_json,pref(frames.login).document_json);
assert.deepEqual([pref(frames.final).local_revision,pref(frames.final).cloud_revision,pref(frames.final).authority_action_id,pref(frames.final).authority_revision],[3,3,'resource-pref:'+restore.action_id,23]);
assert.deepEqual(frames.login.tables.lingjing_resource_preferences.find(r=>r.resource_id===other),frames.final.tables.lingjing_resource_preferences.find(r=>r.resource_id===other));
const targetBefore=frames.login.tables.lingjing_resource_preferences.find(r=>r.resource_id===id),targetFinal=frames.final.tables.lingjing_resource_preferences.find(r=>r.resource_id===id);
assert.deepEqual({...targetBefore,revision:3},targetFinal);
const ignoredVerifiedAt=r=>Object.fromEntries(Object.entries(r).filter(([k])=>k!=='verified_at'));
assert.deepEqual(ignoredVerifiedAt(frames.login.tables.lingjing_resource_preference_state.find(r=>r.resource_id===other)),ignoredVerifiedAt(frames.final.tables.lingjing_resource_preference_state.find(r=>r.resource_id===other)));
for(const t of ['account_sync_state','account_sync_outbox','account_sync_sources','account_sync_baselines','account_sync_checkpoints'])assert.deepEqual(frames.login.tables[t],frames.final.tables[t]);
const changedTables=Object.keys(frames.login.digests).filter(t=>JSON.stringify(frames.login.digests[t])!==JSON.stringify(frames.final.digests[t]));
assert.deepEqual(changedTables,['account_actions','account_settings','lingjing_resource_cloud_downloads','lingjing_resource_cloud_receipts','lingjing_resource_preference_cache','lingjing_resource_preference_outbox','lingjing_resource_preference_state','lingjing_resource_preferences']);
const generated=j=>{const state=j===positive?pref(frames.positive):pref(frames.final);return{actionId:j.action_id,localRevision:j.local_revision,baseRevision:j.base_revision,status:j.status,attempts:j.attempts,verifiedAt:j.verified_at,cloudPreferenceRevision:state.cloud_revision,authorityAction:state.authority_action_id,authorityRevision:state.authority_revision,authorityChecksum:state.authority_checksum};};
const proof={at:new Date().toISOString(),status:'client_roundtrip_and_full_original_settings_restoration_verified_awaiting_independent_cloud',sourceCommit:'c7ad6837e1569dafd942528f375062debf714c2b',approvalRef:'root-c7ad-qa024-positive-restore-tail-1125',resourceId:id,
 native:{positiveSaveCount:1,restoreSaveCount:1,restoreInput:'Focus verified as size1.06; one native Left produced1.05; one Save',syncRestoration:'One normal account switch true to false while volume71, before volume restoration',volumeRestoration:'Keyboard focus verified volume71; one Left to70; one normal Save',manualSyncCount:0,manualRetryCount:0,backupRestoreCount:0,mergeCount:0,backgroundDraftNotice:'Both dirty resource drafts received another-window-update notice during ordinary pump; each sole Save succeeded. Notice retained separately for code triage.',uiStoppedAfterFinalScreenshot:true},
 generated:[generated(positive),generated(restore)],
 settings:{sequence:settingSequence,originalDocumentRawExact:true,finalRevision:7,closeToTray:true},
 retained:{all4PostloginPetsRawExactAcrossAll9Frames:true,companionAccountAndSelectionsRawExact:true,otherResourcePreferenceRawExact:true,targetEntireDocumentOriginalExact:true,originalConflictOnlyStatusChangedToSuperseded:true,originalConflictVerifiedAtStillNull:true,originalPositiveRowRawExact:true,accountSyncStateOutboxSourcesBaselinesCheckpointsRawExact:true},
 tableAudit:{tables:Object.keys(frames.final.digests).length,unchangedDigestOrSensitiveCountTables:Object.keys(frames.final.digests).length-changedTables.length,changedTables,changedCounts:changedTables.map(t=>({table:t,before:frames.login.digests[t].count,after:frames.final.digests[t].count})),sensitiveTablesCountOnly:true},
 limits:{fullAccountSyncComplete:false,accountLocalHead:frames.final.tables.account_sync_state[0].cloud_revision,independentCloudRestoreReceiptPending:true,ledgerNotChanged:true,postloginPetBaseline:'Original cache was legitimately hydrated at login from immutable cloud head21; independent Root provenance file already retained. This proof does not roll back earned XP/win.'},
 evidence:Object.fromEntries(Object.entries(frames).map(([k,f])=>[k,{at:f.at,label:f.label}]))};
const output=path.join(__dirname,'qa024-b2-c7ad-client-roundtrip-original-settings-restored-20261026.json');fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...proof}));
