真实 Electron 窗口对照（2026-10-24）

02-exploration.png：生产 main/preload 的真实 OSM 瓦片、MapLibre 地图、署名、2D 标记；位置明确为演示。
04-wild-preview.png：共享服务、持久化测试账号、受控测试位置；两位共享 Pixi 角色、真实小地图、快捷伙伴卡与 Radix 键盘选择。
04-capture-result.png：实际随机战斗获胜后保存的独立实例、昵称、首次相遇记忆和桌面设置；受控位置不算真实定位验收。
pokedex.png / desktop-pixi.png：同一个 petId 的图鉴和实际独立桌面窗口。
evidence.json：操作、SQLite 读回、重复确认、动画开关、重启、系统定位精度与本地 PostgreSQL 证据。

对应原图：02-exploration-and-battle.png、04-wild-encounter-and-capture.png。
页面采用原图的地图/详情双栏、湖畔大角色/小伙伴、右侧待发现特征、底部伙伴卡和收服双栏。
差异：地图是当前 OSM 数据；地点采用真实游戏生成点位标签，不填入示例“西湖边”；角色使用项目共享图集的现有动作；纸花与定格插画没有逐像素复刻。
应用中只有两位可用 2D 伙伴时展示两张选择卡，不为凑设计示例数量制造伙伴。

系统权限重试已恢复，最新 Windows WiFi 精度95米，仍高于80米门槛；物理位置收服和部署后的 Supabase 联调均未验收。
原始位置和真实地图截图只留本机 artifacts，不在此目录。
