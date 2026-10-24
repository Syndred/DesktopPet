唯一战场：模块自验交付

实现代码：cb5c2c3a7aa44bb13c4320788c7487d54d259bb3。
旧规则展示投影补丁：5ca0bc3a87cebfa8b8ce14a73929388d8a02613d。
最新目标：docs/implementation/acceptance/2026-10-24/unified-battle-goal.txt。
接口：docs/implementation/battle-screen-contract.txt；规则：docs/implementation/battle-five-elements.txt。

训练、好友、野外、领地均使用 BattleScreen → BattleArena / CombatantStatus / BattleMoves / 回合记录，
同一个 useBattleSession 和 useBattleAnimation。来源领域仅提供可信会话和上下文结算。
八个实际 canonical 角色覆盖金木土水火；青芽、岩团和 playbackKey 来自 resources f4c210d，经 foundation 合入。
没有重新采用 standalone 野外内核或复制探索技能栏。

证据目录
rules：实际 runtime 的25有序对阵、75伤害用例和9项属性/行动检查，0失败。
interactions：四行动反馈的较早隔离自验。此阶段早于新版命名空间身份门禁，仅作动作反馈历史证据。
hit：打断不提前播放 hit；impact 阶段实际纹理坐标命中该角色受击帧，不只断言动作名称。
copy：真实选中玩家、待处理邀请的文案清单截图；身份、搜索、房间码和操作保留。
entries：从真实野外/领地入口进入共享战场，胜利收服、领地胜/负确认、返回和重复确认检查。
matrix：25组真实 UI 属性出招；每组的独立宠物、资源、元素、实际释放/受击纹理、伤害和状态归属。
motion-friends：标准/宽窗口、同招连续重播且画布不变、动画关闭立即终态/停止真实帧并解锁，
重新开启不重播历史；两个独立新命名空间 QA 账号完成邀请/同房、待确认行动重启、唯一回合和奖励。
sqlite-readback.json：独立 Node SQLite readOnly/query_only 读取五个 QA 数据库；34场会话/战报，
5条终局奖励回执、1次收服、2个已确认领地胜负；25个矩阵离开战报没有奖励。
simulated-friend-authority.json：明确为模拟的 loopback 房间、双端提交和唯一回合/结算回执。
legacy-rules-readback.json：仅同版本旧 rules 的展示元数据补齐；服务会话/战报读路径定向检查1/1。

窗口使用真实 Windows Electron BrowserWindow.setContentSize：请求1280×844，DPI1.25实测1280×846；
宽窗口实测1440×900。没有 page.setViewport 仿冒原生DPI。HUD保留8px装饰切角，四行动和右栏完整可见。
未进入房间的对方只显示等待图标，不伪造角色、五行、HP或资源错误。

源码边界
每次运行的 source SHA、原始 dirty 状态及产品源码散列保存在 evidence.json，不能混作同一次运行。
25对阵和来源结算的运行版本为ce2b18e；之后只增加未知好友等待态，已由cb5c2c3双端自验覆盖。
两者的实际规则、会话服务、事件及动画控制器散列相同，manifest.json保留逐项核对。
5ca0bc3只补读投影中的同版本缺失展示元数据；数值、回合、HP、怒气、奖励不变，不执行引擎或写存档。
该补丁没有重复跑25 UI；主会话将仅复验指定旧档样本。
build-manifest.json对应cb5c2c3实际构建。最终统一构建的独立验收由主会话执行。

来源与剩余范围
本轮身份、好友传输、定位及领地场景明确标记 simulated，使用新建且路径绑定的QA profile和命名空间账号。
普通存档不会因联网失败启用模拟；生产迁移、真实云端双设备及跨设备收敛按用户最新目标暂缓。
模块自验通过，等待主会话整合复验；不能以本目录替代最终全目标验收。
