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

第二个CLI迁移 `20261025034748_lingjing_battle_authority_save.sql` 依赖08 protected CAS及第一份battle迁移。只新增训练会话/命令/结算表和同事务RPC，不改旧历史。好友和训练活动成员互斥，遵守统一账号行优先的锁顺序。第三份 `20261025040739_lingjing_battle_scoped_authority_receipt.sql` 将08 CAS动作键改为短的 `battle-authority:<mode>:<UUID>`，原领域奖励actionId和旧回执不变；160字符原owner的SQL到SQLite重放已通过。三份均已由主协调部署，04未部署或改远端历史。

正式函数名 `lingjing-battle`，部署文件闭包由 `node scripts/cloud/read-edge-bundle.cjs lingjing-battle --json` 收集和校验，不手选入口与依赖。`scripts/battle/build-cloud.mjs`机械打包同一核心/02成长与模板/05菜园及JSON，`--check`按仓库相对路径与CRLF规范化SHA校验，不手改生成物。完整TS源码仍保留审查。08 withActor校验真实JWT/活跃Auth session/owner/device；verify_jwt=false只关闭旧网关校验，不关闭函数认证。旧duel-online入口已退役。

## 同一规则核心

`infra/supabase/functions/_shared/battle-core.js` 是原桌面算法的单一源码；`scripts/battle/build-core.mjs` 机械生成桌面 CJS，`--check` 校验源码 SHA256，禁止手工改生成物。原 `services/battle-runtime.cjs` 只保留导出兼容入口。规则 ID `five-elements-standard-v1` 不变，核心版本 `five-elements-standard-v1/2026-10-25` 明确写进每场房间/回合。

`lingjing-battle/room-core.js`只转换host/guest DTO，调用同一内核；不重复伤害、怒气、异常状态或胜负公式。未知版本拒绝解析，历史记录不重算。训练也使用该内核原AI。选招依然不限时，不引入自动动作或判负。

主进程消费08 cloudActor.requireActor()的稳定SID SDK及fresh invoke。Realtime仅调用无参setAuth()，保留SDK accessToken callback，不把显式旧JWT钉在manual模式。退出/切账号拆频道。create/join/invite/训练start先持久化原请求编号，恢复服务端原行动；网络失败不改成下一回合的新命令。云端结算后必须另发HTTPS读取 `proof.authority.actionId` 对应的完整存档，同时核对原领域奖励actionId、revision/checksum/owner/report，再在同一SQLite事务恢复02/05/04一致性单元；不再本机追加XP或种子。有独立本机操作时保留并报冲突。

真实重连暴露了安装版realtime-js2.98的teardown缓存行为：主动disconnect清掉close绑定，但旧topic对象仍可能保留。04先串行化频道替换，再调用正常removeChannel；若仅该失效对象仍占据原topic缓存，才精确移除该旧登记，不清空同一SDK其他模块订阅。真实刷新／重连后继续完成回合，并收到了双方实际私有频道推送。

## 已完成的本地验证

从 V3 冻结提交提取 1,200 份确定性黄金序列（初态/50怒气/叠层状态），共 7,162 回合：桌面生成 CJS 与 Edge 源输出完全一致，且每份结果 SHA256 与原版相同。冻结的是数据，不是第二份运行算法。

PGlite 实际执行 08 身份 SQL 和新增对战 SQL，完成真实数据库事务/RLS 检查：邀请/接受/预约入房、非参与者与匿名拒绝、隐藏未解析动作、私有频道 SELECT、不能覆写行动、8回合战斗、失败事务回滚、重复提交同一回合、两张不同 pet/owner 奖励凭据、原 JWT claims 对应 session 删除后拒绝房间/回合/频道直读、账号 locked 后拒绝、RPC 执行权限。此结果明确是本地嵌入式 PostgreSQL，不是远端 Supabase、WebSocket 或真实 Electron 联机证明。

## 真实原生验收与清退

独立只读核对：项目有8个ACTIVE函数和22份迁移，对战为v2。02正式领养／选择／读回及05原子库存已接入。测试账号通过正式Auth建立、宠物通过正式领养，不做管理式种数据。

1. 同机独立Electron44.9.3客户端完成真实邀请、接受、入房、10个自然回合和双方实际私有频道推送；真实响应读取中断、原actionId重试、Auth刷新／同SDK回调认证重连、原生进程重启均已覆盖。
2. 双方战报真实显示并在重启后保持。修复战报回放缺少TooltipProvider的上下文，不改CSS。重复结算与只读SQLite核对确认每场恰好一份成长、2粒种子和完整战报。
3. 同账号第二客户端通过实际界面接管云训练，原AI自然完成20回合；两端成长、背包、战报一致。该训练自然失败获得+5，好友胜利+20，因此A最终经验25；B好友失败后为5。
4. 实际撤销一台设备后，保存的原JWT仍能通过Auth验证；房间／回合REST各返回403 LJ_SESSION_REVOKED，私有频道CHANNEL_ERROR；另一同账号设备仍可读取原房间并SUBSCRIBED。
5. `65e4210` 删除OnlineDuelService旧HTTP／密钥／launcher默认连接及注册／登录／改密方法。正常检索和房间请求不附旧正文身份，只消费08 SDK/JWT。旧模拟身份仅由隔离QA adapter构造。旧SQL／VM测试入口已转至现代JWT数据库与共享room-core；旧历史读取保留。清退后的真实原生登录、原终局／战报打开、私有频道与重启持久化已定向通过。

完整证据与8个隔离目录readOnly/query_only核对见 [cloud-native-v2/README.md](evidence/battle/2026-10-25/cloud-native-v2/README.md)。证据按原始运行及文件SHA相连：前两轮在后续界面／脚本阶段失败，保持其原始false状态，再定向补验剩余范围；不宣称一次不中断全程通过，也不宣称两台实体设备。

04源码／证据已合入，主协调已独立核对真实房间、双账号云端奖励和8份原生SQLite档。旧Edge／SQL已按恢复审计删除，远端迁移历史未修改。主协调继续负责08资源水合／raw指纹守卫整合、最终冻结和成品验收；04不执行远端部署或删除远端历史。

## 官方依据

已检查 2026-10-25 changelog。当前 Node/Electron 使用现代 HTTPS/TLS；未引入被弃用的 CBC TLS 或旧 pgcrypto 密码算法。

- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)：private topic 与 Postgres Changes RLS 是两层权限。
- [Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)：记录按 SELECT RLS 授权。
- [Auth sessions](https://supabase.com/docs/guides/auth/sessions)：会话撤销与 JWT 过期的区别。
- [TLS changelog](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)。
