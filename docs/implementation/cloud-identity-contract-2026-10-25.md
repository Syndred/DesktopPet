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

规范迁移由 CLI 2.122.0 `migration new` 生成：`20261025021620_lingjing_identity_actor_contract.sql`。新增 `public.lingjing_accounts` / `public.lingjing_devices` 及不可直接读写的 `lingjing_private.legacy_account_claims`。不覆盖既有表。UID 与 owner 分列；新 owner 为独立 `account:<uuid>`，已验证旧记录保留原文本 owner。

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

`20261025024615_lingjing_protected_save_cas.sql` 提供 `lingjing-save` 自验证 Edge 入口（`verify_jwt=false`）。`POST {op:'push',actionId,baseRevision,envelope}` 使用用户 JWT 和设备头，只能修改 `settings` / `conversations`；所有受保护模块及通用表必须与服务器片段完全一致。`read` 无 actionId 读当前完整头，带 actionId 独立读回不可变操作回执；`archive` 保存原始本地档案并返回 `promoted:false`，不生成库存或奖励。所有公开表仅允许本人 SELECT，写入必须经过受限 RPC。冲突 `SYNC_CONFLICT` / 标识复用 `ACTION_ID_REUSED` 为409，不能自动强推。

领域 SQL 受控函数在同一事务中按以下顺序执行：

1. 从统一 actor 验证 owner、petId、参与者和经济权限。调用 `lingjing_private.lock_save_owner(owner)` 后再锁领域行；跨两个 owner 时按 owner 文本排序锁定，避免互相等待。
2. 执行领域变更，使用 actionId 幂等回执。只有成功的变化能够进入下一步。
3. 从已验证的服务端行生成完整领域片段，调用 `lingjing_private.commit_authority(owner, 'garden:<actionId>', fragments, expectedRevision或null)`。必须在同一个数据库事务中；不得在已发奖后另发第二个 SDK 请求补存档。发生异常整个事务回滚。

`fragments` 示例：`{"garden":{"module":{"version":1,"data":领域备份适配器原格式},"tables":{}},"companions":{"module":{"version":1,"data":伙伴备份原格式},"petIds":["保持原始petId"]}}`。module 和 tables 可省略其中一项，省略的领域 module 表示该域只维护表片段。tables 的每个值必须是正式 SQLite 备份的 `{schema:[...],rows:[...]}`，每一行 `owner_account_id` 必须是目标 owner。应由领域部署代码固定结构生成，不接收客户端自报 schema、余额、经验或胜负。petIds 仅 companions 的可信事务可登记，主键为 `(owner_id,pet_id)`，不假设历史 petId 跨账号唯一；所有验证同时匹配 owner，不因退役删除历史聊天的归属记录。

02 的正常云端入口必须提供受控初始化/领养、选择、改名及位置更新，并为当前 owner 登记宠物。新账号可以按服务端已定义规则领取初始伙伴；已有档案仅经可信旧源或合法领域凭据保留原 ID/成长/库存。不能因为没有登记而让新账号一直无法聊天、探索和对局，也不能把整包客户端进度当作初始化奖励。相同旧 petId 可以分别属于两个 owner，实际请求不得混用这两个复合身份。

可用受保护模块名：`garden`、`discovery`、`battle`、`companions`、`resources`、`character-resources`、`legacy`。不同领域不得同时声明同一张表。该函数重建所有领域的受保护层并保留个人设置/聊天，统一版本只增一次；重复相同 actionId 返回原回执。`public.lingjing_commit_authority` 仅 service_role 可用，供经服务端验证的 Storage/可信旧源收据导入；它不对普通客户端开放。领域数据库事务直接调用 private helper，无需服务密钥。

JSON SHA256 和现有备份保持兼容，SQL 处理 UTF-16 键排序及 ECMAScript 最短数字串（包括1e23、subnormal），不能用 PostgreSQL 默认 JSONB 文本替代。归档保留未验证玩法数据但不会变成权威头；旧源仍需可信数据与凭据验证。不能部署旧 `accounts-sync` 的 runtime session_token 实现作为新权限模型。

## Electron 主进程消费接口

