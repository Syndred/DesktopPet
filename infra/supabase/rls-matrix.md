# 当前权限矩阵

所有身份都使用 Supabase Auth UID 到原文本 owner 的服务端映射。用户 metadata、renderer 传入的 owner、有效 JSON 校验和均不能授予权限。

| 对象 | 已验证用户读取 | 业务写入 |
| --- | --- | --- |
| lingjing_accounts / lingjing_devices | 当前本人及有效设备会话 | 受限身份/绑定/撤销 RPC |
| lingjing_saves / save_actions / save_archives | 当前 owner + 有效 SID/device | 个人 CAS 或服务端权威事务 |
| lingjing_resource_packages | 当前 owner/UID；索引可独立插入 | 索引本身不赋予游戏权限 |
| lingjing_resource_references | 当前 owner/UID | 实际私有文件验证后的服务事务 |
| lingjing_resource_preferences / preference_actions | 当前 owner；偏好同时核 UID | 共享验证器与 CAS 的服务事务 |
| lingjing-battle 邀请/房间/回合 | 本人或实际参与者；私有频道 | 新鲜 actor 的权威命令 |
| 未解决的对战选择/命令 | 不向用户开放 | 服务事务；不加入 Realtime 发布 |
| garden/world 业务表 | 不直接开放表读取 | 经受验证函数查询/修改；PostGIS/owner 锁 |
| lingjing_discovery | 不直接开放表读取 | 签名位置、同一 actor 与原子捕捉事务 |
| lingjing_private | 不直接开放表读取 | 最小受限函数及必要服务权限 |
| 私有 Storage 对象 | 有效本人 UID 路径及设备会话 | 不可变分块；禁止客户端覆盖/删除 |
| comparisontext_archive_20261025 | 无客户端权限 | 本轮不改原行，仅校验保全 |

私有 actor 守卫在业务事务中重新检查实际 Auth 用户、managed session、有效期限、不可逆撤销账本及精确设备绑定；service_role 没有新增 Auth 表 SELECT 权限。跨账号、非参与者、匿名、过期/伪造凭据和旧 SID 重绑定均有独立拒绝证据。

RLS enabled/no-policy 的私有 worker/归档表是有意默认拒绝，不通过宽松策略消除提示。资源策略的三个 Auth 值已在真实 authenticated EXPLAIN 中确认是 InitPlan。Free 套餐仍有 Pro 专属泄漏密码检测提示，未付费启用；参见 [审计结果](../../docs/implementation/evidence/cloud/2026-10-25/live-database-advisory-review.json)。
