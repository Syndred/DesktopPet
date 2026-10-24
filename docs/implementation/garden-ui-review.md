# 菜园界面与集成验收记录

工作分支：`codex/lingjing-garden`。已合入 foundation `1457f36`，包含 `b3c15a5` 公共账号 checkpoint、`2d0b5c8` 六个正式形象，以及已验收的归属迁移和公共排版 token；在独立托管工作树验证。共享源检出保持原状。远端 `origin/main` 已重新 fetch，当前为 `4786f97680679c2db0aa307fa5f67ec247f93086`。

对照原图：`docs/design/2026-10-24/full-ui/05-territory-garden-and-inventory.png` 与 `10-garden-harvest-and-feeding.png`。截图来自实际 Electron 窗口，界面通过正式 IPC 操作同一个 SQLite 连接，未使用静态网页替代产品。

| 页面 | 已落实的图稿结构 | 实际差异与边界 |
| --- | --- | --- |
| 我的菜园 | 湖畔庭院插画、鲸鱼娘、3×2 菜地、地块标签与成熟状态、右侧作物详情和四类种子、下方成长流程 | 使用项目生成的独立 2D 插画；种子数量、成熟时间、产量均取真实存档和配置，未复制图稿示例数字 |
| 制作与喂养 | 收获列表、米饭配方、明确制作数量、指定伙伴、食物选择与饱食预览；宽窗口三列、窄窗口重排 | 首版配方仍为稻米 1→米饭 1；没有为填满图稿添加假菜谱或库存 |
| 背包 | 四列物品卡、四个正式分类、搜索、右侧食物详情和伙伴选择、数量与喂食结果 | 当前九种真实物品；装扮分类为空，保留清楚的空态，不虚构可用装扮 |
| 领地总览 | 共用真实地图、领地列表、归属与日志、驻守选择、捕捉收益、独立基础菜园入口 | Windows 最新返回 WiFi 定位，误差 177m，大于 80m 门槛；未把演示坐标或测试领地作为真实占领证据。部分 OSM 瓦片失败保留错误提示 |

基础控件直接使用 foundation 导入的官方 shadcn/Radix Button、Input、Select 与 Tabs。实际窗口检查了 Select 键盘打开、Esc、焦点返回，以及 Tabs 的方向键、Home、End、搜索和分类数量。正式 Button 的工具栏高度曾使图卡挤压，已按卡片内容高度修正，并检查图片位于卡片内部、伙伴名与等级没有被裁掉。

集中视觉整改按 1280×844 与 1440×900 实际内容尺寸复核：物品和伙伴卡片使用自身内容高度，不继承工具栏按钮的固定高度；标题移除功能私有的 vw/clamp。最初跟随全局 29px，最新 foundation 统一 token 为 `--text-title:28px` / `--weight-title:700`，菜园已跟随并实测一致；页边距使用公共排版规则。旧的 37.12px/750 标题不再保留。

列表和路由使用公共 Motion 实现。实际通过 accounts 设置关闭/恢复动画，也验证了运行中系统 reduced motion 的变化；验证后恢复原来的测试账号设置。菜园 Pixi 只在地块状态变化与窗口缩放时重绘，缩略图直接复用 CompanionPortrait 的共享资源图集。地图直接复用 NearbyMap/useDiscovery、MapLibre 和探索模块的 Turf 边界检查；没有另一套地图或精灵动画引擎。

本版只显示 2D。新菜园代码不引入 Three.js、R3F、model-viewer、GLB/GLTF/VRM；历史文件和记录保留。按钮保持平面，画布不参加 Tab 焦点顺序。

素材来自内置 ImageGen，原始文件、完整提示词和项目目标路径见 [garden-assets.json](garden-assets.json)。使用 foundation 的鲸鱼娘角色资源，不复制出第二份角色库；未导入 farming-game 的 GPL 示例贴图。各实际依赖的版本、来源和许可证见 [status/garden.json](status/garden.json)。

最终原生截图和读回数据放在 [evidence/garden](evidence/garden)。`verification.json` 分别记录物理定位失败、旧归属迁移完成、本地 PostgreSQL 测试与真实原生流程，不能把它们混称线上成功。

已消费资源模块六个正式资源：鱼丸、小蓝、饭团、焰柴、礼帽喵、小狐。独立本机 QA 目录复用已正式生长得到的食物，再通过真实领养 IPC 创建六只伙伴；六个 PNG 的内容 hash、资源路径均不同，实际解码为 1254×1254。公共 ResourceStage 渲染任意图集，无功能私有精灵播放器。指定小狐喂食后，原生窗口收到唯一 owner/pet/resource 对应的 eat 通知，并实测帧 0→1；其他伙伴记录完全一致。原 action 重放不再次扣物品或发动作，重启后库存和伙伴精确读回。这个目录明确是本机 UI 验收资料，不是云端或双设备证明。

复验入口：

```powershell
npm run build:pc
$env:GARDEN_SMOKE_OUTPUT='artifacts/garden/integrated-electron'
node apps/pc-app/runtime/features/garden/smoke.electron.mjs plant
# 按正式生长时间，分阶段运行 carrot、battle、rewardplant、harvest、rewardfinish、readback。
# library、motion、map、responsive 是对应的定向窗口检查。
```

原生脚本使用独立验收资料目录。已有阶段结果存在时先读回，避免对不确定的喂食动作盲目再点。`identity` 阶段记录迁移适配尚未提供时的保护；foundation 提供接口后，`identity-upgrade` / `identity-upgrade-readback` 使用同一旧 raw-ID 资料，验证原库存、逐只成长、原始宠物记录及两套归档保留，目标归属不重复赠种，重启读回完全一致。历史截图与旧证据保留，不用新资料目录冒充旧存档迁移。

驻守界面另用 `prepare-territory-fixture.mjs` 将已关闭的 QA 资料复制到新的独立目录，由正式权威导入接口写入明确标注“非实际占领”的受控记录。随后 `territory-ui` / `territory-readback` 在真实窗口更换驻守并重启读回，同时比较完整伙伴数据与独立选择均未变化。它验证 UI→IPC→SQLite，不替代物理定位或真实占领验收，也没有向原生生长验收资料加入测试领地。

PostgreSQL 检查采用测试工具 PGlite 0.5.11（Apache-2.0）。foundation 已统一提供测试依赖；原 ignored `artifacts/garden/pg-qa` 仍保留，可用 `GARDEN_PGLITE_MODULE` 指向该测试模块。运行 `node --test apps/pc-app/runtime/features/garden/cloud.test.mjs`，会保留实际 SQL、HTTP、SQLite 验证结果；这不构成已部署 Supabase 的证明。

旧归属迁移、accounts 公共云版本衔接、六个正式形象与指定伙伴本机进食已接入并通过定向验收。本轮为 18 项 SQLite/实际领域检查和 10 项本地 HTTP/PostgreSQL 检查；类型检查、功能 ESLint 与最新原生布局复核通过。仍需统一集成解决的事项：云端领地对战/驻守接入统一权威服务；HTTPS 部署与真实双设备读回；精度合格的实际定位验收（最新原生 WiFi 精度 177m）。接口和回滚说明见 [garden-contract.md](garden-contract.md) 与 [garden-cloud-review.md](garden-cloud-review.md)。foundation 负责最后一次全功能集成回归和 Windows 打包，本会话没有反复运行全项目回归或自动发布生产服务。