默认账号入口改用 `SupabaseRemote`，开发源码默认读取仓库 `config/lingjing-cloud-public.json`，发布包读取 `resources/lingjing-cloud-public.json`。`LINGJING_PUBLIC_CONFIG` 指向的公开 JSON、`LINGJING_SUPABASE_URL` / `LINGJING_SUPABASE_PUBLISHABLE_KEY` 环境变量可显式覆盖。配置只允许 HTTPS + 现代 publishable key，secret 永不接入桌面。设备 UUID 位于当前 userData 的 `accounts/device.json`，每个独立用户目录独立保存。旧单 token HTTP 适配仅显式 `LINGJING_LEGACY_AUTH=1` 可启用，不用于新账号路径。

领域从 `services.get('cloudActor')` 取得主进程能力：`await requireActor()` 或 `await invoke('lingjing-领域函数', body)`。也可调用 `accounts.requireCloudActor()` / `accounts.cloudInvoke(name,body)`。前者返回公开 actor 字段以及非枚举的 `.client`（官方 Supabase SDK，含用户 JWT/设备头）、`.invoke(name,body)`（会刷新令牌）、`.accessToken`、`.url` 和 `.publishableKey`。资源模块每次 Storage 操作重新取得 context，同SID复用同一SDK及其动态令牌回调；不要跨owner/SID缓存身份或转发到renderer。`JSON.stringify(context)` 不含这些字段。领域还应在异步结果应用本地前核对 owner/会话，统一 invoke 已阻止退出/切号后的旧结果生效。

07已发布的 `services.get('cloudAuth')` 是同一个 `cloudActor` 对象的兼容名称，无第二套身份或会话；`requireActor(expectedOwner?)` 在返回前再验证显式目标owner。新领域统一使用cloudActor。

旧 `requireRuntimeUser()` 对新 Auth 返回 `CLOUD_PROTOCOL_UPGRADE_REQUIRED`，`privateSession().sessionToken` 为null，JWT不会误发到原HTTP。新 Auth证明仅在主进程的 `cloudProof`，包含Auth SDK签发的access/refresh；既有 `SessionVault` 用Windows safeStorage加密保存证明。SQLite仅追加 `account_cloud_links` 记录稳定 owner 与Auth UID，不保存令牌。刷新合并并发请求，成功后同步更新加密凭据；退出/切号epoch与旧proof检查阻止迟到刷新恢复登录。

同一个 owner/device/Auth session 取得的 `.client` 是同一个官方 SDK 实例。SDK 使用 `accessToken` 异步 callback，由账号模块在每次 Data API/Storage 请求及 Realtime callback/heartbeat/reconnect 时取得仍有效的 access JWT；没有固定 Authorization header。刷新后账号模块调用 `client.realtime.setAuth()` 更新现有频道，并保持callback模式。消费者不得手动 `setAuth(token)` 固定令牌；SDK的 `.auth` 不对领域开放，密码/刷新由账号模块独占。退出、失效、切账号或Auth session更换时取消频道并断开连接，旧SDK回调不再提供该账号JWT。`.accessToken` 是兼容的瞬时值，长期任务必须使用SDK callback或 `.invoke()`，不可缓存该字符串。

`20261025032327_lingjing_session_revocation_ledger.sql` 追加私有、禁止UPDATE/DELETE的 `revoked_auth_sessions`，永久记录显式撤销和被新登录替换的SID。register/revoke按owner行锁序列化，等锁后再查SID。`live_session_id()` 共用检查使直接authenticated RPC、actor、session和RLS均拒绝旧SID，不能只依赖当前device行或Edge。升级时保留全部当前有效设备绑定，只补记已撤销行及已关联灵境账号当前未绑定的旧Auth sessions，以关闭旧实现已丢失的替换历史；不改Auth表数据，不扩大service_role对auth表读取权限。迁移瞬间尚未完成设备绑定的登录可能需要重新登录一次，原密码和存档不变。

所有service-role业务提交在同一事务先调用 `lingjing_private.assert_service_actor(owner,authUid,deviceUuid,sessionUuid)`：取得owner `FOR UPDATE`规范锁后，锁住真实Auth用户/session `FOR SHARE`，复核activeowner、nonanonymous、实际not_after/clock_timestamp、immutable撤销账本和当前device/SID。锁保留到业务提交结束，把退出/撤销与提交线性化；没有新Auth表读取授权。helper私有definer、空search_path、仅service_role可EXEC。`20261025033602` 提供helper，`20261025033734` 保持03 discovery live_actor、05 territory_check_actor和02 companion command签名/授权及业务内容，替换其重复身份检查；04/07新RPC应直接调用同一helper并传四个已验证身份字段。

