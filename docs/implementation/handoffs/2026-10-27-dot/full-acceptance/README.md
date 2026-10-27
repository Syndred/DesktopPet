# 新版本全 98 场景覆盖矩阵

## 当前批次 b5dbcfe（2026-10-27）

[逐项最新矩阵](coverage-b5dbcfe.json)：**4 当前完整原生通过 + 3 经代码影响核对复用 + 12 部分覆盖 + 2 原生输入受阻 + 77 尚未完整执行 = 98**。不是 98 全通过。复用项 R03/R04/B05 保留原源版本、EXE 和证据 hash，不冒称新包重跑；不受影响项不随纯测试脚本提交清零。

真实 SFX/冷启动/密码完整键盘顺序/About 已通过。新 native QA fixture 启动、窗口状态和旧布局选择器仍在修正复验；blocked/partial 不当作产品全通过。P09 实际注册/撤销成功且原注册值恢复，不在下一波重复改注册表。

下一波仅修改测试脚本，严格核对产品路径未变化及 b5 EXE/hash，再先运行 QA renderer preflight；通过才运行后续隔离 native flows。离线经济按真实 25 分钟成熟，无时钟或库存注入。

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
