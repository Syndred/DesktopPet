# 菜园集成契约

`garden/index.cjs` 自动注册 `snapshot/plant/harvest/craft/feed/garrison`。所有写操作携带 `actionId/expectedRevision`；喂养另带 `petId/expectedPetRevision`。账号只来自主进程 context。

共用 foundation SQLite 连接；不新增另一套账号或宠物表。`companions` provider 可以是 service 本身或 `{service}`，沿用真实 `applyGrowthInTransaction(owner,{petId,actionId,expectedRevision,effect})`，把食品 intimacy 映射到 affinity。库存扣减、伙伴修改和两模块幂等流水在同一事务提交。

探索 / 对战主进程结算后调用：

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

领地 provider：`services.provide('territories', { listForOwner({db,ownerAccountId}), getForOwner({db,ownerAccountId,territoryId}), gardenBonusForOwner({db,ownerAccountId}) })`，或 discovery provider 的 `.territories`。函数同步。返回类型见 shared-types/features/garden；保留现有归属、区域捕捉倍率、占领记录。基础菜园永不依赖领地；gardenBonus 独立配置、默认 0，在播种时固定收成。易主只影响驻守显示与后续加成。

根依赖由 foundation 管理。菜园只需要已有 React / TypeScript 和公共 SQLite，无额外运行库。未部署云端权威服务前界面明确显示“本机存档”；SQLite outbox 不可直接被当作跨设备成功，不得合并两台设备的整份库存快照。
