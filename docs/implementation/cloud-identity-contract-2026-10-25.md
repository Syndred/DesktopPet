# 灵境共享云身份与存档权限契约

状态：第一阶段身份接口已实现，待主协调部署；账号登录桥、完整存档 CAS 和真实 HTTP/Electron 双客户端验收继续实施。PGlite 仅是本地 SQL 检查，不能算真实 Supabase 通过。

目标项目 `jbvrdmrkwpznbrvteive`。不读取或迁入 comparisontext 的用户记录；不修改它的私有归档。旧 DesktopPet 实例 `http://47.112.208.97:8000` 无凭据健康检查超时/UND_ERR_SOCKET，且暂无 SSH 或源备份。旧全量云账号迁移单列外部未完成项；不能把空 Auth 库当迁移成功，也不接受客户端自报旧 owner。新账号和云权限实施不依赖旧实例可达。

## 公共身份

`infra/supabase/functions/_shared/lingjing-auth.ts` 提供 `requireActor(request)`、`withActor(handler)`、`readJson`、`jsonResponse`、`assertActorOwner`、`assertDifferentPlayers`。返回：

```ts
type LingjingActor = {
  schemaVersion: 1; authority: 'live'; authKind: 'supabase';
  authUserId: string; ownerAccountId: string; deviceId: string; sessionId: string;
  account: string; username: string;
};
// ActorContext.client 是携带当前用户 JWT 的 Supabase SDK，仅服务端使用，
// 不可枚举，不会随 JSON 序列化。普通领域操作不要使用 admin client。
```

客户端请求必须带 `Authorization: Bearer <Supabase user JWT>`、`apikey: <modern publishable key>`、`X-Lingjing-Device-Id: <UUID>`。设备 ID 稳定保存在各独立用户目录，不作为不同玩家身份。helper 先实际调用 `auth.getUser(jwt)`，然后 RPC 验证 auth.sessions 活跃性、非匿名用户、UID→文本 owner 映射和该 device/session 绑定。不信任 user_metadata、renderer owner 或旧 session_token。

现代 Edge 环境使用 JSON 字典 `SUPABASE_PUBLISHABLE_KEYS['default']` / `SUPABASE_SECRET_KEYS['default']`；helper 集中读取，兼容单数和旧变量仅作 fallback。此项目旧 anon key 已被主协调实测为无效，因此部署需确认现代字典存在。`supabasePublicConfig()` / `createAdminClient()` 分别供用户验证与账号桥调用。secret 不进入 renderer、提交、日志或证据。

部署 `verify_jwt=false`，所有受保护的业务函数必须使用 `withActor` / `requireActor` 完成实际认证。这与允许匿名访问是不同配置。账号密码入口本身可以无 JWT；后续 actor/device/业务操作必须验证用户 JWT。新 username 账号通过受控 Auth 管理 API 创建 named user 并确认内部登录标识，不依赖目标项目默认邮件自动确认开关。该桥及节流/渐进迁移在后续提交交付。

## SQL / RLS

规范迁移由 CLI 2.122.0 `migration new` 生成：`20261025020314_lingjing_identity_actor_contract.sql`。新增 `public.lingjing_accounts` / `public.lingjing_devices` 及不可直接读写的 `lingjing_private.legacy_account_claims`。不覆盖既有表。UID 与 owner 分列；新 owner 为独立 `account:<uuid>`，已验证旧记录保留原文本 owner。

对外 RPC：

- `lingjing_register_device(p_device_id, p_label)`：在经验证 Auth 登录后建立当前 device/session 绑定；不会替换同账号其他 device。
- `lingjing_actor_context(p_device_id)`：返回上述公共 actor。
- `lingjing_current_owner()`：领域 RLS 的统一文本 owner。
- `lingjing_revoke_device(p_device_id)`：仅当前 owner 的设备；常规退出只撤销当前 device，并使用 Supabase `signOut({scope:'local'})`，不全局互踢。
- `lingjing_link_auth_user(...)`：仅 `service_role` 可执行。新账号由服务端 Auth API创建，旧 owner 只能来自受控源清单。函数通过 FK 检查 Auth UID存在，不要求 service_role 读取 auth.users。匿名排除和 session 活跃性在私有权限查验函数中独立执行。

领域表使用 `owner_account_id text`，不把它改为 Auth UUID。SELECT/UPDATE/DELETE 用 `owner_account_id = (select public.lingjing_current_owner())`；UPDATE 同时有 USING / WITH CHECK。需要事务写入的权威表不直接开放客户端写权限；用领域受控 RPC，固定空 search_path 并显式撤销 PUBLIC/anon EXECUTE。私有 Auth 查验函数仅访问必要 auth.sessions/users 字段，未扩大 service_role 的 auth.users SELECT 权限。

## 各域接入

