#02 伙伴云端命令部署检查点

HTTP凭据支持CurrentUser DPAPI加密的相同JSON，扩展名`.dpapi`。仅在验证器进程内解密，不写明文临时文件；`testOnly:true`和a/b指定验收账号格式相同。references未上线时，HTTP证据明确记录custom不可用，不宣称自定义外观上传/恢复成功。

由主协调审查和部署；02没有写远端数据库或覆盖函数。依赖已批准08检查点 `45b857d` 及共享 `lingjing-auth.ts` / `lingjing-json.ts`，同一 `lingjing_private.commit_authority`、完整存档与 `(owner_id,pet_id)` 注册。已消费协调会话 `d7b4b07`：自定义外观只读取07服务端登记的 `lingjing_resource_references`，客户端可写的packages索引不能授权。references未部署或无回执时custom拒绝，内置2D继续可用。

迁移由CLI2.122.0实际执行 `migration new lingjing_companion_commands --workdir infra` 生成：`infra/supabase/migrations/20261025025515_lingjing_companion_commands.sql`。它只增加私有worker和public包装函数，不新建伙伴、账号、库存或奖励表。仅service_role可调用，普通客户端不能提交任意module；私有definer重新核对08账号、device/session及Auth会话，固定空search_path，没有向service_role新增auth表读取权限。owner锁、统一CAS、不可变回执、完整companion fragment和petIds注册在一次SQL事务内。

Edge入口：`infra/supabase/functions/companions-sync/index.ts`，部署 `verify_jwt=false`，每次由08 `withActor` 实际验证。可审查依赖位于同一仓库相对路径：

- `apps/pc-app/runtime/features/companions/cloud-domain.mjs`
- `apps/pc-app/runtime/features/companions/instance.mjs`
- `apps/pc-app/runtime/features/companions/growth.mjs`
- `apps/pc-app/runtime/features/resources/assets/roster-v2/catalog.json`
- `infra/supabase/functions/_shared/lingjing-auth.ts` / `lingjing-json.ts`

请求：`POST {op:'snapshot'}` 或 `{op:'command',command,input,baseRevision?}`，全部走同一08用户JWT/设备头。命令固定为 `adopt / rename / select / desktop / appearance / interact / recall-all`。input.actionId为8–96位ASCII稳定标识；共用不可变回执为 `companions:<actionId>`。跨设备相同请求返回原始petId/结果；同ID不同请求拒绝；可选baseRevision过期仅允许已存在的相同请求重放。

新领养复用本地同一实例工厂和可信内置模板，不接受客户端petId、成长、初始经验、胜场、owner、库存或schema。名字、独立槽位和桌面字段只修改当前owner指定pet；互动复用原有mood+2、affinity+1和每宠物10秒服务端冷却，不授予XP或食物。外观只接受可信内置2D或当前Auth UID/稳定owner均匹配的07已验证spritesheet包。原始petId和历史不重写；历史3D档案保持存储但不能作为活动2D伙伴。

部署前已跑：4项本地canonical reducer检查、3项本地PGlite权限/事务检查、Deno2.9.6类型检查。它们不是云端验收。SQL检查包括同请求竞争返回原始实例、不同账号同petId联合登记、anon/authenticated拒绝、设备/会话撤销拒绝、后续失败整体回滚且不新增auth表权限。

真实HTTP验证器：`apps/pc-app/runtime/features/companions/tests/cloud-http.acceptance.mjs`。由协调者运行，设置 `LINGJING_PUBLIC_CONFIG` 和 `LINGJING_COMPANION_VERIFY_CREDENTIALS`，后者指向ignored JSON：`{testOnly:true,a:{account,password},b:{account,password}}`，必须是两个指定验收账号，不是普通用户账号。验证同账号两个独立deviceId和另一账号，实际领养、原回执独立读回、CAS冲突、选择、位置、外观、互动、跨账号/伪造成长拒绝、08整包伪造成长拒绝，以及独立重启Node进程的云读回。证据不包含JWT、密码或完整其他私人历史；验收记录保留，清理只撤销本次设备会话。

主进程IPC、桌面拖动持久化和共享备份转换/安全投影接入仍继续实施。HTTP验证器明确记录Node进程，不冒充Electron或两台实体设备。正式目标需这些集成和真实Electron/HTTPS证据都齐备后才能完成。
