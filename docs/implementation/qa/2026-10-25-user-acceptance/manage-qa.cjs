const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n');
const statusText = { pending: '未执行', running: '进行中', passed: '通过', failed: '失败', blocked: '受阻', reported: '用户已报告', reproduced: '已复现', assigned: '已派修', fixed_awaiting_retest: '待复验', verified: '修复已复验' };
function render() {
  const state = read('cases.json'); const issues = read('issues.json');
  const counts = Object.fromEntries([...new Set(state.cases.map(row => row.status))].map(key => [key, state.cases.filter(row => row.status === key).length]));
  const targeted = state.verificationPolicy?.mode === 'targeted-preserve';
  const currentRows = state.cases.filter(row => row.sourceCommit === state.activeRound?.sourceCommit && row.exeSha256 === state.activeRound?.exeSha256);
  const currentCounts = Object.fromEntries([...new Set(currentRows.map(row => row.status))].map(key => [key, currentRows.filter(row => row.status === key).length]));
  const safe = value => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  const lines = ['# 灵境完整用户验收矩阵', '', `更新：${new Date().toISOString()}（记录使用 UTC；用户时区 Asia/Shanghai）`, '',
    '原人类授权已从总协调会话 01a1704b-e200-7090-9d17-958218c80f42 的最新用户消息核对。唯一真实鼠标键盘操作者为本验收会话。业务修复交给 01–08 对应会话，总协调集成；本目录只写 QA 记录与辅助取证工具。', '',
    '初始 checkout：`codex/lingjing-implementation-base`，HEAD `6d4df8fdbf102e185cfc9c022bcdddf4601aac82`。已执行 fetch/pull --ff-only origin main，输出 Already up to date，远端 main `4786f97680679c2db0aa307fa5f67ec247f93086`。设计图和压缩包保留。', '',
    `初始成品：\`${state.baseline.executable}\`；sourceCommit \`${state.baseline.sourceCommit}\`；SHA256 \`${state.baseline.exeSha256}\`。原包运行时 manifest 已实际回读；完整旧结果冻结于 rounds/baseline-a9acd7f-790f5b6d。`, '',
    ...(state.activeRound ? [`当前轮次：\`${state.activeRound.id}\`；runId \`${state.activeRound.runId}\`；sourceCommit \`${state.activeRound.sourceCommit}\`；SHA256 \`${state.activeRound.exeSha256}\`。${targeted ? '采用定向复验并保留全部原case状态；下方总数是跨候选累计状态，未在新包实际复验的旧通过不能作为最终通过。每行标明其实际候选。' : '本表状态仅统计此轮，旧包通过不转入新包。'}`, ...(targeted ? [`当前候选已实际记录 ${currentRows.length}/${state.cases.length} 项：${Object.entries(currentCounts).map(([key,n]) => `${statusText[key] || key} ${n}`).join('，') || '尚无'}；其余保留旧候选状态等待适用的定向复验。`] : []), ''] : ['当前仍为原包基线；新候选尚未开始。', '']),
    '方法：实际 EXE、真实界面点击/键盘/拖动、原生窗口截图，辅以只读 renderer/IPC、SQLite query_only 回查及独立云端读取。脚本预置、模拟场景、模拟定位/好友权威必须标明来源，不能冒充真实用户操作或 live-cloud 成功。保持产品 1–4 只桌面显示限制，不操作用户普通账号或窗口。', '',
    '判定：每行均需在同一最终 EXE 复验才可作为最终通过；旧证据不计入本轮。硬件、付费或凭据不足记录受阻；有发布阻断项不得声称全部通过。暂停 TS 迁移，旧服恢复/迁移排除。', '',
    `总计 ${state.cases.length} 项；${Object.entries(counts).map(([key, n]) => `${statusText[key] || key} ${n}`).join('，')}。`, '',
    '## 发布问题', '', '| ID | 严重度 | 状态 | 负责 | 问题 |', '| --- | --- | --- | --- | --- |',
    ...issues.issues.map(row => `| ${row.id} | ${row.severity} | ${statusText[row.status] || row.status} | ${safe(row.owner)} | ${safe(row.title)} |`), '',
    '## 场景清单', '', '| ID | 域 / 场景 | 操作步骤 | 预期 | 实际 | 负责 | 状态 / 证据 |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...state.cases.map(row => `| ${row.id} | ${safe(row.domain)} / ${safe(row.title)} | ${safe(row.reproducibleSteps.join(' → '))} | ${safe(row.expected)} | ${safe(row.actual)} | ${row.owner} | ${statusText[row.status] || row.status}${targeted ? '<br>实际候选 ' + safe(row.sourceCommit?.slice(0,8)) + (row.sourceCommit === state.activeRound?.sourceCommit && row.exeSha256 === state.activeRound?.exeSha256 ? '（当前）' : '（旧证据）') : ''}${row.evidence.length ? '<br>' + row.evidence.map(safe).join('<br>') : ''} |`), '',
    '## 操作边界和最终交付', '', '所有实际档案、进程、窗口句柄、运行 build 身份和单项证据在 run-manifest.json 与 evidence/ 留存。云端账号仅独立合成 QA 身份；模拟 QA 档案不连接真实云。重启只能关闭本轮自己启动且档案绑定匹配的进程。最终交付逐项状态、缺陷及修复 commit、同一最终 EXE 的真实截图/数据证据；原始失败记录保留。', ''];
  fs.writeFileSync(path.join(root, 'matrix.md'), lines.join('\n'));
}
function updateCase(id, status, actual, evidence = []) {
  const state = read('cases.json');
  const row = state.cases.find(item => item.id === id);
  if (!row) throw new Error(`Unknown case ${id}`);
  Object.assign(row, { status, actual, updatedAt: new Date().toISOString(), evidence: [...new Set([...row.evidence, ...evidence])] });
  write('cases.json', state); render(); return row;
}
function updateIssue(id, patch) {
  const state = read('issues.json');
  const row = state.issues.find(item => item.id === id);
  if (!row) throw new Error(`Unknown issue ${id}`);
  Object.assign(row, patch, { updatedAt: new Date().toISOString() });
  write('issues.json', state); render(); return row;
}
function beginRound(round) {
  if (!round.id || !round.runId || !round.sourceCommit || !/^[0-9a-f]{64}$/.test(round.exeSha256)) throw new Error('Exact round identity required');
  const state = read('cases.json');
  if (state.activeRound?.id === round.id) throw new Error('Round already active; refusing to reset progress');
  for (const row of state.cases) {
    if (row.status !== 'pending') (row.history ||= []).push({ roundId: state.activeRound?.id || 'baseline-a9acd7f-790f5b6d', sourceCommit: row.sourceCommit, exeSha256: row.exeSha256, status: row.status, actual: row.actual, evidence: row.evidence });
    Object.assign(row, { status: 'pending', actual: '尚未在此候选实际执行', evidence: [], sourceCommit: round.sourceCommit, exeSha256: round.exeSha256, runId: round.runId });
  }
  state.activeRound = round; write('cases.json', state);
  const issueState = read('issues.json');
  for (const issue of issueState.issues) {
    if (issue.status !== 'verified') continue;
    (issue.verificationHistory ||= []).push({ sourceCommit: issue.verifiedSource, exeSha256: issue.verifiedExeSha256, verification: issue.verification, evidence: issue.verificationEvidence || [] });
    issue.status = 'fixed_awaiting_retest';
    issue.awaitingRoundId = round.id;
    issue.verification = 'A prior candidate passed; this exact candidate requires native retest.';
  }
  write('issues.json', issueState); render(); return state;
}
module.exports = { root, read, write, render, statusText, updateCase, updateIssue, beginRound };
if (require.main === module) render();
