# 菜园集成契约

`garden/index.cjs` 自动注册 `snapshot/plant/harvest/craft/feed/garrison` 及领地命令。所有 renderer 写操作携带 `actionId/expectedRevision/sessionOwnerAccountId`；喂养另带 `petId/expectedPetRevision`。sessionOwnerAccountId 只作旧页面防串账号的拒绝条件，账号权限仍只来自主进程 context。

共用 foundation SQLite 连接；不新增另一套账号或宠物表。`companions` provider 可以是 service 本身或 `{service}`，沿用真实 `applyGrowthInTransaction(owner,{petId,actionId,expectedRevision,effect})`，把食品 intimacy 映射到 affinity。库存扣减、伙伴修改和两模块幂等流水在同一事务提交。

探索 / 对战主进程结算后可以调用；`snapshot` 也会通过 battle 的真实 `getOutcome`、战报和 discovery 的已确认捕捉凭据补结算，崩溃后不会遗漏：

```js
const garden = services.get('garden');
const receipt = { id: battleId, source: 'battle', ownerAccountId, eligible: true };
const result = garden.grantSeeds(
  { ownerAccountId },
  { actionId: `battle-seeds:${battleId}`, source: 'battle', receiptId: battleId },
  receipt
);
```

`exploration` 同理；传入的 receipt 必须来自可信结算，不能来自 renderer。种子类型由凭据稳定计算，种子数量由菜园规则决定；同一 receipt 换 actionId 也不能重复领取。不开放 renderer 发放物品命令。可在外层结算事务内调用；失败需由外层回滚。

已提供真实持久化 `territories` provider：`listForOwner/getForOwner/gardenBonusForOwner/applyCaptureBonus`。主进程 `importRecord(record)` 可导入已有权威领地，不执行 UUID 账号强转。`territoryLocate` 只读取 discovery 的新鲜 WGS84 系统定位（≤80 米），生成确定性地理区域；演示位置不能占领。界面复用 discovery 的真实底图 IPC 并绘制区域边界。

`territoryChallenge` 携带 petId/territoryId/expectedTerritoryRevision，沿用 battle.beginTerritoryChallenge；`territorySettle` 只接受已保存的挑战和 getOutcome 的真实结果，成功占领、失败守住，保留原有区域捕捉倍率 ×2 与每天两次入侵。`garden.territories.applyCaptureBonus({ownerAccountId,territoryId,baseReward})` 给捕捉结算复用，不能由 renderer 自报最终收益。当前默认额外菜园产量为 0，避免把捕捉倍率误用到菜园。

已注册 accounts BackupManager 的 garden 原子存档适配器；不同进度不能用逐表 INSERT IGNORE 混合库存、地块与 action。新库存流水使用账号与 UUID 联合标识；旧流水保留并增量归档，跨账号恢复不会撞全局自增 ID。

根依赖由 foundation 管理。菜园只需要已有 React / TypeScript 和公共 SQLite，无额外运行库。未部署云端权威服务前界面明确显示“本机存档”；SQLite outbox 不可直接被当作跨设备成功，不得合并两台设备的整份库存快照。

2026-10-24 范围修订已接入：只渲染 2D 伙伴，保留旧数据；PixiJS Application/Assets/Texture/Sprite 负责正式菜园背景和作物，图集路径/提示词在 garden-assets.json。Button/Input、Radix Select/Tabs 直接使用 foundation 公共 shadcn 入口；背包列表使用公共 AnimatedList（Motion）。依赖 foundation f0af90f 的公共组件、Tailwind 和全局动画偏好 Provider。地图通过 discovery/NearbyMap 共享入口复用，不再维护第二套地图引擎。

CloudGardenAuthority 对云端账号采用服务端结算和二次读回，服务不可用时只显示缓存并保留原 action；服务端代码与真实未完成项见 garden-cloud-review.md。本机账号仍可完整离线种植与喂养。
# Verified legacy-owner transition

Accounts may map an old raw local ID to `local:<id>`. Garden only considers an
`account_aliases` row with `evidence=legacy-id` belonging to the verified current
identity. It never matches usernames or rewrites runtime TEXT IDs as UUIDs.

The synchronous `garden.migrateOwnerAlias(context)` adapter runs before the first
snapshot or mutation. If companions already expose exactly the same pet IDs and
growth under the target owner, garden copies the whole personal graph once,
archives its original graph in `garden_identity_imports`, and makes the source
owner read-only. Personal stock is never summed; two progressed gardens require
explicit account conflict resolution. Shared territorial ownership is not changed
by an account-save import.

If companion rows still belong to the source ID, companions must provide
`migrateOwnerAlias({sourceOwnerAccountId,targetOwnerAccountId,provider,subjectId})`
using the same SQLite connection, synchronously inside the caller's transaction.
Garden then verifies each old pet ID and growth state through `listPets(target)`.
Until that provider adapter exists, return `OWNER_MIGRATION_REQUIRED`, retain all
source rows, create no target garden or starter inventory, and show a migration
message in the UI. Garden does not write another feature's pet tables to bypass
this integration requirement.

The full integrated smoke accepts canonical account IDs from the actual login
response. Its earlier raw-ID profile remains intact as a migration regression
fixture; a new profile is not presented as proof that the old profile migrated.
