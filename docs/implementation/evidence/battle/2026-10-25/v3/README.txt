对战 V3 实施与真实 Electron 定向验收

分支：codex/lingjing-battle-v3
基线：f1dbc30312b6041f32ee815b67faeeb20a7a24df（最新集成设计交接）
产品实现：8bcde0d；采样器生命周期修正：2148ced；可读提示截图修正：2871bb8。
旧分支和既有数据均保留；只在 lingjing-battle 自有工作树实施，未写主工作区，未推送或发布。
完成前已重新 git fetch origin；origin/main=4786f97680679c2db0aa307fa5f67ec247f93086，已为本分支祖先，合并确认 Already up to date。

实现
- 唯一 BattleScreen/BattleArena/BattleMoves 继续由现有 useBattleSession/useBattleAnimation 驱动，训练、好友、野外、领地共享。
- 庭院铺满导航右侧主区域；移除出战列表/独占侧栏/独立底部面板，四个圆形行动整体居中。
- 等宽等高镜像 HUD：头像外置于卡内，等级及属性在头像下方；敌方头像和演员朝左，文字正常；条内数字，敌方从右向左填充。
- 大招常驻，SVG 环按当前 anger/ultimateAnger 归一；运行门槛仍为50。未就绪真实禁用，达到门槛金环星芒，消耗后回落，三种基本行动尺寸相同。
- 三提示精确为“打断属性”“无法闪避”“闪避攻击”，hover/focus 等效，保留真实禁用原因及键盘按钮语义。
- 真实回合记录在右下小型半透明 ScrollArea，限定高度与长文溢出，全部回合弹窗仍可用。
- 克制读取 session.rules.advantage：左克右→，右克左←，其余—；图标始终玩家/敌方顺序。未知好友不显示猜测元素、头像或数值。

实际时钟语义（不能把设计示意15s改成新玩法）
核对当前 BattleSession、battle service、OnlineDuelService 与房间协议：选招、等人和已锁定等对手阶段没有选招截止时间。既有12000ms是联机请求/可选等待解析的网络上限，不是选招计时，当前路径 waitForResolution:false。
因此选招显示“不限时”，等待显示“待加入/待对手”，结束显示“已结束”。只有现有1520ms出招演出使用绝对 endsAt 及真实剩余时间；不以渲染或round轮询重置，不新增自动行动/超时判负。
切换时直接恢复已持久化权威回合，不补播历史；原行动在原生重启后仍等待原回合；关闭动画立即清除实际演出期限并解锁。native.json 记录阶段、同一deadline、递减余时及实际纹理帧。

验证与来源
- 全量指本次 V3 定向套件，而非重复全项目回归：node apps/pc-app/runtime/features/battle/verify-v3.mjs，32项记录通过，0页面错误。
- 25种有序元素：5个→，5个←，15个—；实际IPC创建会话、实际 canonical Pixi演员，核对图标/aria/会话规则，4个典型关系截图保留在原始目录。
- 原生窗口 CSS尺寸1280×846、1440×900、1024×720，DPR1.25；原生 requested1280×844发生Windows取整，已按实际记录。检查背景边界、镜像HUD、四圆居中、日志无重叠，每个画布可见像素>2500（实测最小27891）。
- 怒气0、部分怒气、50就绪、大招实际消耗；三个hover与三个focus；真实日志滚动；真实动画期限递减、切换恢复、原生重启恢复、动画开关；实际impact命中纹理及画布身份保持。
- 野外胜利收服幂等、领地胜/负确认与原属主逻辑、好友双端同一回合和结算，均使用当前产品/领域适配器。
- 三份fresh path-bound QA资料，命名空间本地账号；结束后 node:sqlite DatabaseSync(readOnly:true)+PRAGMA query_only=ON，读出33场会话、5张唯一奖励回执，未重复发奖。
- TypeScript UI、定向ESLint、git diff --check、build:pc通过；旧规则投影回归1项通过。
- 可读提示截图：--tips-only（7项）在Radix淡入完成后抓取；产品sourceHashes和codeFingerprint与32项主验收完全相同，后续提交只改验证器。
- 首轮采样器在页面卸载后读旧节点产生5条错误，记录于prior-sampler-failure.json；不计为通过。修正后fresh profile重跑无错误。

证据
index.html：提交内截图浏览。
native.json：主验收，源码/构建SHA、阶段/纹理/时间/布局、每场会话、SQLite只读结果。
tooltip-capture.json：清晰提示截图验收，完整6张focus/hover留在其原始artifact目录。
manifest.json：20张提交内PNG的SHA256、确切源目录、基线与来源。
原始32项目录：artifacts/battle/v3-1792887048306。
原始清晰提示目录：artifacts/battle/v3-1792887201133。

限制
这是真实 Electron/UI/IPC/SQLite验收；QA身份、领域定位及好友loopback权威明确为simulated，不是生产云端联机验证。
生产云端验证仍按此前约定延期；主会话集成/打包/独立验收尚待完成。本分支未自动推送、部署或改动奖励公式与历史数据。
