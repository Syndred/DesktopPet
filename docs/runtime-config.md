# 运行配置文档（PC 桌宠对战）

文档版本：v2.3  
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

## 4. v2.3 行为说明

### 4.1 窗口策略（按你要求修正）

1. 非战斗状态：窗口为宠物大小（小窗），仅显示宠物模型。
2. 对战状态：恢复为之前的窗口尺寸与显示风格（不再放大成大舞台窗口）。
3. 已移除菜单按钮；仅通过右键宠物打开控制面板。
4. 面板右上角提供关闭按钮（`×`）。

### 4.2 回合与中间提示

1. 双方中间显示“克制/被克/均势 + 5 秒倒计时”。
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

1. 面板左侧使用横向/换行头像列表展示现有宠物（同一行可显示多个头像）。
2. 默认不展示详情卡片，点击某个头像后在右侧展开该宠物详细信息。
3. 详情中可点击“设为出战”切换当前宠物。
4. 当前为本地数据结构，后续可直接对接数据库持久化。

### 4.5 模型资源（已补齐）

当前本地已包含 6 个 GLB：

1. `Fox.glb`
2. `CesiumMan.glb`
3. `Astronaut.glb`
4. `Horse.glb`
5. `NeilArmstrong.glb`
6. `RobotExpressive.glb`

## 5. 手动验证清单

1. 启动后确认是小窗口，仅宠物模型可见。
2. 右键宠物打开面板，能看到“头像行列表”。
3. 点击某个头像后，右侧出现详情；点击“设为出战”后生效。
4. 开始对战后窗口恢复为旧尺寸，不会被放大。
5. 中间显示“克制/被克/均势 + 倒计时”，超时自动普攻。
6. 怒气不足 100 时大招不可点；怒气为 0 时闪避不可点。
7. 闪避对闪避时怒气按规则扣减，不返还。
8. 对战胜负出现后，必须点击结算“确认”才会退出对战。

## 6. 关键文件

1. `apps/pc-app/runtime/main.cjs`
2. `apps/pc-app/runtime/preload.cjs`
3. `apps/pc-app/runtime/renderer/index.html`
4. `apps/pc-app/runtime/renderer/styles.css`
5. `apps/pc-app/runtime/renderer/renderer.mjs`
6. `apps/pc-app/runtime/services/battle-runtime.cjs`
7. `apps/pc-app/runtime/assets/models/`
8. `tests/task-d001-pc-runnable-runtime.test.ts`
9. `tests/task-d002-pc-battle-runtime.test.ts`
10. `tests/task-d003-desktop-stage-battle.test.ts`
