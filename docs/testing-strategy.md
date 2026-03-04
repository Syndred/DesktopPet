# 测试体系策略（T-301）

文档版本：v1.0  
更新时间：2026-03-04

## 1. 目标

形成可执行、可追溯的分层测试体系，覆盖：
1. 单元测试（Unit）
2. 集成测试（Integration）
3. 端到端测试（E2E）
4. 性能测试（Performance）
5. 安全测试（Security）

## 2. 分层定义

1. Unit：纯函数与模块级逻辑，要求稳定、快速。
2. Integration：多模块组合流程，验证协议、状态一致性。
3. E2E：按业务闭环场景模拟用户流程。
4. Performance：关键链路耗时、吞吐、预算判定。
5. Security：鉴权、越权、隐私脱敏、输入校验。

## 3. 目录与脚本

目录约定：
1. `tests/task-*.test.ts`：任务验收测试（默认归入 Unit 基线）
2. `tests/unit/**/*.test.ts`
3. `tests/integration/**/*.test.ts`
4. `tests/e2e/**/*.test.ts`
5. `tests/performance/**/*.test.ts`
6. `tests/security/**/*.test.ts`

执行脚本：
1. `npm run test:unit`
2. `npm run test:integration`
3. `npm run test:e2e`
4. `npm run test:performance`
5. `npm run test:security`
6. `npm run test:layers`
7. `npm run test:coverage`

## 4. 覆盖率门槛

Vitest 覆盖率最低门槛：
1. `lines >= 70%`
2. `statements >= 70%`
3. `functions >= 70%`
4. `branches >= 60%`

说明：
1. 核心模块（`game-engine`、`supabase-edge`）后续可提高至 80%+。
2. 覆盖率不等于质量，仍需配合场景测试与边界测试。

## 5. CI 质量门禁

CI 工作流：`quality-gates.yml`

门禁顺序：
1. `static-checks`：lint + typecheck
2. `layered-tests`：分层测试全量执行
3. `coverage-gate`：覆盖率报告输出与归档

合并策略：
1. 任一门禁失败，禁止合并。
2. 覆盖率报告必须可追溯到本次提交。

## 6. 报告与追踪

1. 每个任务必须有对应测试文件，路径写入 `docs/task-progress.md`。
2. 每次变更至少执行 `npm run verify`。
3. 发布前必须附带覆盖率报告与测试清单。

