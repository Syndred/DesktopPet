对战 UI 定向修正证据 · 2026-10-24

可集成源码：941d2535cee497bc21df880c9ac0607dac5a71ae，分支 codex/lingjing-battle。
公共六形象资源来自 2d0b5c8，ResourcePortrait 公共接口来自 1dac04e，均经 foundation 合并。
基准审计：docs/implementation/acceptance/2026-10-24/visual-audit.txt（9915684）。

本轮修正
HUD 白底切角固定为 8px，仅作装饰；两侧姓名、元素说明、生命与怒气完整留在浅底内。
HUD、出战队伍和旧战报的小头像统一 ResourcePortrait 的 portrait 近景构图。
场上全身角色仍用公共 ResourceStage/PixiJS；相同属性攻击连续发生时重新播放独立蓄力/释放帧。
资源模块已就绪且 canonical 两角色存在时，不再登记多余的战斗专用角色；旧素材文件保留。
既有四行动卡的水平图标/文字、统一状态条、选中线和真实规则未改变。

真实原生窗口检查（22:03 Asia/Shanghai）
02-live-1280.png / .json：请求 1280×844 内容区，DPI1.25 实测 CSS 1280×846。
02-live-1440.png / .json：DPI1.25，实测 CSS 1440×900。
均通过 HUD 浅底安全区、标题/行动卡字体、卡片状态条、右栏对齐和底部操作可见检查。
HUD 与队伍中共六处 SVG 使用公共 portrait 模式；四个队伍槽是实际独立领养实例。
action-skill-release.png：第三次实际属性攻击的释放帧；验证观察蓄力帧推进到独立释放帧。
actions-hover.png：hover 的 box-shadow/transform 均为 none。
actions-keyboard-focus.png：真实键盘焦点可见。
actions-unavailable-tooltip.png：怒气不足时大招禁用且实际 Radix Tooltip 显示真实门槛。
visual-recheck.json：具体几何、规则、实例身份、行动与 renderer 错误记录（零错误）。
成长属性 HP124 保持原值；companions combatProfile、battle rules、训练实际 HUD 均采用原内核 HP120。
本轮没有为贴合示例图更改战斗平衡、添加冷却或倒计时。

旧战报头像兼容（22:18 Asia/Shanghai）
report-portraits.png / .json：克隆既有隔离验证档，读取其真实 11 回合终局战报。
列表和回顾区四处头像均使用公共近景；读取前后完整报告与奖励相同，未重新结算。
旧战报的名字、元素、回合和奖励保持原历史快照；不因当前训练默认值而重写记录。
原始隔离测试档和真实用户个人目录未操作。

manifest.json 保存源码提交、两次实际运行时间、截图/证据 SHA256，以及被测应用的 25 个构建文件散列。
已核对这些构建文件及 battle 资源适配器与当前构建一致；截图并非旧源码图片复用。
类型检查、battle 功能 lint 和正式 build 在本轮定向检查前已通过；未重复运行整库回归。

剩余验收
主会话在 foundation 集成构建后独立操作四个技能并作最终图稿验收；本轮不提前标记其通过。
完整重启/终局/结算是上一级目录保留的历史证据，本轮没有重复整链流程。
真实双云端账号约战、跨设备奖励和生产服务健康未在本轮验证。最近云端核验是 21:11 的 502，
不以这次 UI 检查推断当前服务状态，也未部署生产迁移或函数。