- 04 联机：actor 的 owner 是玩家身份；同 owner 两个 device 不能充当两名对战玩家，调用 `assertDifferentPlayers`。真实 JWT 不传入旧 HTTP/单 session_token 传输。新增云联机后端消费同一 actor，当前 UI 所有权不变。
- 05 领地/菜园：相同 actor.client 与 owner；地理/库存/结算函数在事务内验证参与者、胜负、actionId/revision，并更新受保护存档状态。
- 03 探索/捕捉：owner/petId 归属用同一映射，位置、捕捉和奖励凭证由该域权威验证；模拟明确区分，不能写成 live 定位成功。
- 07 资源 Storage：私有 bucket，路径第一段为稳定 owner；Storage policy 通过 `lingjing_current_owner()` 验证，并传同样设备头。manifest/hash/owner 共同校验，不上传密钥。
- 02 伙伴 / 06 聊天：保留原 petId、消息/成长实例关联。客户端只提交个人允许同步的部分；领域权威状态不得被整包覆盖。

## 完整存档的权限边界（后续 CAS 实现必须满足）

结构正确、owner 正确和 checksum 正确不构成改写玩法状态的权限。`garden / discovery / battle / companions / resources / legacy` 模块及其 SQL 表默认受保护；个人设置/聊天等白名单部分可走用户 CAS。已成为云端权威的库存、奖励、捕捉、领地、成长和战报，只能由对应受控事务从真实数据生成 authority fragment。完整存档 push 必须与该受保护片段一致；首次迁移没有可信源时保存原档为未授权迁移档案，不能凭本地 JSON 自动生成云端经济/胜利。其他域必须在同一事务提交权威片段和统一存档 revision，避免先发奖再补存档的分叉。

## 完整存档与领域事务接口

`20261025021759_lingjing_protected_save_cas.sql` 提供 `lingjing-save` 自验证 Edge 入口（`verify_jwt=false`）。`POST {op:'push',actionId,baseRevision,envelope}` 使用用户 JWT 和设备头，只能修改 `settings` / `conversations`；所有受保护模块及通用表必须与服务器片段完全一致。`read` 无 actionId 读当前完整头，带 actionId 独立读回不可变操作回执；`archive` 保存原始本地档案并返回 `promoted:false`，不生成库存或奖励。所有公开表仅允许本人 SELECT，写入必须经过受限 RPC。冲突 `SYNC_CONFLICT` / 标识复用 `ACTION_ID_REUSED` 为409，不能自动强推。

领域 SQL 受控函数在同一事务中按以下顺序执行：

1. 从统一 actor 验证 owner、petId、参与者和经济权限。调用 `lingjing_private.lock_save_owner(owner)` 后再锁领域行；跨两个 owner 时按 owner 文本排序锁定，避免互相等待。
2. 执行领域变更，使用 actionId 幂等回执。只有成功的变化能够进入下一步。
3. 从已验证的服务端行生成完整领域片段，调用 `lingjing_private.commit_authority(owner, 'garden:<actionId>', fragments, expectedRevision或null)`。必须在同一个数据库事务中；不得在已发奖后另发第二个 SDK 请求补存档。发生异常整个事务回滚。

`fragments` 示例：`{"garden":{"module":{"version":1,"data":领域备份适配器原格式},"tables":{}},"companions":{"module":{"version":1,"data":伙伴备份原格式},"petIds":["保持原始petId"]}}`。module 和 tables 可省略其中一项，省略的领域 module 表示该域只维护表片段。tables 的每个值必须是正式 SQLite 备份的 `{schema:[...],rows:[...]}`，每一行 `owner_account_id` 必须是目标 owner。应由领域部署代码固定结构生成，不接收客户端自报 schema、余额、经验或胜负。petIds 仅 companions 的可信事务可登记，主键为 `(owner_id,pet_id)`，不假设历史 petId 跨账号唯一；所有验证同时匹配 owner，不因退役删除历史聊天的归属记录。

02 的正常云端入口必须提供受控初始化/领养、选择、改名及位置更新，并为当前 owner 登记宠物。新账号可以按服务端已定义规则领取初始伙伴；已有档案仅经可信旧源或合法领域凭据保留原 ID/成长/库存。不能因为没有登记而让新账号一直无法聊天、探索和对局，也不能把整包客户端进度当作初始化奖励。相同旧 petId 可以分别属于两个 owner，实际请求不得混用这两个复合身份。

可用受保护模块名：`garden`、`discovery`、`battle`、`companions`、`resources`、`character-resources`、`legacy`。不同领域不得同时声明同一张表。该函数重建所有领域的受保护层并保留个人设置/聊天，统一版本只增一次；重复相同 actionId 返回原回执。`public.lingjing_commit_authority` 仅 service_role 可用，供经服务端验证的 Storage/可信旧源收据导入；它不对普通客户端开放。领域数据库事务直接调用 private helper，无需服务密钥。

