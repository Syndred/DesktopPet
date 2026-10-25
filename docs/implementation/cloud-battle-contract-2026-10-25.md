# 云端对战接口与阶段检查点

负责人 04；保留已经验收的 V3 全部界面。当前分支 `codex/lingjing-battle-v3`，V3 冻结交付 `0ddda2a`，本轮统一范围已合入，身份契约消费 08 的 `ee36030`。

## 权限与事务

目标 `jbvrdmrkwpznbrvteive`，全部远端迁移和部署由主协调执行。规范 SQL 由 CLI 2.122.0 `migration new` 生成：`20261025020540_lingjing_battle_jwt_rooms.sql`，依赖先部署 08 身份迁移。

新增七张 `lingjing_battle_*` 表：邀请、房间、成员、未解析行动、已解析回合、命令回执、奖励凭据。历史旧表不删除或改写。Auth UUID 和旧文本 owner 分列；同一 Auth 用户或同一 owner 最多一个活动房间，同账号不同设备不能互相对战。

房间/回合/邀请/奖励 SELECT 同时检查参与者 Auth UID 与 08 `lingjing_private.session_owner()`，后者每次查询校验真实 session/account 状态；不允许只匹配 UID 而让尚未过期的已登出 JWT 继续直读 Data API。Realtime 不支持自定义 WebSocket headers，因此不能在频道 RLS 中误用依赖 X-Lingjing-Device-Id 的 HTTP helper。HTTP Edge 必须通过 08 `requireActor` 校验设备/session；Realtime 用其 header-free session guard，退出/失效时客户端移除频道，刷新 JWT 后重新授权。

私有频道 `lingjing:battle:<room UUID>` 的 SELECT 仅参与者能通过；不开放客户端 Broadcast INSERT。Postgres Changes 仅发布房间、回合、邀请，逐行 RLS 继续执行。未解析行动无客户端 SELECT 权限，也不进入 publication，不能提前看到对手选择。

三个权威 RPC 都是 `SECURITY INVOKER`、空 search_path，撤销 PUBLIC/anon/authenticated EXECUTE，只授予 service_role。受控 Edge 用 08 actor 确定 actor UUID/owner，普通读取使用 actor.client；服务端权限只用于不可由客户端伪造的事务写入/目录解析，密钥不会交给桌面或 renderer。

- `lingjing_battle_command(actor,owner,op,actionId,input)`：同 actor/actionId 的完整命令回执；邀请/接受/入房/锁定行动/离开在数据库事务中校验权限。接受邀请与房间/预约对象绑定同事务；命令重放不能换目标、动作或伙伴。
- `lingjing_battle_commit_round(room,round,revision,rawHost,rawGuest,result)`：锁房间，核对版本、双方已锁定动作与 revision；回合插入和状态推进同事务。失败回滚，重复提交返回同一权威回合。
- `lingjing_battle_claim_settlement(actor,owner,room,pet)`：仅已结束参与者与原出战 pet；一次性稳定 `battle:<room>:<owner>` 回执，胜20经验、负5。这里只生成权威奖励凭据，不另建云库存/成长通道。需接 08/领域统一 authority fragment，在同一事务更新受保护存档和 revision，不能把客户端整包当发奖凭证。

## 同一规则核心

`infra/supabase/functions/_shared/battle-core.js` 是原桌面算法的单一源码；`scripts/battle/build-core.mjs` 机械生成桌面 CJS，`--check` 校验源码 SHA256，禁止手工改生成物。原 `services/battle-runtime.cjs` 只保留导出兼容入口。规则 ID `five-elements-standard-v1` 不变，核心版本 `five-elements-standard-v1/2026-10-25` 明确写进每场房间/回合。

`duel-online/room-core.js` 只转换 host/guest DTO，调用同一内核；不重复伤害、怒气、异常状态或胜负公式。未知版本拒绝按新公式解析，历史记录不重算。选招依然不限时，不引入自动动作或判负。

## 已完成的本地验证

从 V3 冻结提交提取 1,200 份确定性黄金序列（初态/50怒气/叠层状态），共 7,162 回合：桌面生成 CJS 与 Edge 源输出完全一致，且每份结果 SHA256 与原版相同。冻结的是数据，不是第二份运行算法。

PGlite 实际执行 08 身份 SQL 和新增对战 SQL，完成真实数据库事务/RLS 检查：邀请/接受/预约入房、非参与者与匿名拒绝、隐藏未解析动作、私有频道 SELECT、不能覆写行动、8回合战斗、失败事务回滚、重复提交同一回合、两张不同 pet/owner 奖励凭据、原 JWT claims 对应 session 删除后拒绝房间/回合/频道直读、账号 locked 后拒绝、RPC 执行权限。此结果明确是本地嵌入式 PostgreSQL，不是远端 Supabase、WebSocket 或真实 Electron 联机证明。

## 后续必须完成

1. 固定 08 主进程 Auth 客户端/refresh/device API，接现有 OnlineDuelService，不另建多人框架；新链路不发送旧 userId/sessionToken 作为授权。
2. 固定受保护账号存档/伙伴查询及 reward authority fragment 事务接口，出战 pet 必须来自服务端已验证归属；不信任 renderer 资源/五行/成长或未授权旧本地 JSON。
3. 自包含 JWT Edge handler、真实 HTTPS/Realtime 客户端和两进程验证器；由主协调部署后进行真实账号、邀请、多回合、断网/重启、双方战报及服务端读回。
4. 真实验收使用两个独立 deviceId、fresh 用户目录、两个 Electron 进程，明确是同机双客户端。不会启用会强制 simulated 身份的 unified-battle QA transport，也不冒称两台实体设备。
5. 旧 `duel-online/index.ts` 中密码/单token和重复规则，在账号桥迁出并确认消费者为零后替换/删除；不因清理旧代码丢失历史读取或账号迁移能力。

## 官方依据

已检查 2026-10-25 changelog。当前 Node/Electron 使用现代 HTTPS/TLS；未引入被弃用的 CBC TLS 或旧 pgcrypto 密码算法。

- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)：private topic 与 Postgres Changes RLS 是两层权限。
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)：记录按 SELECT RLS 授权。
- [Auth sessions](https://supabase.com/docs/guides/auth/sessions)：会话撤销与 JWT 过期的区别。
- [TLS changelog](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)。
