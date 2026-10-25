# 同伴兼容入口与清理依据

范围为02同伴模块；供01集成清理使用。未删除用户存档、原始3D文件、设计材料或历史证据。检查命令以 `rg -n 'toLegacyPet|importLegacyInventory|migrateOwnerAlias' apps packages tests` 为基础，并逐个核对运行入口。

| 旧入口 | 当前替代或正式入口 | 实际消费者 | 决定 |
|---|---|---|---|
| companions/index.cjs 的 RuntimeDataStore 全局兼容读取 | Accounts.getLegacyInventory(owner) 的受归属约束原档读取 | 仅 Accounts 不存在时的 fallback；正式 discoverFeatures 将 accounts 排在 companions 前 | 01确认最终默认启动只走 Accounts 后删除 fallback；保留正式原档导入能力 |
| companions/service.cjs `toLegacyPet` | 原生 CompanionInstance；领域通过 companions.getPet/listPets/getSelections | 仅同伴模块导出与 service.test.cjs 的历史投影断言，未找到实际运行调用 | 可删除候选；01集成时复核全树消费者，原始 legacy archive 不删除 |
| companions/service.cjs `importLegacyInventory` | 当前数据迁移入口本身 | companions.ensureImported；battle/service.cjs 的原档导入；受 owner 约束的 Accounts 原档 | 保留并归入正式迁移能力；不是3D运行链路 |
| companions/identity.cjs `migrateOwnerAlias` | 当前受验证旧归属迁移能力 | companions.ensureImported；garden/identity.cjs 联合菜园迁移 | 保留；接08已验证 alias 后收敛，不能为了删兼容代码丢失旧ID/成长/库存 |
| companion_legacy_archive / companion_identity_imports | 完整存档 companions module | 恢复、迁移原始历史与 target-before 留存 | 保留数据；新设备一起恢复，不作为云身份授权证据 |
| companion_accounts/pets/actions 等旧通用表备份路径 | companions backupAdapter 完整一致性单元 | 08当前 BackupManager 通用备份；05当前 cloud-domain 直接读取通用表 | 等08旧档规范化和05模块路径同时就绪后切换，禁止让旧备份失效或维护双通道 |
| 旧3D伙伴记录 | 原始 archive + 不激活的历史资源引用 | importLegacyInventory、备份恢复；listPets/getPet/desktop 过滤运行资源 | 保留历史读取；活动2D窗口不加载3D资源 |

身份校验、公开 actor、网络传输和数据库迁移由08负责；经济事务由05负责。02未复制账号库、库存、奖励或同步传输，也未改动04战场界面。
