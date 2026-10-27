# 新版本全 98 场景覆盖矩阵

## 当前批次 b5dbcfe（2026-10-27）

[逐项最新矩阵](coverage-b5dbcfe.json)：**28 当前完整原生通过 + 21 经代码影响核对复用 + 14 部分覆盖 + 0 原生输入受阻 + 35 尚未完整执行 = 98**。不是 98 全通过。复用保留原源版本、EXE 和证据 hash，不冒称新包重跑；不受影响项不随纯测试脚本提交清零。详见 [独立复用审查](reuse-original-evidence-review.json)。

追加逐函数影响核对与已发布证据 hash 复用：A03/A04/A09/A10/T04/T05/G05/G06 共 8 项，保留旧源 `4e6c3de`、旧 EXE SHA 和准确原证明/截图路径；不是新原生重跑。T04/T05 的上游是**明确模拟的 loopback**，产品与云端读回为真实，不能称外部模型验证。G06 保留原自然成熟与跨客户端唯一收获证明；不重开旧账号/旧 grant。详见 [第二部分完整复用审查](reuse-original-evidence-review-part2.json)。A15 和密码重置未因此计为通过。

670 新增 **D01/P03 原步骤完整通过**：真实审计 b5 便携 SFX，在一次性云端 Windows 离线 QA 显示 1/2/3/4/4 只、隐藏后补位/重显、设置上限 1–4 并逐窗核对原 petId、角色资源和无可见姓名编号。音量 0/100/37 保存后，四个实际桌面 renderer 均收到正确 owner 与音量政策，其他设置不变。这里是**应用音量政策生效，不是声压/系统音量实测**；未使用用户电脑或生产云。见 [原回执及独立核验](native-670-receipts/independent-summary.json)，原 JSON 与包复用证据完整随附。P01 新脚本尚未执行，不因此升级。

T06 采用**当前原生 + 不受影响旧云证据组合**关闭：670 真实 SFX 的连接保存/取消、同原消息错误重试、备份无 key 和 UI 清 key 三项通过；旧 `4e6c3de` 实际云公开 connection 无 key 读回经源文件影响核对复用。上游明确为模拟 loopback，不是外部模型成功，也不是 670 新云上传。connection-selections 总回执仍因独立 C08-garrison 失败而 `passed=false`，**C08 未升级**。见 [完整证据组合与边界](native-670-receipts/T06-independent-summary.json)。

当前实包仍是 b5dbcfe，EXE SHA-256 `ad94c4e252ebe87c1b72c954d18ed82dad2496dae8ef972cff540d02a924ddeb`。0fd 测试批次仅修改验收脚本，逐项校验原产品路径、ASAR 审计及包 hash 后复用。

0fd 新增完整原步骤证据：N01 六个当前主导航和前进后退；P02 未保存丢弃/保存/重启；T02 两只同模板宠物的人设、记忆增改删及正常重启隔离；R02 八角色×12可用动作、首次与重复共192段真实帧/纹理推进；P09 原精确启动项注册撤销与本次默认 profile 语义组合。完整原始步骤与证据边界见 [逐项独立审查](native-0fd-receipts/coverage-recommendations.json)。资源大回执保留准确 artifact/bytes/SHA，不复制1.1MB进Git；[独立采样摘要](native-0fd-receipts/R02-independent-summary.json) 并非原回执替身。

e9 经济真实自然成熟已完成：07:24:43 种稻米，07:49:44 收获，合成2份米饭/不足拒绝、指定宠物一次喂养/快速重复、同档案重启库存回执保持；云同步仍未覆盖。账号 A05/A08/A14、详情 C06 和其他此前完整证据保留。

423 批次原生拖拽已通过：D02 同宠物 10 次真实 OS SendInput 拖动，逐次严格 HWND/PID 命中与 trusted 事件，窗口 230×280、canvas 212×247、DPR=1、scale=1 均不累乘。该批是 Windows **开发态 Electron 加载 built dist**，源/验收提交为 `4233936`，经产品路径核对无产品变化；不能写成便携 SFX 拖动验收。见 [原始 artifact 引用与 hash](native-423-receipts/desktop.artifact-reference.json) 和 [独立摘录](native-423-receipts/desktop-independent-summary.json)。ae612 后续 restart-only 已实际成功：D03 四边后原宠物重启实际位置 851,510；D04 甲保持 0.75/173×210、乙保持 1/230×280；D06 逐原 petId 对应窗口的位置、尺寸、canvas、visual、DPR 与原记录重启前后一致且无额外实例，三项原步骤闭环。仍是固定 DPR=1 的开发态 Windows Electron，不冒称 SFX/多显示器测试。见 [ae612 原回执引用](native-ae612-receipts/desktop-restart.artifact-reference.json) 与 [独立摘录](native-ae612-receipts/desktop-restart-independent-summary.json)；D02 未重复运行，保留 423 已通过证据。原生文件选择器首轮在 controller 初始化阶段超时，bridge 结果仍只算部分证据。生命周期 ba4310 已成功：N04 收起/重复启动召回只算部分；N05 原宠物/业务保全仍用已核复用，加本次恰好一次 second-instance 子集，不重复运行已充分通过项。真实云两专用新账号批次仅准备、尚未注册，须完整模块审查并确认三设备同 scope 后继续；旧冻结记录不变。

## 初始 764aa2e 盘点（历史保留，不是最新数字）

