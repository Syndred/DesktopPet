# 灵境项目目录与文件用途

更新于 2026-10-25。正式架构与运行命令见 [README](../README.md)、[运行配置](runtime-config.md) 和 [发布说明](release-runbook.md)。

| 路径 | 用途 |
| --- | --- |
| apps/pc-app/runtime/main/index.ts | Electron 正式窗口、托盘、受信 IPC 与退出生命周期 |
| apps/pc-app/runtime/preload/index.ts | sandbox/contextIsolation 的类型化桥接 |
| apps/pc-app/runtime/core | 服务注册、SQLite、资源备份、只读历史兼容与档案发现 |
| apps/pc-app/runtime/features | accounts/resources/companions/battle/garden/discovery/conversations 七个模块 |
| apps/pc-app/ui/src | React 主界面、路由模块和共享 ResourceStage |
| apps/pc-app/ui/desktop.html | 独立透明桌宠入口 |
| build/feature-routes.ts | 编译时提取路由元数据，运行时按需导入 |
| packages/shared-types/src/ipc.ts | 公共 IPC 命令及类型契约 |
| apps/pc-app/runtime/assets/brand | 正式品牌、窗口和托盘图标 |
| apps/pc-app/runtime/features/resources/assets/roster-v2 | 八角色、五元素的二维动画资源及来源记录 |
| config/lingjing-cloud-public.json | 可公开的 Supabase 配置 |
| infra/supabase | 由协调统一审批的迁移与函数；旧入口退役清单见 cleanup inventory |
| scripts/desktop | 正式启动、原生加载、依赖闭包及来源清单 |
| scripts/release/electron-builder.pc.cjs | 复核依赖闭包后加载 JSON 打包配置 |
| scripts/release | 真实签名检查、不可变 EXE 归档、校验、选版与启动 |
| scripts/acceptance | 真实 Electron、便携 EXE、包来源与隔离验收 |
| artifacts/pc-cloud-upgrade | 当前 Windows x64 便携 EXE 与解包结果（忽略，不提交） |
| docs/implementation/status | 各模块的提交、证据、数据保护和剩余事项 |
| docs/implementation/cleanup | 旧文件、替代入口、消费者与恢复决定 |

旧 HTML renderer/auth/main/preload、移动端发布占位以及哈希伪签名脚本已退役。仍有消费者的旧数据读取、地图或联机能力保留至正式替代验收完成，再按清单清理；不能直接删除它们破坏历史恢复或业务行为。

清理前完整 Git bundle 保存在 artifacts/recovery/cloud-foundation-2026-10-25。恢复到新目录，不覆盖当前检出；用户档案、设计源文件以及 comparisontext 加密恢复备份不属于源码清理。
