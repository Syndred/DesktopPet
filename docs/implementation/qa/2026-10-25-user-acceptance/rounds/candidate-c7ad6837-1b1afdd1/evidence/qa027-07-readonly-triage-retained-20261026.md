# C7 资源编辑 dirty 期间普通 pull 误报｜07 只读 triage｜2026-10-26

结论：可认定为已有原生观察支持、源码可确定触发的 P2 UI/UX 缺陷：无变化的普通云拉取会被资源页解释为“另一窗口已更新资源设置”。不是已证明的资源 CAS 冲突或数据丢失。07 没有重新执行产品复现，没有升 QA issue/构建任务；是否纳入新构建由 Root 决定。

## 核对范围

- Root 与 managed acceptance-final 的 HEAD 均为 c7ad6837e1569dafd942528f375062debf714c2b。
- managed tree C:/Users/Administrator/.codex/worktrees/acceptance-final/DesktopPet，tracked clean。Root 原有 QA coordination/untracked 文件未修改。
- 两树中 useResources.ts、cloud-sync.cjs、cloud-preferences.cjs、cloud-host.cjs、repository.cjs、runtime/main/index.ts 六份文件 SHA256 逐一相同。
- 本轮只读最终源码、09 c7 既有公共 DOM metadata/截图，并在07 artifact新增此报告。未执行产品/UI/helper/CUA/SQL/测试，未读凭据，未改源码、Root QA ledger、包或冻结候选。

## 确定性链路与同文档判据

以下源码路径均相对 C:/Users/Administrator/.codex/worktrees/acceptance-final/DesktopPet；Root 同路径文件已核 SHA 一致。

|位置|实际行为|对本例的含义|
|---|---|---|
|apps/pc-app/runtime/features/resources/cloud-host.cjs:21-36|正常 pump 先 flush，再 pull，30秒定时触发|不需要第二个 Main 或另一窗口保存|
|apps/pc-app/runtime/features/resources/cloud-sync.cjs:194-205|逐资源 downloadEntry，之后 preferences.pull|同轮存在两个独立通知来源|
|apps/pc-app/runtime/features/resources/cloud-packages.cjs:58-72|已有 descriptor/owner/contentHash 一致；localMatches 校验全部文件数量/字节长度/SHA|已经有相同有效包仍进入下载核验分支|
|apps/pc-app/runtime/features/resources/cloud-sync.cjs:181-191|localMatches 为 true 时返回 unchanged:true；仍刷新 receipts/download status，最终无条件 onChanged|明确 unchanged 的包也发送资源变化事件；新增导入历史也可能属于此支路，但不能据此断言编辑设置已变|
|apps/pc-app/runtime/features/resources/cloud-preferences.cjs:53,57-70|text 是规范 calibration/actions；localText 是当前持久化有效偏好；当 local 存在且 localText===text 时，revision 原值保持，仍写偏好/state/verified_at，并返回 restored:true|state 权威/核验时间或旧 outbox 收敛变化不等于资源编辑内容变化|
|apps/pc-app/runtime/features/resources/cloud-preferences.cjs:89-93|所有 applied.restored 都 onChanged，无实际changed判据|local revision1、持久化scale1.05、云偏好revision1/doc1.05均不变也发送事件|
|apps/pc-app/runtime/features/resources/cloud-host.cjs:17|事件只带 ownerAccountId/resourceId，没有revision、文档或reason|消费者不能仅从事件名确定资源编辑内容变化|
|apps/pc-app/runtime/main/index.ts:194-195 与 runtime/preload/index.ts:7-10|事件桥转发到renderer subscription|普通云拉取与本机真实保存最终共用同一通知|
|apps/pc-app/ui/src/features/resources/useResources.ts:22-29|忽略payload；除正在save/import外，任何 resources:changed 在dirty时立刻提示另一窗口更新|既不限定目标资源，也不读取最新持久化内容、比较基线|
|apps/pc-app/ui/src/features/resources/useResources.ts:12-19,30-31|reload将list反序列化新对象写入resources；selected对象引用改变就clone draft并setDirty(false)|不能用“dirty时也照常reload”作为修复，否则可能直接丢草稿|

真实 changed 分支对比：

- 正常 UI save：resources/index.cjs:78,93 发带 resource.revision 的事件；repository.cjs:89-96 精确比较 expectedRevision，然后 revision+1。另窗口真实保存可导致旧draft保存 REVISION_CONFLICT。
- 正常云端新偏好：cloud-preferences.cjs:61 允许非dirty持久化基线更新，63 将local revision+1，文档实际变化；仍走同一onChanged。
- 新包首次 hydration 或实际文件修复：cloud-sync.cjs:187 -> cloud-packages.cjs:75-118，实际新增资源或修复file registry，并与无变化核验共用onChanged。
- 本例1.06只存在renderer草稿；后台看到的仍是保存基线1.05。故比较云文档与draft会把用户自己的未保存编辑误当外部变化。应比较云/最新本地保存结果与“保存基线selected”，不能比较draft。
- 本轮现有事件不记录发射reason，因此可确认普通pull的两个分支都足以制造提示，不能精确断言11:20这一次最先来自哪一个resource/download/preference事件，也可能来自同owner其他资源。

