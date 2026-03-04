# 性能与成本治理（T-303）

文档版本：v1.0  
更新时间：2026-03-04

## 1. 性能预算

预算来源：`infra/performance/perf-budget.json`

预算项：
1. API 延迟 p95 <= 100ms
2. 对战同步 p95 <= 150ms
3. PC 内存 p95 <= 150MB
4. 移动端内存 p95 <= 220MB
5. 崩溃率 <= 0.1%

判定逻辑：
1. 任一指标超限即视为预算不健康。
2. 预算检查函数：`evaluatePerformanceBudget`。

## 2. 成本模型

模型来源：`infra/cost/cost-model.json`  
样例用量：`infra/cost/sample-usage.json`

主要成本项：
1. Supabase Pro 固定成本
2. 地图调用成本（按千次）
3. Realtime 消息成本（按千条）
4. 告警与监控基础成本

估算函数：
1. `estimateMonthlyCost`

## 3. 周报机制

生成命令：
1. `npm run perf:report`

输出文件：
1. `reports/weekly-ops-report.json`

输出内容：
1. 性能预算健康状态
2. 超限项列表（如有）
3. 月度成本估算

## 4. 运维建议

1. 每周固定窗口执行预算和成本复盘。
2. 预算连续两周超限时，列为阻断项进入下个迭代。
3. 成本超预算 20% 时，必须启动限流或策略降级评估。