主进程受保护同步先完整保存 `account_sync_sources.original_document`，再按已确认的 cloudRevision 拼合个人设置/聊天与当前服务端权威片段。缺少可信来源的本机玩法差异只上传 `promoted:false` 安全投影，不会覆盖云库存。`cloud-projection.cjs` 排除旧legacy原文、raw/source_json、凭据字段及配置JSON内嵌的凭据，单列 `original_checksum` 与 `cloud_projection_checksum` 和排除项；不能把安全投影称为完整原档云备份。本机旧源原件、原始快照和备份保留。同步结果 `requiresAuthority:true` / `privacyRedactions:true` 时只声明可同步内容成功，UI显示核验/私密字段留在本机。冲突不会重定基准版本；显式云恢复前生成原档备份。已经准备的CAS输入在网络/响应丢失后原样重试，不能重新读取新版头覆盖原action内容。

`20261025030859_lingjing_cloud_secret_guard.sql` 与客户端使用一致的schema边界：`conversations.data.tables.conversation_messages.content`、`conversation_memories.content`、`conversation_profiles.persona/reply_style` 的字符串是用户正文，逐字保留，即使正文是 `{"password":"EXAMPLE_PLACEHOLDER","enabled":true}`。只有这些明确字段免于字符串JSON配置解析；其他位置的nested/serialized credential继续拒绝。通用表的对应正文叶子也使用完整路径判断，不能通过带点的伪造key名绕过。公开业务 `proof`（例如捕捉回执）不视为登录密钥，`cloudProof/sessionProof/authProof` 才是账号私密字段。

02 的 `6435a13` 已合入并解决sync冲突。`BackupManager.normalizeData(data,owner)` 可通过已注册adapter的 `legacyTables/fromLegacyTables` 在验证后生成通用表→正式模块的恢复/指纹视图，原envelope和checksum不改。受保护同步仅用该视图比较归属及差异，上传CAS仍原样携带服务器权威片段，不能用转换生成自报玩法状态。显式云恢复新增对应checksum/revision checkpoint，避免恢复成功后因旧回执被误报为待同步。

## 当前验证和来源

## 旧源恢复后的准备工具

`node scripts/migration/prepare-lingjing-legacy-claims.cjs <runtime_accounts.json> <manifest.json> <新的输出目录>` 仅本机准备，不执行网络写入、创建Auth用户或重置密码。manifest 必须是 `format:lingjing-server-export,version:1,environment:production`，`source:{origin:http://47.112.208.97:8000,collection:public.runtime_accounts,instanceId:真实实例标识}`，`provenance:{kind:operator-server-export,mode:live}`，`file:{sha256,byteLength,rowCount}`。原导出需来自运营方实际恢复的服务器/备份，文件manifest本身不能证明来源；主协调仍必须独立验证取证链。空表、QA/模拟来源、comparison项目、重复owner/账号及损坏校验拒绝。

输出仅 `claims.dpapi`（Windows当前用户加密，entropy为公开字符串 `LINGJING_LEGACY_CLAIMS_V1`）与不含用户名/密码摘要的audit.json；不覆盖原导出或旧输出。每条claim保持原TEXT owner、用户名、原SHA256密码语义及创建时间，关联源record/manifest摘要。主协调后续在安全内存中解密、复核来源后才能阶段性写私有claims表；登录端验证原密码后才创建并绑定Auth身份。该工具的3个合成用例不代表已经拿到旧服务器数据。宠物/成长/库存/消息/资源的旧源导入仍需各域核对，audit明确 `cloudMigrationCompleted:false`。

真实Auth由主协调部署并HTTPS8/8验收；CAS部署后的主进程HTTPS11/11证据为 `docs/implementation/evidence/accounts/cloud-2026-10-25/main-http.json`。早期双Electron8项仅个人/部分同步的历史证据仍保留，不能用它声明完整存档。secret guard及事务内actor guard均由主协调集中部署。

后续已验证且提交到 `docs/implementation/evidence/accounts/cloud-2026-10-25/`：实际并发CAS两种竞争均正确；主协调managed-valid旧SID重绑/refresh拒绝且独立设备继续有效；嵌套/serialized假凭据5种拒绝且安全投影独立DB读回无假标记；原签发JWT自然过期被Auth403 bad_jwt(expired)及save401拒绝；生产聊天adapter生成的消息/记忆/人设JSON示例经过合法云领养、CAS及独立Data API读回逐字一致且整包checksum不变。

