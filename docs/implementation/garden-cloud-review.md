# 菜园云端审查与集成

本记录是审查材料，不代表已部署或取得线上回执。禁止自动执行生产迁移或发布。

先部署 accounts 的 `20261024_accounts_save_sync.sql`，再审查本模块 `infra/supabase/migrations/20261024_garden_authority.sql` 与 `functions/garden-sync`。菜园与伙伴仍在同一个 `runtime_account_saves.envelope` 中，不新建第二套库存、宠物或身份数据库。云端入口验证 runtime_accounts 文本 ID / 当前 session_token；数据库再次锁定同一账号，检查 account revision 与 action hash，再一次提交库存及指定伙伴的养成。

成熟时间来自 Edge 服务端；renderer 的倒计时和坐标不能发奖。相同 actionId 重试返回原回执，两个客户端从旧版本同时收获只有一个提交。制作扣稻米与加米饭、喂养扣食物与改 companion_pets 行在同一个 PostgreSQL 事务中提交。客户端二次读回校验 checksum、owner、actionId、版本后，才在同一 SQLite 事务中落盘。网络中断保留原操作，禁止降级成本机重复结算。

`claimReward` 只从 runtime_battle_settlements / runtime_discovery_captures 查询当前账号的已结算凭据；不接受 renderer 自报数量。主进程的同步种子接口对云端账号返回明确 pending 标记，由战报事务保存，再等服务端确认，不发本机库存。本机训练缺少服务端凭据时仍是待确认，不能伪称云端种子成功。

云端账号要求 HTTPS（仅 localhost 可用于测试）。当前内置联机地址仍是 HTTP，故新菜园不会把真实会话凭据发到该地址。尚未提供新的 HTTPS 菜园端点或部署回执。

当前限制必须保留在总验收清单：

- 云端领地挑战与驻守尚缺共享权威服务；本版对应云端命令明确返回 CLOUD_TERRITORY_UNAVAILABLE。真实本机领地、归属、挑战、驻守已实现，不能把两者混称。
- 若伙伴有未同步本机操作、未同步改名或较新位置，客户端保留原数据并返回 CLOUD_LOCAL_CONFLICT；需要 accounts 的统一存档同步/冲突预览完成衔接，不能盲目覆盖本机进度。
- garden 操作推进了公共云存档版本；accounts 下一次手动整存档推送需要先读取该版本。旧 base revision 会被安全拒绝，不自动重放旧快照。
- 线上双设备与真实账号验收尚未完成；本地 PGlite 是真实 PostgreSQL 执行环境的审查验证，不是已部署 Supabase 的证明。

本地验证入口：`apps/pc-app/runtime/features/garden/cloud.test.mjs`。测试工具 @electric-sql/pglite 已由 foundation 提供为公共测试依赖；原 ignored artifacts/garden/pg-qa 仍保留，可通过 GARDEN_PGLITE_MODULE 指定。它用于 SQL 审查，不构成产品线上服务。验证真实 HTTP handler → PostgreSQL CAS/RPC → 主进程适配 → SQLite，包含并发收获、重试、指定伙伴与失败回滚。

首次云端打开也走同一 PostgreSQL CAS：已同步但尚未初始化的菜园模块，由服务端用固定 `cloud-garden-initialize:v1` 回执创建六块菜地和首次种子。两个客户端同时打开只提交一次，再读回同一存档；认证失败或端点不可用时，不在本机创建云端账号的首次库存。空模块之外的旧版本存档仍需在账号页面完成可审查的统一同步。

回滚顺序：停用 garden-sync 入口，再停用功能注册；保留 runtime_garden_operations、runtime_account_save_actions 和本机流水。迁移文件不含 DROP/DELETE 生产数据。
