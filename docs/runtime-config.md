# 运行配置文档（PC 桌宠对战）

文档版本：v2.8  
更新时间：2026-03-05

## 1. 环境要求

1. Node.js `>=20`
2. npm
3. Windows 或 macOS（当前优先 Windows）

## 2. 安装与校验

```powershell
npm install
npm run test:unit
npm run pc:smoke
npm run verify
```

预期结果：

1. 单元测试通过。
2. `npm run pc:smoke` 输出 `PC runtime smoke passed.`。
3. `npm run verify` 通过（lint/typecheck/test layers）。

## 3. 启动 PC 端

```powershell
npm run dev:pc
```

## 4. v2.7 行为说明

### 4.1 窗口策略（按你要求修正）

1. 非战斗状态：窗口为宠物大小（小窗），仅显示宠物模型。
2. 对战状态：恢复为之前的窗口尺寸与显示风格（不再放大成大舞台窗口）。
3. 已移除菜单按钮；仅通过右键宠物打开控制面板。
4. 面板右上角提供关闭按钮（`×`）。
5. 面板尺寸覆盖当前窗口区域，滚轮可正常上下滚动内容。
6. 面板打开时会隐藏桌面宠物层，避免被宠物遮挡。
7. 面板头部区域支持按住左键拖动窗口（按钮等交互控件不受影响）。
8. 结算框层级置顶显示，避免被其它战斗元素遮挡。

### 4.2 回合与中间提示

1. 克制关系与倒计时已分离显示：
   - 血条中间显示克制标签（`克制/被克/均势`，带颜色态）
   - 下方独立显示圆环倒计时（中心数字倒计时）
2. 5 秒内未操作自动普攻。
3. 回合播报仍在顶部区域（回合数/快照下方）。
4. 胜负产生后会播放结算弹层动画，需点击“确认”才退出对战返回桌宠模式。

### 4.3 怒气规则

1. 怒气 `<100` 时大招按钮禁用。
2. 怒气 `=0` 时闪避按钮禁用。
3. 引擎兜底：怒气不足的闪避/大招都会自动降级普攻。
4. 闪避经济规则：
   - 闪避消耗 20 怒气
   - 闪避躲过普攻返还 30 怒气
   - 双方都闪避不返还

### 4.4 宠物仓库（头像行 + 右侧详情）

1. 面板左侧使用横向/换行头像列表展示现有宠物（同一行多个头像居中均分）。
2. 当前头像列表固定为每行 6 个头像。
3. 默认不展示详情卡片，点击某个头像后在右侧展开该宠物详细信息。
4. 选中头像后，头像下方出现“出战”快捷按钮；点击后会自动切换并自动关闭面板。
5. “出战”快捷按钮已缩小，避免最后一列被撑出横向滚动条。
6. 详情区使用多色 tag/chip 展示模型、属性、序号与数值信息。
7. 仓库已接入主进程持久化，切换出战后会写入本地数据文件，重启仍保持。

### 4.5 状态伤害与回血数字

1. DOT 持续伤害保持颜色区分。
2. 寄生触发回血时，治疗方会显示绿色 `+数值` 漂字（可与伤害数字区分）。

### 4.6 模型资源（已补齐）

当前本地已包含 6 个 GLB：

1. `Fox.glb`
2. `CesiumMan.glb`
3. `Astronaut.glb`
4. `Horse.glb`
5. `NeilArmstrong.glb`
6. `RobotExpressive.glb`

### 4.7 仓库持久化与战报（新增）

1. 默认持久化文件路径：`<Electron userData>/pet-runtime-data.json`。
2. 启动时自动拉取仓库与当前出战宠物，不再依赖仅前端常量。
3. 每场对战会自动记录战报：
   - 开始对战：创建会话
   - 每回合：写入动作与伤害事件
   - 胜负结算：自动标记为“已结算”
   - 手动结束：标记为“中断”
