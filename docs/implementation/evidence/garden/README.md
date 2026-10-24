# 实际运行证据

本地闭环与界面定向验收已完成，线上与跨模块依赖仍保留在未完成清单。完整数值、操作/战斗编号、时间和重启读回见 [verification.json](verification.json)。

- 原生 Electron 36.9.5：稻米经过真实 25 分钟 13.735 秒成熟，收获 2 份，制作并消耗 1 份米饭。鱼丸饱食 60→80、亲密 0→4；其他所有伙伴记录保持一致。
- 实际本机训练结算获得番茄种子 2 份；随后种植、正式等待 15 分钟、收获番茄 3 份、喂鱼丸 1 份，饱食 80→90、亲密 4→6。再次本机训练结算获得经验 5、莓果种子 2；本次对战结果实际为失败，没有伪称获胜或线上 PvP。
- 两次重启后，库存与完整伙伴记录读回一致；再次收获返回 `ALREADY_HARVESTED`，旧账号界面请求返回 `SESSION_CHANGED`。
- 1280×844 与 1440×900：公共 Button 卡片完整包含图、名称、数量和伙伴等级；跟随最新公共排版 token，标题实测 28px/700。Select Esc/焦点、Tabs 方向/Home/End、搜索、公共 Motion 与动画开关通过。
- 18 项 SQLite/实际领域检查与 8 项本地 HTTP/PostgreSQL WASM 检查通过。包括真实 HTTP 提交后断连重试、并发收获和首次赠种、SQL 角色权限；这些不是已部署 Supabase 回执。
- Windows 最新实际 WiFi 精度为 177m（此前为 212m），未通过 80m 门槛。受控驻守记录只用于原生 UI→IPC→SQLite→重启检查，明确不是实际地理占领。
- 旧 raw-ID 菜园的完整库存仍在；适配未就绪时的保护记录保留。最新公共接口在同一旧验收资料中完成迁移：目标库存和逐只成长完全一致，原始伙伴记录逐条比对不变，菜园及伙伴归档均存在，重复读取与重启没有第二份首次种子。

最新视觉对照采用：

- [1280×844 背包与卡片修复](05-radix-inventory.png)
- [固定清单 A04：1280×844 定向复核](A04-1280x844-inventory.png)
- [固定清单 A04：1440×900 定向复核](A04-1440x900-inventory.png)
- [对战奖励作物正式成熟](09a-reward-mature.png)
- [最新制作/指定伙伴界面](11-kitchen-current.png)
- [最新背包界面](12-inventory-current.png)
- [旧存档衔接保护](identity-migration-preserved.png)
- [同一旧存档完成迁移后的实际界面](identity-upgraded-preserved.png)

`02a-2d-mature-garden.png`、`02-cooked-and-fed.png` 与 `09a-reward-mature.png` 记录先发生的正式成熟及喂食结果，早于最新公共 token 统一；最终字号以 A04、制作/背包及迁移后的最新截图和实测指标为准。全部图片均为实际窗口截图，没有修改生长时钟、补写物品或事后拼装界面。

固定清单 `visual-audit.txt`（9915684）的 A04 已修正，并提供标准/宽窗口的卡片矩形、图片包含关系、伙伴 scrollHeight、公共标题字体和 Card 外边距的实际读回。结果均满足本模块定向检查；A01/A03 跟随公共实现。完整 A01—A12 的集中视觉回验仍由 foundation 组织，这里不宣称全应用视觉验收通过。

本轮交付仍未覆盖：真实 HTTPS 云端部署/双设备读回、云端领地权威对战与驻守、accounts 公共云版本衔接，以及精度合格的物理定位占领。统一说明见 [garden-ui-review.md](../../garden-ui-review.md) 与 [garden-cloud-review.md](../../garden-cloud-review.md)。
