const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const qa=require(path.resolve(__dirname,'../../../manage-qa.cjs'));
const read=f=>JSON.parse(fs.readFileSync(path.join(__dirname,f),'utf8').replace(/^\uFEFF/,''));
const freeze=read('../candidate-freeze.json'),state=qa.read('cases.json'),issues=qa.read('issues.json');
assert.equal(state.cases.length,98);assert.equal(state.activeRound.sourceCommit,freeze.sourceCommit);assert.ok(!issues.issues.some(r=>r.id==='QA-027'));
const triage='C:/Users/Administrator/Desktop/project/DesktopPet-fresh-worktrees/07/artifacts/qa/c7-resource-dirty-pull-notice-triage-20261026.md';
const triageBytes=fs.readFileSync(triage),triageText=triageBytes.toString('utf8');
assert.ok(triageText.includes(freeze.sourceCommit)&&triageText.includes('P2')&&triageText.includes('useResources.ts'));
const frameNames=['cloudB2-resource-public-ui-single-native-click-draft106-before-save-20261026.json','cloudB2-resource-public-ui-single-restore-draft105-before-save-20261026.json'];
const observed=frameNames.map(f=>{const v=read(f);assert.equal(v.result.selected[0].resourceId,'866b735a-9351-414f-a797-6bab290144c2');assert.ok(v.result.messages.includes('另一窗口已更新资源设置。请放弃修改并重新载入后再编辑。'));return{at:v.at,file:f,draftScale:v.result.active.value,messages:v.result.messages};});
assert.deepEqual(observed.map(r=>r.draftScale),['1.06','1.05']);
const client=read('qa024-b2-c7ad-client-roundtrip-original-settings-restored-20261026.json');assert.ok(client.generated.every(j=>j.status==='verified'));
const prefix='rounds/candidate-c7ad6837-1b1afdd1/evidence/';
const copied='qa027-07-readonly-triage-retained-20261026.md';fs.copyFileSync(triage,path.join(__dirname,copied),fs.constants.COPYFILE_EXCL);
const evidence=frameNames.map(f=>prefix+f).concat(prefix+'qa024-b2-c7ad-restore-draft105-save-ready-20261026.png',prefix+'qa024-b2-c7ad-single-restore105-save-first-result-20261026.png',prefix+'qa024-b2-c7ad-client-roundtrip-original-settings-restored-20261026.json',prefix+copied,triage);
for(const f of ['qa024-b2-c7ad-restore-draft105-save-ready-20261026.png','qa024-b2-c7ad-single-restore105-save-first-result-20261026.png'])assert.ok(fs.existsSync(path.join(__dirname,f)));
const proof={at:new Date().toISOString(),issueId:'QA-027',sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,status:'native_observed_and_readonly_source_triaged_open',observed,triage:{path:triage,retainedCopy:prefix+copied,sha256:crypto.createHash('sha256').update(triageBytes).digest('hex'),owner:'07',readOnlySourceAnalysis:true},noAdditionalNativeReproduction:true,noCodeChanged:true,noCandidateChanged:true,scope:'An unchanged ordinary background resource pull emits resources:changed; the dirty hook warns without checking selected saved baseline. Exact first event source was not captured. Drafts remained and each sole save succeeded; no proven automatic draft loss, data overwrite, or CAS bypass.',independentFromQa024:true,caseStatusesPreserved:true};
fs.writeFileSync(path.join(__dirname,'qa027-c7ad-native-observation-and-triage-20261026.json'),JSON.stringify(proof,null,2)+'\n',{flag:'wx'});
evidence.push(prefix+'qa027-c7ad-native-observation-and-triage-20261026.json');
issues.issues.push({id:'QA-027',title:'资源编辑草稿期间无变化后台拉取误报另一窗口已更新',owner:'07',verifier:'09',severity:'P2',blocking:false,status:'open',associatedCases:['R01','R06'],sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,runId:state.activeRound.runId,
 reproducibleSteps:['原B2普通c7ad资源页选中导入青芽866b、显示场景桌面，正常同步已开','只编辑缩放草稿，保持未保存并经过正常后台pull周期','资源保存基线未变时，原生公共DOM两次出现另一窗口已更新/应放弃修改提示','原草稿仍在、保存按钮可用；各自一次正常Save均成功且新云端唯一authority已核对'],
 expected:'相同保存基线或无关资源的后台失效通知不提示外部编辑冲突、不清草稿；只有当前选中资源已保存基线确实改变才保留草稿并准确提示，后端expectedRevision保护继续生效。',
 actual:'11:20:38Z草稿1.06和11:30:47Z恢复草稿1.05均实际显示“另一窗口已更新资源设置。请放弃修改并重新载入后再编辑。”，但对应持久化基线仍原版本，唯一Save均正常verified。07只读确认unchanged download和同文档偏好pull均无条件发通知，dirty hook忽略payload且不比较保存基线即报冲突。事件原因未采集，不能断言某次首先来自哪个分支；未证明自动丢草稿、覆盖数据或CAS失效。',
 rootCause:'07源码只读triage：resources useResources hook将resources:changed直接解释为外部选中资源变更，未核验owner/selectedId/saved baseline；简单dirty时reload又可能因新对象引用重置草稿。最小修复需保留草稿并读最新保存基线比较及异步代际保护。',
 evidence,rootDecision:'Root要求与已通过QA024分开登记P2，保留现有两次DOM/截图和07报告；07仅artifact patch/test方案，当前冻结包和原生现场不改，待Root复审。',nativeFixVerified:false,productCandidateUnchanged:true,updatedAt:proof.at});
const statuses=state.cases.map(r=>[r.id,r.status]);
for(const id of ['R01','R06']){const row=state.cases.find(r=>r.id===id);(row.linkedIssues ||= []).push('QA-027');(row.targetedChecks ||= []).push({at:proof.at,roundId:state.activeRound.id,sourceCommit:freeze.sourceCommit,exeSha256:freeze.exe.sha256,scope:'QA027 dirty resource draft notice during ordinary unchanged background pull; existing captured observations only',passed:false,issueId:'QA-027',evidence});}
assert.deepEqual(state.cases.map(r=>[r.id,r.status]),statuses);
qa.write('issues.json',issues);qa.write('cases.json',state);qa.render();
console.log(JSON.stringify({issue:'QA-027',severity:'P2',status:'open',caseStatusesPreserved:true,counts:state.cases.reduce((o,r)=>(o[r.status]=(o[r.status]||0)+1,o),{})}));