4. 控制面板新增“最近战报”列表（默认显示最近 8 场，支持中英文文案切换）。
5. Supabase 迁移脚本已补：
   - `infra/supabase/migrations/0002_pet_inventory_battle_reports.sql`
   - 包含 `pet_instances`、`pet_capture_records`、`battle_sessions`、`battle_round_events` 与 RLS。

### 4.8 地图能力抽象（M-301 PC演示版）

1. 已新增地图能力抽象服务：`apps/pc-app/runtime/services/map-runtime.cjs`。
2. Provider 抽象已落地：
   - `tencent`（坐标系 `gcj02`）
   - `google`（坐标系 `wgs84`）
3. 权限状态机支持四态：
   - `prompt`（未请求）
   - `granted`（已授权）
   - `denied`（已拒绝）
   - `system_disabled`（系统定位关闭）
4. 统一能力接口已打通（主进程 IPC）：
   - `getCurrentLocation`
   - `startWatch / stopWatch`
   - `distanceTo`
5. 面板新增“地图能力（演示）”模块，可切换 Provider、模拟权限、刷新位置、启动连续追踪、计算到演示点距离。
6. 主进程会通过 `pet:map-state` 持续广播定位状态，渲染层实时显示最新定位字段。

### 4.9 附近流浪宠物与收服对战（M-302/M-304 PC演示闭环）

1. 面板新增“附近流浪宠物”模块，支持查看附近可见流浪宠物列表。
2. 每只流浪宠物具备唯一编号（示例：`WP-2026030515-0001`）。
3. 列表展示字段：
   - 编号
   - 名称
   - 属性
   - 稀有度
   - 距离
   - 状态（可收服/超出范围/冷却中/已收服）
4. 收服规则（演示版）：
   - 只有在 `100m` 范围内且状态为可收服，按钮才可点击。
   - 点击“收服对战”后直接进入桌面实时对战。
   - 对战胜利：宠物自动入仓，保留编号。
   - 对战失败/手动中断：目标进入冷却状态。
5. 收服成功入库去重：
   - 已收服编号重复结算不会重复入库。
6. 新增服务：
   - `apps/pc-app/runtime/services/wild-pet-runtime.cjs`
   - 负责点位刷新、附近查询、收服前置校验、收服结果落库联动。

### 4.10 宠物成长与收服战报提示（D-022）

1. 收服成功时会增加两条日志提示：
   - 收服成功：`收服成功：{serial} 已加入仓库`
   - 战报提示：`收服战报已记录：{serial}`
2. 对战结算时，若我方胜利且有出战宠物实例：
   - 自动记录胜场与经验。
   - 每 `5` 胜自动升 `1` 级（经验清零进入下一轮）。
3. 升级后会按属性提升仓库中的 `stats` 文本（HP/ATK/DEF/SPD）：
   - 火：`ATK +2`
   - 水：`SPD +1`、`HP +1`
   - 木：`HP +4`
   - 金：`DEF +2`
   - 土：`HP +3`、`DEF +1`
4. 对战 HUD 新增“头像 + 等级”展示：
   - 我方：血条/怒气条左侧显示头像与 `Lv.x`
   - 敌方：血条/怒气条右侧显示头像与 `Lv.x`
5. 仓库头像列表每只宠物头像会显示等级角标（`Lv.x`）。
6. 仓库详情新增字段：
   - 等级
   - 经验（当前 `exp/5`）
   - 胜场
7. 收服战报在“最近战报”中会保留额外信息：
   - `mode = capture`
   - `captureSuccess`
   - `captureSerial`
   - 列表中显示“收服成功/收服失败 + 编号”。

## 5. 手动验证清单

