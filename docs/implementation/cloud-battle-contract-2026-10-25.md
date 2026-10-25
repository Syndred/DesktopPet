# 云端对战接口与阶段检查点

负责人04；保留已验收V3全部界面。分支 `codex/lingjing-battle-v3`，V3冻结 `0ddda2a`，完整后端初版 `5ebb63b`，部署阻断补丁 `69a23b4`。已消费08稳定SID SDK及事务guard `08088e7/de11173`、02共享成长/伙伴后端、05 `40941f2` 的完整菜园领域模块。

## 权限与事务

目标 `jbvrdmrkwpznbrvteive`，全部远端迁移和部署由主协调执行。规范 SQL 由 CLI 2.122.0 `migration new` 生成：`20261025034744_lingjing_battle_jwt_rooms.sql`，依赖先部署 08 身份迁移。

新增七张 `lingjing_battle_*` 表：邀请、房间、成员、未解析行动、已解析回合、命令回执、奖励凭据。历史旧表不删除或改写。Auth UUID 和旧文本 owner 分列；同一 Auth 用户或同一 owner 最多一个活动房间，同账号不同设备不能互相对战。

房间/回合/邀请/奖励 SELECT 同时检查参与者 Auth UID 与私有 `battle_viewer_owner()`：消费08 header-free `session_owner/live_session_id`，并核查同一owner/session存在未撤销设备。这个空search_path的私有definer只用于绕开devices自身HTTP-header RLS递归，不给service_role读取auth.users的额外权限。真实revoke_device只更新revoked_at、不删除Auth session的场景也必须立即拒绝直读；同owner另一未撤销设备继续可读。Realtime不支持自定义WebSocket headers，不能误用HTTP设备头helper。

私有频道 `lingjing:battle:<room UUID>` 的 SELECT 仅参与者能通过；不开放客户端 Broadcast INSERT。Postgres Changes 仅发布房间、回合、邀请，逐行 RLS 继续执行。未解析行动无客户端 SELECT 权限，也不进入 publication，不能提前看到对手选择。

公开权威写RPC都是 `SECURITY INVOKER`、空search_path，撤销PUBLIC/anon/authenticated EXECUTE，只授予service_role。受控Edge用08 actor确定Auth UID/owner，普通读取使用actor.client；出战伙伴来自受保护head，资源/五行/等级/成长不接收客户端自报。

所有写RPC传入08验证过的deviceId/sessionId，并在业务锁前调用统一私有 `lingjing_private.assert_service_actor(owner,uid,device,sid)`。它先锁owner，再锁定并重查真实Auth用户/session/not_after、不可变撤销账本与非撤销设备绑定；04不复制另一套认证，也不扩大service_role对Auth表的权限。命令缓存和已保存结算的HTTP重放同样进入guarded RPC，不能绕开。SQL验证保留Auth session的情况下撤销原设备，旧SID全部拒绝且不落账；同owner另一SID仍可读写。

资源校验复用02模板五行；合法跨五行内置换装也不改变模板元素。自定义2D外观只查询同owner/Auth的 `lingjing_resource_references` 已验证spritesheet引用，绝不以客户端可写 `resource_packages` 作为授权。

- `lingjing_battle_command(actor,owner,op,actionId,input)`：同 actor/actionId 的完整命令回执；邀请/接受/入房/锁定行动/离开在数据库事务中校验权限。接受邀请与房间/预约对象绑定同事务；命令重放不能换目标、动作或伙伴。
- `lingjing_battle_commit_round(room,round,revision,rawHost,rawGuest,result)`：锁房间，核对版本、双方已锁定动作与 revision；回合插入和状态推进同事务。失败回滚，重复提交返回同一权威回合。
- `lingjing_battle_training_command`：云账号训练使用同一内核的实际AI行动，保存服务端会话、不可变行动回执和revision；客户端只提交动作。相同actionId重放不会重新抽取AI动作或推进另一回合。
- `lingjing_battle_settle_authority`：好友/训练共用一次结算事务。先lock_save_owner，再锁领域行，核验原出战pet和胜负；02 awardBattleResult、05 applyCloudCommand准备伙伴/菜园，04投影完整战报，最后在同一SQL事务调用08 commit_authority并插入结算回执。失败全部回滚；旧receipt-only claim函数已撤销service_role EXECUTE。稳定奖励actionId为好友 `battle:<room UUID>:<owner>`、训练 `battle:battle-<training UUID>:<owner>`；种子source=battle、receiptId分别为room UUID或训练sessionId，复用05确定性种子选择及2粒数量。

