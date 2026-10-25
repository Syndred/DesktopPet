# 灵境 Windows 发布与回滚

更新于 2026-10-25。正式发布链路只生成 Windows x64 便携 EXE；源码入口见 README。旧移动端占位产物、按哈希冒充签名的脚本以及独立构建缓存已退役。

## 安装和构建

使用 Node 24 / Windows x64，执行 `npm ci`、`npm run native:check`。安装保留正常生命周期脚本；better-sqlite3 13 使用上游 N-API 二进制。更新锁文件后执行 `npm run deps:lock`。

在干净、已提交的检出中执行 `npm run release:prepare`。该命令依次构建实际 EXE、审计 ASAR、启动实际便携程序，再生成不可覆盖的版本目录。可先设置 `RELEASE_VERSION`，或单独使用 `npm run release:manifest -- --version=<version>` 归档已经通过审计和烟雾检查的同一 EXE。

产物位于 `artifacts/pc-cloud-upgrade/`。版本归档在 `releases/<version>/`，包括真实 EXE、独立 SHA256 文件、manifest.json、包审计及便携程序验收记录。版本目录存在时拒绝覆盖；生成清单默认不切换正在使用的版本。

## 来源和依赖闭包

构建清单记录 sourceCommit/sourceTree、工作区脏文件、原始及 CRLF 规范化源码指纹、实际编译字节指纹、Electron/SQLite 版本、独立主窗口和桌宠入口、公开云配置 SHA/projectRef。

`runtime-closure.mjs` 从正式核心及七个注册模块追踪相对 require/import，并纳入定位及前台检测 PowerShell 文件。所需 .cjs、.js、.mjs、JSON 都按实际依赖进入包；未知动态导入、缺失依赖、测试或服务端权威实现会阻止打包。builder 的 CJS 配置重新核对每个源码哈希，ASAR 审计逐文件复核。

公开配置只包含 Supabase URL、projectRef、publishable key，位于资源目录 `lingjing-cloud-public.json`。secret/service role、用户数据库、私钥、恢复备份、开发/测试脚本不得进入包。便携测试先在无云配置环境变量的普通隔离档案中确认云账号入口可用，再在明确 QA 场景下检查角色、行走纹理和训练；这不代表真实云端业务或第二台实体设备验收。

## Windows 签名

SHA256 仅用于完整性校验。真实签名由 electron-builder 使用 `CSC_LINK` / `CSC_KEY_PASSWORD` 配置的 Authenticode 证书完成；本地不落入源码。使用 `npm run release:verify-signature -- --executable=<path>` 调用 Windows Get-AuthenticodeSignature。

没有证书时，候选包允许以 `NotSigned` 状态归档，明确记录未签名。`--require-signed` 或 `REQUIRE_SIGNED=1` 要求 Valid 签名。失效、被改动或无法检查的签名不能成为可发布版本。

## CI 和发布

CI 包含 Linux 类型与单元检查，以及 Windows 普通 npm ci、Node/Electron 共用 SQLite、全部 CJS/native 测试、实际 EXE 构建、旧 SQLite 档案发现、原生窗口/托盘/IPC/延迟加载、包审计及便携 EXE smoke。只上传 EXE 与选定 JSON/PNG 证据，不上传用户档案、加密凭据或 artifacts 全目录。

Release Pipeline 默认 dry_run。正式发布要求已有审核过的 Git tag、真实证书、实际 EXE smoke 与匹配哈希；随后创建 GitHub Release，上传同一不可变二进制和清单。未运行 GitHub 托管 workflow 时，不能把本地等价检查写成托管 CI 成功。

触发正式发布前，先把 release_version 对应 tag 推送到 origin，并使它指向本次 workflow 的 GITHUB_SHA。发布步骤会读取远端 tag、解引用 annotated tag 到 commit，强制核对 tag commit == manifest.source.sourceCommit == GITHUB_SHA；同名 tag 指向其他提交会被拒绝，不会由 --target 自动纠正。

工作流使用已核对的官方版本：[checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1)、[setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0)、[upload-artifact v7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2)、[download-artifact v8.0.2](https://github.com/actions/download-artifact/releases/tag/v8.0.2)。

## 真实二进制回滚

保留目标版本完整目录后执行：

```powershell
npm run release:rollback -- --target=<verified-version>
npm run release:launch -- --verify-only
npm run release:launch
```

回滚会先复核版本目录边界、manifest、真实 EXE 哈希，再原子切换 release-state/current.json；失败保留原指针。launch 每次重新验证，实际启动指针选中的 EXE。已在运行的旧进程应先正常退出；指针切换不会强杀用户程序。

Release Rollback workflow 需要 target_version 与保存该版本的成功 release workflow run ID，下载完整二进制归档后执行同样校验，输出可检查的选版指针。它不是远端自动更新服务，不宣称已经切换用户设备上的运行程序。

回滚只选择程序二进制，不回退/删除用户 SQLite、资源、聊天、成长或云数据库。云端使用兼容的追加迁移；远端迁移历史和 comparisontext 保全重放由主协调统一处理，不从旧 authority SQL、旧 accounts-sync/duel-online 入口恢复部署。