1. 启动后确认是小窗口，仅宠物模型可见。
2. 右键宠物打开面板，能看到“头像行列表”。
3. 打开面板后滚轮滚动正常，且宠物层被隐藏不遮挡面板。
4. 头像列表每行固定展示 6 个并居中分布。
5. 点击某个头像后，右侧出现详情；点击“设为出战”后生效。
6. 点击选中头像下方“出战”快捷按钮后，会自动关闭面板并切换当前宠物。
7. 开始对战后窗口恢复为旧尺寸，不会被放大。
8. 血条中间显示克制标签，圆环倒计时单独显示，超时自动普攻。
9. 克制标签和倒计时上移，位于双方血条之间更易读。
10. 结算框置顶显示，不会被其它 UI 挡住。
11. 怒气不足 100 时大招不可点；怒气为 0 时闪避不可点。
12. 闪避对闪避时怒气按规则扣减，不返还。
13. 寄生回血时治疗方会显示绿色 `+数值`。
14. 对战胜负出现后，必须点击结算“确认”才会退出对战。
15. 切换“出战”后重启应用，当前出战宠物保持一致。
16. 完成任意一场对战后，面板“最近战报”会出现对应记录。
17. 手动点击“结束对战”后，战报会新增“中断”状态记录。
18. 打开“地图能力（演示）”，可切换 `Tencent/Google` 且坐标系随之变化（`gcj02/wgs84`）。
19. 权限模式切到 `Denied/System Disabled` 后，刷新位置与启动追踪应失败并输出错误日志。
20. 权限模式切到 `Granted` 后，刷新位置可得到经纬度与精度字段。
21. 启动追踪后 `Watch` 状态变为追踪中，位置会连续变化；停止后恢复未追踪。
22. 点击“距离演示”后可看到“到演示点距离”数值更新。
23. 在地图权限为 `Granted` 并刷新位置后，点击“刷新附近宠物”可看到带编号的流浪宠物列表。
24. 仅 `100m` 内的流浪宠物“收服对战”按钮可点击，超出范围应禁用。
25. 点击“收服对战”后会进入桌面双宠对战（敌方为选中的流浪宠物）。
26. 若胜利，战斗结束后仓库会新增该编号宠物，且“附近流浪宠物”状态变为已收服。
27. 若失败或手动结束，对应流浪宠物状态会变为冷却中并显示剩余秒数。
28. 收服成功后日志区应额外出现“收服战报已记录：{serial}”。
29. 使用同属性/同名称但不同编号的宠物可重复入仓（不同 serial 视为不同个体）。
30. 同一只出战宠物连续赢 5 局后，仓库详情等级 +1，经验回到 `0/5`，并可看到属性数值变化。
31. 对战时我方血条左侧、敌方血条右侧可看到头像与 `Lv.x`。
32. 仓库头像行每个头像都应显示等级角标，详情区包含等级/经验/胜场字段。

## 6. 关键文件

1. `apps/pc-app/runtime/main.cjs`
2. `apps/pc-app/runtime/preload.cjs`
3. `apps/pc-app/runtime/renderer/index.html`
4. `apps/pc-app/runtime/renderer/styles.css`
5. `apps/pc-app/runtime/renderer/renderer.mjs`
6. `apps/pc-app/runtime/services/battle-runtime.cjs`
7. `apps/pc-app/runtime/services/runtime-data-store.cjs`
8. `apps/pc-app/runtime/services/map-runtime.cjs`
9. `apps/pc-app/runtime/services/wild-pet-runtime.cjs`
10. `apps/pc-app/runtime/assets/models/`
11. `infra/supabase/migrations/0002_pet_inventory_battle_reports.sql`
12. `tests/task-d001-pc-runnable-runtime.test.ts`
13. `tests/task-d002-pc-battle-runtime.test.ts`
14. `tests/task-d003-desktop-stage-battle.test.ts`
15. `tests/task-d004-pc-persistence-reporting.test.ts`
16. `tests/task-d005-pc-map-runtime.test.ts`
17. `tests/task-d006-pc-wild-capture-flow.test.ts`
18. `tests/task-t205-persistence-schema.test.ts`
