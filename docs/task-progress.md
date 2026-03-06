# 任务进度记录

更新时间：2026-03-06

## 当前状态

1. PC 端核心闭环已可运行并通过全量验证（`npm run verify`、`npm run pc:smoke`）。
2. 地图演示版（M-301/M-302/M-304）已完成，后续重点在地图可视化与收益联动（M-303/M-305）。
3. 鉴权与账号体验已升级为“独立登录窗口 + 运行面板头像下拉资料管理”，不再占用仓库区域。

## 最新里程碑

1. `D-037` 用户模型升级（账号/用户名分离）+ 中文鉴权提示完善 `[DONE]`
   - 完成内容：
     - 用户模型升级为：`id(内部主键)` + `account(登录账号)` + `username(展示名)` + `passwordHash`。
     - 注册新增用户名字段，默认与账号解耦；登录仍采用账号+密码。
     - 资料修改改为“改用户名 + 改密码（需旧密码）”，账号保持稳定不变。
     - 运行面板与头像显示优先展示用户名，同时保留 `@账号`。
     - 中文模式下鉴权错误提示统一中文化（登录/注册/资料修改/搜索申请等）。
   - 测试：
     - `tests/task-d001-pc-runnable-runtime.test.ts`
     - `tests/task-d007-pc-user-auth-duel-request.test.ts`
     - `npm run verify`
     - `npm run pc:smoke`

2. `D-036` 账号体验重构 + HUD自适应 + ESC分层退出 `[DONE]`
   - 完成内容：
     - 独立鉴权窗口改为主流单卡片流程：默认登录，支持“去注册/去登录”单按钮切换。
     - 运行面板移除登录/注册表单，改为右上角用户头像下拉（退出登录、修改信息）。
     - 新增资料修改弹层：支持修改用户名、修改密码，均要求输入旧密码校验。
     - 对战 HUD 顶部高度改为按双方模型最高点动态计算，避免血条/怒气条被高模型遮挡。
     - 面板关闭按钮移除，ESC 现在按层关闭：资料弹层 -> 用户下拉 -> 战报/详情弹层 -> 面板。
     - 鉴权状态改为主进程实时广播（`pet:auth-state`）：修复“登录后头像仍禁用/会话状态不同步”问题。
     - 头像按钮样式居中修复（去除默认按钮 padding，改 flex 居中）。
   - 测试：
     - `tests/task-d001-pc-runnable-runtime.test.ts`
     - `tests/task-d003-desktop-stage-battle.test.ts`
     - `tests/task-d007-pc-user-auth-duel-request.test.ts`
     - `npm run verify`
     - `npm run pc:smoke`

3. `D-035` 独立鉴权窗口 + 对战朝向修正（Azimuth/Pitch）`[DONE]`
   - 完成内容：
     - 新增独立登录窗口：应用启动先进入鉴权窗口，注册/登录成功后再进入桌宠主窗口。
     - 主窗口改为 `show: false` 启动，托盘行为适配鉴权状态（未登录优先打开登录窗口）。
     - 对战朝向由模型 `orientation` 旋转改为 `cameraOrbit` 方位角控制（azimuth），`Ctrl + 左键` 水平拖动可稳定绕水平角旋转，不再只出现“X轴观感”。
     - 修复模型 load 回调覆盖战斗视角：战斗态加载模型不再回退到 idle 视角。
   - 测试：`tests/task-d001-pc-runnable-runtime.test.ts`、`tests/task-d003-desktop-stage-battle.test.ts`、`tests/task-d007-pc-user-auth-duel-request.test.ts`、`npm run verify`、`npm run pc:smoke`

4. `D-034` PC 用户系统一期（注册/登录/搜索账号/对战申请）`[DONE]`
   - 完成内容：
     - 新增本地账号系统持久化：注册、登录、退出登录、会话恢复。
     - 新增账号搜索与对战申请：可搜索账号并发起申请，支持收/发申请列表查看。
     - 主进程/预加载/渲染层全链路打通（`runtime-data-store` + IPC + 面板 UI + 中英文文案）。
   - 测试：`tests/task-d007-pc-user-auth-duel-request.test.ts`、`tests/task-d001-pc-runnable-runtime.test.ts`、`npm run verify`、`npm run pc:smoke`

3. `D-033` 对战自由视角微调 + 启动颜色同步修复 `[DONE]`
   - 完成内容：
     - 对战模式支持 `Ctrl + 左键拖动` 自由微调（左右调朝向、上下调俯仰），用于兜底不同模型的朝向差异。
     - 修复启动颜色不一致：非对战态 HUD/模型染色按当前出战宠物与当前敌宠显示，不再被旧 battle state 覆盖。
   - 测试：`tests/task-d003-desktop-stage-battle.test.ts`、`npm run verify`、`npm run pc:smoke`

4. `D-032` 面板开启动画跳位修复 + 对向符号反转校正 `[DONE]`
   - 完成内容：
     - 面板打开改为“先切布局再显示面板”，消除右键开面板时闪到左上角的一帧跳位。
     - 面板布局切换改为保留当前左上角锚点并禁用动画 `setBounds(..., false)`，降低视觉突变。
     - 战斗模型朝向符号反转为 `player=+90deg`、`enemy=-90deg`，修复朝向方向仍错误的问题。
   - 测试：`tests/task-d001-pc-runnable-runtime.test.ts`、`tests/task-d003-desktop-stage-battle.test.ts`、`npm run verify`、`npm run pc:smoke`

