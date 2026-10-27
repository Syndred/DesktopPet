# Dot 待办：逐项修复，逐项验证

当前这些任务均未在本次交接中实施。原源码、原候选和原结果不变；读取待办不自动开始测试。用户向 Dot 授权接手后，以本清单确定本次范围。

**每项功能或修复当场做完整，检查本次变更和确实受影响的关联，当次问题当次修好再报完成。没有受影响、已经正常的功能不反复扫。**

## 1. P1：记忆的再次明确恢复（4E6-003 / P05）

- [ ] 在新的可丢弃复现中确认原失败机制，不删除旧处理记录：已处理同一备份 → 后来删除原记忆 → 再次明确导入 → 页面显示完成但原 ID 未恢复。
- [ ] 把“新的导入意图”和“同一意图的重试”分开：前者可产生新的可审查恢复选择，后者复用原身份，不重复写入或重复产生选择。
- [ ] 显式选择后按当前版本条件写入原记忆 ID；保留全部旧冲突/处理历史，不用新 ID 代替恢复。
- [ ] 针对性检查：首次恢复、再次恢复、同次重试、过期版本冲突、另一宠记录隔离；现有其他记录、游戏数据、凭据不变。
- [ ] 在实际运行版本中确认页面结果与原记录读回一致，再报告完成；未具备真实云端条件的工程证据单独说明。

原因已定位：importData 的差异原因只由备份 checksum 决定，preserve 的 INSERT OR IGNORE 唯一键吞掉后续新恢复意图。

现成复现与原结果：

- [memory-reimport.regression.test.cjs](../2026-10-27-cloud-authority-paused/engineering-regressions/memory-reimport.regression.test.cjs)
- [before-memory-reimport-repair.json](../2026-10-27-cloud-authority-paused/engineering-regressions/before-memory-reimport-repair.json)

## 2. P1：缺失资源缓存时的备份预览和恢复（4E6-006 / R05）

- [ ] 覆盖三个环节：预览、恢复前保护备份、已存在 resourceId 的合并。只改最后的合并步骤不足以解决前置 ENOENT。
- [ ] 只从有效备份补回已知、匹配当前不可变整包哈希的缓存字节；同时核对备份和当前 content_hash，不能只信可被重新计算的单文件 SHA/外层 checksum。
- [ ] 保留资源 ID、authored row/revision、imports、preferences、分配、原文件和历史。预览不得导入新业务记录或制造“恢复已完成”状态。
- [ ] 针对性检查：有效备份补缺图；替换/篡改图被拒；已有 ID 的元数据保持；保护备份确实可读；普通恢复结果确实来自备份而非后台云自动补回。
- [ ] 实际运行路径验证通过后再报告恢复成功。此前一次真实 R05 故障已清理，不重复消费旧故障许可，不操作原用户文件来制造新失败。

原因已定位：保护备份先同步读取缺失资源；资源 merge 又直接跳过已有 ID。整包 hash 算法及约束见 [修复观察](../2026-10-27-cloud-authority-paused/root-unified-repair-observations.json)。

现成复现：

- [account-backup-preview-missing-cache.regression.test.cjs](../2026-10-27-cloud-authority-paused/engineering-regressions/account-backup-preview-missing-cache.regression.test.cjs)
- [account-backup-missing-cache.regression.test.cjs](../2026-10-27-cloud-authority-paused/engineering-regressions/account-backup-missing-cache.regression.test.cjs)
- [resource-merge-repair.regression.test.cjs](../2026-10-27-cloud-authority-paused/engineering-regressions/resource-merge-repair.regression.test.cjs)
- [resource-backup-cache-integrity.regression.test.cjs](../2026-10-27-cloud-authority-paused/engineering-regressions/resource-backup-cache-integrity.regression.test.cjs)

## 3. P2：未保存草稿被另一端刷新覆盖（4E6-001 / N03）

- [ ] 人设和连接表单都保留 dirty 草稿及开始编辑时的版本，远端更新时显示明确选择；干净表单允许采用新版本。
- [ ] 旧草稿保存仍基于原编辑版本，不能简单移除 React key 后把旧草稿写进未见过的新版本。
- [ ] 账号、会话或 petId 切换时清除旧草稿和密钥输入。
- [ ] 针对性检查：脏表单 + 真实远端新版本、干净表单刷新、无变化通知、旧草稿保存冲突、切宠/切账号隔离；不重复扫描地图、战斗等未受影响模块。
- [ ] 实际双端或对应真实运行路径中草稿和冲突行为正确后再报告完成。

