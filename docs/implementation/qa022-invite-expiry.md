# QA022：邀请的服务器五分钟有效期

准备分支：codex/lingjing-battle-invite-expiry-qa022-20261026，基于 Root 32b62eb560e886f3131666afe908c37c64b5a587。准备前及提交前均 fetch / pull origin main，结果 Already up to date；origin/main 为 4786f97680679c2db0aa307fa5f67ec247f93086。QA020 cda80ddd16dec60254b94921badb89cb91bbe48c 及原分支、证据全部保留，未混入此补丁。

本次仅准备源码、增量 DDL、生成物及隔离验证。没有 apply 真实迁移、部署函数、打包、push、启动产品、操作中央 QA、创建真实邀请/房间或修改真实时间。

| 项目 | 变化与兼容 |
| --- | --- |
| 数据库 invites.expires_at | 新增 nullable timestamptz，无 DEFAULT，无回填；旧行新增值仅为 NULL，其他原字段、状态和时间不变。 |
| 新邀请 | 仅新建业务邀请时，数据库取同一个服务器时刻赋 created_at、updated_at，并赋 expires_at = 该时刻 + 5 分钟。客户端传入的时间不能决定期限。 |
| 旧邀请 | NULL 表示旧版无期限，不推导或伪造 deadline；原 pending 仍按旧规则处理。正常取消后再发，才创建采用新规则的邀请。 |
| status | 只扩大 CHECK，增加 expired，不在迁移中改写任何旧行。到期仅影响 pending；accepted / rejected / cancelled 历史不因时间改变。 |
| 列表 | 新增 service-only、SECURITY INVOKER 的 lingjing_battle_list_invites；沿用真实 actor / owner / device / SID guard，仅返回当前 owner 的邀请。按同一次服务器时刻投影过期状态，不修改表、时间或命令回执。 |
| DTO / SDK | DuelInvitation 增加可选 nullable expiresAt 和 expired。新客户端保留此字段；旧响应未包含此字段时保留原形状。旧 SDK 按原有显式字段归一化，忽略扩展字段；后端仍拒绝过期接受。 |
| 本地 journal / 备份 | 严格接受原旧形状，或仅多出 nullable/string expiresAt 的新形状；未知字段、错误类型和外部 owner 仍不能取得可信投影。原行及备份保留。 |

迁移由既有 Supabase CLI 2.122.0 的 migration new 创建：

- infra/supabase/migrations/20261026080525_lingjing_battle_invite_expiry.sql
- migration-manifest.json 仍声明实际已部署 25 条，仅把新文件列入 pendingReviewFiles；不改写原云端账本或部署记录。