第二个CLI迁移 `20261025034748_lingjing_battle_authority_save.sql` 依赖08 protected CAS及第一份battle迁移。只新增训练会话/命令/结算表和同事务RPC，不改旧历史。好友和训练活动成员互斥，遵守统一账号行优先的锁顺序。两份battle迁移均未由04写入生产。

正式函数名 `lingjing-battle`。运行时只需 `lingjing-battle/index.ts`、`lingjing-battle/runtime.generated.mjs`、`_shared/lingjing-auth.ts` 三份文件。`scripts/battle/build-cloud.mjs`机械打包同一核心/02成长与模板/05菜园及JSON，`--check`按仓库相对路径与CRLF规范化SHA校验，不手改生成物。完整TS源码仍保留审查。08 withActor校验真实JWT/活跃Auth session/owner/device；verify_jwt=false只关闭旧网关校验，不关闭函数认证。不要部署旧duel-online入口。

## 同一规则核心

`infra/supabase/functions/_shared/battle-core.js` 是原桌面算法的单一源码；`scripts/battle/build-core.mjs` 机械生成桌面 CJS，`--check` 校验源码 SHA256，禁止手工改生成物。原 `services/battle-runtime.cjs` 只保留导出兼容入口。规则 ID `five-elements-standard-v1` 不变，核心版本 `five-elements-standard-v1/2026-10-25` 明确写进每场房间/回合。

`lingjing-battle/room-core.js`只转换host/guest DTO，调用同一内核；不重复伤害、怒气、异常状态或胜负公式。未知版本拒绝解析，历史记录不重算。训练也使用该内核原AI。选招依然不限时，不引入自动动作或判负。

主进程消费08 cloudActor.requireActor()的稳定SID SDK及fresh invoke。Realtime仅调用无参setAuth()，保留SDK accessToken callback，不把显式旧JWT钉在manual模式。退出/切账号拆频道。create/join/invite/训练start先持久化原请求编号，恢复服务端原行动；网络失败不改成下一回合的新命令。云端结算后必须另发HTTPS读取原actionId对应的完整存档，核对revision/checksum/owner/report，再在同一SQLite事务恢复02/05/04一致性单元；不再本机追加XP或种子。有独立本机操作时保留并报冲突。

## 已完成的本地验证

从 V3 冻结提交提取 1,200 份确定性黄金序列（初态/50怒气/叠层状态），共 7,162 回合：桌面生成 CJS 与 Edge 源输出完全一致，且每份结果 SHA256 与原版相同。冻结的是数据，不是第二份运行算法。

PGlite 实际执行 08 身份 SQL 和新增对战 SQL，完成真实数据库事务/RLS 检查：邀请/接受/预约入房、非参与者与匿名拒绝、隐藏未解析动作、私有频道 SELECT、不能覆写行动、8回合战斗、失败事务回滚、重复提交同一回合、两张不同 pet/owner 奖励凭据、原 JWT claims 对应 session 删除后拒绝房间/回合/频道直读、账号 locked 后拒绝、RPC 执行权限。此结果明确是本地嵌入式 PostgreSQL，不是远端 Supabase、WebSocket 或真实 Electron 联机证明。

## 后续必须完成

1. 主协调部署两份migration和完整lingjing-battle函数；04不自行部署或管理式种数据。
2. 消费02主进程云领养/选择/读回。05 emptyGarden及其权威初始化已接入原子奖励，第一次未打开菜园也能合法初始化并领种子；不做管理式种数据。02后端adopt已上线，原有本机选择不能冒充已验证云操作。
3. 部署后执行真实账号邀请、多回合、JWT刷新重连、断网/重启、双方战报、训练及第二客户端存档读回。当前authority-save六项是实际本地Postgres/SQLite验证，不是HTTPS证明。
4. 真实验收使用两个独立 deviceId、fresh 用户目录、两个 Electron 进程，明确是同机双客户端。不会启用会强制 simulated 身份的 unified-battle QA transport，也不冒称两台实体设备。
5. 旧 `duel-online/index.ts` 中密码/单token和重复规则，在账号桥迁出并确认消费者为零后替换/删除；不因清理旧代码丢失历史读取或账号迁移能力。

## 官方依据

已检查 2026-10-25 changelog。当前 Node/Electron 使用现代 HTTPS/TLS；未引入被弃用的 CBC TLS 或旧 pgcrypto 密码算法。

- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)：private topic 与 Postgres Changes RLS 是两层权限。
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)：记录按 SELECT RLS 授权。
- [Auth sessions](https://supabase.com/docs/guides/auth/sessions)：会话撤销与 JWT 过期的区别。
- [TLS changelog](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)。
