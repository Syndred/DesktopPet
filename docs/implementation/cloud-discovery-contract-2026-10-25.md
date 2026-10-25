# 云端探索与定位许可契约

本轮目标在原 discovery 工作树实施，已合入公共基线 `46abf41`、身份检查点 `f81008c` 和统一 Auth/受保护 CAS `3474905`。当前签名定位层可独立部署，野外会话状态机已实现，游戏 SQL/统一存档事务及真实 HTTPS 验收仍在实施。04 对局 UI 未修改，也未读取/触碰其工作树。

## 可独立部署的定位检查点

主协调可立即按以下依赖顺序集中部署，无需等待完整捕捉事务：08已部署统一身份及 Auth bridge → `20261025020719_lingjing_discovery_cloud_authority.sql` → `20261025025641_lingjing_discovery_live_actor_guard.sql` → `discovery` 函数（`verify_jwt=false`，随目录包含 `_shared/lingjing-auth.ts`、`_shared/battle-core.js` 及函数自己的文件）。本会话没有远程写入、迁移或部署。

这个入口当前开放 `protocol/device.register/location.challenge/location.prove/nearby`；reserve/session/act/cancel/confirm/captures/action 仍返回明确的 `CLOUD_AUTHORITY_NOT_READY`，不能把位置组件上线当作完整捕捉上线。第二份迁移为所有定位调用增加当前08账号和设备/session/撤销状态校验，以 `FOR SHARE` 锁定统一映射至本次事务完成，不增加 auth.users/auth.sessions 权限。

05直接依赖上述两份迁移的 `public.lingjing_discovery_take_location`。桌面私有能力为 `services.get('locationProofs').prove(purpose,reference)`；它从原位置隐私/前台/80米质量闭包读取 fix，只返回服务端许可，不接受坐标且没有 renderer IPC。请求通过 `services.get('cloudActor').requireActor()` 返回的 `.invoke('discovery',body)`，令牌刷新和设备会话检查完全复用08。由于08 invoke只返回data，适配器先调用该组件的 protocol 操作协商版本，再在同一已验证 actor/session 内消费具体操作。

## 同一身份与本地数据

函数使用 `../_shared/lingjing-auth.ts` 的 `withActor`。`authUserId` 是 Auth UUID，`ownerAccountId` 继续是08解析出的旧文本 owner；`deviceId/sessionId` 来自已验证设备和活跃会话。拒绝请求体中的 actor/owner/userId/sessionToken/winner/pet/reward。没有第二套账号、owner 映射或密码验证。

公开入口仍是 `discovery`，部署参数按08统一包装使用 `verify_jwt=false`；这不开放匿名请求，JWT/getUser/设备/会话检查在 `withActor` 中执行。现代 publishable/secret JSON 字典只由08 helper读取。新函数不再导入桌面 CJS 路径、不查询旧 `runtime_accounts.session_token`、不把 anon key当用户 bearer。

客户端主进程签名器 `cloud-location.cjs` 只从原定位服务的隐私/质量保护闭包读取 fix；其接口只有用途与目标，不接受调用方坐标。P-256私钥用 Electron safeStorage 加密写入新 `secure/discovery` 子目录，不进入IPC、云存档、日志或资源包。缺安全存储时明确失败，不落明文私钥；不改原用户文件。

## 定位许可：供03及05使用

1. `device.register {publicJwk}`：已认证 actor登记自己的定位公钥；不创建账号设备或改变08的绑定。
2. `location.challenge {purpose,reference}`：服务器签发30秒 nonce，绑定 Auth UID、旧owner、device、session、用途、目标和当前公钥指纹。
3. `location.prove {challengeId,fix,signature}`：使用 ES256/P1363 验证固定字段的 canonical JSON。数据库行锁保证同一nonce不会授权另一份 fix；原请求重试返回原许可。
4. `nearby {proofId}`：依据服务器当前时间和 canonical 目录发现世界格点，不接受客户端物种或刷新时间。

用途：`discover`、`begin`、`capture`、`territory:read`、`territory:challenge`、`territory:settle`。`reference` 对应 spawnId/permitId/territory challengeId；只读 discover为空。许可15秒有效，原 fix仍要求≤30秒、≤80米、WGS84、非系统默认位置。100米互动围栏和现有不确定度补偿规则不变。

05在自己的数据库事务中调用：

```sql
select public.lingjing_discovery_take_location(
  p_actor, p_proof_id, p_purpose, p_reference, p_consumer
);
```

`p_actor` 使用08字段 `authUserId/ownerAccountId/deviceId/sessionId`。RPC仅服务端角色可执行；不得转发客户端actor。返回包含 fix、source、purpose/reference、签发/过期和消费信息的许可。`p_consumer` 是该次唯一领域操作的稳定ID；换目标、换用途、换owner/device/session、换consumer重放均拒绝。必须与领地/收服事务同一SQL提交调用；不得先HTTP消费许可再另行结算。领域幂等回执应在可变权限/时效校验前读回，保持原请求重试语义。

所有定位表位于非公开 `lingjing_discovery` schema，RLS启用，无anon/authenticated表权限；受控RPC显式撤销 PUBLIC/anon/authenticated执行权限。写入由已验证Edge请求持有的后端客户端完成，不扩展service_role对auth.users的读取权限，也不开放任何客户端提交战果的RPC。

## 模拟与真实的边界

普通actor只接受 `source:os/provider:windows-geolocator`。真实系统拒绝、超时或精度不足保持原错误；不会改80米门槛，也不会降级为模拟。

