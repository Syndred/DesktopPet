# globalSerial sidecar：08 交付与部署顺序

本实现依据 `globalSerial-20261025-v1`。SQL 尚未上线。所有新编号只保存在
`lingjing_private.global_pet_serials`，按 namespace + canonical templateId 的可回滚
numeric 计数器分配，通过 `::text` 输出，永不经过 JavaScript Number。原 owner、petId、
名字、legacy serial、资源、pet data_json、保存 envelope、action receipt 和 archive 不回填号码。

## RPC（service_role only，必须先经过 withActor）

- `lingjing_global_serial_wild_ensure(p_actor jsonb,p_spawn jsonb,p_proof_id uuid)`：
  p_spawn 是 Edge 从 discover 定位凭据重建、通过原范围策略的完整 spawn；返回
  `{namespace,ownerAccountId,spawnId,templateId,globalSerial}`。SQL 复核 discover/空 reference、
  当前 actor、QA 授权、80m/30s/100m；consumer 为 `serial-observe:` + sha256(spawnId)。
  同一 proof/spawn 可幂等重试，换 spawn 使用新 discover proof。
- `lingjing_global_serial_wild_lookup(p_actor jsonb,p_spawns jsonb)`：输入最多100个
  `{id,templateId}`，仅返回已登记 DTO 数组，不领号；nearby 和历史 permit/session/capture 的
  只读投影使用该接口。
- `lingjing_global_serial_owned(p_actor jsonb,p_expected_revision bigint default null)`：返回
  `{format:'lingjing.global-serial.readback',version:1,ownerAccountId,namespace,revision,pets:[...]}`，
  每项为 `{namespace,ownerAccountId,petId,templateId,globalSerial}`，捕获项还可带 spawnId。
  非空 expected_revision 不匹配时报 `LJ_SYNC_CONFLICT`。只补 sidecar，不改保存 revision。

原 `lingjing_discovery_game_write` 签名保持。旧 reserve 客户端在 begin proof 成功后于同事务
ensure 野外号。claim 插入原 captures 后，共同 commit 的 `register_owned_global_serials`
从可信 captures + permits 找回同一野外实例，并调用私有 `bind_wild_global_serial` 绑定原 petId。
任一 CAS、保存或编号错误都会回滚 proof、permit、capture、原宠物、回执和计数器。
旧 actionId 重试仍直接返回原回执；不重写原 requestHash 或 result_json。

## 新总协调执行顺序

1. 审核合入 SQL、03 Edge 适配及08缓存/companions-sync；确认云端仍为预期22迁移。
   先记录 accounts/saves/save_actions/save_archives/owned_pet_ids/authority_fragments 既有行
   的主键+原行哈希和 counts，并保留。不能把既有 QA-007 结果当编号证据。
2. 只读审核服务端 `location_test_grants` 与 permits.source/scenario_id。2026-10-25 接手时
   有6条过期 grant，不能按过期状态当作 live；服务端 shadow scope 会保留这些 namespace。
   同一账号若有多个不同 QA namespace，先使用专用新 QA 身份或由协调明确处理服务端授权，
   不根据用户名/user_metadata 分类。不要删旧 grant 试图恢复 live。
3. 总协调通过受控 SQL 部署 `20261025105253_lingjing_global_pet_serials.sql`。
   事务先短暂阻塞 owner 写锁，历史 permits 按 os/live、simulated/qa:scenario 分号，再给当前
   保存里的旧宠补 sidecar；已捕获 pet 绑定其 permit 的同号。过期授权只允许迁移内部回填，
   运行时分号明确报 `GLOBAL_SERIAL_SCOPE_REVOKED`。此步不修改任何原记录。
4. 立即对步骤1既有行逐主键比对原哈希/数量，查所有新表 RLS/函数 grants，运行 security advisors。
   私有 namespace resolver 是 definer，先复核 canonical actor 并锁服务端 grant，避免给
   worker 授予 QA grant UPDATE。其他新增 RPC 是 invoker、仅 service_role 可执行。
5. 部署新 companions-sync，再部署03 discovery；companions snapshot 的独立 `serialRegistry`
   位于 envelope/module 之外。原 checksum/receipt 保持。旧 app/Edge 可继续用原保存协议，
   新客户端缺独立字段时只显示已有可信缓存或待同步。
6. 为09两个新真实云身份提供服务端 QA grant，再运行新候选的真实场景和独立云端读回。
   若测试过期或撤销，先显式重新授权相同 scenario；不能让它回落生产发号。

## 09 两个真实云身份的服务端授权入口

09在两个隔离 profile 用真实 Auth 登录，取得 canonical actor 的 authUserId、deviceId、
ownerAccountId、sessionId，核对设备绑定有效。总协调以受控数据库身份对两个精确 UID/device
写入下面模板；取值来自已核验 actor，不来自用户名、表单参数或 user_metadata：

```sql
-- 两个身份各执行一次。参数值通过受控客户端绑定，秘密和令牌不入 Git。
insert into lingjing_discovery.location_test_grants(auth_uid,device_id,scenario_id,expires_at)
values (:verified_auth_uid, :verified_device_id, :same_qa_scenario_id,
        clock_timestamp()+interval '30 minutes')
on conflict(auth_uid,device_id) do update set
 scenario_id=excluded.scenario_id,expires_at=excluded.expires_at;
```

触发器自动记录持久 QA scope；无需单独登记墓碑。两个用户使用相同 scenario 和同一 template
验证跨用户连续号；nearby 刷新不增计数，observe 后重进/刷新同号，获胜捕获绑定同号。
并发验证应使用两个真实会话同时请求，并另测同 actionId 竞争、不同类型反序片段、故障回滚、
退出重启缓存、备份/伪造导入、断网待同步、撤销与账号切换。由09唯一操作原生界面。

## 验证边界

`global-serial-sql.test.mjs` 在 LOCAL PGlite 执行真实 PostgreSQL SQL 和权限/事务检查，
包括6张既有表的完整行哈希保留、claim 中途故障回滚、旧 reserve 兼容和超出2^53号码。
WASM 会串行排队事务；其并发发起检查仅证明该执行器无碰撞，不能证明真实云多连接锁竞争、
Auth、PostGIS 或原生UI通过。真实云并发和09验收仍待总协调部署后完成。
