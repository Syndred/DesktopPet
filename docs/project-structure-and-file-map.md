# 灵境项目目录与文件用途

更新时间：2026-03-07

## 1. 根目录

1. `package.json`：工作区脚本入口、版本号、打包/测试命令。
2. `package-lock.json`：依赖锁定。
3. `README.md`：项目总览。
4. `scripts/`：启动、构建、发布、运维脚本。
5. `apps/`：应用端代码（PC 运行时、Supabase Edge）。
6. `infra/`：数据库迁移、RLS、Supabase 相关基础设施。
7. `tests/`：任务化测试与回归测试。
8. `docs/`：配置说明、验收说明、发布说明等文档。

## 2. PC 运行时核心目录（重点）

1. `apps/pc-app/runtime/main.cjs`
   - Electron 主进程。
   - 负责窗口、托盘、IPC、联机服务接线。
2. `apps/pc-app/runtime/preload.cjs`
   - 渲染层与主进程的安全桥接 API。
3. `apps/pc-app/runtime/renderer/index.html`
   - 桌宠与面板结构。
4. `apps/pc-app/runtime/renderer/styles.css`
   - 桌宠与面板样式。
5. `apps/pc-app/runtime/renderer/renderer.mjs`
   - 前端交互主逻辑：战斗、联机、仓库、日志、国际化。
6. `apps/pc-app/runtime/auth/index.html`
   - 登录注册窗口结构。
7. `apps/pc-app/runtime/auth/styles.css`
   - 登录注册窗口样式。
8. `apps/pc-app/runtime/auth/renderer.mjs`
   - 登录注册窗口逻辑。
9. `apps/pc-app/runtime/services/battle-runtime.cjs`
   - 回合战斗规则与结算。
10. `apps/pc-app/runtime/services/runtime-data-store.cjs`
   - 本地数据持久化（账号会话、仓库、战报等）。
11. `apps/pc-app/runtime/services/online-duel-service.cjs`
   - 联机对战服务封装（房间、回合、同步、诊断日志）。
12. `apps/pc-app/runtime/services/map-runtime.cjs`
   - 地图能力抽象（定位、权限、追踪、距离）。
13. `apps/pc-app/runtime/services/wild-pet-runtime.cjs`
   - 附近灵宠生成、收留流程、冷却逻辑。
14. `apps/pc-app/runtime/assets/models/`
   - 运行时 GLB 模型资源。
15. `apps/pc-app/runtime/assets/models/catalog.json`
   - 模型来源、许可、作者与文件映射清单。
16. `apps/pc-app/runtime/assets/icons/`
   - 托盘/窗口图标资源。

## 3. 联机与数据库

1. `infra/supabase/migrations/`
   - 数据库结构与策略迁移。
2. `infra/supabase/functions/duel-online/index.ts`
   - 联机回合结算 Edge Function。
3. `infra/supabase/README.md`
   - Supabase 部署与接线说明。
4. `infra/supabase/rls-matrix.md`
   - RLS 权限矩阵说明。

## 4. 发布与打包

1. `scripts/release/electron-builder.pc.json`
   - PC 端打包配置（产物格式、图标、输出目录）。
2. `scripts/release/build-pc.mjs`
   - PC 构建流程脚本。
3. `artifacts/pc-beta/`
   - 打包产物输出目录。
4. `build/icon.png`
   - Windows 打包图标源文件（由 electron-builder 转换为 ico）。

## 5. 联机双开调试脚本

1. `scripts/desktop/start-online-dual.cmd`
   - 一键双开 A/B 客户端。
2. `scripts/desktop/start-online-a.cmd`
3. `scripts/desktop/start-online-b.cmd`
4. `scripts/desktop/local-online-env.cmd`
   - 本地联机环境变量（Supabase URL/ANON KEY）。

## 6. 当前瘦身策略（本次执行）

1. 已删除确认无引用的临时文件：`.tmp-electron-check.cjs`。
2. 保留所有与后续路线直接相关模块：
   - 联机服务
   - 仓库与战报
   - 地图/收留
   - 鉴权与单端会话
3. 未做激进删除，避免误伤回归测试路径。

## 7. 后续可继续瘦身的范围（建议分批）

1. 清理历史实验脚本（先确认无 CI/文档引用）。
2. 将 `renderer.mjs` 按功能拆分模块（duel/inventory/map/auth/ui）。
3. 建立模型目录清单与自动校验，减少硬编码映射。
4. 对 `docs/` 做版本归档，保留最新+关键里程碑文档。
