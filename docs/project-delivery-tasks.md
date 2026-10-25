# 灵境交付要求

更新于 2026-10-25。

交付应满足以下可核验结果：

- 当前入口为 TypeScript Electron 主进程/preload、React UI、共享 SQLite、PixiJS 2D 角色；旧原型入口与无用模型代码退役。
- Supabase Auth、PostgreSQL/RLS、Edge Functions、私有 Storage、私有 Realtime 和 PostGIS 承担云端能力；账号及业务权限在服务端重新校验。
- 原本机账号、宠物 ID、成长、对话、导入历史和资源字节保留；旧云端来源不可访问时，明确保留待迁移边界。
- 真实双客户端的自动同步、联机、领地经济和单端断线恢复经独立云端/SQLite/可见画面验收；同机双进程不写成两台物理设备。
- 完成最新远端代码拉取、最终严格回归、源码冻结及实际成品 EXE 验收，提供源码 SHA、文件 SHA 与真实限制。
- 清理仅针对已经确认替代的代码与内容，删除前验证恢复快照；不删除数据或重写云端迁移历史。

目前进度见 [task-progress.md](task-progress.md)，功能与证据映射见 [prd-traceability-audit.md](prd-traceability-audit.md)。工程便携包当前没有 Authenticode 签名；签名发布不能由本地运行通过推断。
