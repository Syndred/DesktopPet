# 灾备演练 Runbook（S-02）

文档版本：v1.0  
更新时间：2026-03-04

## 1. 备份目标

当前纳入备份：
1. `releases/`
2. `release-state/`
3. `infra/supabase/migrations/`

## 2. 执行备份

命令：
1. `npm run dr:backup -- --label=dr-YYYYMMDD-HHMM`

产物：
1. `backups/<label>/...`
2. `backups/<label>/backup-metadata.json`

## 3. 执行恢复

命令：
1. `npm run dr:restore -- --label=<label>`

恢复后验证：
1. `release-state/current.json` 可读取。
2. `release-state/last-restore.json` 已更新。
3. 发布清单存在且可解析。

## 4. 演练频率与成功标准

1. 至少每月进行一次全流程演练。
2. 演练成功标准：
   - 备份可生成
   - 恢复可执行
   - 核心发布状态可恢复

