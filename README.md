# 灵境 · 桌面伙伴

正式桌面程序使用 Electron 44.9.3、React、TypeScript、Vite 与 SQLite。云端升级遵守 [统一任务契约](docs/implementation/cloud-upgrade-2026-10-25.md)，业务部署由主协调集中执行。

## Windows 开发

使用 Node.js 22.12 或更新版本；当前已验收 Node 24 / Windows x64。

```powershell
npm ci
npm run native:check
npm run dev:pc
```

better-sqlite3 13 使用发布包内的 N-API 预编译文件。普通安装不需要 VS C++ 工具链。锁文件保留上游发布的 gypfile:false，避免 npm/cli#9837 的隐式编译问题；维护依赖后执行 npm run deps:lock。npm run verify:install 会在全新隔离目录检查普通 npm ci 与 Node/Electron 交叉读写，不修改现有 node_modules。

## 正式入口与检查

- 主进程：apps/pc-app/runtime/main/index.ts；安全 preload：runtime/preload/index.ts。
- React 主界面按路由加载；桌宠使用独立 desktop.html，保持同一资源渲染器。
- npm run build:pc 编译正式程序；npm run start:pc 启动编译版本。
- npm run package:pc:win 生成 artifacts/pc-cloud-upgrade 下的 Windows 便携 EXE。
- npm run typecheck、npm run test:foundation 与 npm run pc:smoke 检查类型、实际 SQLite 和正式启动结构。
- 业务模块通过 [工程契约](docs/implementation/foundation-contract.md) 注册。旧 HTML renderer/preload/main 已移除。

## 数据与恢复

程序继续查找原有用户目录和 pet-runtime-data.json，首次迁移前保留 .before-lingjing.bak；原始 JSON 由只读兼容能力读取。新增数据保存在原用户目录的 lingjing.sqlite。不得删除原账号、宠物 ID、成长、库存、聊天、资源、历史及备份。

清理决策见 [旧文件与消费者清单](docs/implementation/cleanup/cloud-foundation-inventory.json)。清理前完整 Git bundle 存放在 artifacts/recovery/cloud-foundation-2026-10-25，恢复时克隆到新目录，不覆盖当前检出或用户存档。设计文件及 comparisontext 加密恢复备份不属于清理范围。
