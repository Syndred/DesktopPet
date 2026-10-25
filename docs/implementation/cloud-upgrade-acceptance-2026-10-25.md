# 灵境云端升级验收 · 2026-10-25

新云端与最终 Windows 便携包已完成真实验收。按用户 2026-10-25 最新指示“旧服的不用管”，旧服恢复及其全量账号迁移移出本次范围，当前授权范围已完成。该历史实例的全部原云端账号尚未迁移。

应用来源：`a9acd7f6f1920c541d429fa26d1f054b1427cd95`。此后只归档证据，生产代码与样式未改。完成前已再次 fetch 并 pull 最新 origin/main，结果 Already up to date，远端提交 `4786f97680679c2db0aa307fa5f67ec247f93086`。

## 技术栈与部署

复用 comparisontext 的 Supabase Free 实例 `jbvrdmrkwpznbrvteive`，实际部署 22 个迁移和 8 个 ACTIVE Edge Functions。最终再次核对全部函数版本及部署包哈希一致；GraffitiName 未改动，未升级付费方案。

| 范围 | 技术与当前能力 |
| --- | --- |
| 账号权限 | Supabase Auth、PostgreSQL RLS、事务内 owner/device/SID 校验；撤销会话立即阻止业务与私有频道访问 |
| 完整同步 | 本地 SQLite、持久 outbox、Postgres CAS、不可变操作回执；自动推送与接收、冲突保护、原请求重启恢复 |
| 领地菜园 | PostGIS、Supabase Edge Functions、事务经济账本；竞争抢占、驻守、种植、收获、制作和指定宠物喂养 |
| 联机战报 | Supabase Private Realtime、服务端权威回合、共用原有战斗核心；邀请至终局、回合镜像、幂等结算、历史回顾 |
| 资源偏好 | 私有 Storage、SHA256 分块校验、已验证资源引用与版本化偏好；保留导入历史和实际文件字节 |
| 桌面界面 | Electron 44.9.3、React、TypeScript、better-sqlite3、PixiJS、MapLibre、Vite、Tailwind/Radix |
| 聊天 | AI SDK、assistant-ui、本机加密凭据；按 petId 保存人设、记忆与消息，密钥不上传 |

桌面仅包含 publishable 配置。云函数入口自行核验 managed Auth，数据库事务再次校验身份；平台 `verify_jwt=false` 与这套完整鉴权配套使用。

## 最终实际验收

- **同一最终 EXE 的完整业务链 8/8 通过**：原 15 个宠物 ID 保留、正常界面领养、个人自动同步、私有资源与偏好、实际按钮自然训练、战报回顾、单端真实 TLS 断网、原请求跨 EXE 重启及双端原生渲染。没有拼接此前失败运行。
- 最终同步 A/B/独立云端均为版本 **103**，校验和 `324bd218a312baecc38aebcb3e4c9fdfa72fd08893c416c83d0bd945d0b65e5c`。原自动请求保留 base **101**、回执版本 **102** 和原始正文 SHA；本次 12 回合训练的 XP 5、种子 2 各一条回执。
- **真实好友主链 6/6、终局后双端实际 EXE 重启 2/2 通过**：自然 10 回合，双方各收到 10 次 Realtime 回合推送，XP 20/5、稻种 2/2 各只结算一次；重复同步和结算未改写权威原文。双方最终分别为版本 **9/7**、clean。
- 总协调独立获取实际云端完整原文，再只读打开四份退出后的 SQLite。每份 **27 个数据单元**与云端逐行一致，待确认队列均为 0；两份同步档案各 169 行，好友档案分别 55/46 行。实际资源文件字节、偏好版本 3、旧导入记录也已复核。

核心证据：[完整业务](/C:/Users/Administrator/Desktop/project/DesktopPet/docs/implementation/evidence/cloud/2026-10-25/final-portable-a9acd7f/evidence.json)、[真实好友与重启](/C:/Users/Administrator/Desktop/project/DesktopPet/docs/implementation/evidence/battle/2026-10-25/final-portable-a9acd7f/evidence.json)、[总协调独立云端/SQLite 核对](/C:/Users/Administrator/Desktop/project/DesktopPet/docs/implementation/evidence/cloud/2026-10-25/final-canonical-sqlite-readback.json)。

回归：311/311 原生 CJS 检查、总协调独立 12 项好友生命周期检查、22 个 Node 云端测试文件、5 项 Deno 校验及严格迁移检查通过；lint、TypeScript/UI 类型检查和 46 项单元检查通过。原生 CJS 数量不含另行验证的 MJS 事务用例。

前期候选、旧夹具失败及首次附加重启控制端口等待失败均保留原结果。附加重启第二轮在原业务验收进程自然退出后完成，没有放宽生产校验或修改样式；不将首轮失败重写为成功。

## 数据保全与旧代码清理

comparisontext 原 18 张表、100 行数据完整移入私有归档 schema，另有 DPAPI 保护的双份加密备份。全内容哈希已与替换前导出核对；终验再次确认精确行数、18 表 RLS 及 anon/authenticated 无读取权限。旧 DesktopPet 的必要本机读取、宠物 ID、历史、用户资源与设计源文件保留。

已退役旧明文 HTTP、硬编码客户端/旧会话字段链路、旧 accounts-sync/duel-online Edge、旧迁移草稿、旧直连验证器、孤立探索 authority 及已替换原型内容。最终 ASAR 审计通过，清理清单 remaining 为空；保留的旧读取代码承担数据兼容职责。可恢复原代码 Git bundle 已验证，未删除原始档案或设计素材。

清理与完整证据索引：[清理审计](/C:/Users/Administrator/Desktop/project/DesktopPet/docs/implementation/cleanup/cloud-coordinator-retirement.json)、[总协调状态](/C:/Users/Administrator/Desktop/project/DesktopPet/docs/implementation/status/cloud-coordinator.json)。

## 交付物与边界

最终成品：[灵境 0.1.8 Windows x64 便携版](/C:/Users/Administrator/Desktop/project/DesktopPet/releases/final-a9acd7f/Lingjing-0.1.8-portable-x64.exe)。169196329 字节，SHA256 `5fb591f67119eeeb35c50290e9aeb1169acfad35ad142985e46693914e2bb289`，签名状态 **NotSigned**。主项目副本、实际验收输入和工程归档逐字节一致；未创建公开正式 Release，未宣称 GitHub 托管 CI 已运行成功。

1. **旧服迁移已移出范围**：`47.112.208.97:8000` 不可达且暂无 SSH/备份。按用户最新指示不再处理旧服；该实例未完成全量账号迁移，未按用户名猜测归属、重置原密码或用新账号冒充迁移。
2. 双端实际验收来自同一 Windows 主机的独立生产进程、档案、加密会话和设备 ID；未声称已在两台异地实体电脑验收。
3. 当前主机定位精度未达到原有 80 米准入，未放宽门槛。真实 PostGIS、原生 OSM 与领地/菜园链路已验证，精确 OS 定位正向准入仍需合格硬件环境。
4. 本机无 Docker/Podman，未声称完成完整本地 Supabase/PostGIS reset；外部 LLM 的付费成功调用未纳入已验证范围。

全局默认、总协调与 01–08 会话的快速模式配置已统一开启，模型与推理设置保持原值。

用户查看：已正常启动同一最终便携 EXE，并通过实际窗口截图确认“灵境 · 桌面伙伴”显示云端账号登录页，保留窗口供用户操作。
