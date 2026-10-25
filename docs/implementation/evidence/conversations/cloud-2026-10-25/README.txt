06 conversations 云端完成证据，2026-10-25

最终正常入口：live-sync.json，6组通过，运行b27fd397-1254-426b-b74c-70d9ad08531c，taskId=01a16dc5-c418-7372-ac4b-1d9abb116865。
正式源码和构建同为886fe05c1ffbf40f67a13094b33f3708c1fd6eea；同机两个真实Electron进程、独立用户目录/deviceId、真实Supabase Auth和HTTPS。不是两台实体机器。
包含正常companions IPC合法领养两只同模板宠物、实际React选宠断网保留原选择/原操作在线确认、Accounts完整预览恢复、逐宠消息ID/顺序/正文/人格/记忆、两种设备密钥、真实SQL409与冲突回滚、删除、原action队列重试和进程重启。
live-sqlite-readback.json为进程退出后的独立数据读取方式：SQLite readOnly和query_only，Auth UID/owner和两个deviceId、两端各8条消息、人格/记忆、密文摘要及chat/battle/guard分离均匹配同一runId。它不是独立审查人。
live-restored-chat.png、live-selection-rejected.png为该轮实际React画面，已目视检查。
观察全部archive/push请求正文：4次push含1次真实SQL409，另4次安全archive；所有正文均无本机key/密文/Auth proof。用户正文中的示例JSON保持原样。

范围和故障注入：
模型使用真实loopback连接失败与已连接socket取消，不构造成功回复；不宣称外部模型成功。
选宠和存档故障分别对一个主进程请求注入实际closed-loopback连接拒绝，未关闭整机网络；恢复后的命令/原action重试及B读回使用真实HTTPS。
未写特权SQL，没有测试SQL造宠物，没有新增renderer IPC，也未伪造会话。Supabase部署由主协调执行。

补充和历史证据：
live-sync-server-path.json（5组）与server-path-restored-chat.png是此前main cloudActor合法adopt/select路径；它与最终正常IPC/React结果分开。
live-boundary.json仅为早期真实Auth/权限6项，不作为完整聊天同步通过。
pending-projection-text-failure.json记录ce0affb错误过滤正文；pending-projection-text-fix-review.json记录8e5c735本机修复复核。该缺陷已由最终真实JSON逐字段读回验证修复。
recovery.json绑定runtime7416031，dialogs.json绑定runtimef82b117/harness58e319b；均为真实Electron44/SQLite13，但QA身份和旧档夹具是模拟，不冒充真实云端历史。
native.json为N-API跨Node/Electron持久读写；model-preflight.json只描述当时对标准目录的有限只读检查。
cleanup-manifest.json保留旧AI源码移除清单与哈希；恢复源码快照46abf41。01已删除旧壳并切换两个聊天备份消费者，兼容转发器也已删除。

复现命令和消费者合同见 docs/implementation/cloud-conversations-contract.txt。
数据库、原始备份、解密凭据不提交。全项目发布包和其他领域的最终验收由主协调执行。