## 现有原生证据（未重放）

证据目录 C:/Users/Administrator/Desktop/project/DesktopPet/docs/implementation/qa/2026-10-25-user-acceptance/rounds/candidate-c7ad6837-1b1afdd1/evidence/：

- cloudB2-resource-public-ui-single-native-click-draft106-before-save-20261026.json:2 记录 2026-10-26T11:20:38.098Z；8为选中原866b资源；44/55为1.06；145-146明确原生公共状态文案“另一窗口已更新资源设置。请放弃修改并重新载入后再编辑。”；150-155保存和放弃按钮均可用。
- qa024-b2-c7ad-single-positive-save-client-verified-20261026.json:15 明确记录持久化base/rev仍1、scale1.05，随后只Save一次；generated记录localRevision2/base1、action0879f2f8-a834-4080-ba2b-d3b284ef943a、客户端verified、cloudPreferenceRevision2，verifiedAt11:23:06.089Z。该文件仍声明独立云回执/恢复待Root核对，07不据此代签最终通过。
- 已查看 qa024-b2-c7ad-size-slider-focused-still105-20261026.png（实际draft显示1.06，文件名误标已在09metadata声明）及 qa024-b2-c7ad-single-authorized-scale106-save-first-result-20261026.png（显示正常保存成功）。提示本身以同时段公共 DOM JSON 为直接证据，不谎称截图已拍到提示。

严重度建议：P2。普通同步开启后，编辑超过一次后台周期即可反复收到不实“另一窗口更新/应放弃修改”指引，可能诱导用户主动丢草稿；此次实际draft保留且唯一Save成功，没有证据显示自动丢失、覆盖云数据或CAS失效。

## 最小共享路径建议（仅建议，未应用）

优先在共享 resources useResources hook 修正通知后的版本核验与对象复用；不必先扩大到主进程协议/数据库/authority。

1. 将事件视为失效通知。用当前 owner/selectedId/已保存基线 ref 与请求sequence读取client.list；payload.resourceId可以帮助限定目标，但不能单凭同ID认定冲突。
2. dirty时只比较fresh selected和saved baseline：id、revision、canonical({calibration,actions})；包/文件变化还应比较contentHash、entryAsset、clips/atlas等有效descriptor及availability/warnings，或直接使用canonical完整CharacterResource快照。相同revision但文档不同也不能静默忽略；相同文档但revision推进也意味着draft.expectedRevision可能已过期，仍要保守提示。
3. 同基线/无关resource事件不提示、不改draft/dirty；刷新列表时给当前未变selected复用原对象引用，不能因JSON新对象触发selected effect清草稿。可更新其他条目。
4. 仅已确认当前选中资源保存基线真的变化/移除/availability改变时，保留草稿并显示“当前资源已更新，草稿已保留”等准确提示；继续保留后端expectedRevision CAS。不要在收到任何事件时自动放弃或合并。
5. 所有await返回后重查alive、sequence、selectedId、owner、dirty/operation；自身save/import时现有操作保护仍保留，防止晚返回的list覆盖新保存结果或新选择。

可选生产者降噪：

- preferences.apply可额外返回effectiveResourceChanged，只有应用前后有效文档或本地revision真正变化才触发编辑设置事件；无变化时仍必须完成authority/state/outbox收敛事务，不能early return跳过QA024。
- downloadEntry可以区分unchanged核验与实际新增/修复；新增历史、传输状态用相应刷新原因处理。仅修生产者不足以处理另一资源的真实事件误报，不能替代hook中对当前选中保存基线的核验。

## 必要定向回归（本轮未执行）

1. 持久化rev1/doc1.05，dirty draft1.06，连续普通unchanged包+同文档偏好pull：不提示、不清draft/dirty、不增加local revision/action，原QA024 state/旧outbox收敛仍保持正确。
2. 同owner另一资源真实save/import时，当前dirty草稿保留且不误报；列表可更新但当前selected对象不被无意义替换。
3. 同一资源真实文档变化/被移除/变为missing时仍提示并保留draft；同文档但local revision真实推进同样保留冲突保护，旧expectedRevision保存被后端拒绝。
4. 用户自身唯一Save成功后状态正确，晚到/乱序list与dirty变化、选中资源切换、session卸载不能覆盖新结果或清草稿；正常discard才采纳新基线。

既有23/23不能证明这个UI行为：cloud-preferences.test.cjs:62把onChanged设为空函数，未统计通知；这些夹具没有订阅useResources实际dirty路径。无需为本次只读triage重跑全量。