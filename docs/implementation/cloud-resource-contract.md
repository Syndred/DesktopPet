# 私有资源包 Storage 契约（2026-10-25）

资源模块使用官方 supabase-js 的 `storage.from().upload/download` 与 Data API 索引。主进程只消费 08 的统一能力，不创建第二套账号、JWT 或 owner 数据库。注入 `getActor(ownerAccountId)` 返回 08 `lingjing-auth.ts` 的 ActorContext：`{schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId,authUserId,deviceId,sessionId,client,...}`。`client` 是已经绑定当前 Supabase Auth 会话及 X-Lingjing-Device-Id 的官方客户端；token/refresh token/publishable key/service secret 均不从资源 IPC 返回。08 若采用不同入口命名，只需在正式注册入口适配这个函数。模拟会话、未经验证的文本 owner 与任意 renderer UID 均不能构成该能力。Storage 和索引 RLS 同时调用 08 的 `public.lingjing_current_owner()`，包括 session/device 撤销校验；本迁移在 identity_actor_contract 之后部署。

私有 bucket 为 `lingjing-resources-v1`，索引表为 `public.lingjing_resource_packages`。每包路径为 `<authUID>/<原resourceUUID>/<manifestSHA256>/manifest.json`；文件为 4 MiB 分块，路径还包含整文件与分块 SHA256。各对象只插入、禁止覆盖/删除；先完成所有块与 manifest 的独立下载校验，最后发布 immutable 索引。RLS 同时约束 bucket/路径前缀与 Auth UID；索引只允许当前 UID 读和插入。ownerAccountId 是 08 经验证的旧稳定 owner，客户端再次校验 manifest/index，绝不把旧文本 owner 当作 Auth UID。

本机 outbox 在共享 SQLite；导入可在断网时排队，首次传输才绑定验证后的 Auth UID 和不可变 manifest。中断后校验已有块再续传；精确索引和对象二次读回先进入 Storage 完成阶段，受保护引用及权威回执独立读回一致后才标完整 verified。账号切换中断后续操作与数据库应用，队列仍归原 owner。内置资源不上传，保留完全离线路径。

下载使用安全临时目录、路径/大小/hash 验证和现有 2D 包解析器，再写共享 SQLite。保留原 resourceId、导入流水及现有偏好；不同客户端相同内容但不同 resourceId 都保留，普通导入去重仍由串行服务执行。历史 model3d 仅作为 opaque archive 恢复和查询，不能进入 2D 渲染或重新导入 3D。

01/08 集成：消费已批准 ae563bf 的 main-only `services.get('cloudActor').requireActor()`；资源包装器在取得 context 前后核对当前 owner，并核对 context.ownerAccountId，不跨账号缓存 SDK。正式服务 `resourceCloud` 提供 enqueue/flush/pull/status/synchronize/referenceSnapshot/hydrateReferences。资源模块还在登录/开启同步/恢复事件与 30 秒重试时自动恢复，renderer 只能调用受保护的 resources:cloudSync/cloudPull/cloudStatus/history。成长、库存、聊天、petId、当前动作/校准偏好的冲突权威仍由 08 的完整存档 CAS 处理，本模块不创建平行存档通道。根依赖只消费 01 已批准锁定版本；本机独立普通 node_modules 已 npm ci/native:check，未操作其他会话 Junction。

## 服务端受保护引用

第二迁移 `20261025024855_lingjing_verified_resource_authority.sql` 和函数 `lingjing-resources` 在 identity / protected-save CAS / private Storage 之后由主协调部署。函数使用统一 withActor；publish 只接收 resourceId、manifestSha256，从当前用户的真实私有对象读取 manifest 和所有分块，校验路径、大小、分块/全文件/整包哈希和密钥字段，再重新核对会话。用户客户端从不使用 service secret。

核验后服务端调用仅 service_role 可执行的 `lingjing_register_resource_receipt`。SQL 先锁统一 owner，再从实际 index 行生成 refs，调用 private commit_authority，并写 `lingjing_resource_references`，同事务提交；失败同时回滚，重复同一包返回原权威回执。普通 authenticated 只能读本人 references，不能注册、修改或删除；个人 CAS 不能自报资源权限。

客户端在独立请求中读回 references 与 lingjing_save_actions，核对同 actionId/revision/checksum 后才将 live 任务记为完整 verified。仅上传成功但未注册的旧任务显示 awaiting-authority，保留 lastStorageVerifiedAt；lastVerifiedAt 只表示完成受保护注册。此前模拟/未验证回执持续隔离，不能提升为 live 成功。旧存储阶段已通过的包可直接复用发布，不重复上传全部字节。

统一存档的 character-resources 模块现在有云端专用 version 2：`{format:'lingjing-resource-references',ownerAccountId,references:[{authUserId,resourceId,manifestSha256,contentHash,manifestPath,manifestBytes,totalBytes,kind}]}`。由服务器行生成，不接受客户端自定义 schema 或资源列表当权威。08/01 的云恢复适配应先调用 `resourceCloud.hydrateReferences(owner, module)`，它再次比对服务器已核验 refs，再恢复实际文件；随后才应用伙伴等引用资源的片段。本机离线备份 version 1 的原包/校准/历史恢复保持。资源权威回执是该次历史操作，不可直接当成所有领域的最新 CAS 头版本。

两次迁移均由 Supabase CLI 2.122.0 的 migration new 生成；资源会话不直接改变远端 schema/函数。主协调已部署 private Storage，第二次 authority 迁移与函数待统一部署。目标项目初始只读检查没有 Storage bucket，原 comparisontext 的 18 张业务表保留。本机协议验证和真实 HTTPS A/B/跨账号证据分别记录，不能互相代替。