原因已定位：PersonaForm/ConnectionForm key 含远端 revision 导致重建，提交时又读取最新 prop revision。

现成复现：

- [conversation-settings.regressions.jsx](../2026-10-27-cloud-authority-paused/engineering-regressions/conversation-settings.regressions.jsx)
- [run-conversation-settings.mjs](../2026-10-27-cloud-authority-paused/engineering-regressions/run-conversation-settings.mjs)
- [before-unified-repair.json](../2026-10-27-cloud-authority-paused/engineering-regressions/before-unified-repair.json)

导出的 JSX 相对路径需先核对。QA-027 是资源表单的无变化通知误报，不要把两者混为同一个已解决问题。

## 4. P2：待确认状态漏计及错误优先级（4E6-002 / S06）

- [ ] 账号汇总、园地 provider、refresh 结果、缓存 snapshot 使用一致的 owner 范围持久请求状态，园地计数纳入且只计一次。
- [ ] 当前网络/权限主错误不能被旧 metadata warning 遮住。已经明确终止失败的请求不能永久算作未知请求。
- [ ] 读取状态不重放业务命令、不新增 actionId、不改变库存/经济；未知请求沿用原 ID 和原输入确认。
- [ ] 针对性检查：已有 pending 的缓存读取、各域汇总、重复读取无写入、网络错误优先级、恢复后 pending 消失且原请求仅一次结算。
- [ ] 实际页面和持久状态一致后再报告完成。现有网络故障与恢复证据可用于理解问题；不要为复核状态读数自动重跑整个历史断网批次。

原因已定位：garden 没有独立 cloudStatus、账号仅加总其他两个域、缓存分支把 pending 强制设 0、错误状态仍沿用旧元数据警告。

现成复现：

- [account-domain-status.test.cjs](../2026-10-27-cloud-authority-paused/engineering-regressions/account-domain-status.test.cjs)
- [garden-cached-pending.regression.test.cjs](../2026-10-27-cloud-authority-paused/engineering-regressions/garden-cached-pending.regression.test.cjs)

## 5. P3：版本、关于、日志与更新入口（4E6-004 / A01、P08）

- [ ] 登录页显示来自真实 public appInfo/build 的版本，区分“界面没显示版本”和“打错版本包”。
- [ ] 提供真实可用的关于/本地诊断入口，日志不公开上传、不泄漏凭据。
- [ ] 为便携版提供真实可操作的更新说明和程序位置；仓库当前没有已配置的官方下载/在线更新地址，不编造服务或声称支持自动更新。
- [ ] 针对性检查：未登录页版本、设置入口、真实版本/build、实际日志/诊断打开、稳定外层 EXE 位置；最终包实际启动确认。

## 6. 保留的旧问题与未完成内容

- [ ] 依据现有证据核对 BC-001（个人记录初始化被旧伙伴请求阻断）/BC-002（连接风暴）的正式状态。它们是继承 open，当前候选并非都重新复现。原登记不覆盖、不抹除。
- [ ] QA-021：核对保留合并成功后真实未处理差异的提示与入口，避免再次导向同一恢复形成循环。旧登记 fix_prepared_awaiting_integration 不代表当前包已完成验证。
- [ ] QA-027：现有修复已合并、22 条 DOM 检查通过；按受影响的资源草稿通知路径核对，不用工程数字代替实际结果。
- [ ] I02：先核对已存在的正常合成和不足材料禁用证据，补齐缺失说明/登记所需证据，不重复制作已成功的 action。
- [ ] I03 新快速喂养、C07 互动及其余待办见 [SCENARIOS.md](SCENARIOS.md)。保留全部范围，接手方结合用户当次目标排期，不因清单存在就启动全量验收。
- [ ] C03/C11 编号授权、R02/B02 动态环境、真实定位/硬件、P09 开机启动分别按实际前置处理；不把受限项当成 bug，不通过换身份、改 grant 或改系统设置制造通过。

## 每项修复的记录与交付

每项简要记录：改了什么、针对哪些真实路径验证、运行版本/结果、仍未验证或失败的部分。验证发现本次范围内的问题，当次修好再报完成。检查原身份、actionId、输入、历史及关键数据是否保持。

新包按受影响功能做必要实际复验，并核对源码/包版本一致、能实际启动；不要把每次修复扩成数天全量测试。依赖隔离、运行依赖加载检查和正常退出属于真实包交付所需检查，不重建共享 junction。

本清单不把历史 passed 改成新版本 passed，也不删除原 98 场景。原登记保持冻结，新增修复和结果另做清楚的版本绑定。只有用户另行要求且具备证据时，才更新相应正式验收状态。
