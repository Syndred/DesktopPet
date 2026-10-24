聊天与 AI 设置自验（2026-10-24）

范围：聊天 / AI 设置的 U02、U05、U07 自验；主会话独立复验与全产品 U08 尚未完成。
八个正式资源均通过当前 petId/resourceId 解析近景；五行标记来自实际库存 element，不从角色名称或外观推测。
前台使用短标题、图标和公共 Tooltip；保留可理解的空态、错误、危险操作后果、键盘焦点和禁用原因。
真实生产 Electron，1280×844 / 1440×900，隔离 QA profile。simulation=none；模型部分仅验证真实本机连接失败，不含云模型成功。
通过操作：五行切换与八资源身份；焦点 Tooltip / Tabs / Switch；记忆与人设保存；非本机 HTTP 拒绝；密钥脱敏；发送/重试；清空历史后的保留语义。
SQLite 只读回读：一条用户消息、一条失败助手消息（空回复、attempt=2、NETWORK_ERROR）；清空后消息为0、记忆与人设保留、memory_enabled=0；密钥为加密值（67 bytes），renderer localStorage=0。
网络观测只包装实际 fetch 并转交原函数，没有注入响应；两次真实本机连接失败，记忆关闭时两次请求均不含已保存记忆。
人工查看了五行聊天、失败状态和1440布局，并核对最终稳定态 Tooltip 与设置截图。首次与稳定态补拍的 codeFingerprint / compiledFingerprint 完全一致。
云模型按本轮范围暂缓；未将本机失败验证或历史本机协议 fixture 作为云端成功。
运行时12项、typecheck:ui、根 typecheck、会话目录 lint、生产构建通过；本轮 Electron 五组操作通过、renderer errors=0。构建仅有既有 bundle size warning。

实际测试源码提交：d9e1b71119e3141f9f82164db26586d371835e19
codeFingerprint：5a5bc7711318f0aeeccf617b2872f4f619b8e1f5667dc3ae6515cc549a6499e0
compiledFingerprint：21c7aef7d1db9288a68bc48d35c3bb202e85316124e2892e876f2d9919fbde45
sourceRun：run-1792855266773
构建前工作区：clean

复现：
npm run build:pc
node apps/pc-app/runtime/features/conversations/tests/compact-acceptance.mjs

证据：evidence.json 包含源码哈希、构建记录、输入操作、八个资源/元素、五行页面投影与 SQLite 回读。
index.html 汇总10张真实截图；artifacts 中保留独立 QA profile，未提交数据库或密钥。
本交付只修改 conversations 所属目录和对应文档；公共模块来自 foundation，五行资源来自 f4c210d / 58c3a9d。
模块状态：ready_for_main_review。
