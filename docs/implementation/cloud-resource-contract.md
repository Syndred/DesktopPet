# 私有资源包 Storage 契约（2026-10-25）

资源模块使用官方 supabase-js 的 `storage.from().upload/download` 与 Data API 索引。主进程只消费 08 的统一能力，不创建第二套账号、JWT 或 owner 数据库。注入 `getActor(ownerAccountId)` 返回 08 `lingjing-auth.ts` 的 ActorContext：`{schemaVersion:1,authority:'live',authKind:'supabase',ownerAccountId,authUserId,deviceId,sessionId,client,...}`。`client` 是已经绑定当前 Supabase Auth 会话及 X-Lingjing-Device-Id 的官方客户端；token/refresh token/publishable key/service secret 均不从资源 IPC 返回。08 若采用不同入口命名，只需在正式注册入口适配这个函数。模拟会话、未经验证的文本 owner 与任意 renderer UID 均不能构成该能力。Storage 和索引 RLS 同时调用 08 的 `public.lingjing_current_owner()`，包括 session/device 撤销校验；本迁移在 identity_actor_contract 之后部署。

私有 bucket 为 `lingjing-resources-v1`，索引表为 `public.lingjing_resource_packages`。每包路径为 `<authUID>/<原resourceUUID>/<manifestSHA256>/manifest.json`；文件为 4 MiB 分块，路径还包含整文件与分块 SHA256。各对象只插入、禁止覆盖/删除；先完成所有块与 manifest 的独立下载校验，最后发布 immutable 索引。RLS 同时约束 bucket/路径前缀与 Auth UID；索引只允许当前 UID 读和插入。ownerAccountId 是 08 经验证的旧稳定 owner，客户端再次校验 manifest/index，绝不把旧文本 owner 当作 Auth UID。

本机 outbox 在共享 SQLite；导入可在断网时排队，首次传输才绑定验证后的 Auth UID 和不可变 manifest。中断后校验已有块再续传；精确索引和对象二次读回先进入 Storage 完成阶段，受保护引用及权威回执独立读回一致后才标完整 verified。账号切换中断后续操作与数据库应用，队列仍归原 owner。内置资源不上传，保留完全离线路径。

下载使用安全临时目录、路径/大小/hash 验证和现有 2D 包解析器，再写共享 SQLite。保留原 resourceId、导入流水及现有偏好；不同客户端相同内容但不同 resourceId 都保留，普通导入去重仍由串行服务执行。历史 model3d 仅作为 opaque archive 恢复和查询，不能进入 2D 渲染或重新导入 3D。

01/08 集成：消费已批准 ae563bf 的 main-only `services.get('cloudActor').requireActor()`；资源包装器在取得 context 前后核对当前 owner，并核对 context.ownerAccountId，不跨账号缓存 SDK。正式服务 `resourceCloud` 提供 enqueue/flush/pull/status/synchronize/referenceSnapshot/hydrateReferences。资源模块还在登录/开启同步/恢复事件与 30 秒重试时自动恢复，renderer 只能调用受保护的 resources:cloudSync/cloudPull/cloudStatus/history。成长、库存、聊天、petId、当前动作/校准偏好的冲突权威仍由 08 的完整存档 CAS 处理，本模块不创建平行存档通道。根依赖只消费 01 已批准锁定版本；本机独立普通 node_modules 已 npm ci/native:check，未操作其他会话 Junction。

## 服务端受保护引用

第二迁移 `20261025034122_lingjing_verified_resource_authority.sql` 和函数 `lingjing-resources` 在 identity / protected-save CAS / private Storage 之后由主协调部署。函数使用统一 withActor；publish 只接收 resourceId、manifestSha256，从当前用户的真实私有对象读取 manifest 和所有分块，校验路径、大小、分块/全文件/整包哈希和密钥字段，再重新核对会话。用户客户端从不使用 service secret。

核验后服务端调用仅 service_role 可执行的 `lingjing_register_resource_receipt`。设备 UUID 与 session UUID 只从 withActor 的已验证 actor 传入，客户端 body 不可覆盖。SQL 先调用 08 `lingjing_private.assert_service_actor(owner,uid,device,sid)`，取得统一 owner 锁后检查真实 Auth session、not_after、非匿名、不可变撤销台账与设备绑定，再从实际 index 行生成 refs，调用 private commit_authority，并写 `lingjing_resource_references`，同事务提交；失败同时回滚，重复同一包也须先通过事务 guard。普通 authenticated 只能读本人 references，不能注册、修改或删除；个人 CAS 不能自报资源权限。部署顺序还要求 08 的 `20261025032327_lingjing_session_revocation_ledger.sql` 和 `20261025034106_lingjing_transaction_actor_guard.sql` 先于资源注册函数；不新增 auth.* 表权限。

客户端在独立请求中读回 references 与 lingjing_save_actions，核对同 actionId/revision/checksum 后才将 live 任务记为完整 verified。仅上传成功但未注册的旧任务显示 awaiting-authority，保留 lastStorageVerifiedAt；lastVerifiedAt 只表示完成受保护注册。此前模拟/未验证回执持续隔离，不能提升为 live 成功。旧存储阶段已通过的包可直接复用发布，不重复上传全部字节。

