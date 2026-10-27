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
