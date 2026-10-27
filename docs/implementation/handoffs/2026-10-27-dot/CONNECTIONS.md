# Dot 连接说明（无管理密钥）

用户已要求另外提供可交给 Dot 的连接文件。实际应用 key、连接步骤和权限缺口已保存在仓库外的私有文件 **DesktopPet-Dot-CONNECTIONS-PRIVATE-20261027.md**，由用户直接转交；本文件不包含管理凭证。

## 正确仓库和项目

| 项目 | 值 |
| --- | --- |
| GitHub | https://github.com/Syndred/DesktopPet |
| 工作分支 | codex/cloud-authority-convergence（未合并 main） |
| Supabase ref | jbvrdmrkwpznbrvteive |
| Dashboard 名称 | Text Comparision（确为当前程序使用的现有项目） |
| API | https://jbvrdmrkwpznbrvteive.supabase.co |
| Dashboard | https://supabase.com/dashboard/project/jbvrdmrkwpznbrvteive |
| Edge Functions | https://jbvrdmrkwpznbrvteive.supabase.co/functions/v1/ |
| 项目范围 MCP | https://mcp.supabase.com/mcp?project_ref=jbvrdmrkwpznbrvteive |
| 只读核对 MCP | https://mcp.supabase.com/mcp?project_ref=jbvrdmrkwpznbrvteive&read_only=true |

2026-10-27 已通过当前会话的 Supabase 连接只读核对：项目 ACTIVE_HEALTHY、区域 ap-southeast-1；仓库公共配置的项目、URL 和实际应用 key 与云端仍启用的 key 匹配。没有在交接中部署、迁移或写业务记录。

## 应用连接与管理权限分开

- 正常桌面运行默认读取 [config/lingjing-cloud-public.json](../../../../config/lingjing-cloud-public.json)，不需要为同一环境再猜一份 .env。
- 可选覆盖变量为 LINGJING_SUPABASE_URL、LINGJING_SUPABASE_PUBLISHABLE_KEY，见 [.env.example](../../../../.env.example)。只配置本项目应用公开 key，不能把 service_role/secret key 放入桌面。
- 后台 SQL/迁移/部署需要 Dot 自己的 Supabase 管理授权。当前会话的 OAuth 连接不能随 Markdown 文件自动转移；私有连接文件明确列出了此权限缺口，没有假称已经导出管理员 Token。
- hosted MCP 可走 OAuth。若 Dot 不支持 OAuth 而只支持 Token，需要在 Dot 的安全凭证入口提供相应管理 Token；应用公开 key 不能替代。
- 项目范围 MCP 不提供部分账号级工具，可用 get_project_url、list_edge_functions 或只读查询核对连接，不因此误判项目不存在。
- 现有应用登录、刷新及设备头见 [supabase-remote.cjs](../../../../apps/pc-app/runtime/features/accounts/supabase-remote.cjs)。需要正常登录取得用户会话；不要复制其他设备 token，也不要把 GLOBAL_SERIAL_SCOPE_REVOKED 前置受限当成 URL 错误。

## 已读取的函数部署快照

| 函数 | version |
| --- | --- |
| lingjing-auth | 3 |
| lingjing-save | 1 |
| discovery | 6 |
| companions-sync | 3 |
| garden-sync | 3 |
| territory-sync | 3 |
| lingjing-resources | 2 |
| lingjing-battle | 4 |
| lingjing-records | 2 |

全部为 ACTIVE。此表只描述交接时读取的现状，不代表 Dot 已取得调用或部署权限。保留当前代码的云端权威边界，不恢复旧整档主同步路径。

地图、外部模型密钥和原 QA 账号登录没有包含在公开仓库；本次本机项目环境没有发现可直接交接的管理 Token。真实客户端/原档案仍在原机器，远端 Dot 不自动拥有。缺少条件如实说明，不换身份或重发未知请求来证明连通。

官方连接说明：[Supabase MCP](https://supabase.com/docs/guides/ai-tools/mcp)。
