# 灵境云端升级验收 · 2026-10-25

当前阶段：云端和各功能专项通过，实际便携 EXE 的前三段业务验收通过；20 回合训练后 A 的完整同步未收敛，正在修正，整包尚未通过。

应用冻结提交：`2e13487f73396ebad981ff703b4377f403e214e0`。后续仅归档证据的提交与此应用来源分别记录。

## 已部署能力

复用 comparisontext 的 Supabase Free 实例 `jbvrdmrkwpznbrvteive`，未升级付费方案，GraffitiName 未改动。实际部署 22 个数据库迁移与 8 个 ACTIVE Edge Functions。

| 范围 | 使用的成熟技术 | 已验证的行为 |
| --- | --- | --- |
| 身份和权限 | Supabase Auth、PostgreSQL RLS、服务端事务身份检查 | 账号和设备会话隔离；旧 JWT 被撤销后不能读写业务或加入私有频道；另一设备保持有效 |
| 完整存档同步 | SQLite、本机持久 outbox、Postgres CAS 和不可变回执 | 正常后台自动上传/接收；本机脏修改阻止覆盖；断网任务原 actionId 重启后恢复 |
| 领地与菜园 | PostGIS、Postgres 事务和幂等经济账本 | 抢占竞争、驻守、种植/收获/制作/指定宠物喂养；真实等待成熟与重复请求无额外收益 |
| 联机与战报 | Supabase Private Realtime、服务端权威回合、共享 2D 战斗核心 | 原生邀请/接受、10 回合好友战、20 回合训练、刷新/断线恢复及设备撤销；经验和种子只结算一次 |
| 资源和外观 | 私有 Storage、分块 SHA256、已验证资源引用和偏好版本 | 两端实际文件与原导入 ID 一致；自定义角色、校准和动作偏好可恢复；合法资源下载能进入自动完整存档同步 |
| 桌面应用 | Electron 44.9.3、React、TypeScript、better-sqlite3、PixiJS、MapLibre | 多实例独立宠物选择；原生角色像素、系统窗口和实际 OSM 瓦片已核对 |
| 聊天 | AI SDK、assistant-ui、本机加密连接凭据、按 petId 归属 | 人设、记忆、原消息顺序和实际失败/取消状态跨端保存；连接密钥不会上传或进入普通备份 |

云函数在入口及数据库事务中核验 managed Auth、owner、device 和 SID；桌面只包含 publishable 配置，服务密钥留在云端。函数平台 `verify_jwt=false` 与函数自身完整鉴权配套使用。

## 独立核对与数据保全

- comparisontext 原来的 18 张表、100 行数据完整保存在不公开的归档 schema；全部内容哈希与替换前加密导出相同，另有 DPAPI 保护的双份加密备份。
- 总协调重新只读打开原生验收档案，直接计算已登记资源文件 SHA、比对原导入记录，并独立从 Supabase 读取最终存档和经济回执。
- 同步专项中 A/B/云端版本 6 和校验和相同，原断网自动任务保留；新增私有资源专项中 A/B/云端版本 5 和校验和相同，原生导入的原始 JSON 保留。
- 好友战和训练证据为分阶段的真实原生链路；中间失败原记录保留，不能称为一次不中断的全通过运行。

当前汇总与证据索引：[`status/cloud-coordinator.json`](status/cloud-coordinator.json)。

## 回归结果

lint、TypeScript、UI 类型检查和 46 项单元检查通过；Electron 原生集成 260/260 通过；严格云端检查通过，覆盖 22 个迁移文件名、4 份生成分发的哈希/mtime 不变、22 个 Node SQL/authority 测试文件和 Deno 2.9.6 的 5 个资源验证用例。

初次总回归中的 14 项 lint 问题和 6 项测试夹具失败另行保留。夹具修正使用正式事件总线、权威伙伴选择，并加强恢复 epoch/历史断言，没有添加生产 fallback。云端身份函数的 `let` → `const` 静态修正已实际部署为 v3。

这些本地检查不等于 GitHub 托管 CI 成功，也不等于完整本地 Supabase/PostGIS reset。最终整包业务验收将在实际 SFX EXE 上单独记录。

## 旧内容退役

旧明文 HTTP/硬编码客户端/旧会话字段链路、旧 accounts-sync/duel-online Edge、旧迁移草稿、旧 PostgreSQL 直连验证器与孤立探索 authority 已退役。旧原型说明已替换为当前实现与验证指引。原始账号/存档读取、宠物 ID、历史、用户资源和设计源素材保留。

可恢复 Git bundle 已完整验证，位于 `C:/Users/Administrator/.codex/backups/DesktopPet/2026-10-25/cloud-upgrade-pre-retirement.bundle`。当前清理审计：[`cleanup/cloud-coordinator-retirement.json`](cleanup/cloud-coordinator-retirement.json)。

## 尚未覆盖的外部边界

1. 旧服务器 `47.112.208.97:8000` 不可达，用户暂无 SSH 或数据库备份；无法核实并迁移该实例的全部原云端账号。未按用户名猜测归属，也未重置原密码；已有本机原数据读取和增量迁移路径保留。
2. 实际双端证据来自同一 Windows 主机的两个独立生产进程、档案和设备会话，未称为两台异地实体电脑验收。
3. Electron 44 系统定位已实际授权，但本机当前精度未满足原有 80 米准入。未放宽位置门槛，未把受控定位用例称为真实精确 GPS 成功。
4. 没有签名证书，便携版将如实记录 NotSigned；尚未创建公开正式 Release。外部 LLM 的付费成功调用不属于当前已验证范围。

## 最终成品

实际工程候选已生成：`releases/final-2e13487/Lingjing-0.1.8-portable-x64.exe`，169183111 字节，SHA256 `90dc58a18487825ec86b943a11c1deeb927cd97ff4a75e280b673487dc583070`，NotSigned。ASAR/来源审计与工程测试通过。实际云端整包首轮通过账号与原 11 个宠物 ID 保全、个人自动同步、私有资源偏好与双端原生角色渲染；20 回合训练后 A 未完成完整存档收敛，失败记录已保留。当前正在核对本机传输意图账本与云端权威业务存档边界，不能将这个候选称为业务全通过的最终版本。
