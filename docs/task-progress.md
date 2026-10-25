# 灵境当前进度

更新于 2026-10-25。本页取代原型阶段的进度与命令。

- 云端已在现有 Supabase 项目部署 22 个实际迁移和 8 个函数，账号、保护存档、伙伴、探索、领地菜园、联机及私有资源共用完整 actor 守卫。
- 自动同步新增安全基线：个人改动先持久化原请求；干净本机自动读取较新云端；脏数据、冲突和旧档保留。真实生产30秒计时器已通过双 Electron 验收，协调方独立读两端 SQLite 和云端均为版本6/相同校验值。
- 原 comparisontext 的18张表100行保全到私有归档并有独立加密备份；其他项目未动。原 DesktopPet 远端不可访问且暂无备份，不能声称旧云端全部账号已迁入。本机旧账号密码验证、归属和原档读取保留。
- 最终成品尚待源码冻结、严格集成回归和实际便携 EXE 联合验收；联机收尾和领地底图视觉复核进行中。

当前实现与证据：[云端升级记录](implementation/cloud-upgrade-2026-10-25.md)、[功能状态](implementation/status/)、[云端部署](../infra/supabase/README.md)、[测试策略](testing-strategy.md)。

原型的旧完成声明、旧双开脚本和旧SQL部署指令已从本页退役；原内容在 Git 历史及经过验证的外部恢复 bundle 中保留，见 [清理审计](implementation/cleanup/cloud-coordinator-retirement.json)。
