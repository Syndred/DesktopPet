本轮定向证据，非全项目视觉验收

修正提交：d4d8462、0156faf、9722659、1ca1aea。
对照清单：实施基线分支 9915684 的 docs/implementation/acceptance/2026-10-24/visual-audit.txt。

A01：采用 foundation layout.css 的同名公共字体/间距 token 引用，独立工作树 fallback 与约定一致：H1 28px/700、中文字体栈、上下24px/左右32px。不在本模块定义全局 token；公共样式导入由 foundation 统一集成。
A02：实际 CSS 视口1280×844。标题从基线 x192/y54 移到 x224/y78；地图同左沿。这里记录的是 H1 边界框，地图页依图稿没有额外面包屑行。Windows DPR=1.25，截图物理像素不可当作 CSS 坐标。空状态没有位置；演示视图明确标识，真实 OSM 瓦片已加载。
A03：结果页父容器 gap=16px；Card margin-bottom=0。appearance.json 的两卡边界差值为16px，无默认外边距叠加。

A07/A08 配合：NPC 模板从 canonical companions 目录读取；模板/资源/属性变化生成新的相遇代际，原记录保留。同一 petId 在资源换装后，结果与图鉴读取当前资源；其他伙伴不变。截图使用已存在的真实2D焰柴资源验证，未宣称六角色和完整动作已验收，素材仍由 resources 统一提供。缩略图尊重 atlas 帧范围，旋转帧由共享 Pixi 舞台处理。

foreground.json：真实 Electron 窗口中验证内部切页保留监听、实际15秒计时产生新样本，隐藏/最小化/离开探索/撤销权限停止；窗口恢复不暗中重启监听。位置是明确标记的测试样本，不算物理定位验收。
native-cancellation.json：在 Electron36.9.5/Node22.19.0 中启动真实 PowerShell 辅助进程，suspend 与 stopWatch 均终止它，确认进程已退出；未保存坐标。
asar-location.json：从真实 ASAR 归档加载定位模块，脚本不解包仍取到 OS WiFi 位置；最新精度138米，仍高于80米门槛。此检查只证明原生模块的归档兼容，不代替完整安装包验收。

原始系统坐标未提交；物理收服与部署后的云端联调仍单列。整包/集中视觉回验由 foundation 执行，本轮未重复项目全量回归。
