# Accounts 当前集成契约

更新于 2026-10-25。本页取代旧 duel-online/sessionToken 集成说明。生产部署、迁移历史和最终业务验收由主协调统一处理，见 docs/implementation/cloud-upgrade-2026-10-25.md 与 docs/implementation/status/cloud-accounts.json。

## 身份与云传输

正常云端路径为 Supabase Auth + lingjing-auth + lingjing-save。公开配置从受审 public JSON 读取，只有 HTTPS URL 与 sb_publishable_ 公钥；桌面和 renderer 不包含 secret/service role。网络失败不自动降级成本机身份。

services.session 的 getCurrentUser().id 是原有存储 ownerAccountId，不能把它替换为 Auth UUID。新协议显式携带 authUserId、ownerAccountId、deviceId、sessionId，主进程通过 accounts.requireCloudActor() 或 services.get('cloudActor').requireActor()/invoke() 获取受验证 actor。旧 owner 文本、account_aliases、petId 和完整历史保留；不用账号名称猜测或合并身份。

云域必须使用当前 actor 的 JWT/设备会话。SupabaseRemote.cloudContext 的访问令牌回调在每次请求时重查 owner/SID；账号变化、logout 和凭据刷新不能复用旧身份或清掉新账号的连接。正常传输明确拒绝 duel-online/accounts-sync。旧 token 和 id-only proof 不能升级成当前登录证明；加密存储仅是凭据保管，不代表云端授权成立。

同一账号可在独立 deviceId 上同步，退出只撤销本设备会话。账号、设备和 SID 的服务端检查仍是权限依据；一个账号不能冒充双方对战玩家。

## 原档与本机边界

正式目录优先显式 PET_USER_DATA_DIR，其次当前/已知旧目录 canonical SQLite，再查旧 JSON。目录发现不造空 JSON、不移动原文件。旧 JSON 首次导入前保留 .before-lingjing.bak，并保存内容寻址档案；读入使用只读兼容能力。损坏旧档不能被默认状态覆盖。

getLegacyInventory(ownerAccountId) 提供经过归属映射的原始库存/历史给各域迁移。不能从全局 active pet、匿名镜像或旧 currentUserId 推断新账号归属。跨 owner 不能复制历史；不明确的历史保留待核，不强行派给所有账号。

本机明确选择的账户可保留原密码验证和独立存档；不会因云端离线自动产生。独立 QA 必须新建路径绑定 marker，同时提供 LINGJING_QA_SCENARIO 和绝对 PET_USER_DATA_DIR，遵守 QA_CONTRACT.md，显示模拟身份，不调用真实云端。

## 备份、隐私和 CAS

完整存档通过各模块 backup adapter 注册到同一 BackupManager。跨端写入使用 expected revision + actionId + 校验和，冲突先保留当前本机档案和待同步记录。资源、聊天、宠物和成长分别保留其归属和完整性，不建立第二套库存或奖励入口。

资源引用 v2 与受验证偏好先异步下载、检查实际私有文件和权威回执，再进入同步 SQLite 恢复事务。预览保留原始 envelope/checksum，内部规范视图只用于比较；异步等待后必须仍是原 owner/device/SID，同 SID 的令牌刷新可以继续，退出后同账号重新登录须重新预览。只有完整本机视图与独立云端读回相同，才推进公共同步基线。

已生成的本地/云端预览也只在当前登录会话内有效：adopt、logout 和当前 owner 会话失效时清空内存预览；同 SID 自动刷新不清空。原备份、下载缓存、待重试任务不随预览清理删除。

Windows safeStorage 保管登录凭据与个人 BYOK；密钥不进入 renderer、普通 SQLite 明文、云存档、导出或日志。云投影按已知 schema 去除配置凭据，同时保留用户创作的 JSON/消息内容，不能简单按字段名删掉正常对话。服务端继续检查完整 actor、受保护状态及拒绝不合法投影。

## 桌面宿主与验证

close-to-tray、窗口数量、置顶、穿透、安静时段和定位权限接正式 Electron API。启动项仅在用户显式保存开关时修改。全屏检测从 ASAR 用 Node 读取脚本后运行 PowerShell，fullscreenMonitorReady 必须等到协议输出，不能以子进程存在代替。专项证据保留 false 样本并严格断言就绪。

公开 session/login/register/logout 与受保护设置/备份/同步命令继续由统一 IPC 注册；renderer 不传可信 owner、JWT、任意备份文件路径。安全 session 事件由统一 app/accounts 通知刷新界面。退出释放本账户的频道和托管连接，保留其他设备与其他账号。

## 旧入口退役

旧账号 sessionToken 网络适配和显式旧登录开关已退役。普通云账号统一使用 SupabaseRemote，本机旧账号继续在本机验证原密码和导入原档。对局旧云端消费者与旧函数/SQL由主协调统一核对退役，精确清单见 docs/implementation/cleanup/cloud-retirement-consumers.json。不得通过旧 SQL 的 db push/reset、repair 历史或删除原档来完成退役。

## 已完成验证

7a6b04a 在真实 Supabase HTTPS 和两个独立 Electron44.9.3 进程完成 9 项检查：正式领养与标准菜园初始化、同 petId 双端恢复、完整存档校验、CAS 冲突保档、SDK 令牌轮转、加密重启、原任务断网重试到版本5、令牌边界和单设备退出。证据为 docs/implementation/evidence/accounts/cloud-2026-10-25/dual-electron-full.json，明确 fullSaveVerified=true、authorityPending=false。本机双进程未声明两台实体设备或私有 Realtime 频道重连；旧服务器数据仍缺可信来源。最终账号回归54项、UI类型检查和生产构建通过。
