# 总协调短交接

用户要求总协调和 01–09 全部换成全新会话。继续完整用户功能验收与缺陷修复，全部快速模式、目标模式。使用这份短记录和各角色记录接手；按需要定位代码/原始证据，避免读整段旧历史。人类授权与最新换会话指令所在旧总协调：01a1704b-e200-7090-9d17-958218c80f42。

## 恢复后的实际路径（优先于各角色旧路径）
- 归档旧聊天触发managed worktree自动回收，已集中恢复到 C:\Users\Administrator\Desktop\project\DesktopPet-fresh-worktrees\01–08；分支为codex/lingjing-XX-fresh-20261025。registry.json是唯一有效目录/分支映射。
- 从8个原已提交HEAD建立独立worktree，再仅恢复snapshot改动到工作区，不把半成品变为已提交：02=11文件、03=5、05=5、08=1；22文件逐一Git blob验证通过。原HEAD/历史与旧目录残留均保留。恢复证据：artifacts/handoff-recovery/2026-10-25/restored-worktrees.json。
- node_modules链接到共享根依赖，禁止通过junction执行npm ci/install/rebuild或清理；需改依赖由新总协调安排独立目录。01原ignored打包证据、08inspection如仍在原路径可只读，缺失则据已追踪证据/快照复核。
- 新团队收到恢复保护后已停写，等待旧root最后的明确交接消息再启动。不要再次归档/回收这些新目录。

