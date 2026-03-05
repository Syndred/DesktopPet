# 运行配置文档（PC 桌宠对战）

文档版本：v2.5  
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

## 4. v2.5 行为说明

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

## 6. 关键文件

1. `apps/pc-app/runtime/main.cjs`
2. `apps/pc-app/runtime/preload.cjs`
3. `apps/pc-app/runtime/renderer/index.html`
4. `apps/pc-app/runtime/renderer/styles.css`
5. `apps/pc-app/runtime/renderer/renderer.mjs`
6. `apps/pc-app/runtime/services/battle-runtime.cjs`
7. `apps/pc-app/runtime/services/runtime-data-store.cjs`
8. `apps/pc-app/runtime/assets/models/`
9. `infra/supabase/migrations/0002_pet_inventory_battle_reports.sql`
10. `tests/task-d001-pc-runnable-runtime.test.ts`
11. `tests/task-d002-pc-battle-runtime.test.ts`
12. `tests/task-d003-desktop-stage-battle.test.ts`
13. `tests/task-d004-pc-persistence-reporting.test.ts`
14. `tests/task-t205-persistence-schema.test.ts`
