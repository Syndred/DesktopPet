# 伙伴云接入验收

正式运行代码检查点为9a18511，包含协调冻结基线4830619及bc10bb5队列归属守卫。后续交付仅增加验收脚本、共享测试夹具和证据文档。

| 证据 | 来源与范围 |
|---|---|
| native-https.json | 55d6b24，run9d8fe784-40da-456d-b8eb-cebc165f726e；默认正式Electron入口，7组实际HTTPS/IPC/窗口检查，包含同模板原ID、三种独立选择、改名冲突、位置、断网重启和自定义资源 |
| final-guard-native.json | 9a18511，构建来源与加载的guard函数哈希核对；5组定向检查，实际Electron PID、原加密会话/设备恢复、缓存重放、固定互动幂等、两端指定资源窗口像素 |
| main-recall-https.json | 实际注册的伙伴主进程能力、真实SQLite、08 SupabaseRemote及独立设备读回；Node宿主，不声称托盘点击或完整存档已同步 |
| real-https.json / worker-acl.json | 先前独立HTTPS权限、幂等、并发和SQL只读权限检查；保留原运行身份 |
| owner-queue-regression.txt | 8项通过；6个明确标注协议模拟的真实SQLite用例，加账号边界和实际资源动作隔离；包含切换账号时排队缓存重放的先失败后修复用例 |
| shared-checkpoint-fixture-regression.txt | 3项通过；当前完整单元注册和会话夹具；严格冲突/忙碌/待确认守卫、原请求不变、离线记忆保留 |
| ledger-path-regression.txt | 3项本地PGlite检查通过；迁移路径已对齐实际ledger名称；不是远程SQL执行证据 |
| retained-native-failures.json | 失败的验收脚本与协议版本不匹配记录保留，不替代成功报告 |

本机只有一台实体Windows设备。双Electron进程、独立deviceId和隔离资料目录已有证据；两台实体设备验收、最终EXE及跨模块最终结算由协调方统一验收。旧外部云源未经核验时不声称完成迁移。原始SQLite、DPAPI密文和私有资源包留在被忽略的artifacts中，没有进入该公开证据目录。

完整7组运行开始时源码干净。A重启后原位置于04:21:19Z已确认，队列守卫改动发生在04:21:44Z；进程使用已加载的CJS缓存。新守卫随后用9a18511重新构建并在两个新正式进程中核验，源版本分别保留，没有把两轮运行写成同一源码验收。完整报告中的pids为Windows启动包装进程；定向报告记录实际process.pid。

复现需要协调方指定的测试账号DPAPI文件和公开运行配置。通过LINGJING_PUBLIC_CONFIG、LINGJING_COMPANION_VERIFY_CREDENTIALS提供路径；脚本在内存解密，不打印或导出账号口令、访问令牌或刷新令牌。

```powershell
node apps/pc-app/runtime/features/companions/tests/cloud-native.acceptance.mjs
node apps/pc-app/runtime/features/companions/tests/cloud-native-restart.acceptance.mjs <已成功的隔离运行目录>
node apps/pc-app/runtime/features/companions/tests/cloud-recall.acceptance.mjs <已成功的隔离运行目录>
```

`native-cloud-offline-pending.png`显示待确认的原请求；`native-cloud-custom-B.png`和`native-final-guard-A.png`显示与具体petId/resourceId绑定的实际2D窗口。成功运行已收起本次创建的可见测试伙伴，所有宠物、成长、回执、资源和历史保留。
