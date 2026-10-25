# 云端领地与菜园契约 · 2026-10-25

基线 `46abf416e0500b53ef32fc29b441d923ef5a6a80` 已在原独立工作树合入。生产迁移与函数部署由主协调执行；本模块不修改旧业务记录、Auth 映射或 battle UI。

## 领域边界

- 账号、伙伴和私人库存继续使用 `runtime_account_saves` 的完整规范 envelope。不得新建第二份宠物或库存库，不修改旧 owner 文本 ID。
- 公共世界使用追加的 `runtime_territory_regions/challenges/actions/attempts` 表；PostGIS Polygon/Point、GiST 索引和行锁负责地理准入、争夺和归属。易主只改变世界记录，私人菜地、库存、聊天和资源保持原样。
- `territory-sync` 接收已验证的08 actor context；客户端不能提交可信 owner、胜者、奖励、对手 HP 或领地边界。数据库 RPC 仅授予 service_role，并启用 RLS、拒绝 anon/authenticated 直接写入。
- 定位准入消费03提供的服务端定位许可，绑定 owner/device、位置、精度、签发与过期时间；不得将 renderer 自报的 `source:'os'` 当成服务器验证。许可适配器未就绪时保留明确错误，不能退回模拟坐标。
- 服务端使用现有 `runtime/services/battle-runtime.cjs` 的标准引擎，通过可核对源哈希的构建适配导入，不另写五行公式。原始引擎和规则版本保持唯一。
- 公共战场继续用现有 sessionId/context/settleContext；领地模块只提供服务端会话适配，不创建另一套战场、技能按钮或动画。

## HTTP 入口与事务

`garden-sync`：snapshot、plant、harvest、craft、feed、claimReward。统一 Auth 包装替换旧 body session_token 身份判断，保留规范库存 reducer 和完整存档 CAS。

`territory-sync`：locate、snapshot、challenge、session、act、settle、garrison、captureContext。所有写入携带 actionId；新写入核对 expectedRevision，原请求重试先读不可变 hash 回执。

挑战保存服务器选定的双方实例、region revision 和标准引擎快照。act 只能选择四种合法动作；服务端推进原规则并持久化轮次，客户端不能提交胜负。settle 只接受该 owner 的已结束挑战，核对锁定的 region revision、服务端结果和当前拥有的 petId。在同一 PostgreSQL 提交中保存世界归属、规范伙伴/库存、账号版本和幂等回执。

并发争夺只有一份当前 revision 的合法占领；过时挑战无权覆盖新主人。败局不占领，不获得占领倍率；正常战斗参与奖励沿用已有规则，必须有服务器完成凭据且只入账一次。非法、过期、非参与者与伪造结果不能产生奖励。驻守只引用当前账号真实 petId，不改变宠物成长或独立选择。

## 08 / 03 依赖

08 正在发布统一 Auth UID→旧 owner / device actor 包装。实现会消费它，禁止本模块创建另一套凭证验证或 owner 映射。

03 定位许可与服务端捕捉准入发布后适配同一许可；`captureContext` 返回服务器世界记录的领地与倍率，捕捉奖励由03权威凭据消费，不能信任客户端传入的收益。

## 验收边界

本地 reducer/HTTP/事务检查与真实 Supabase HTTPS 证据分开。交付包括两个独立进程、不同 deviceId 的脚本，验证同账号并发、两个账号争夺、重复确认、断网后原请求重试、失败和跨账号拒绝；最后由主会话在统一构建中独立验收。不把 PGlite、模拟 Auth 或同机进程称作两个实体设备。

迁移由 Supabase CLI 2.122.0 的 `migration new lingjing_territory_authority --workdir infra` 创建：`20261025020010_lingjing_territory_authority.sql`。部署前必须完成08基础身份/存档迁移及原 Text Comparision 数据保全。

官方依据：[PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Edge Auth](https://supabase.com/docs/guides/functions/auth)。已检查最新 changelog，相关 TLS CBC 弃用不要求恢复旧 TLS 配置。
