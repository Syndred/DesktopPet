# 《轻宠·领主 3D》PRD 对照审计（1.1~2.5）

文档版本：v1.1  
审计日期：2026-03-04  
审计范围：你提供的“核心玩法闭环 + 阶段一/二任务 + 7项输出物”

状态标识：
1. `[DONE]` 已实现并有测试/文档证据。
2. `[PARTIAL]` 已有核心实现，但未达到你定义的“完整可交付口径”。
3. `[PENDING]` 尚未进入可运行交付。

## 1. 核心玩法闭环对照

| 核心环节 | 实现状态 | 代码证据 | 测试证据 | 说明 |
|---|---|---|---|---|
| LBS 收留流浪宠物 | `[DONE]` | `apps/supabase-edge/src/lbs.ts`, `apps/supabase-edge/src/capture.ts` | `tests/task-t105-lbs.test.ts`, `tests/task-t106-capture-pokedex.test.ts` | 含地标元素映射、围栏判定、收留事务与记忆标签。 |
| 桌面养成（属性/技能） | `[DONE]` | `packages/game-engine/src/progression.ts` | `tests/task-t203-progression.test.ts` | 已有等级/经验/亲密度/技能解锁规则。 |
| 1v1 五行回合对战 | `[DONE]` | `packages/game-engine/src/index.ts`, `apps/supabase-edge/src/realtime-room.ts` | `tests/task-t103-battle-engine.test.ts`, `tests/task-t104-realtime-room.test.ts` | 已实现克制链、状态、怒气、回合同步规则。 |
| 现实区域占领与收益翻倍 | `[DONE]` | `apps/supabase-edge/src/territory.ts` | `tests/task-t108-territory.test.ts` | 已支持占领、日志、加成收益。 |
| 轻社交无压力 | `[DONE]` | `apps/supabase-edge/src/social.ts`, `apps/supabase-edge/src/friends.ts` | `tests/task-t201-light-social.test.ts`, `tests/task-t202-friends-private-duel.test.ts` | 已覆盖微光相遇、匿名守护、好友与私密约战。 |
| 核心闭环联调 | `[DONE]` | `apps/supabase-edge/src/core-loop.ts` | `tests/task-t109-core-loop.test.ts`, `tests/e2e/player-journey.e2e.test.ts` | 已具备“收留->对战->占领->收益回流”自动化链路。 |

## 2. 阶段一（1.1~1.7）逐项对照

| 任务 | 状态 | 对应实现与证据 | 结论 |
|---|---|---|---|
| 1.1 项目框架搭建 | `[DONE]` | Monorepo/workspaces、shared-types、Supabase migration；测试：`tests/task-t001-monorepo.test.ts`、`tests/task-t002-shared-contracts.test.ts`、`tests/task-t003-supabase-migration.test.ts` | 满足可启动、可类型检查、可迁移。 |
| 1.2 PC端3D悬浮窗核心 | `[PARTIAL]` | 透明窗/托盘/穿透：`apps/pc-app/runtime/main.cjs` + `renderer/renderer.mjs`；双模型对战舞台：`apps/pc-app/runtime/assets/models/*`；测试：`tests/task-t101-pc-window.test.ts`、`tests/task-t102-interaction.test.ts`、`tests/task-d001-pc-runnable-runtime.test.ts` | 窗口与穿透已完成，已具备双宠模型、血条怒气条、对战动效与中英文切换；但当前不是 React + R3F + GLB 动画生产架构。 |
| 1.3 对战引擎核心开发 | `[PARTIAL]` | 引擎与回合：`packages/game-engine/src/index.ts`；PC运行时对战接入：`apps/pc-app/runtime/services/battle-runtime.cjs`；房间服务：`apps/supabase-edge/src/realtime-room.ts`；测试：`tests/task-t103-battle-engine.test.ts`、`tests/task-t104-realtime-room.test.ts`、`tests/task-d002-pc-battle-runtime.test.ts` | 规则与回合广播已实现，且 PC 端可直接验证对战回合；当前仍为 in-memory 服务模拟，未接 Supabase Realtime 实网链路。 |
| 1.4 LBS收留模块 | `[PARTIAL]` | LBS + 收留：`apps/supabase-edge/src/lbs.ts`、`apps/supabase-edge/src/capture.ts`；测试：`tests/task-t105-lbs.test.ts`、`tests/task-t106-capture-pokedex.test.ts` | 核心逻辑已实现；移动端/PC真实定位 SDK 与后台提醒尚未落地。 |
| 1.5 情绪镜像系统 | `[PARTIAL]` | 情绪引擎：`apps/supabase-edge/src/emotion.ts`；测试：`tests/task-t107-emotion-engine.test.ts`、`tests/task-s04-privacy-compliance.test.ts` | 映射逻辑与隐私约束已实现；真实设备行为采集接入（PC系统级/移动端）待补。 |
| 1.6 核心闭环联调 | `[PARTIAL]` | `apps/supabase-edge/src/core-loop.ts`；测试：`tests/task-t109-core-loop.test.ts` + `tests/integration/core-loop.integration.test.ts` + `tests/e2e/player-journey.e2e.test.ts` | 闭环已跑通；但“双端实时一致（PC+Mobile）”因移动端未交付而未闭合。 |
| 1.7 MVP打包与测试 | `[PARTIAL]` | 构建与发布脚本：`scripts/release/*`；测试：`tests/task-t301-testing-pipeline.test.ts`、`tests/task-t302-release-pipeline.test.ts` | 有演练级构建与回滚；未形成真实 Windows/macOS 安装包和 Android/iOS 包产物。 |