历史 `dual-electron-full.json` 的9项检查各自成立，`fullSaveVerified:true`只说明该次完整保存已核验。独立复查发现：A最终revision5/volume54，B仅远程读回相同回执，本机仍revision4/volume43；当时30秒任务只flush，没有自动拉取，也没有为个人改动自动建队。它不能证明最终双端一致。原证据和原SQLite继续保留，差异见 `automatic-gap-retrospective.json`，不能覆盖历史文件来消除这个缺口。

所有已生成的本地/云端恢复预览在adopt/logout/当前owner会话失效时清空，只清内存预览，不删原备份或缓存。同SID自动令牌刷新仍允许恢复。真实SQLite搭配明确模拟Auth的回归确认：同owner新SID即使本机指纹不变，旧previewId也不能写入恢复；原备份字节不变。最终账号范围54项、UI类型检查和生产构建通过，build-manifest记录源码7a6b04a及干净工作区。完成前已再次执行 `git pull --no-rebase --no-edit origin main`，结果为已是最新，origin/main为4786f97680679c2db0aa307fa5f67ec247f93086。

## 安全自动同步与最新双端收敛验收

280328d复用正式30秒任务、SDK、持久outbox及备份恢复。accounts-007只新增本机 `account_sync_baselines`，保存已确认版本/envelope校验和及个人/受保护内容指纹，不存登录令牌，不改云端协议/RLS。自动上传必须已有匹配的已确认基线、受保护指纹未变且没有待处理冲突或未核验/隐私裁剪原档；只为个人改动生成一次持久auto action，然后执行原CAS/readback。断网、响应丢失和重启继续使用原action/base，不静默重定版本。

自动读回只允许替换相对检查点完全干净的本机。云端读取和prepareCloud前后核对owner/device/SID/epoch、本机完整指纹、检查点、同步开关及待处理/未核验状态；异步期间新增改动、退出或同owner新SID均拒绝应用，同SID自动刷新允许继续。同步恢复事务先保留before-restore文件；恢复后的完整规范数据必须与读回一致才提交checkpoint。已由其他领域合法应用且完整视图与云端完全相同的情况，只确认严格读回，不覆盖本机；不因单一领域更新直接宣称其他个人内容已同步。

主进程sync/settings/save-restored事件让实际账号页刷新状态；未检查、正在同步、待处理、部分内容和云端较新均不宣称完整“已同步”。dirty/离线/冲突保留本机与原任务，仍提供显式预览及保档恢复。

最新真实证据为 `docs/implementation/evidence/accounts/cloud-2026-10-25/automatic-sync/evidence.json`，源码280328d、8项通过。首次建立基线以后没有调用立即同步、重试或runAutomaticSync，只等待正式定时器：正常设置修改自动上传并实际落地B；B的本机volume42面对较新云端时保留原action并显示冲突；显式恢复保留42原档；A断网任务 `auto:72f3e76a-4cd5-4d96-b374-6aabc95f8b36` 以原base5跨真实Electron进程重启后自动提交revision6，B持续运行自动恢复54。两端UI订阅实际显示已同步，两份query_only SQLite、完整规范数据指纹及独立Supabase MCP SELECT均一致：revision6、volume54、checksum `d2cfa0ddb6eb76fd7e18d61c3c62e6d194372aee22bd52d122ef1bf8b8f6ff89`。快照、冲突截图、构建来源、独立SQL回读及摘要manifest均在同目录。没有复制凭据文件/JWT/密码。

最新账号回归73项、领域/checkpoint集成9项、UI类型检查和生产构建通过。生产conversation adapter的消息/记忆/人设自动排队另有明确模拟provider的真实SQLite用例，未宣称真实LLM生成。本机双进程未冒称两台实体设备或私有Realtime频道重连；旧服务器全量迁移与最终EXE联合发布仍由主协调处理。完成前04:56:56 UTC再次pull origin/main，仍为已是最新；无自行部署、云端SQL写入或恢复旧网络入口。

官方资料（2026-10-25 已核对）：[Auth sessions](https://supabase.com/docs/guides/auth/sessions)、[Sign out scopes](https://supabase.com/docs/guides/auth/signout)、[Edge secrets](https://supabase.com/docs/guides/functions/secrets)、[新 API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。已检查最新 changelog，Node/Electron 使用现代 TLS；未引入自造 JWT 或第二套认证密码系统。