若主协调需要在真实HTTPS上验证云链路而实地精度不足，可为专用测试Auth UID+device在私有 `location_test_grants` 中明确签发限时scenario授权。此表无客户端写权限，不能通过user_metadata、注册公钥或请求参数启用。模拟 fix仍保存 `source:simulated/provider:qa-discovery/scenarioId`；撤销/过期后不能继续消费。它证明真实HTTPS/事务能力，不证明物理定位或第二台实体设备。

设备密钥签名证明持钥主进程与nonce绑定，不等于GPS硬件证明。本实现限制renderer伪造、请求篡改和重放，不声称可阻止拥有设备管理权限的攻击者伪造系统位置。

## 规则和后续数据事务

`verification/build-cloud.mjs` 生成只读presenter、discovery坐标/格点及8角色目录的适配包。战斗直接导入04已经批准的 `_shared/battle-core.js`（检查点 `4969eac`），presenter原CJS规则引用也重定向到该核心；生成包不再携带一份桌面内核。源哈希和单一导入均受专项检查。未修改04 UI、技能样式或原始战斗公式。

`authority.mjs` 已实现 reserve/act/capture 状态机，只接受操作ID、轮次与动作选择；服务器随机推进共享内核，保存自己的会话和不可变回执。捕捉必须使用该服务器会话的胜利记录、当前定位许可与原 owned pet，不能根据renderer胜者重算或接受一份客户端battle。当前事务store尚未接入，因此入口不会调用未完成的游戏写入。

08的authority fragment/全存档revision已合入；后续游戏事务按 `lock_save_owner → 领域行 → commit_authority` 同一SQL提交。02登记合法宠物、05统一经济和规范成长，本域不会另建库存/成长通道。跨端恢复必须采用服务端同一个petId与奖励凭据；真实链路未验收前不置完成。

## 游戏 SQL 与函数下一检查点

`20261025030459_lingjing_discovery_wild_transactions.sql` 已通过实际PGlite/共享规则/规范02实例与成长/05库存 reducer 的贯通检查。它新增私有permits、game_actions和captures，普通客户端无表或RPC权限；同一owner锁序串行化回合、准入和收服。`game_write` 在同一事务消费位置、核对实例原revision、写服务端会话/不可变回执，并提交统一08 authority fragment。公开 HTTP 只接收动作/回合/permitId/actionId，特权payload完全由验证后的Edge生成。

依赖：已部署08身份/受保护CAS、上述03位置迁移、已批准02 `67546f5+d7b4b07` 的可信 companions module，以及05 `40941f2` 已部署的 `public.runtime_territory_capture_context(text,double precision,double precision,text)`。先通过合法garden-sync snapshot初始化规范garden模块。追加CLI迁移 `20261025033352_lingjing_discovery_capture_scenarios.sql` 对齐第四个scenarioId参数；先应用游戏基础迁移，再应用此追加迁移，不改已发布历史。普通位置传null；受控模拟传本次相遇的原scenarioId，位置source/scenario变更直接拒绝。捕捉事务内重算05上下文并以FOR SHARE保持区域，预览若变化则整体冲突重试，不发放旧HTTP倍率。

游戏入口在本检查点接入 `authority.mjs/store.mjs/domain.mjs`。`domain.mjs`只拼装共享规范函数：02的 `createCompanionInstance/companionUnit/awardBattleResult`、05的 `applyCloudCommand`；不复制构造器、成长公式或奖励数量。捕捉petId固定为 `pet-<server permit UUID>`，新实例及 `(owner,petId)` 注册、位置消费、discovery回执和统一存档revision同一SQL提交。新旧伙伴/独立选择/历史行保留；当前服务器discovery片段使用原SQLite通用表schema，12项专项检查包含真实SQLite导入和旧历史保留。

HTTP操作：`reserve {spawnId,petId,proofId,actionId}` → `{id,sessionId,expiresAt}`；`session {permitId}`、`act {permitId,action,expectedRound,actionId}`、`cancel {permitId,actionId}`、`confirm {permitId,proofId,name,actionId}`、`captures`、`permits`、`action {actionId}`。actor或对战对象/胜负/经验/倍率不由客户端提交。操作冲突或网络不确定时读原action或会话；普通写入不能覆盖受保护片段。

尚待完成：主协调审查/部署新游戏迁移及函数、05前置、真实HTTPS捕捉/竞争回执、新版Electron共享BattleScreen后端SPI与SQLite/新设备恢复。完整目标仍active，当前位置组件真实HTTPS13项检查与物理78米local-os收服不能替代这些未验收项。

## 验证状态

当前11个本地专项检查通过：真实ECDSA篡改/重放、加密测试vault与handler/SQL贯通、嵌入PostgreSQL权限/nonce/消费和统一设备撤销、共享核心100次分发一致性、源哈希/8角色目录、状态机回执与共享Auth主进程能力消费。嵌入PostgreSQL/测试vault/注入actor仅是本地检查，不是Supabase Auth或云端部署证据。

2026-10-25用户开启Windows位置权限后另行通过真实实地验收：生产Electron36.9.5、普通隔离账户、Windows WiFi78米、20回合自然胜利、local-os收服、唯一petId/回执/SQLite及重启恢复。证据见 `evidence/discovery/2026-10-25-native-permission-retry/evidence.json`。这份旧实际运行版本证据保留原标注；最终云端Electron将按批准依赖切换44.9.3/13.0.3后复验。只提交坐标hash，不提交真实坐标。

官方依据：[Edge auth headers](https://supabase.com/docs/guides/functions/auth-headers)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)。已读取2026-10-25 changelog；[TLS CBC弃用](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)不通过恢复旧TLS来规避。
