# 云端源码 CI 检查

在仓库根目录用 Node 24 安装普通依赖后运行：

```powershell
npm ci
npm run verify:cloud
```

入口不读取云端配置、凭据或用户档案，不需要 Docker。它检查：

- 与实际迁移账本对齐的 22 个 SQL 文件名；缺失、旧草稿或新增未审核文件都会失败。
- battle core、battle cloud、garden 和 discovery 分发的 `--check`；只比较现有文件并核对字节和修改时间未变。
- 现代账号、伙伴、探索、对局、资源和花园的 21 份本地 SQL/authority 测试，以及迁移文件门禁的回归测试。PGlite 串行运行，防止并发 WASM 内存膨胀。
- 固定 Deno 2.9.6 的 5 个私有资源包/偏好共享验证器；使用 `--no-config` 避开 Electron 根 tsconfig，锁文件冻结，不写根 node_modules。

输出在 `artifacts/foundation/cloud-engineering/cloud-source-check.json` 及同名目录按 `run-时间戳` 隔离的日志中。PGlite 使用显式 Auth/Storage 平台 fixture；结果不代表真实 Supabase HTTPS、真实 Storage、物理定位或完整 PostGIS 建库验收。

旧 9 份草稿由主协调统一退役之前，仅针对本机过渡检查使用：

```powershell
npm run verify:cloud -- --allow-legacy-drafts
```

该结果明确记录 `strictMigrationGate: false`。CI 永远运行无此参数的严格入口，草稿退役后任何一份被重新放回 migrations 都会被拒绝。
