const path = require('node:path');
const qa = require(path.resolve(__dirname, '../../../manage-qa.cjs'));
qa.updateIssue('QA-025', {
  owner: 'Root (01a1759f-d666-75d1-81dc-e757e748d221)',
  originalDomainOwner: '04',
  rootDecision: 'Root实际复核原生截图和readonly DOM，确认P2 release blocker；只修错误反馈与恢复入口，不放宽定位guard、不自动定位或重发。',
  preparedFixCommit: '9a17abda3b718c6277a2dc83fe08b9549317a348',
  preparedFixScope: 'Root反馈单文件BattleScreen.tsx将capturing错误置于modal内部并提供返回探索入口；定向ESLint和diffcheck通过；仍未打新包。',
  status: 'fixed_awaiting_retest',
  nativeFixVerified: false,
  productCandidateUnchanged: true
});
console.log('QA-025 Root ownership and prepared-only fix recorded; M05 remains failed.');