## 3. 阶段二（2.1~2.5）逐项对照

| 任务 | 状态 | 对应实现与证据 | 结论 |
|---|---|---|---|
| 2.1 区域占领玩法完善 | `[PARTIAL]` | `apps/supabase-edge/src/territory.ts`；测试：`tests/task-t108-territory.test.ts` | 占领与收益已做；排行榜与完整区域榜单展示未完成。 |
| 2.2 轻社交模块开发 | `[DONE]` | `apps/supabase-edge/src/social.ts`、`apps/supabase-edge/src/friends.ts`；测试：`tests/task-t201-light-social.test.ts`、`tests/task-t202-friends-private-duel.test.ts` | 模块逻辑完整且有测试。 |
| 2.3 移动端悬浮窗适配 | `[PENDING]` | `apps/mobile-app/README.md`（placeholder） | 尚未进入可运行阶段。 |
| 2.4 宠物养成系统完善 | `[PARTIAL]` | `packages/game-engine/src/progression.ts`、`apps/supabase-edge/src/appearance.ts`；测试：`tests/task-t203-progression.test.ts`、`tests/task-t204-appearance.test.ts` | 规则层与服务层已实现；3D换装渲染与端侧 UI 联动待补。 |
| 2.5 性能优化与BUG修复 | `[PARTIAL]` | 预算/报告：`packages/observability/src/*`、`scripts/perf/generate-weekly-report.mjs`；测试：`tests/task-t303-performance-cost.test.ts` | 有预算治理与脚本；缺真实设备实测数据和安装包体积优化闭环。 |

## 4. 你要求的“7项输出物”对照

| 输出项 | 状态 | 证据 |
|---|---|---|
| 1. 完整项目目录结构 | `[DONE]` | 仓库根目录 + monorepo 已稳定。 |
| 2. BattleEngine.ts 完整代码 | `[PARTIAL]` | 引擎完整实现位于 `packages/game-engine/src/index.ts`（类名 `BattleEngine` 已具备，文件名与要求不一致）。 |
| 3. PC端3D悬浮窗与穿透核心代码 | `[PARTIAL]` | 已有 `apps/pc-app/runtime/main.cjs` + `renderer/renderer.mjs`；但非 R3F/GLB 生产形态。 |
| 4. Supabase 表结构与索引 SQL | `[DONE]` | `infra/supabase/migrations/0001_core_schema.sql`。 |
| 5. LBS 刷新与收留逻辑代码 | `[DONE]` | `apps/supabase-edge/src/lbs.ts` + `apps/supabase-edge/src/capture.ts`。 |
| 6. 情绪镜像系统核心代码 | `[DONE]` | `apps/supabase-edge/src/emotion.ts`。 |
| 7. 全端打包与部署完整步骤 | `[PARTIAL]` | `docs/runtime-config.md` + `docs/release-runbook.md` + `scripts/release/*`；移动端真实打包链路未闭合。 |

## 5. 本轮核查结论

1. 你给的清单已经完成了“服务层核心闭环 + Desktop 可运行 + 全链路自动化测试”的大部分主体。
2. 当前仍有关键未闭合项：
   - 移动端 Flutter + Unity 可运行工程。
   - PC 端 R3F + GLB 动画生产实现。
   - Supabase Realtime 实网对战链路（当前为 in-memory 服务模拟）。
   - 真实安装包（PC/macOS/Android/iOS）交付产物。
3. 因此，当前状态准确表达应为：`功能与规则大部分完成，但尚未达到你定义的“全端完全可运行交付”`。

## 6. 本轮测试执行记录（2026-03-04）

1. `npm run verify`：通过。
2. 分层测试：unit/integration/e2e/performance/security 全部通过。
3. `npm run pc:smoke`：通过。

## 7. 下一步建议（严格补齐缺口）

1. 先完成“移动端可运行壳工程 + Unity 视图接入”（对齐 2.3 与 1.6/1.7）。
2. 将 PC runtime 升级为 React + R3F + GLB 动画管线（对齐 1.2）。
3. 将对战房间从 in-memory 替换为 Supabase Realtime + Edge 校验（对齐 1.3）。
4. 用真实打包流程产出安装包并纳入发布演练（对齐 1.7 与输出项 7）。
