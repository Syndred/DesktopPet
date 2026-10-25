# 私有资源包 Storage 契约（2026-10-25）

资源模块使用官方 supabase-js 的 `storage.from().upload/download` 与 Data API 索引。主进程只消费 08 的统一能力，不创建第二套账号、JWT 或 owner 数据库。注入 `getActor(ownerAccountId)` 返回 08 `lingjing-auth.ts` 的 ActorContext：`{schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId,authUserId,deviceId,sessionId,client,...}`。`client` 是已经绑定当前 Supabase Auth 会话及 X-Lingjing-Device-Id 的官方客户端；token/refresh token/publishable key/service secret 均不从资源 IPC 返回。08 若采用不同入口命名，只需在正式注册入口适配这个函数。模拟会话、未经验证的文本 owner 与任意 renderer UID 均不能构成该能力。Storage 和索引 RLS 同时调用 08 的 `public.lingjing_current_owner()`，包括 session/device 撤销校验；本迁移在 identity_actor_contract 之后部署。

私有 bucket 为 `lingjing-resources-v1`，索引表为 `public.lingjing_resource_packages`。每包路径为 `<authUID>/<原resourceUUID>/<manifestSHA256>/manifest.json`；文件为 4 MiB 分块，路径还包含整文件与分块 SHA256。各对象只插入、禁止覆盖/删除；先完成所有块与 manifest 的独立下载校验，最后发布 immutable 索引。RLS 同时约束 bucket/路径前缀与 Auth UID；索引只允许当前 UID 读和插入。ownerAccountId 是 08 经验证的旧稳定 owner，客户端再次校验 manifest/index，绝不把旧文本 owner 当作 Auth UID。

本机 outbox 在共享 SQLite；导入可在断网时排队，首次传输才绑定验证后的 Auth UID 和不可变 manifest。中断后校验已有块再续传；只有精确索引和对象二次读回一致后才标 verified。账号切换中断后续操作与数据库应用，队列仍归原 owner。内置资源不上传，保留完全离线路径。

下载使用安全临时目录、路径/大小/hash 验证和现有 2D 包解析器，再写共享 SQLite。保留原 resourceId、导入流水及现有偏好；不同客户端相同内容但不同 resourceId 都保留，普通导入去重仍由串行服务执行。历史 model3d 仅作为 opaque archive 恢复和查询，不能进入 2D 渲染或重新导入 3D。

01/08 集成需求：08 提供 main-only `services.provide('cloudAuth',{requireActor(owner)})`，返回以上 ActorContext，校验当前账号与设备并附已认证客户端。正式服务 `resourceCloud` 提供 enqueue/flush/pull/status/synchronize；账号完整存档同步应在发布 save 前 flush 所需包、恢复 save 前 hydrate 资源。资源模块还在登录/开启同步/恢复事件与 30 秒重试时自动恢复，renderer 只能调用受保护的 resources:cloudSync/cloudPull/cloudStatus/history。成长、库存、聊天、petId、当前动作/校准偏好的冲突权威仍由 08 的完整存档 CAS 处理，本模块不创建平行存档通道。根依赖由 01 统一固定官方 supabase-js 版本；资源域不修改根依赖。

迁移由 Supabase CLI 2.122.0 `migration new lingjing_private_resource_storage` 生成，待主协调审核和统一部署；资源会话不直接改变远端 schema/函数。目标项目只读检查当前没有 Storage bucket，原 comparisontext 的 18 张业务表保留。本机协议验证和真实 HTTPS A/B/跨账号证据分别记录，不能互相代替。
