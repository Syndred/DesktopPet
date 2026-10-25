# 灵境需求与验收证据映射

更新于 2026-10-25。本页取代退役原型的完成判定。

| 需求 | 当前实现与证据入口 |
| --- | --- |
| 原账号、归属、权限与安全会话 | [账号状态](implementation/status/cloud-accounts.json)、[身份契约](implementation/cloud-identity-contract-2026-10-25.md) |
| 双端自动同步、原请求和冲突保护 | [真实生产计时器验收](implementation/evidence/accounts/cloud-2026-10-25/automatic-sync/evidence.json)、[协调方独立 SQLite 复核](implementation/evidence/cloud/2026-10-25/automatic-sync-independent-sqlite.json) |
| 多伙伴独立实例、桌面与成长 | [伙伴状态](implementation/status/cloud-companions.json)、[真实原生证据](implementation/evidence/companions/cloud-2026-10-25/README.md) |
| 探索、定位、权威对局和捕捉 | [探索状态](implementation/status/cloud-discovery.json) |
| 训练、好友联机、私有频道和战报 | [对战状态](implementation/status/cloud-battle.json) |
| PostGIS领地、菜园、库存与指定宠物喂养 | [领地状态](implementation/status/cloud-garden.json) |
| 人设、记忆、消息顺序与本机模型凭据 | [对话状态](implementation/status/cloud-conversations.json) |
| 私有资源、导入字节/流水、显示偏好 | [资源状态](implementation/status/cloud-resources.json) |
| 云端部署与原项目保全 | [部署清单](implementation/evidence/cloud/2026-10-25/deployment-manifest.json)、[保全复核](implementation/evidence/cloud/2026-10-25/project-preservation-final-readback.json) |
| 已替代代码与内容清理 | [协调方恢复与退役审计](implementation/cleanup/cloud-coordinator-retirement.json) |

实际未完成项以各状态和协调方验收为准；早期原型测试数量、合成定位或单独领域测试不能代替成品交付结论。
