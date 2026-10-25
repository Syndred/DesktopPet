# 云端探索与定位许可契约

本轮目标在原 discovery 工作树实施，已合入公共基线 `46abf41` 与经主协调批准的身份检查点 `f81008c`。状态：实施中，当前定位层和规则分发已实现；野外会话、统一存档事务、桌面接入与真实 HTTPS 验收仍待完成，不能部署为整项交付。04 对局 UI 未修改，也未读取/触碰其工作树。

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

`verification/build-cloud.mjs` 从现有 `battle-runtime.cjs`、battle只读presenter、discovery坐标/格点代码及8角色目录生成函数内 `_generated/runtime.mjs`，记录源哈希。规则不复制手写，发布时源漂移会使检查失败；Deno已实际执行该包。未修改04 UI、技能样式或原始战斗公式。

后续 reserve/act/capture 只接受操作ID、轮次与动作选择；服务器随机推进原内核，保存自己的会话和不可变回执。捕捉必须使用该服务器会话的胜利记录、当前定位许可与原 owned pet，不能根据renderer胜者重算或接受一份客户端battle。

08的authority fragment / 全存档revision事务与02实例写入契约尚在发布。本域不会另建云库存/成长通道，不会用完整存档checksum充当改经济权限，也不会先发奖励再补存档。跨端恢复必须采用服务端同一个petId与奖励凭据；真实链路未验收前不置完成。

## 验证状态

当前7个专项检查通过：真实ECDSA篡改/重放、主进程加密测试vault与HTTP/SQL贯通、嵌入PostgreSQL权限/nonce/消费、25有序属性对阵共100次分发一致性、源哈希和8角色目录。嵌入PostgreSQL/测试vault/注入actor仅是本地检查，明确不是Supabase Auth、云端部署或硬件定位证据。

官方依据：[Edge auth headers](https://supabase.com/docs/guides/functions/auth-headers)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[API keys](https://supabase.com/docs/guides/getting-started/api-keys)。已读取2026-10-25 changelog；[TLS CBC弃用](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)不通过恢复旧TLS来规避。
