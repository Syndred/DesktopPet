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
- npm run typecheck、npm run typecheck:ui、npm run test:native 检查类型及实际 Electron/SQLite；pc:smoke:profile、pc:smoke:engineering 和 pc:smoke:portable 分别验证档案发现、原生窗口和真实 EXE。
- npm run verify:cloud 严格检查22份实际部署迁移与生成源码，运行不带云凭据的SQL/领域/Deno用例；真实云端验收证据单独记录。
- 业务模块通过 [工程契约](docs/implementation/foundation-contract.md) 注册。旧 HTML renderer/preload/main 已移除。
- Linux CI 检查正式类型及单元逻辑，Windows CI 执行全部域 CJS/native、真实窗口和 EXE；旧内存版业务原型及其测试已退役，验收数量以本轮证据为准。

## 数据与恢复

PET_USER_DATA_DIR 显式覆盖优先；程序先寻找当前及已知旧目录的 lingjing.sqlite，再查找旧 pet-runtime-data.json。目录发现不移动文件、不生成空 JSON。首次旧档迁移前保留 .before-lingjing.bak，原始 JSON 由只读兼容能力读取。新增数据保存在所选原用户目录的 lingjing.sqlite。不得删除原账号、宠物 ID、成长、库存、聊天、资源、历史及备份。

普通便携 EXE 自带公开云配置；构建来源、运行依赖闭包、真实签名状态和二进制回滚见 [发布说明](docs/release-runbook.md)。无有效 Authenticode 证书的候选包会明确标记未签名。

清理决策见 [旧文件与消费者清单](docs/implementation/cleanup/cloud-foundation-inventory.json) 与 [云端退役审计](docs/implementation/cleanup/cloud-coordinator-retirement.json)。工程及云端清理均已保存完整 Git bundle，路径和SHA见相应审计；恢复时克隆到新目录，不覆盖当前检出或用户存档。设计文件及 comparisontext 加密恢复备份不属于清理范围。
