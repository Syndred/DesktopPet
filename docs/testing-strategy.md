# 灵境测试与真实验收

更新于 2026-10-25。

先完成与变更有关的有意义定向检查；源码冻结后做一次最终集成回归。低影响可逆修改不要求堆积镜像实现的测试。

| 检查 | 范围 |
| --- | --- |
| npm run verify | lint、类型及当前单元验证 |
| npm run test:native | 实际 Electron/SQLite 领域检查 |
| npm run verify:cloud | 不带凭据的严格22迁移目录、生成代码不变性、SQL/领域用例及 Deno 验证 |
| Windows 成品验收 | 实际 SFX、ASAR 源码标识、独立用户目录、安全会话、可见角色与真实窗口 |
| 云端验收 | 实际 HTTPS/Auth/RLS/Storage、原回执、并发、撤销与拒绝路径，再与独立数据库/本机 SQLite 对照 |

脚本化 SDK/provider、PGlite、合成测试定位和真实服务分开标记。资源非空、请求计数、静态文本或单纯测试通过不能证明实际画面、底图、物理定位或生产闭环。

双端同步最终必须同时核对云端 revision/checksum 与两端本机落库；断网恢复保留 actionId、baseRevision、原始 source，冲突不得静默覆盖。资源校验实际文件 SHA256、import_id、manifest 和本轮精确偏好。

QA 使用独立绝对用户目录和被指定的测试账号，不修改普通 AppData、全局网络或真实用户历史。源码、构建、运行和证据应绑定同一检查点；失败记录保留，不把旧失败改写成通过。

Docker/Podman 当前不可用，未声称完整本地 Supabase/PostGIS reset 通过。实际云端与权限证据见 [云端证据](implementation/evidence/cloud/2026-10-25/)。