JSON SHA256 和现有备份保持兼容，SQL 处理 UTF-16 键排序及 ECMAScript 最短数字串（包括1e23、subnormal），不能用 PostgreSQL 默认 JSONB 文本替代。归档保留未验证玩法数据但不会变成权威头；旧源仍需可信数据与凭据验证。不能部署旧 `accounts-sync` 的 runtime session_token 实现作为新权限模型。

## 当前验证和来源

## Electron 主进程消费接口

默认账号入口改用 `SupabaseRemote`，开发源码默认读取仓库 `config/lingjing-cloud-public.json`，发布包读取 `resources/lingjing-cloud-public.json`。`LINGJING_PUBLIC_CONFIG` 指向的公开 JSON、`LINGJING_SUPABASE_URL` / `LINGJING_SUPABASE_PUBLISHABLE_KEY` 环境变量可显式覆盖。配置只允许 HTTPS + 现代 publishable key，secret 永不接入桌面。设备 UUID 位于当前 userData 的 `accounts/device.json`，每个独立用户目录独立保存。旧单 token HTTP 适配仅显式 `LINGJING_LEGACY_AUTH=1` 可启用，不用于新账号路径。

领域从 `services.get('cloudActor')` 取得主进程能力：`await requireActor()` 或 `await invoke('lingjing-领域函数', body)`。也可调用 `accounts.requireCloudActor()` / `accounts.cloudInvoke(name,body)`。前者返回公开 actor 字段以及非枚举的 `.client`（官方 Supabase SDK，含用户 JWT/设备头）、`.invoke(name,body)`（会刷新令牌）、`.accessToken`、`.url` 和 `.publishableKey`。资源模块每次 Storage 操作重新取得 context；不要长期缓存 SDK 对象或转发到 renderer。`JSON.stringify(context)` 不含这些字段。领域还应在异步结果应用本地前核对 owner/会话，统一 invoke 已阻止退出/切号后的旧结果生效。

旧 `requireRuntimeUser()` 对新 Auth 返回 `CLOUD_PROTOCOL_UPGRADE_REQUIRED`，`privateSession().sessionToken` 为null，JWT不会误发到原HTTP。新 Auth证明仅在主进程的 `cloudProof`，包含Auth SDK签发的access/refresh；既有 `SessionVault` 用Windows safeStorage加密保存证明。SQLite仅追加 `account_cloud_links` 记录稳定 owner 与Auth UID，不保存令牌。刷新合并并发请求，成功后同步更新加密凭据；退出/切号epoch与旧proof检查阻止迟到刷新恢复登录。

同一个 owner/device/Auth session 取得的 `.client` 是同一个官方 SDK 实例。SDK 使用 `accessToken` 异步 callback，由账号模块在每次 Data API/Storage 请求及 Realtime callback/heartbeat/reconnect 时取得仍有效的 access JWT；没有固定 Authorization header。刷新后账号模块调用 `client.realtime.setAuth()` 更新现有频道，并保持callback模式。消费者不得手动 `setAuth(token)` 固定令牌；SDK的 `.auth` 不对领域开放，密码/刷新由账号模块独占。退出、失效、切账号或Auth session更换时取消频道并断开连接，旧SDK回调不再提供该账号JWT。`.accessToken` 是兼容的瞬时值，长期任务必须使用SDK callback或 `.invoke()`，不可缓存该字符串。

主进程受保护同步先完整保存 `account_sync_sources.original_document`，再按已确认的 cloudRevision 拼合个人设置/聊天与当前服务端权威片段。缺少可信来源的本机玩法差异上传为 `promoted:false` 原档，不会覆盖云库存。同步结果 `requiresAuthority:true` 时只声明个人内容成功，UI明确显示历史进度待核验；所有本机数据仍可导出。冲突不会重定基准版本；显式云恢复前生成原档备份。已经准备的CAS输入在网络/响应丢失后原样重试，不能重新读取新版头覆盖原action内容。

本地 `cloud-identity-sql.test.mjs` 已验证：旧文本 owner保留、客户端不能绑定/读取旧凭据、两个 device/session 同时有效、跨 owner/假设备/失效 session 拒绝、撤销单设备不踢另一设备。Deno 2.9.6 类型检查通过；SDK 2.98.0 固定并保留 lock。已合入 Electron44.9.3 / SQLite13.0.3 公共检查点并通过 native:check，未 rebuild 共用 node_modules。真实云端迁移/HTTP结果仍待集中部署，不以这些本地检查代替。

官方资料（2026-10-25 已核对）：[Auth sessions](https://supabase.com/docs/guides/auth/sessions)、[Sign out scopes](https://supabase.com/docs/guides/auth/signout)、[Edge secrets](https://supabase.com/docs/guides/functions/secrets)、[新 API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。已检查最新 changelog，Node/Electron 使用现代 TLS；未引入自造 JWT 或第二套认证密码系统。
