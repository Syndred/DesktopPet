# 发布与回滚 Runbook（T-302）

文档版本：v1.0  
更新时间：2026-03-04

## 1. 发布前检查（Go/No-Go）

Go/No-Go 清单：
1. `npm run verify` 全绿。
2. `npm run test:coverage` 覆盖率门槛通过。
3. 关键任务进度已记录到 `docs/task-progress.md`。
4. 本次版本号已冻结（示例：`v1.0.0`）。
5. 回滚目标版本可用（至少最近一个稳定版本）。

## 2. 本地发布演练

按顺序执行：
1. `npm run release:build`
2. `npm run release:sign`
3. `npm run release:manifest -- --version=vX.Y.Z`

产物检查：
1. `artifacts/pc/pc-build.json`
2. `artifacts/mobile/mobile-build.json`
3. `artifacts/signatures/signatures.json`
4. `releases/vX.Y.Z/manifest.json`
5. `release-state/current.json`

## 3. CI 发布流程

触发入口：
1. GitHub Actions -> `Release Pipeline`

输入参数：
1. `release_version`: 目标版本号
2. `dry_run`: 是否仅演练不发布

执行阶段：
1. `build-sign-manifest`: 构建、签名、生成清单并归档
2. `publish`: 非 dry-run 时执行发布步骤

## 4. 回滚流程

本地回滚：
1. `npm run release:rollback -- --target=vX.Y.Z`
2. 检查 `release-state/current.json` 与 `release-state/last-rollback.json`

CI 回滚：
1. GitHub Actions -> `Release Rollback`
2. 输入 `target_version`

回滚后检查：
1. 版本指针已指向目标版本。
2. 核心烟雾测试通过（构建、核心链路、关键 API）。

## 5. 数据兼容策略

1. 数据库变更优先采用向后兼容迁移。
2. 非兼容变更必须附带反向迁移脚本或影子字段方案。
3. 回滚时不得依赖人工数据修复作为唯一手段。

