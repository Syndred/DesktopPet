// Deliberately not self-executing without an independently reviewed Root proof path.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
assert.ok(process.argv[2], 'Explicit Root independent acceptance proof required; no ledger changes made');
const qa=require(path.resolve(__dirname,'../../../manage-qa.cjs'));
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8').replace(/^\uFEFF/,''));
const reviewPath=path.resolve(process.argv[2]);
const review=JSON.parse(fs.readFileSync(reviewPath,'utf8').replace(/^\uFEFF/,''));
assert.equal(review.qa024NativeTargetedFixVerified,true,'Root proof must explicitly verify QA024 native targeted fix');
assert.equal(review.entireR06ColdMatrixReplayed,false,'Root proof must retain narrow-versus-full-case layering');
assert.equal(review.fullAccountSyncClaimed,false,'Do not claim full account sync');
assert.ok(review.checks&&Object.keys(review.checks).length===17&&Object.values(review.checks).every(v=>v===true),'All 17 independent checks must be true');
const freeze=read('../candidate-freeze.json');assert.equal(review.sourceCommit,freeze.sourceCommit);
const client=read('qa024-b2-c7ad-client-roundtrip-original-settings-restored-20261026.json');
assert.equal(client.sourceCommit,freeze.sourceCommit);
assert.equal(client.settings.originalDocumentRawExact,true);assert.equal(client.settings.finalRevision,7);
assert.ok(Object.values(client.retained).every(v=>v===true));
assert.deepEqual(client.generated.map(r=>[r.actionId,r.baseRevision,r.localRevision,r.cloudPreferenceRevision,r.authorityRevision,r.status]),[
 ['0879f2f8-a834-4080-ba2b-d3b284ef943a',1,2,2,22,'verified'],
 ['908592f4-3814-4cd4-b9e8-897b66f6984b',2,3,3,23,'verified']
]);
const prefix='rounds/candidate-c7ad6837-1b1afdd1/evidence/';
const files=[
 'cloudB2-c7ad-original-normal-launch-20261026.json','cloudB2-c7ad-actual-runtime-identity-20261026.json',
 'cloudB2-flow-first-normal-login-auto-pull-20261026.json','cloudB2-flow-normal-sync-first-pull-after-timer-20261026.json',
 'qa024-b2-c7ad-single-positive-save-client-verified-20261026.json',
 'qa024-b2-c7ad-single-authorized-scale106-save-first-result-20261026.png',
 'cloudB2-resource-public-ui-single-restore-draft105-before-save-20261026.json',
 'qa024-b2-c7ad-single-restore105-save-first-result-20261026.png',
 'cloudB2-flow-single-restore105-save-normal-timer-record-20261026.json',
 'cloudB2-flow-sync-restored-false-before-volume70-save-20261026.json',
 'qa024-b2-c7ad-original-settings-restored-single-save-20261026.png',
 'cloudB2-flow-qa024-original-settings70-syncfalse-restoration-final-20261026.json',
 'qa024-b2-c7ad-client-roundtrip-original-settings-restored-20261026.json',
 'cloudB2-app-info-qa024-final-original-settings-restored-20261026.json'
];
for(const f of files)assert.ok(fs.existsSync(path.join(__dirname,f)),f);
const state=qa.read('cases.json'),row=state.cases.find(r=>r.id==='R06'),issue=qa.read('issues.json').issues.find(r=>r.id==='QA-024');
assert.equal(state.cases.length,98);assert.equal(state.verificationPolicy.mode,'targeted-preserve');
assert.equal(state.activeRound.sourceCommit,freeze.sourceCommit);assert.notEqual(row.sourceCommit,freeze.sourceCommit);
assert.equal(issue.nativeFixVerified,false);assert.equal(row.status,'failed');
const scope='QA024 only: original B2 same-document conflict safely superseded after ordinary authoritative pull, followed by one base1/local2 scale1.06 save and one base2/local3 original1.05 restoration save, each client verified plus independently confirmed immutable cloud receipts. Original settings and post-login pets/selections preserved. Full cold-download bytes/texture/cloud restore matrix retained under DC7 source, not rerun on c7ad.';
const proof={at:new Date().toISOString(),sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,asarSha256:freeze.asar.sha256,runId:state.activeRound.runId,roundId:state.activeRound.id,resourceId:client.resourceId,verificationScope:scope,fullR06Pass:false,qa024NativeVerified:true,generated:client.generated,settings:client.settings,retained:client.retained,rootIndependentReview:reviewPath,rootIndependentChecks:review.checks,fullAccountSyncComplete:false,originalConflictStatus:'superseded',originalConflictVerifiedAt:null};
const output=path.join(__dirname,'qa024-c7ad-native-narrow-retest-verified-20261026.json');
assert.ok(!fs.existsSync(output),'One-shot recorder already ran');
fs.writeFileSync(output,JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
const evidence=files.map(f=>prefix+f).concat(prefix+path.basename(output),reviewPath);
qa.updateIssue('QA-024',{status:'verified',nativeFixVerified:true,verifiedSource:freeze.sourceCommit,verifiedExeSha256:freeze.exe.sha256,verifiedAsarSha256:freeze.asar.sha256,verification:'原B2普通登录与正常自动pull后，原ad冲突唯一status变为superseded，旧attempt/error/document/verifiedNULL完整保留。仅两次正常偏好Save产生0879 base1/local2与9085 base2/local3，客户端verified与独立云端唯一authority22/23匹配。恢复原1.05、先syncfalse后volume70，settings7原doc、四宠及选择rawexact；无手动重试/立即同步/备份恢复/merge。',verificationEvidence:evidence,productCandidateUnchanged:false});
(row.history ||= []).push({roundId:'candidate-dc7aee3-1b1afdd1',sourceCommit:row.sourceCommit,exeSha256:row.exeSha256,runId:row.runId,status:row.status,actual:row.actual,evidence:row.evidence});
Object.assign(row,{sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,verificationRoundId:state.activeRound.id});
(row.targetedChecks ||= []).push({at:proof.at,roundId:state.activeRound.id,sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,scope,passed:true,evidence});
qa.write('cases.json',state);
qa.updateCase('R06','pending','c7ad定向回验QA024已native verified：原B2正常pull后，原同document/base0冲突ad安全superseded且其余字段与verifiedNULL保留；后续唯一正常1.06保存0879 base1/local2/cloudpref2/full22与唯一原1.05恢复9085 base2/local3/cloudpref3/full23均实际verified、独立云端authority/唯一回执匹配。先正常syncfalse再volume70仅Save一次，完整settings原doc恢复至rev7，四宠与原选择按独立确认的login后baseline逐帧rawexact，另资源偏好不动。原DC7冷恢复字节/owner/纹理广矩阵保留原来源，未在c7ad重跑，因此整R06 pending，仅QA024窄项通过；未称全账户同步完成。',evidence);
console.log(JSON.stringify({output,issue:'QA-024',nativeVerified:true,case:'R06',status:'pending',targetedPassed:true,counts:qa.read('cases.json').cases.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})}));