产品版本 `764aa2e38d5b5d7c99148d99153b7fb4cbe11317`。原冻结记录不变；历史通过不自动继承。当前完整原生覆盖 **2/98**（A01、P08），其余 **96** 尚未按完整原步骤在本版本原生验证；这不表示96个bug。定向工程/组件证据另列，不替代真实账号、双端或硬件验收。

完整步骤、期望、历史证据、当前层级与下一步见 [coverage-764aa2e.json](coverage-764aa2e.json)。

| ID | 场景 | 当前完整原生 | 下一步/前置 |
|---|---|---|---|
| A01 | 首次冷启动 | 已通过 | none |
| A02 | 登录保持行对齐 QA-001 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| A03 | 空值与错误登录 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| A04 | 注册校验 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| A05 | 合成QA本地注册 | 未完成 | 允许一次性离线 QA 本地身份，不使用真人身份 |
| A06 | 云端合成账号注册登录 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| A07 | 显隐密码与键盘顺序 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| A08 | 记住账号 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| A09 | 保持登录重启 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| A10 | 未保持登录重启 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| A11 | 账号切换隔离 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| A12 | 退出与失效会话 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| N01 | 所有主导航入口 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| N02 | 最小尺寸与最大化 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| N03 | 窗口连续缩放与滚动 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| N04 | 关闭到托盘与恢复 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| C01 | 属性图标分类 QA-002 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C02 | 同模板连续领养 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C03 | 固定角色名和唯一编号 QA-003 | 未完成 | Explicit valid application QA global-serial grant and authorized dedicated identities; expired grant cannot be revived |
| C04 | 五行筛选与拥有筛选 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C05 | 八角色详情与动画 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C06 | 详情页全部页签 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C07 | 养成互动与冷却 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C08 | 每宠独立选择 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C09 | 无宠物空状态 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| C10 | 领养快速连点与返回 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D01 | 显示隐藏与上限 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D02 | 重复拖动变大 QA-004 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D03 | 边缘与越界恢复 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D04 | 单宠大小偏好 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D05 | DPI与多显示器 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| D06 | 拖动持久化与重启 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D07 | 行为与鼠标交互 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D08 | 穿透与全屏隐藏 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| D09 | 托盘全部显示隐藏 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| T01 | 空状态和切宠 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| T02 | 人设与记忆独立 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| T03 | 无供应商配置错误 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| T04 | 发送流式与取消 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| T05 | 历史与再生成 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| T06 | 凭据边界与失联 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| M01 | 地图初始与图层 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| M02 | 定位未授权与重试 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| M03 | 真实定位精度准入 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| M04 | 探索扫描与无结果 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| M05 | 野外相遇到捕捉 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| M06 | 失败逃跑与过期 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| M07 | 网络异常与重新定位 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| B01 | 训练选择与开始 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| B02 | 全部招式与回合反馈 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| B03 | 自然胜负与奖励 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| B04 | 进行中返回恢复 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| B05 | 历史和回放 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| B06 | 好友邀请和接受 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| B07 | 好友拒绝 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| B08 | 好友取消 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| B09 | 邀请过期 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| B10 | 断网重连与重复操作 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| B11 | 好友自然终局和重启 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| B12 | 未知对手与空态 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| G01 | 领地初始地图与列表 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| G02 | 驻守选宠与更换 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| G03 | 竞争胜利占领 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| G04 | 竞争失败取消和占用 | 未完成 | Authorized test identity where required plus real map/location or explicitly supported simulated scenario; GPS/DPI hardware proof cannot be invented |
| G05 | 种植与库存扣减 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| G06 | 成熟等待与收获 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| G07 | 离线与云端冲突 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| I01 | 分类与空背包 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| I02 | 合成成功与不足 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| I03 | 指定实例喂养 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| I04 | 库存重启同步 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| R01 | 库筛选预览与偏好 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| R02 | 真实动作全套与重复播放 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| R03 | 本地资源导入 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| R04 | 无效导入与路径边界 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| R05 | 资源随账户备份导出与恢复 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| R06 | 偏好与资源云端恢复 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| S01 | 账户页资料与状态 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| S02 | 自动同步完整域 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| S03 | 离线写入恢复 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| S04 | 双端并发冲突 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| S05 | 权限与跨账号隔离 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| S06 | 同步错误与手动重试 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| P01 | 所有设置分组可达 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| P02 | 保存取消与重启 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| P03 | 桌面上限音量尺寸 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| P04 | 导出本地备份 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| P05 | 恢复备份与回滚 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| P06 | 无效跨身份备份 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| P07 | 通知开机和隐私边界 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| P08 | 版本日志和更新入口 | 已通过 | none |
| A13 | 存档待核对提示与正常确认 | 未完成 | 允许一次性离线 QA 本地账号/宠物 fixture；真实云身份步骤另受限 |
| N05 | 同一档案重复启动 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| P09 | 便携版开机启动路径稳定 | 未完成 | cloud Windows isolated desktop; only public/unauthenticated substeps executable |
| A14 | 本机合成QA账号修改密码 | 未完成 | 允许一次性离线 QA 本地身份，不使用真人身份 |
| A15 | 真实云端合成QA账号修改密码 | 未完成 | Authorized dedicated real cloud account(s), app-level sessions and bounded data/network mutation; no admin-auth bypass |
| C11 | 同类型跨用户连续数字编号 | 未完成 | Explicit valid application QA global-serial grant and authorized dedicated identities; expired grant cannot be revived |
| C12 | 旧档案升级保留身份与历史 | 未完成 | Authorized original old QA profile preserving exact identities/history; exported evidence is not profile |
