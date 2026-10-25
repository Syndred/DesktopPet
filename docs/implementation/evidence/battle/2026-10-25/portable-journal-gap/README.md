# SFX 对战 journal／权威存档边界修复

源码：`8c3fb942876654111c208707025488128f7dff47` + `c82380fc9f9535bfe9fa37f87dbf08c6e24d2eca`。基于主协调冻结源 `2e13487`。无 UI／CSS、云端 SQL／Edge、账号指纹或玩法改动。

## 已独立确认的根因

原 SFX 失败档案为 `final-portable-Fbu6gW`，保持只读。A 的原 baseline rev67 没有 battle 模块；终局有1场 session、1张 report、1张 reward，却额外导出了21条本机传输回执（1条 training-start、20条动作）。B 的已验证 rev68 和诊断时远端 rev69 均为严格四数组且 actions 为空。三方 session／report／reward 的原始 JSON MD5 一致。

原 v1 适配把本机请求日志当作受保护业务动作。结算的 `BattleCloudAuthority.apply` 尝试建立完整存档 checkpoint 时日志仍不同；之后 `store.resolve` 又写入本机缓存 revision，导致 `localChanged` 一直为 true。3／5／…／39 等本机 revision 不能冒充服务端权威回执。

## 修复边界

- 增量本机迁移创建 `battle_transport_journal`。旧 action 行继续保留，其 command/result 原始字符串另有不可改写的 origin 映射；新云请求直接持久化到 journal，仍使用原 actionId 重试。
- local backup v2 包含完整原历史和 journal；云端仍为兼容的 v1，严格保留 sessions／actions／reports／rewards 四数组。会话、战报、奖励、未知动作和离线历史继续参与08完整保护指纹。
- 序列化 marker 不授予排除权限。排除旧行还必须匹配本机主进程保存的 origin seal、owner、请求形状及原四列字节；输入不能声明 `projection_origin` 或 `authority_json`。
- 泛用 v1/v2 文件恢复不会覆盖已有动作槽，也不能自行生成可信 seal。旧 pending 复制到 durable journal 后仍以原 ID 调用正式重试协议；原始 action 行不改写。
- 完整奖励读回在同一既有保存点内确认匹配 journal。已有奖励的旧完成档则走 projection-only：重新核验 receipt-specific HTTPS 存档以及原 session／report／reward 字节，只确认 journal，不恢复伙伴／菜园或重发奖励。
- `restoreCloud(owner,data,mode,db,context)` 仅接受主协调私有预览钩子 `695007e` 的 context：`kind=verified-cloud-preview`、同 owner、正 revision、SHA256 checksum 和同一 DB。随后只对原始业务行严格一致的已完成云战斗确认 journal。普通文件／renderer 自称的字段无效。

私有预览 seal 是可从正式云读回重建的本机缓存，不作为文件输入中的权限证据。改变原业务行、origin 或绑定的请求，不会变成新的权威业务状态。

## 定向证据

- [upgrade-copies.json](upgrade-copies.json)：复制原失败 A/B SQLite 后执行实际增量迁移。A 原21行字节保留、journal21、cloud actions0；B journal0、cloud actions0；云端投影完全一致。最后 resolve 不改变投影；改写业务行仍改变保护指纹。原库 SHA 前后相同。
- [upgrade-copy-locations.json](upgrade-copy-locations.json)：另提供两份仅执行增量迁移的干净副本，未注入回归测试中的 revision999。SQLite 留在本机 ignored 目录，仓库只记录绝对路径与 SHA；供只读复核，不是可启动的用户配置目录。原 action、session、report、reward 字节不变。
- [cloud-readback-69.json](cloud-readback-69.json)：独立只读 SELECT。终局 session／report／reward MD5 与原 B rev68一致；未修改云端。
- [journal-tests.txt](journal-tests.txt)：10项实际 SQLite／正式 AccountSync、BackupManager 检查，传输或私有 context 明确使用脚本提供者。包含 v1 原 pending→原 ID 重试→finished 读回→最后 resolve→clean；已含 reward 的完成档新读回；明确云端恢复与伪造 marker 的正负例。
- [authority-readback.json](authority-readback.json)、[authority-readback.txt](authority-readback.txt)：9项实际本地 PGlite + SQLite 检查，含预战 baseline→durable start/round journal→权威结算完整读回→最后 resolve 后正式 AccountSync 保持 clean。不是新增 HTTPS／SFX 成功证明。

[coordinator-integration.json](coordinator-integration.json) 记录主协调回报：已整合 `8c3fb94`、`c82380f` 和私有 preview 钩子 `695007e`；正式经过 BackupManager 私有 map→battle.restoreCloud→AccountSync.acceptCloudRestore 的旧 finished-v1 正负例及本模块用例，共16项定向检查通过。此处明确为主协调结果，本聊天没有重新执行这批检查。

最终受影响回归、重新打包和真实 SFX 复验仍由主协调负责。产品源码保持 `c82380f`；此轮只发布副本清单、证据与状态，未重跑 HTTPS／全套，也未把旧失败或新 SFX 状态改为通过。
