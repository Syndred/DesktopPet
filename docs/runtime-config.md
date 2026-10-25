# 灵境运行配置

更新于 2026-10-25。正式程序为 Electron + React + TypeScript + Vite + SQLite；旧 HTML renderer、3D 显示和旧 main/preload 入口已退役。设计资料及历史存档保留。

## Windows 环境与启动

Node >=22.12，当前验证 Node 24 / Windows x64；Electron 固定 44.9.3，better-sqlite3 固定 13.0.3。

```powershell
npm ci
npm run native:check
npm run dev:pc
```

`npm run build:pc` 编译正式入口、追踪运行依赖并生成来源清单；`npm run start:pc` 启动编译版本。`npm run package:pc:win` 生成真实便携 EXE，发布和二进制回滚见 [发布说明](release-runbook.md)。

## 账号与存档目录

PET_USER_DATA_DIR 的显式绝对目录优先。未设置时，先寻找当前应用目录的 lingjing.sqlite，再寻找已知 Lingjing、qingpet-desktop-runtime、qingpet-lord-3d 目录的同名 SQLite；没有 canonical SQLite 时才按相同顺序查找 pet-runtime-data.json。全新安装默认使用 AppData/Lingjing。

目录发现只读取，不移动、不覆盖文件，也不生成空 JSON 作为标记。首次旧 JSON 迁移前保留 .before-lingjing.bak；旧档由只读兼容读取，正式账户、每个 petId、成长、背包、聊天、资源及历史保存在所选目录的 SQLite。账户记住登录凭据由 Windows 安全存储加密；个人 BYOK 不进入跨端存档。

## 云端公开配置

打包从 config/lingjing-cloud-public.json 复制公开配置到 resources/lingjing-cloud-public.json，记录 SHA256 与 projectRef。用户正常启动 EXE 不需要手填环境变量。开发路径的默认配置解析由 accounts 模块维护。

仅在维护独立环境时使用 LINGJING_PUBLIC_CONFIG，或 LINGJING_SUPABASE_URL 与 LINGJING_SUPABASE_PUBLISHABLE_KEY。只接受 HTTPS 和 sb_publishable_ 公钥。secret/service role 不能进入桌面包、renderer、日志或验收截图。

本轮云端项目为 Text Comparision，project ref jbvrdmrkwpznbrvteive；生产迁移和函数发布由主协调集中执行，保留 comparisontext 旧业务加密恢复副本。

## IPC、路由和桌宠

正式 preload 仅暴露受校验的 lingjing 调用与事件。新调用使用共享类型中的 call / command；已有 invoke 经过同一受信窗口、载荷和 petId 校验。主界面按路由加载，各桌宠从独立 desktop.html 加载资源渲染器。桌面窗口只操作绑定 petId，位置、显示选择和对战/聊天选择独立。

## 验收

`npm run typecheck`、`npm run typecheck:ui` 检查类型；`npm run test:native` 在实际 Electron 执行所有 CJS/SQLite 测试。`npm run pc:smoke:profile` 使用新建隔离目录验证只有 SQLite 的旧档发现；`npm run pc:smoke:engineering` 验证原生窗口、托盘、请求图与 IPC。

QA 必须通过 create-scenario-profile.mjs 新建路径绑定的隔离目录，同时设置 PET_USER_DATA_DIR 与 LINGJING_QA_SCENARIO。不得给普通用户目录补 QA 标记。QA 明确显示模拟身份；真实 Supabase、同机双进程和两台实体设备证据分别记录。