## 工作入口
- 共享检出：C:\Users\Administrator\Desktop\project\DesktopPet；codex/lingjing-implementation-base。换班前 HEAD 3465bccc2488b0fc273e290623811bd8156534d1。只有总协调可改此检出 Git 索引、合并、部署和冻结新产品来源。
- 最新 origin/main=4786f97680679c2db0aa307fa5f67ec247f93086，已 fetch/pull --ff-only；完成前再次确认。
- .codex/config.toml 已有 priority/fast_mode=true/goals=true。用户没要求换模型，不覆盖模型设置。
- 各新角色继续原绝对工作树，先以 registry.json 的旧会话停止/写入权标记为准。只总协调提交共享 handoff/coordination 文件；新 QA 只写验收文件不碰 Git 索引。
- 未跟踪 docs/design/2026-10-24/* 和 2026-10-25/battle-* 是用户素材，保留；QA 未跟踪文件也保留。不 reset/clean，不删历史、资源、旧账号或原 petId。

## 当前目标和决定
- 用户报告登录图标不齐、领养用大肥鱼分类、名字/编号混乱、拖动越变越大，要求独立用户模拟会话把所有场景实测，发现问题直接交负责角色修复。
- 最新规则唯一入口：docs/implementation/companions-global-serial-contract.json，decisionId globalSerial-20261025-v1。globalSerial?: string 是服务端未补零正整数字串，UI至少4位，缺值待同步。同类型跨用户连续，删除不回收；内部 owner+petId 不变。打开野外相遇 observe 先领号，捕获同号；保持现有按用户隔离野外实例语义。桌面无名字/编号。
- 08 正做私有 sidecar registry+计数器、非备份缓存和可信只读 DTO 投影，不改原 data_json、不可变回执和旧存档字节。03做 observe/捕获继承，02公共 DTO/helper/桌面，04–07补消费出口。增量 SQL 尚未上线；必须审核后真实部署验收。
- TS 统一暂停；旧服务器不管。现有04对局样式、核心、协议、历史不改。无新付费项目，不发布 Release/tag/push。

## 已整合和待验收
- 原候选 312e5fef320dfd7bb0a1a6eb88d0ce798d09ac17，releases/user-acceptance-312e5fe/Lingjing-0.1.8-portable-x64.exe，169197132 bytes，SHA256 01b8993f4464a8d2a19ceb906d0b1875b702e17777fbb7aec88738a6a63307da。运行 ASAR de3e646fddfbc0a202e41f00dbcc26a3896d939d91a78b8228a2af3839a5cf0d。原 artifact 冻结保留；下一包需等数字号整合再构建。
- 312源技术门槛已过：verify46、native353、cloud66+22迁移/4生成源/5Deno、discovery额外2。证据 docs/implementation/qa/2026-10-25-user-acceptance/integration-gates-312e5fe.json。没有新理由勿反复全量跑。
- 09在312实际复验：QA001对齐、QA002属性分类、QA004十次真实拖动/180帧散步已通过；完整矩阵仍大量 pending。原QA003改为新编号需求待验。
- QA008：5s位置持久化增加CAS revision未通知UI，行为切换冲突。02ea2dac317b3aaaee12cf9517b456450391cf9c 已合入，root独立4项真实SQLite通过，待新包UI复验。
- portable共享解压目录静态风险：a4ae503b3520ec8742dceb4ba4189be0addde35e 已合入，仅portable.unpackDirName=true及本机builder26.18回归。root3项通过；惰性NSIS编译证明，不是产品运行证明。下一包必须验证跨解压目录 same-profile localStorage/IndexedDB sentinel+真实garden原pending/actionId和Nodeoutbox、冷热重复启动、首端资源完整。
- QA009/P1：312已受控热重复wrapper17496 exit9、未出现第二main、未唤回已最小化原窗；原exe/ASAR哈希完整。证据 QA/rounds/candidate-312e5fe-524fd56d/evidence/qa006-hot-captured-01/。不能把静态修复当已解决。
- 04数字号fallback 8cff955f52b908163a70aa5f4b8e3ca68ffb1536 已整合，只将UUID改待同步，不动核心/样式/报告。
- 07资源 ApplyToCompanion 完整CompanionPet直接传公共helper，无需空补丁。
- 原a9失败基线已完整冻结100文件，索引SHA29c3ad3bf10fbbad9cb72ab5b290076c969a2ce4b42a9a3b9d021e971bcb42fe，Git blob100/100验证。不要覆盖失败历史或当最新通过。

## 运行与数据保护
- 正常用户原实例 launcher14476/main10392，普通profile C:\Users\Administrator\AppData\Roaming\Lingjing；超大置顶狐 HWND9703220，125%DPI，可能遮挡QA。严禁按名字/path批量kill。仅能在唯一识别时正常退出，数据/session不改。
- 当前312 QA launcher23280/main27436，主HWND7866562，runId6ff8e38f-9f2b-4872-8747-1fb00bd81655；profile artifacts/qa/user-acceptance/<runId>/local-a。旧09交接后新09唯一鼠标键盘操作者；其他角色不抢桌面。
- QA主目录 docs/implementation/qa/2026-10-25-user-acceptance/；cases/issues/matrix/active-session为活动事实，最后98项9passed/87pending/1failed/1running仅为当时快照。具体以新09读回为准。
- 真实Supabase项目 jbvrdmrkwpznbrvteive，22迁移/8函数。root迁移前只读聚合基线 artifacts/qa/user-acceptance/global-serial/preflight-baseline.json：accounts55/owned62/actions319/archives24/captures1。部署前再取既有行哈希，部署后证明原记录未改/删，并发QA新增单列。凭据/vault/raw DB只在ignored artifacts，不进Git。
- 功能通过必须真实界面/持久化/独立云读回；模拟QA定位、付费LLM/硬件限制如实区分，不削弱80m精度/30s/100m距离、成熟周期、产品限制。

## 新总协调下一步
1. 读 registry.json 与对应角色短记录，确认旧会话已停止并唯一分工。人类授权继续将缺陷直接派给对应新角色；新09独占UI。
2. 审核合入02/03/05/06/08尚在进行的数字号实现/必要修复；SQL和Edge真正部署前数据保留检查。
3. 冻结来源，01打唯一新候选，核对实际EXE/ASAR/manifest/hash，09全场景复验并继续发现缺陷闭环，root独立验收。
4. 不把当前任务提前标完成。只读/必要修复无需反复问用户确认；用户最在意真实可用与保留数据。
