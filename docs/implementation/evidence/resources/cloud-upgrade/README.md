# Storage 资源升级验收

当前代码与状态指针见 [cloud-resources.json](../../../status/cloud-resources.json)，完整边界见 [cloud-resource-contract.md](../../../cloud-resource-contract.md)。统一源基线 46abf41；已合入主协调批准的身份检查点 f81008c。真实部署由主协调完成，资源会话没有直接变更数据库、部署函数或修改 comparisontext 原表。

## 已完成的域实现

- 私有 `lingjing-resources-v1` bucket，Auth UID 前缀、08 `lingjing_current_owner()` 与设备/会话撤销校验；immutable 索引及 INSERT/SELECT 策略，无 UPDATE/DELETE/upsert/public URL。
- 官方 supabase-js SDK 上传/下载，4 MiB 分块、manifest 与全文件 SHA256/大小/路径校验，发布前独立读回；SQLite outbox 与磁盘块缓存可在进程/数据库重开后继续。
- 原 resourceId、导入流水、已存在资源/偏好保留。同内容但不同资源 ID 在两个客户端同时存在时全部保留；普通新导入仍串行去重。文件损坏或缺失时写入新恢复目录并更新登记，不覆盖原用户字节。
- 内置八角色继续离线，私有上传只取已登记资源文件，不导出应用配置/账号或 BYOK vault；凭据字段描述会在任何网络请求前拒绝。
- 正式 history.cjs 保留已有模型档案的只读查询、包内引用校验及跨客户端档案恢复，活动导入/预览继续仅 2D。

主进程消费 08 `cloudActor.requireActor()`，在异步前后检查 owner。生产适配器拒绝 simulated actor 和 HTTP client；只有显式 protocolFixture 测试构造器允许 127.0.0.1，状态及持久化回执均标为 simulated。没有因网络失败而切换 mock。

[真实服务层证据](live-service/evidence.json) 已证明实际 Supabase A→B 哈希与原 resourceId 一致、OTHER Storage404/index0、一次明确网络故障后关闭重开 SQLite 续传。这个结果属于存储层；受保护 refs 注册和真实双 Electron 单独验收。[早期 SQLITE_ERROR](retained-failures/initial-sqlite-ledger.json) 保留，修正为使用正式 openDatabase 初始化迁移台账后重新运行，没有把失败改成成功。[旧模拟双 Electron](native-simulated/evidence.json) 仍标 simulated/cloudVerified=false，实际使用 Electron36.9.5/SQLite12.11.1，不改写成升级后的44版本。

[真实双 Electron](live-dual-electron/evidence.json) 已通过：production typed main/preload、Electron44.9.3 / Node24.22.0 / ABI149、两个实际 PID 和设备 UUID、两份独立 userData、正式 accounts 登录/资源同步/完整存档预览和 replace 恢复。A 实际改校准与 wave→idle 映射，新 B 读回同值、同原 resourceId、同两文件 SHA256 和原 import_id；原本机 v1 备份均保留。两边都恢复同一个原 petId 的私有外观，成长不变。非空偏好的 cloudModule 均为 v2，[独立根存档读回](live-dual-electron/independent-root-readback.json) 与两边语义逐字节 canonical 比对一致。两个实际截图已检查角色完整可见，Pixi contentBounds 在实际 canvas 内，无加载占位图。这是同机双进程，不能宣称两台实体设备。

[真实偏好服务](live-preferences/evidence.json) 已证明原 action 重试不增量、旧偏好 revision409、未知 clip422、未经核验索引/其他账号404、撤销 SID401、客户端直调写 RPC42501，失败保持当次 Root checksum/revision。[伙伴外观服务联验](live-authority/companion-joint.json) 只认 verified references。完整恢复首轮因尚未消费主协调的伙伴适配注册而拒绝，随后正常 merge 保护拒绝不同初始化伙伴进度；两份[失败一](retained-failures/native-before-companion-registration.json)、[失败二](retained-failures/native-merge-conflict-preserved.json) 均保留。最终使用已批准的正式注册和明确完整恢复入口，没有放宽合并或身份权限。

## 本机验证与真实云端边界

