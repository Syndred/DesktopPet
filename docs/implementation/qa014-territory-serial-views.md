# QA014 领地对局编号只读投影

本补口从 Root 指定的 `8d193fd` 建立独立分支，依赖 08 的第 24 迁移 `729929d86cbef2e5f4f95c53af09a6f1b66b82eb`。第 25 候选由现有 Supabase CLI `migration new lingjing_territory_serial_views --workdir infra` 创建；清单保持原 23 个已部署版本，24/25 只列入 pendingReviewFiles。真实部署、版本重命名及账本提升由总协调执行。测试按唯一文件后缀寻找 24/25，不依赖候选时间戳。

## SQL 与授权

`public.lingjing_territory_serial_views(p_actor jsonb, p_session_ids jsonb)` 为 STABLE、SECURITY INVOKER、空 search_path，仅 service_role 可执行。它直接复用 08 的 `lingjing_private.global_serial_read_actor_namespace(jsonb)`，不复制或调用写入式鉴权、ensure、登记、回填、锁或计数器操作。支持 `BEGIN READ ONLY`。

请求必须是 1–20 个唯一非空字符串，逐项检查类型、1–160 长度和格式。任何未知或非调用者的服务器 challenge session 都整批统一拒绝 `NOT_PARTICIPANT`。SQL 先证明所有 session 的 owner，再读取身份，禁止请求目标 owner/pet。

每个旧对局还需匹配其持久 id、mode、context owner/authority、原 territoryId/revision 和原 location scope。玩家使用 challenge.pet_id 与原 player.petId；敌方 owner 只能来自唯一的原 `action='challenge'` 创建日志 `old_owner_id`，petId 来自原 enemy.petId。原日志缺失或歧义时不猜。完全不查询当前 region.owner/garrison，也不读取 raw guard/envelope/battle 中自带的 templateId/globalSerial。

身份仅从不可变 registry 的历史 owner+原 petId+同 namespace 读取；peer canonical account 必须 active，QA 墓碑必须同 scope。缺号或跨 scope 返回 null。globalSerial 在 SQL 中直接转十进制 text，Main 不做 Number 转换。

`enemyKind` 可选：只有同 scope 的历史身份成功时才为 `instance`；原创建日志唯一且 old_owner_id 为 NULL、原 enemy.petId 精确等于 `guardian:<原 territoryId>` 时可为 `guardian`。其他情况省略。不会扫描无关 owner 的 registry/当前宠物来猜分类；插入或移除无关 owner/其他 scope 的同 petId 不影响完整返回。

## Edge 与 Main 接口

Edge 独立纯读操作：`{op:'serial-views', input:{sessionIds:[...]}}`。只接受这些字段；不访问 action journal，不调用 snapshot/settle/write，不生成 actionId 或定位许可。

云端成功 DTO：

```json
{
  "format": "lingjing.territory.serial-views",
  "version": 1,
  "ownerAccountId": "caller-owner",
  "namespace": "live",
  "sessions": [{
    "sessionId": "server-session-id",
    "player": {"ownerAccountId":"caller-owner","petId":"original-pet","templateId":"animal-wood-deer","globalSerial":"90071992547409931234567890"},
    "enemy": null
  }]
}
```

Main 内部方法为 `garden.getBattleSerialViews({ownerAccountId, sessions:[{sessionId,playerPetId,enemyPetId}]})`，没有 renderer command。它核对当前 owner、完整批次/唯一 session、双方原 petId、玩家 owner、规范 template/正整数字串和可选分类；返回新建的独立对象，不修改 session/store/report。网络、权限或损坏回包失败抛给最终 IPC clone consumer，由 04 保持 pending，不把失败伪装成 live scope。账号切换仍拒绝旧回复。

本地分支返回 `namespace:null`，每项 player/enemy 均 null；只允许从本库 owner-bound 持久 challenge、原对局和唯一原 invade 日志证明 NPC 分类。没有跨 owner 或无 scope 的存在性探测。自己的可信号码由 04 的独立 `readIdentityPet` 路径投影。本地缺证据不能替代线上 namespace 查询。

原 challenge、battle_json、defender、日志、命令、回执、存档及原 actionId 均不写回；规则、位置政策和领地界面布局不变。

## 定向验证

以下是明确的本地 PostgreSQL/WASM、SQLite 与 scripted Edge 夹具，未访问真实 HTTPS、发号或操作产品/UI，不表示云端部署和原生验收完成。

- `node --test --test-concurrency=1 scripts/acceptance/cloud-territory/serial-views.test.mjs scripts/acceptance/cloud-territory/serial-views-sql.test.mjs`：22 项通过。使用真实第 23/24/25 源迁移和真实 Auth helper；READ ONLY/ACL、原 owner 易主、同 petId 不同 owner、长号、伪 raw serial、整批拒绝、缺失/歧义日志、同/跨 QA scope、撤销后不回落、无关 owner/其他 scope 同 id 的插入与移除完整返回不变、所有原表及原 SQLite JSON 字节保持。
- 现有 domain、desktop-bridge 和 receipt-expression：10 项通过，原喂养/驻守、丢回复重试、库存、原宠物状态和结算表达式保持。
- 定向 lint、迁移名称门禁 4 项、garden Edge bundle 生成一致性及 Deno 2.9.6 `--frozen --node-modules-dir=none` 的 territory 入口类型检查通过。CommonJS 入口沿用既有 require 风格，定向 lint 关闭该样式规则，不改工程配置。

两个新增测试已接入统一 cloud source gate；完整集成检查由 Root 收敛运行。08 第 24、04 最终 IPC clone、该第 25 补口由 Root 依序整合后，再部署并交 09 做新候选真实验收。
