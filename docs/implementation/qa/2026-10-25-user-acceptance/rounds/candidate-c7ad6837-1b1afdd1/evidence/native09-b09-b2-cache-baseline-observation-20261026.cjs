const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8').replace(/^\uFEFF/,''));
const before=read('cloudB2-flow-b09-before-only-new-invite-20261026.json'),current=read('cloudB2-authority-flow-b09-existing-authority-cache-attribution-current-20261026.json');
const backupPath='C:/Users/Administrator/Desktop/project/DesktopPet/artifacts/qa/user-acceptance/790f5b6d-a900-4c6f-bb3f-e32237136ed1/cloud-b-second-device-native/accounts/backups/before-cloud-battle-readback-1793017984437-754260fb-4e7e-4610-ae09-60b3648cf28d.lingjing.json';
const bytes=fs.readFileSync(backupPath),backup=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
if(backup.ownerAccountId!==before.owner)throw Error('Backup actor mismatch');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
const normalized=rows=>rows.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(normalized(rows))).digest('hex');
const battle=backup.data.modules.battle.data,observations=[];
for(const [module,table,key] of [['sessions','battle_sessions','id'],['reports','battle_reports_v2','id'],['rewards','battle_reward_receipts','session_id'],['transportJournal','battle_transport_journal','action_id']]){
 const original=battle[module].map(r=>({...r,owner_account_id:before.owner})),now=current.tables[table];
 const oldIds=new Set(original.map(r=>r[key]));
 observations.push({table,backupCount:original.length,beforeCount:before.digests[table].count,currentCount:now.length,backupIds:original.map(r=>r[key]),newIds:now.filter(r=>!oldIds.has(r[key])).map(r=>r[key]),backupWithOwnerMatchesOriginalBeforeDigest:hash(original)===before.digests[table].sha256,allOriginalRowsRawEqualCurrent:original.every(o=>now.some(n=>JSON.stringify(canonical(o))===JSON.stringify(canonical(n))))});
}
const garden=backup.data.modules.garden.data.tables;
const gardenObservation={oldItems:garden.garden_items.map(r=>({item:r.item_id,quantity:r.quantity})),currentItems:current.tables.garden_items.map(r=>({item:r.item_id,quantity:r.quantity})),originalActionIds:garden.garden_actions.map(r=>r.action_id),currentActionIds:current.tables.garden_actions.map(r=>r.action_id),originalReceiptIds:garden.garden_reward_receipts.map(r=>r.receipt_id),currentReceiptIds:current.tables.garden_reward_receipts.map(r=>r.receipt_id),newActionMetadata:current.tables.garden_actions.filter(r=>!garden.garden_actions.some(o=>o.action_id===r.action_id)).map(r=>({id:r.action_id,createdAt:r.created_at}))};
const proof={at:new Date().toISOString(),status:'exact_backup_baseline_observation_not_final_acceptance',readOnly:true,queryOnlySourceReports:true,credentialValuesRead:false,backup:{path:backupPath,createdAt:backup.createdAt,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),excluded:backup.excluded},observations,gardenObservation,
 correction:{priorClaim:'The1to2 cache increase was described as a newly cached original friend battle without first obtaining old row IDs.',withdrawn:true,exactOldBaseline:'The original before-cloud-battle-readback backup contains original friend online-d79 in sessions/reports/rewards. New original training dc8 is the correct candidate addition; exact hashes and independent cloud authority still govern acceptance.',failedVerifierRetained:'native09-b09-natural-expiry-client-proof-original-failed-before-b2-cache-attribution-20261026.cjs',failedVerifierProducedSuccessProof:false,ledgerChanged:false},
 next:'Wait for Root independent original common heads11/21/23 and immutable settlements comparison. Do not edit, clear, roll back, retry, or infer newly issued rewards from hydrated local rows.',nativeUiPausedAt:'#/settings'};
const output=path.join(__dirname,'b09-b2-exact-backup-baseline-observation-and-correction-20261026.json');fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,...proof}));