原生 SQLite/资源领域检查与官方 SDK 的本机 HTTP 协议夹具覆盖 A 上传、B 恢复、他账号拒绝、丢失上传回执、关闭重开数据库后续传、下载块缓存复用、路径/大小/哈希/密钥字段拒绝、同内容不同 ID 以及 5 MiB 模型档案分块。**HTTP 夹具不是 Supabase RLS 或真实云端证据**。

`storage-rls-sql.test.mjs` 使用 PGlite 0.5.11，只验证真实迁移 SQL 在本机 PostgreSQL/WASM 中的策略语义：同账号双设备、跨账号/匿名/错误 owner/路径/假设备/撤销设备与会话、不可覆盖/删除以及旧表保留。它消费 08 已提交身份 SQL，而非复制另一套身份逻辑。**PGlite 不是目标项目的部署验证**。

本机运行：

```powershell
npm install --prefix artifacts/resources/cloud-sql-tools --no-save --package-lock=false --ignore-scripts @electric-sql/pglite@0.5.11
node scripts/desktop/run-native-tests.cjs apps/pc-app/runtime/features/resources/verification/cloud-storage.test.cjs apps/pc-app/runtime/features/resources/verification/resources.test.cjs apps/pc-app/runtime/features/resources/verification/roster.test.cjs tests/foundation/resource-backup.test.cjs
node --test apps/pc-app/runtime/features/resources/verification/storage-rls-sql.test.mjs
```

真实 HTTPS 验收入口 `verification/cloud-storage-live.mjs` 必须显式 `--live`，并在协调方部署迁移、完成 08 登录桥后继承三组已有合法会话：`LJ_STORAGE_A_ACCESS_TOKEN` / `LJ_STORAGE_A_DEVICE_ID`、B 同名变量与 OTHER 同名变量；A/B 同 UID、不同 session/device，OTHER 为其他账号。`LJ_STORAGE_PUBLIC_CONFIG` 指向协调方公开配置 JSON（url/publishableKey）。不得把 token 放命令行、源码、证据或截图。脚本不创建用户，不注册设备，不使用 service secret；只消费 08 actor RPC。

```powershell
node -e "const r=require('node:child_process').spawnSync(require('electron'),['apps/pc-app/runtime/features/resources/verification/cloud-storage-live.mjs','--live'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:'inherit',windowsHide:true});process.exit(r.status??1)"
```

脚本将真实 Storage A→B 文件哈希、同 owner/resourceId、独立索引读回与其他账号下载拒绝写到隔离 artifacts。这个服务脚本是同机两个 SQLite 客户端、同一验证进程；不能称为双 Electron 或两台实体设备。最终双 Electron/两台实体设备的范围由主协调分别验收。

## 清理与恢复

[cleanup-sources.json](cleanup-sources.json) 列出五个确认无活动消费者的 3D renderer/importer/旧测试副本及原 SHA256。它们已从源码删除。可恢复源版本为 46abf416e0500b53ef32fc29b441d923ef5a6a80；本地已留 `artifacts/resources/legacy-resource-source-46abf41.zip`，SHA256 为 `60825b7b6443a32c98fd3e941674eaabef4928cedbf4d6cc12d0e42856d1d675`。Git 历史可单独导出该目录作回滚/取证；不把旧代码压缩副本重新放入当前源码或包。

原模型、图集、存档、导入记录和配置未删除。01 后续可移除 release 配置内已不存在 legacy/ 的排除条目；本会话不修改根构建或 battle UI。核心 backup 目前仍保留旧模型读取分支，可在公共工程统一清理时复用新的 history.cjs 校验能力，不能移除迁移读取。

官方核对来源：[Storage 访问控制](https://supabase.com/docs/guides/storage/security/access-control)、[私有 bucket](https://supabase.com/docs/guides/storage/buckets/fundamentals)、[上传](https://supabase.com/docs/reference/javascript/storage-from-upload)、[下载](https://supabase.com/docs/reference/javascript/storage-from-download)、[最新变更](https://supabase.com/changelog)、[TLS 更新](https://supabase.com/changelog/cbc-tls-ciphers-deprecated)。已只读检查上游 Storage 将 request.headers 传给数据库作用域；目标部署实际下载是否完整携带设备头仍由真实脚本验证。