数据库时钟集中在私有、无参数的 lingjing_private.battle_invite_now，生产实现仅调用 pg_catalog.clock_timestamp()，没有客户端、请求级或配置级时间覆盖入口。截止判断取锁后的实际服务器时刻，而非固定在事务起点的 now()；这一差别见 [PostgreSQL 时间函数文档](https://www.postgresql.org/docs/current/functions-datetime.html#FUNCTIONS-DATETIME-CURRENT)。

事务内先验证 actor 和原 action 输入，并优先返回已提交的原 result，再进入期限或新建分支。同一 action 重放始终返回原回执；即使原邀请此时已过期，也不会重写回执中的状态或期限，不会创建新邀请。

新发送动作按双方身份取得同一事务 advisory lock，再锁 pending 行。仍有效或 NULL 的 pending 复用原邀请，不延长 created_at / expires_at。到期后，仅新的发送业务动作才将旧 pending 记为 expired，保留旧 created_at / expires_at，并建立新邀请；反向发送也使用同一双方锁。锁与约束同时保留。

接受邀请先锁邀请并检查截止时间；创建成员可能等待，故在写入 accepted 前再次检查。任一检查失败会回滚该次新房间、成员和命令，不产生奖励。房间码加入也检查关联的 expired / 到期 pending 邀请。已在期限内接受的邀请保持 accepted，原房间及重复接受恢复不被期限重置；其后加入原房间仍按既有房间规则处理。本补丁没有给已接受房间增加另一种超时规则。

到期列表是只读投影：后台原 pending 行可以仍保留 pending，直到用户的新发送或正常取消/婉拒动作将其记为 expired。不能把原表尚未写入 expired 当作接受仍被允许；接受事务独立检查 expires_at。

未知响应与主动新发在界面中有不同入口：

- “发送结果待确认”从新的 Main pendingInvitations 只读接口读取当前 owner 的未确认邀请 journal。即使云端列表失败，本地读取仍独立显示；刷新不发送、不重放、不清理。
- “重试原请求”发送原 actionId、原 targetAccount、原 allowResend；选用当前明确的出战伙伴。技术调用提供原 actionId 时同样走已有输入冲突校验和回执恢复；不提供 ID 的旧调用仍复用原 pendingCommand。
- “重新发送”、普通“发起对战”及过期邀请的“重新发起”，都只在用户点击时产生新 actionId。原未确认行保留。服务器对有效 pending 复用原邀请和 deadline，对已过期邀请才创建新的业务邀请。
- 过期入站邀请明确显示“已过期”，没有接受按钮；旧邀请明确提示“未设置有效期”。边界竞态返回 INVITE_EXPIRED，Main / 账号错误映射给出中文提示，随后刷新列表。

已完成的定向验证：

| 验证 | 结果及范围 |
| --- | --- |
| invite-expiry-sql.test.mjs | 1 个实际迁移 SQL 测试，覆盖 7 组业务检查。先验证生产无参时钟确实取服务器时间，再仅在隔离内存 PostgreSQL 中替换私有时钟；覆盖精确截止边界、原 action 过期后重放、不续期、新发归档、legacy 保留、事务等待跨界回滚、加入防绕过、权限与撤销。 |
| cloud-battle-sql.test.mjs | 已加载本次增量迁移再运行；1 个文件通过，实际 PostgreSQL 8 回合、2 份宠物绑定结算回执、RLS、回滚和撤销检查保持通过。 |
| transport-journal.test.cjs | 11/11。真实 SQLite 验证未确认原 action 显式重试、旧调用恢复、新点击 ID、只读 owner 隔离、原 journal 保留、nullable deadline、备份还原及未知字段保护；wire 为 scripted。 |
| friend-lifecycle.test.cjs | 12/12，以 Electron 的 RUN_AS_NODE 执行真实 SQLite / 磁盘恢复，未启动产品 UI。原过期 fixture 仅验证错误边界文案，不当作五分钟期限证据。 |
| handler.test.ts | Deno 2.9.6，4/4；验证 guarded list RPC 的 actor 参数、legacy/null DTO、显式 409 INVITE_EXPIRED 等，属于 scripted Edge 边界测试。 |
| 真实 React 组件隔离检查 | 4 组交互通过：挂载/刷新不发送；原请求重试保留原 ID；主动新发产生不同 UUID；离线保留原请求，无页面/按钮横向溢出。实际 FriendsPanel、UI kit 和样式；IPC、数据与肖像边界为 fixture。 |
| 工程检查 | UI typecheck、定向 ESLint、修改的 CJS 语法、迁移文件门禁、生成物 --check、diff --check 通过。没有重跑全 98，也未安装/重建共享依赖。 |

证据位于 evidence/battle/2026-10-26/qa022-invite-expiry/：

- sql-evidence.json：隔离 PostgreSQL 检查与真实函数权限快照。
- component-checks.json：实际组件调用 trace、源文件哈希与明确的模拟范围。
- component-mixed-states.png / component-offline-pending.png：已逐张视觉检查，图中标明组件模拟。
- verification.json：验证命令、范围与未改动的基础文件哈希。

可重跑的组件装置保存在本分支工作树的 ignored artifacts/qa/qa022-invite-expiry/verify-ui.mjs 及 ui-source/。它只构建隔离组件，在单独临时 profile 的 headless Chrome 中通过本地 route fixture 渲染；不加载产品或任何实际服务。

React 清单已核对：两个独立读取并发，分别按组件存活状态更新；没有新增自动重发 effect、浏览器时间驱动的过期判断、运行时 garden/战斗模块导入、重复全局监听器或依赖。重试/新发按钮有明确可见名称；长账号独立换行，状态、说明与按钮分别排布。原 battle.css / battle-v3.css 未修改。

尚未证明的部分是实际云端部署后 HTTPS / 多连接锁竞争及原生自然等待五分钟。隔离 SQL 中跨界等待用测试事务触发器推进内存时钟，不是实际多连接竞争；截图也不是原生验收。Root 完整审核后需先统一应用增量迁移，再部署生成的 lingjing-battle 函数，再生成客户端候选；09 在新候选上正常发邀请并自然等待五分钟，期间可并行复测其他项。不得修改正在原生验收的 DC7 或重放/清理 NOQA09。

2026-10-26 云端应用核对：实际迁移版本 `20261026080525`；`lingjing-battle` 第 4 版回读源码匹配，三个数据库函数源码匹配且仍仅 service_role 可执行。12 条旧邀请原字段及房间、行动、命令回执摘要均保持，旧邀请 expires_at 全部为 NULL。对应新台账见 `evidence/cloud/2026-10-26/invite-expiry/migration-ledger.json`。原生自然五分钟到期及实际多连接竞争仍待对应现场证据。
