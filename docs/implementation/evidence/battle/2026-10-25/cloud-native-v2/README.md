# 04 云端对战真实原生验收

正式运行源码检查点：`65e42105687ef38bdc97450f006d0415aec9a6ac`。项目 `jbvrdmrkwpznbrvteive`，`lingjing-battle` v2；由主协调部署。04 没有部署、改远端历史或管理式种数据。

这是同一 Windows 主机上的独立 Electron 44.9.3 进程与隔离用户目录，包含两个对手和同账号恢复客户端。没有验证两台实体设备。账号通过正式 Auth 注册，宠物通过正式领养与选择，战斗通过实际界面推进。

## 证据链

| 原始记录 | 原始整轮状态 | 已完成并保留的范围 | 后续核验 |
| --- | --- | --- | --- |
| [duel-phase.json](duel-phase.json)，8ab8125 | false | 真实邀请／接受／入房；真实响应读取中断；原 actionId 恢复；Auth 刷新、同 SDK 回调认证和私有频道重连；原生进程重启；10 个自然回合和双方实际 Realtime 推送；胜负与已应用奖励 | 在战报页面发现缺少 TooltipProvider，由 746ca66 修复并实测 |
| [report-training-phase.json](report-training-phase.json)，746ca66 | false | 两个新原生客户端读取原终局，重复结算保持成长；战报界面实际显示、重启后完整一致；第二个同账号设备通过界面接管训练，自然完成 20 回合，两端成长／背包／战报一致 | 最后撤销脚本错误地解构 Electron 参数，RPC 未获得设备参数；cb3dc88 修复后单独补验 |
| [device-revoke.json](device-revoke.json)，cb3dc88 | true | 真实撤销一个设备；原 JWT 仍可通过 Auth 验证，房间／回合 REST 均返回 403 LJ_SESSION_REVOKED、私有频道 CHANNEL_ERROR；另一同账号设备 REST 得到原房间且私有频道 SUBSCRIBED | 原始训练和对局文件哈希相连 |
| [after-retirement.json](after-retirement.json)，65e4210 | true | 移除旧传输后的实际原生登录、原终局／战报打开、JWT 私有频道加入、重启后 Auth／战报保持；确认旧密码方法和旧密钥字段不存在 | 这是清退后的定向检查，未宣称重跑完整对局 |

完整范围通过分阶段证据链覆盖。`singleUninterruptedRunPassed=false`：前两份原始失败文件原样保留，未将其改写为通过。各阶段源提交、运行 ID、文件 SHA256 和图片 SHA256 见 [evidence.json](evidence.json)。

## 独立数据读回

[sqlite-readback.json](sqlite-readback.json) 对 8 个实际用户目录核对绝对路径和运行 marker，并使用 SQLite readOnly + query_only：

- 原 owner／pet／actionId 不变；每场完成战斗恰好一张 XP、种子和战报凭据。
- A 的好友胜利 +20、训练失败 +5，最终经验 25；B 的好友失败 +5，最终经验 5。训练胜负由原 AI 自然产生。
- 每场奖励 2 粒种子；实际库存严格等于正式菜园初始库存加各唯一奖励，重复结算未加库存。
- 好友战报完整保留 10 回合，训练完整保留 20 回合；同账号各客户端的数据一致。

`collect.mjs` 保留实际查询和断言。它仅读取指定隔离目录，不复制凭据、令牌或数据库文件。所有失败的原始运行目录继续保留在 ignored `artifacts/battle/live-*`。

## 定向验证与清退

- [native-tests.txt](native-tests.txt)：18 项实际 SQLite／Electron 原生检查，含旧战报读取和原数据保留。
- [transport-tests.txt](transport-tests.txt)：12 项传输／动作意图检查；明确区分脚本 SDK、真实安装 SDK 的无网络生命周期检查和模拟 loopback。
- [modern-postgres.json](modern-postgres.json)：15 项当前 JWT／08 actor guard／原子 CAS 的实际本地 PGlite + SQLite 检查；不是远端服务证据。
- [core-regression.json](core-regression.json)：1,200 组／7,162 回合与 V3 冻结数值完全一致。
- [cloud-deployed-metadata.json](cloud-deployed-metadata.json)：独立只读核对 8 个 ACTIVE 函数、22 份远端迁移；对战 v2。

生产 OnlineDuelService 已删除旧 HTTP／anon key 默认值、launcher 环境回退、注册／登录／改密协议和旧表频道；正常身份只来自08稳定 SDK。好友检索沿用正式新函数的 `search_accounts` 操作名，身份由 JWT 决定，正文不再附旧 userId/sessionToken。旧身份模拟仅在明确的隔离 QA adapter 内构造。

`verify-postgres.mjs` 已转向当前数据库检查；400 组 room DTO 对照改为直接调用现代共享内核，不再执行旧 Edge 源码。旧 Edge／SQL 文件最终删除和08水合指纹整合仍由主协调负责。04 没有改 CSS 或战斗公式。
