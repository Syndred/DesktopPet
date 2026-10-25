# QA023：过期编号正缓存恢复后唤醒战报投影

准备分支 codex/lingjing-battle-report-freshness-qa023-20261026，基于 Root 32b62eb560e886f3131666afe908c37c64b5a587；已 fetch / pull 最新 origin main，结果 Already up to date。QA020 的 cda80ddd 与 QA022 的 28ad68f2、9ec5ca2b 分支和证据保留，未混入本补丁。

原生 C03 证据中的双方原报告均为 mode=friend、sessionId=online-d79b783a-b5a5-4715-8e58-ba95483b2d67，缺省 room / side / displayIdentity 是 authority reportFor 的原合同。实际 overview IPC 的 enemy 已经是“待同步”，三个 UI 出口只是复用该参与者投影。只读查询确认部署的 lingjing-battle version 3 已具备独立 get_display_metadata 操作；历史 inactive 成员授权也已在源码及独立 SQL 谓词审计中确认，不需改写战报、配号或放宽授权。

确定性源码缺陷位于 display-views.cjs 的 accept：

1. HUD 已取得可信编号，正缓存随后超过 15 秒失效；报告从原 sessionId 请求同一房间。
2. 可选查询晚于 750ms 预算时，首次报告投影正常返回“待同步”。
3. 迟到查询成功并返回相同 participants / namespace，旧代码虽更新 cache.at，却判定 changed=false，没有发送 display-identities 通知。
4. 界面因此可以停留在首次 pending 投影；此时手动再读却已能从新鲜缓存取得可信号。

本次唯一产品变化：在有效响应已通过现有 owner、格式、roomRevision 和绑定一致性检查后，把“已有正缓存从过期恢复新鲜”也视为需要通知的变化。仍在新鲜期内的相同数据不重复发送通知。750ms 可选等待、15 秒缓存期限及其原有边界、两路并发、批量上限、owner / generation / namespace / peer binding 全部不变。没有增加可信来源、使用 foreign owner getter、延长缓存或向原 report / receipt / DB 写入编号。

永久回归放在原 display-views.test.cjs，使用真实服务器 reportFor 生成不含 room / side / displayIdentity 的报告形状；metadata 与测试进程 Date.now 为明确的 scripted fixture。双方 owner 都覆盖：正缓存预热、新鲜同值无重复事件、恰好 15 秒仍有效、超期首次 pending、同值迟到成功后恰好一次 owner-bound 事件、事件驱动重投影恢复可信号、再次同值不重复事件、原报告哈希不变。旧代码先在双方“应有一次通知，实际 0 次”断言失败；修复后通过。

定向验证：

- node --test apps/pc-app/runtime/features/battle/tests/display-views.test.cjs：14/14，包含新回归父项和双方子项，以及实际 Main IPC / query_only SQLite 的原 session、report、receipt、archive 保留检查。
- node --test apps/pc-app/runtime/features/battle/tests/serial-views-sql.test.mjs：11/11；隔离 PostgreSQL 实际 SQL 验证 inactive 历史成员可读、外账号/仅邀请/错绑/撤销拒绝、scope 隔离、纯 SELECT 与原行/计数不变。
- node --check 修改的 CJS、git diff --check：通过。

没有改 TSX、SDK/provider、Edge 生成物、SQL/DDL、战斗规则、结算或身份绑定。没有重跑全 98、打包、部署、启动产品、驱动原生输入、读取 vault 或发送真实用户 metadata HTTP。上述回归为源码/隔离工程证据，既不证明真实 JWT 请求已经成功，也不证明 QA023 已在原生界面闭环。

Root / 09 已补充原 DC7 的真实冷启动对照：B1 在全新 Main 打开同一 12 回合报告，列表、主卡、回顾均显示对手 0004；原报告及 10 张业务表保持 exact。证据为中央 QA evidence/qa023-b-normal-cold-restart-report-identity.json 与 qa023-b-normal-cold-restart-correct-opponent-number-native.jpg。这与“空缓存首次迟到会通知，过期正缓存同值恢复不通知”的区别吻合，但旧 warm 失败证据仍保留，QA023 尚未闭环。当前独立 helper 的 session-load / 0-send 障碍也不能归因于 metadata API 失败。

证据摘要位于 evidence/battle/2026-10-26/qa023-report-freshness/verification.json。Root 可继续安排独立只读 live metadata probe；新候选上仍需由 09 复验真实 warm 终局报告的列表、详情、回放三个对手编号，且原报告与结算保持不变。若 probe 有其他异常，应独立记录，不能用本次 scripted 通过替代。