5. `D-031` 面板闪烁与战斗模型可见性修复 `[DONE]`
   - 完成内容：
     - 面板打开时隐藏舞台层（`panel-open` 下整体透明/禁交互），避免右键开面板瞬间模型放大闪烁。
     - 撤销错误的元素级 `rotateY`（会把 `model-viewer` 平面转到近乎不可见）。
     - 战斗朝向改为模型内部朝向：`player=-90deg`、`enemy=90deg`，恢复可见且面对面对战。
   - 测试：`tests/task-d003-desktop-stage-battle.test.ts`、`npm run verify`、`npm run pc:smoke`

6. `D-030` 拖动尺寸硬锁 + 朝向绕Y轴修正 `[DONE]`
   - 完成内容：
     - 拖动链路增加布局尺寸硬锁：移动与保存阶段均按 `idle/panel/battle` 目标尺寸回正，彻底阻断拖动过程宽高漂移。
     - 对战朝向改为 CSS `rotateY(±90deg)`，仅绕竖轴旋转，规避相机与模型轴导致的背对背/翻转问题。
   - 测试：`tests/task-d003-desktop-stage-battle.test.ts`、`npm run verify`、`npm run pc:smoke`

7. `D-029` 拖动与对向显示二次修复 `[DONE]`
   - 完成内容：
     - 拖动改为主进程 `setPosition` 位移，不再在拖动链路调用 `setBounds`，进一步消除拖动中尺寸漂移。
     - 战斗对向改为“左右相机轨道对向”（`player=90deg` / `enemy=-90deg`），不再依赖模型旋转轴，规避朝向翻车。
   - 测试：`tests/task-d003-desktop-stage-battle.test.ts`、`npm run verify`、`npm run pc:smoke`

8. `D-028` 拖动防扩窗与战斗朝向翻转修复 `[DONE]`
   - 完成内容：
     - 主窗口禁用系统手动缩放（`resizable=false`），仅保留 `Ctrl + 滚轮` 缩放入口，避免拖动误触边缘导致越拖越大。
     - 战斗朝向从 `orientation` 旋转改为安全镜像翻转（`player scaleX(-1)`），修复“模型四脚朝天/方向错乱”。
   - 测试：`tests/task-d003-desktop-stage-battle.test.ts`、`npm run verify`、`npm run pc:smoke`

9. `D-027` 拖动稳定与收服结算单弹层修复 `[DONE]`
   - 完成内容：
     - 主进程拖动链路改为“仅移动位置不改尺寸”，修复左键拖动过程中窗口逐步变大的问题。
     - 对战模型朝向改为强制水平对向（`±90deg`），并在战斗模式锁定相机轨道，消除方向错乱。
     - 收服流程改为单一结算弹层确认：胜利后直接在结算框内“确认/取消”收服，不再二次确认。
   - 测试：`tests/task-d001-pc-runnable-runtime.test.ts`、`tests/task-d003-desktop-stage-battle.test.ts`

10. `D-024` 空闲交互与窗口缩放稳定化 `[DONE]`
   - 完成内容：
     - 空闲态改为 `Ctrl + 滚轮` 缩放，普通滚轮不再触发缩放。
     - `Ctrl + 左键` 旋转模型；左键按住宠物保持拖窗。
     - 缩放窗口按模型基准尺寸计算，避免拖动过程中误放大。
     - idle 态保留半透明虚线边界辅助，去除多余实线视觉干扰。
   - 测试：`tests/task-d003-desktop-stage-battle.test.ts`

11. `D-025` 战斗规则与收服流程升级 `[DONE]`
   - 完成内容：
     - 倒计时改为 10 秒，展示改为轻量数字（不再使用圆环）。
     - 大招门槛改为 `>=50` 怒气。
     - 首次允许 0 怒气闪避，后续 0 怒气不可闪避。
     - 平局规则移除：同回合同归于尽按“先掉到 0 HP 的一方判负”。
     - 属性状态基础 2 回合；叠层时增加层数并额外延长 2 回合。
     - 收服战胜后新增确认弹层（确认/取消），取消会记为放弃收服。
     - 最近战报支持点击查看逐回合回放。
   - 测试：`tests/task-d002-pc-battle-runtime.test.ts`、`tests/task-d003-desktop-stage-battle.test.ts`

12. `D-026` 仓库与收服数据一致性修复 `[DONE]`
   - 完成内容：
     - 收服时间统一为 ISO 时间写入并按中文时区显示，修复显示偏差。
     - 宠物详情移除模型文件名显示（不再展示 `Horse.glb` 这类字段）。
     - 放逐后允许同编号重新收服（清理过期捕获记录）。
     - 属性染色增强，避免仅显示单一绿色模型观感。
   - 测试：`tests/task-d004-pc-persistence-reporting.test.ts`、`tests/task-d006-pc-wild-capture-flow.test.ts`

## 已通过验证

1. 定向测试：
   - `npm run test:unit -- tests/task-d001-pc-runnable-runtime.test.ts tests/task-d002-pc-battle-runtime.test.ts tests/task-d003-desktop-stage-battle.test.ts tests/task-d004-pc-persistence-reporting.test.ts tests/task-d006-pc-wild-capture-flow.test.ts`
2. 冒烟测试：
   - `npm run pc:smoke`
3. 全量门禁：
   - `npm run verify`

## 待办（下一阶段）

1. `M-303` 地图 marker 可视化与交互层。
2. `M-305` 区域占领收益与地图收服倍率联动。
3. `M-306/M-307` 后台围栏提醒与地图验收包。