统一存档的 character-resources 模块现在有云端专用 version 2：`{format:'lingjing-resource-references',ownerAccountId,references:[{authUserId,resourceId,manifestSha256,contentHash,manifestPath,manifestBytes,totalBytes,kind}]}`。由服务器行生成，不接受客户端自定义 schema 或资源列表当权威。08/01 的云恢复适配应先调用 `resourceCloud.hydrateReferences(owner, module)`，它再次比对服务器已核验 refs，再恢复实际文件；随后才应用伙伴等引用资源的片段。本机离线备份 version 1 的原包/校准/历史恢复保持。资源权威回执是该次历史操作，不可直接当成所有领域的最新 CAS 头版本。

正式 resource-backup 适配现同时接受 v1 与 v2，版本和内容必须匹配。BackupManager.prepareCloud 在 cloudPreview 留下恢复预览前先执行 v2 的真实服务引用/文件 hydration，之后同步 restore 只接受已有 live authority 回执的对应资源；不在 SQLite 事务里联网。v1 export 与恢复文件仍保留原字节、历史和偏好；云端队列/回执是本机缓存，不从备份文件导入为授权。AccountSync 通过 adapter.cloudModule 生成云端指纹，已核验资源与偏好均可与服务器 v2 对齐；实际未发布修改和真实并发冲突才保留 v1 原档和待核验状态。

## 校准和动作偏好

增量迁移 `20261025041216_lingjing_verified_resource_preferences.sql` 与 Edge `op:preferences` 使用同一 owner 事务 guard 和 protected-save commit。请求仅有 `{op,resourceId,actionId:UUID,baseRevision,document:{calibration,actions}}`；不接受成长、库存、任意 schema 或文本 owner。`preferences.mjs` 抽取原桌面验证器的原算法供桌面与 Edge 共用。私有资源必须已有 verified reference，Edge 重新读取真实包验证实际 clip；内置八角色只使用已提交的图集 JSON 动作元数据，继续离线，不上传内置图像。数据库另外限制全部字段、数值范围和类型。

云端 `lingjing_resource_preferences` 和 immutable preference action 行仅允许客户端 RLS 读取。每个资源使用独立偏好 revision 检查并发，成功在同一个公共 save revision 提交 `character-resources.version2.data.preferences:[{resourceId,revision,calibration,actions}]`；包登记会同时保留已经提交的偏好。原 action 重试返回原回执，错误 SID、未验证索引、非法校准、过期版本和后续回执失败均不改变公共存档。

本机 resources-005 保留偏好 outbox、状态与已核验缓存。先排队再取得 Auth，首次请求冻结 base revision，重开 SQLite 后复用 action/输入；后续本机编辑按顺序保留。自动读取不覆盖脏的本机偏好。明确云端预览先核验缓存，通用恢复事务再应用；冲突保留原档，replace 也保留已 superseded 的队列历史。云指纹使用已核验的偏好语义，允许不同客户端本机 revision 不同，同时保留 v1 备份原 revision。最终集成源 facaf9b 已通过真实双 Electron：偏好云 revision5、本机 A revision2/B revision1，两个非空偏好指纹都为 v2，并与独立读取的受保护资源模块完全一致。

真实目标验证已完成：[受保护引用与拒绝证据](evidence/resources/cloud-upgrade/live-authority/evidence.json)、[02 自定义外观联验](evidence/resources/cloud-upgrade/live-authority/companion-joint.json)。原包未重复上传；B 独立读回统一存档 v2，OTHER404、伪造 index422、撤销设备401，失败均未提升 revision/checksum。伙伴换装只认可 verified references，保持同 petId/成长。

三次迁移均由 Supabase CLI 2.122.0 的 migration new 生成，主协调再按实际 MCP ledger 对齐版本名，原执行与重命名审计由总集成保留。当前实际文件为23614 private Storage、34122 verified authority、41216 verified preferences；资源会话没有直接改变远端 schema/函数。主协调已部署三个迁移及 lingjing-resources v2；原 comparisontext 的 18 张业务表受保护保留。本机协议验证和真实 HTTPS A/B/跨账号证据分别记录，不能互相代替。

最终证据为 [总集成双 Electron](evidence/resources/cloud-upgrade/live-integrated-dual/evidence.json) 与 [独立根存档读回](evidence/resources/cloud-upgrade/live-integrated-dual/independent-root-readback.json)：已消费4830619，总构建源 facaf9b，两个实际 PID/设备 UUID，原两文件 SHA256、resourceId/import_id、同一自定义 petId 与成长、修改后校准/动作映射、原 v1 备份及实际可见 Pixi 图像均一致。它是同机两个独立进程；两台实体设备、原外部来源迁移、全产品打包和旧基础设施退役仍由主协调分别验收，不纳入此资源域完成声明。
