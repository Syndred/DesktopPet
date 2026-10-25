# 灵境 Supabase 云端

当前目标为 `jbvrdmrkwpznbrvteive`，控制台仍显示 Text Comparision，API 为 https://jbvrdmrkwpznbrvteive.supabase.co。原项目的18张表和100行数据已校验后隔离到私有归档，并保留独立加密备份；这些用户不是 DesktopPet 用户。GraffitiName 项目未修改。

## 当前入口

| 功能 | Edge Function | 主要复用能力 |
| --- | --- | --- |
| 账号与身份 | lingjing-auth | Supabase Auth、主进程官方 SDK、安全会话 |
| 完整存档 | lingjing-save | PostgreSQL CAS、幂等回执、owner 锁 |
| 伙伴 | companions-sync | 受验证实例命令、统一保护存档 |
| 探索与捕捉 | discovery | 签名定位凭证、权威回合、原子捕捉 |
| 菜园 | garden-sync | 服务端时钟、库存与成长原子提交 |
| 领地 | territory-sync | PostGIS、行锁、并发归属 |
| 对战 | lingjing-battle | 权威训练/联机、参与者私有 Realtime |
| 角色资源 | lingjing-resources | 私有 Storage、实际字节验证、校准/动作偏好 |

函数自行校验新鲜 Auth 用户和完整 owner/device/SID；配置中关闭旧 JWT 网关验证，不代表允许匿名受保护操作。登录/注册是受限的账号入口，业务权限由身份映射、RLS 和事务内 actor 守卫决定。公开配置只含 URL 与 publishable key，服务密钥留在提供方环境。

## 迁移和检查

`migrations/` 的22个文件名按实际远端执行顺序对齐。版本、原始文件名、实际 SQL 哈希和函数部署来源见 [部署清单](../../docs/implementation/evidence/cloud/2026-10-25/deployment-manifest.json)。未对远端历史执行 repair。旧原型 SQL 不再放在活动迁移目录。

```powershell
npm ci
npm run verify:cloud
```

检查运行现代 SQL/SQLite/WASM PostgreSQL、共享生成分发只读比较和固定 Deno 验证器；它不连接生产、不需要私钥，也不宣称完成真实 PostGIS 重置或云端验收。真正的云端/原生证据分别保留在各模块 evidence 目录。

本地 Supabase 使用 CLI2.122、PostgreSQL17 和当前 config.toml，需要 Docker 或 Podman；本机未安装容器运行时，因此没有完整本地 reset 通过结论。新空库的 comparisontext 一次性步骤会显式跳过；若出现部分原表或已有归档则停止，不能静默移动或删数据。原执行 SQL 见 [操作审计](operations/README.md)。

部署前先 fetch/pull 最新代码、通过严格迁移门禁，再把远端历史与清单逐项比较。当前会话的生产迁移/部署由主协调通过已连接插件集中执行。不要重放一次性保全、执行旧原型 SQL、修改历史版本或把匿名/用户角色升级成业务写入者。

## 数据与原账号

旧 DesktopPet 实例仍不可读取，用户暂无 SSH 或数据库备份。因此不宣称所有旧云账号已迁移。本机原档、原密码验证、文本 owner、petId、历史和安全导入能力继续保留；不会按用户名猜测合并账号。

原 comparisontext 的恢复材料位于工作区外的受保护备份目录；恢复需先停止旧应用流量，并核对全部原表指纹及原权限。正常客户端不能访问私有归档。权限矩阵见 [rls-matrix.md](rls-matrix.md)。
