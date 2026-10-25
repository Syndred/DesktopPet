# 同伴兼容入口与清理依据

范围为02同伴模块；供01集成清理使用。未删除用户存档、原始3D文件、设计材料或历史证据。检查命令以 `rg -n 'toLegacyPet|importLegacyInventory|migrateOwnerAlias' apps packages tests` 为基础，并逐个核对运行入口。

| 旧入口 | 当前替代或正式入口 | 实际消费者 | 决定 |
|---|---|---|---|
| companions/index.cjs 的 RuntimeDataStore 全局兼容读取 | Accounts.getLegacyInventory(owner) 的受归属约束原档读取 | 仅 Accounts 不存在时的 fallback；正式 discoverFeatures 将 accounts 排在 companions 前 | 01确认最终默认启动只走 Accounts 后删除 fallback；保留正式原档导入能力 |
| companions/service.cjs `toLegacyPet` | 原生 CompanionInstance；领域通过 companions.getPet/listPets/getSelections | 仅同伴模块导出与 service.test.cjs 的历史投影断言，未找到实际运行调用 | 可删除候选；01集成时复核全树消费者，原始 legacy archive 不删除 |
| companions/service.cjs `importLegacyInventory` | 当前数据迁移入口本身 | companions.ensureImported；battle/service.cjs 的原档导入；受 owner 约束的 Accounts 原档 | 保留并归入正式迁移能力；不是3D运行链路 |
| companions/identity.cjs `migrateOwnerAlias` | 当前受验证旧归属迁移能力 | companions.ensureImported；garden/identity.cjs 联合菜园迁移 | 保留；接08已验证 alias 后收敛，不能为了删兼容代码丢失旧ID/成长/库存 |
| companion_legacy_archive / companion_identity_imports | 完整存档 companions module | 恢复、迁移原始历史与 target-before 留存 | 保留数据；新设备一起恢复，不作为云身份授权证据 |
| companion_accounts/pets/actions 等旧通用表备份路径 | companions backupAdapter 完整一致性单元 | 正式主入口已注册；08先验证原文件再规范化完整旧六表；05支持同一模块及完整旧格式 | 新备份走模块；保留旧格式只读转换，不能删除原档读取或另建一套同步通道 |
| 旧3D伙伴记录 | 原始 archive + 不激活的历史资源引用 | importLegacyInventory、备份恢复；listPets/getPet/desktop 过滤运行资源 | 保留历史读取；活动2D窗口不加载3D资源 |
| Supabase 会话中的本机领养/改名/选择/位置写入 | CloudCompanionAuthority 经08 cloudActor与受限命令提交 | 正式IPC、桌面拖拽/散步、主进程select/recallAll | 已切换；本地账号原有事务保留。Supabase成长/捕捉旧写入口拒绝无权威回执的本机发奖 |
| 未确认的桌面位置请求 | 既有account_actions中的原actionId、哈希、输入及base | 主进程位置队列、重启恢复、最新未发送草稿 | 保留已发送或结果不明的原请求；只合并从未发送的草稿，不删除未知回执或重新生成请求 |

身份校验、公开 actor、网络传输和数据库迁移由08负责；经济事务由05负责。02未复制账号库、库存、奖励或同步传输，也未改动04战场界面。

本轮按冻结基线4830619重新检索：toLegacyPet仍仅有同伴导出和历史投影断言，没有新增运行消费者。迁移文件采用协调方实际ledger名称，不恢复旧文件名。测试配置、DPAPI会话、原始SQLite和失败验收记录留在artifacts，未纳入公开证据或清理用户数据。
