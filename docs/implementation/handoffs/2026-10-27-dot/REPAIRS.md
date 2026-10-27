# 2026-10-27 Dot 云端修复增量

本记录新增，不改原冻结 98 项状态。用户已授权继续修复验收；执行仅 dot 云端，未访问用户 Windows/Mac，未写生产云端或续旧 QA grant。

## 已实现的五组代码

- **P1 记忆再次导入**：账户原 actionId 贯穿记录导入原因；新意图可重新审查同一原 memoryId，同意图重试去重，旧处理历史保留。UI 丢回执重试保留原 actionId；账户 checkpoint 后预览失效也可原输入重试。
- **P1 资源缓存**：预览、恢复保护备份、existing-ID merge 三阶段从完整合法备份补可信缺失字节。核备份整包哈希和当前不可变哈希、owner/文件集合及路径；所有计划先验证，再 exclusive-write，拒损坏现存文件和 symlink。不改 authored 元数据/revision/import/preferences。
- **P2 草稿**：人设/连接草稿与编辑基线固定，远端更新不覆盖；旧草稿仍用原 revision CAS，显式弃稿/干净表单可采用新版。账号/会话/宠物边界清空，保存期间禁用编辑。
- **P2 状态**：园地 durable pending 纳入 provider、缓存和账户一次计数；明确业务拒绝不算未知；主错误优先 metadata 警告；状态读取不重放命令。
- **P3 支持入口**：登录真实版本；关于显示真实构建指纹/dirty 状态/运行环境；固定主机日志目录和稳定外层 EXE 入口；无自动更新服务如实说明，日志可能不存在/为空，不上传。

## 工程证据与边界

详见 [receipt.json](repair-evidence/receipt.json) 和同目录原始日志。目标 CJS 在实际 Linux Electron Node 模式 27/27，通过真实 SQLite；React JSDOM 草稿 9/9、账户恢复 2/2、关于 3/3。JSDOM 不是浏览器或 Windows 原生证明。旧受影响关联 28 项通过；另 garden 原请求 SQLite 重开/失回执恢复 1 项通过，验证 pending 清除且只结算一次。

`build:pc`、主进程与 UI typecheck、native N-API probe 通过。云端 Chromium 启动遭 Unix socket 权限限制，未绕过。新增当前分支专用最小 Windows Actions：目标测试、实际浏览器草稿、构建/ASAR审计、未登录临时 profile 普通 portable 启动/版本/关于验证。**提交前 Windows workflow 尚未运行，不能据此称最终包已验收。**

P1/P2 的真实已登录双端原身份验收仍与工程测试分开；未新建身份替代旧冲突。BC-001/002、QA-021/027、I02 继承状态见 receipt；未将历史 passed 挪到新版本。

## 复跑

- `node scripts/desktop/run-native-tests.cjs tests/regressions/cloud-repair/*.test.cjs`（PowerShell 用文件数组传参）。
- `node --test tests/regressions/cloud-repair/garden-pending-recovery.test.mjs`
- `node tests/regressions/cloud-repair/run-conversation-settings.mjs`：需可启动本机 Chromium，禁止网络。
- JSDOM 工程替代：在仓库外安装 `jsdom@30.1.3`，设 `JSDOM_MODULE_PATH` 后运行 `run-conversation-settings-dom.mjs` / `run-account-restore-ui.mjs`；about runner 使用 `JSDOM_MODULE`。

这些 fixture 不连接真实云、不注册账号、不消费模型或写用户资料。

程序位置验收区分稳定 EXE 路径与 IPC 正常返回；Electron `showItemInFolder` 返回 void，不将无错误冒充 Explorer 窗口已视觉确认。

## TODO6 补核（不重做历史操作）

- BC-001/002：当前两份直接关联回归共 17/17 通过，验证各域独立刷新、unchanged 失败事件有界和同原 action 恢复；不把它冒充旧 Windows 代理连接风暴已原生闭环。
- QA-027：原 22 资源 hook 场景以当前源码 JSDOM 复跑 22/22；没有修改资源 hook，不重复制造已处理故障。
- I02：补录原 4e6 成功合成的独立 proof 和材料不足按钮证据位置；不是重新执行，也不篡改原 pending 登记。原本地/第二端读回子项仍单列未覆盖。

[补核结构化记录](repair-evidence/inherited-supplement.json)

QA-021 当前实际组件 4/4 工程场景通过：真实差异说明、正确账号入口、同步关闭提示、原记录逐条显式处理；没有删除差异 gate、强开同步或自动重复恢复。原 native 状态仍单列。

I03/C07 可独立代码路径：真实 Electron Node 模式 4/4 通过（指定宠喂养、回执去重、失败事务回滚、无效数量/旧版本、每宠冷却）。这不是恢复旧生产操作许可，原账号快速喂养/互动未擅自重做。

## 云端 Windows 首轮与闭环

首轮 `3a5dd98c` 已实际构建便携 EXE、通过 ASAR 审计、普通启动和登录版本显示；但登录页关于链接被外层 App 登录门禁覆盖，真实 SFX 发现后未判通过。现仅给 `/settings/about` 放行公共诊断，业务路由继续登录门禁；补外层 App 路由回归并重跑云 Windows。详见 [首轮失败记录](repair-evidence/windows-first-run.json)。

外层实际 App 路由工程回归 6/6 通过，修复前相同 fixture 3 失败；仅 route registry 和 motion wrapper 隔离，真实 gate/navigation/bridge/About 保留。包含加载中公共关于、未登录链接/返回、受保护业务与相似前缀、已登录原业务导航。motion 与真实注册仍由第二轮 Windows portable 验证。
