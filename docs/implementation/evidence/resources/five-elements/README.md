# 木、土角色资源自验记录

核心资产/API 源码提交：`f4c210deaa826d3c2ab8d68cb5dadb18538ca864`。捕获发生在该提交前，捕获时的资源运行代码随后原样提交；提交后核对资源 runtime、UI、shared-types 和配置与该 SHA 无差异。详见 [source.json](source.json)。本轮已成功 `git fetch origin`，`origin/main=4786f97680679c2db0aa307fa5f67ec247f93086` 为当前分支祖先。

使用正式生产 Electron、真实 Pixi Spritesheet/AnimatedSprite 与正式资源页控件。数据为隔离本机 `artifacts/resources/2d-profile`，模式 **local-qa / simulated=false / cloud not used**。没有模拟 preload、替代产品页或云端成功声明。

| 伙伴 | 元素 / 模板 | resourceId | 实际 16 帧排版 | 正式页面 / 头像 |
| --- | --- | --- | --- | --- |
| 青芽 | 木 / animal-wood-deer | builtin:lingjing-qingya-v1 | [截图](qingya-frames.png)、[可点原截图的排版](qingya-frames.html) | [页面](qingya-page-1280.png)、[头像](qingya-portrait.png) |
| 岩团 | 土 / animal-earth-pangolin | builtin:lingjing-yantuan-v1 | [截图](yantuan-frames.png)、[可点原截图的排版](yantuan-frames.html) | [页面](yantuan-page-1280.png)、[头像](yantuan-portrait.png) |

每张排版仅排列该角色 16 张未经修改的正式舞台截图，并裁去两侧空白便于比较；每张原截图均一同保存。全量记录在 [evidence.json](evidence.json)：32 个实际 Pixi 帧、每角色 16 个独立 frame Texture UID、12 个公共动作映射与同一个 TextureSource；角色、枝角、鳞尾、攻击和技能特效均在舞台内。最小顶部留白 10.4 CSS px。两角色的近景头像继续使用相同 canonical 待机帧，未生成额外头像图片。

作者已查看两个 16 帧排版、两头像及两种窗口尺寸的正式页面，原图低 alpha 像素没有在实际白蓝背景下形成可见脏边，无相邻角色残片或明显截断。检查结论与边界测量见 [visual-review.json](visual-review.json)。[1280×844 页面](resource-layout-1280.png) / [1440×900 页面](resource-layout-1440.png) 的截图物理尺寸随系统 DPR=1.25；实际字号和控件无障碍名称记录在 evidence.json。

## 连续同名动作事件

[replay/evidence.json](replay/evidence.json) 定向记录两只分别连续两次普通攻击、两次受击，共八次。每次点击正式“重播”图标使 playbackKey 改变，即使 action 不变也重新从帧 8 或帧 10 开始。记录实际 `textureFrame` 矩形与 `frameTexture` UID 变化；同一画布标记及 `textureSource` 保留，验证无卸载重建。每次起手截图均保存在 replay/，例如 [青芽第二次受击](replay/qingya-hit-2-start.png) 和 [岩团第二次攻击](replay/yantuan-attack-2-start.png)。该记录是资源公共接口验收，真正 battle impact 的消费方仍须接入并独立验收。

接入示例及避免历史动作重播的约束见 [五行资源契约](../../../five-element-resources-contract.md)。尤其 release 与 impact 都为 hit 时，impact 必须有新的真实事件 key；不能只依赖 action 字符串改变。

## 真实数据与保留项

[adoption-selection-readback.json](adoption-selection-readback.json) 通过正式 preload IPC 领养青芽和岩团，核对 templateId、element、resourceId，再分别选择 battlePetId 并读取列表确认。最后恢复 QA profile 的原出战选择 `pet-001`。这证明正式数据入口可领养、可选出战，不声称已经玩过统一战斗。

[sqlite-readback.json](sqlite-readback.json) 是 Electron ABI 的只读 SQLite 回读：8 个 canonical 资源、2 个保留历史内置行、2 个导入流水，共 12 资源行 / 10 全局行，两只新伙伴的元素与资源身份均对应。正式模板接口实际元素数量为金 1、木 1、水 4、火 1、土 1。

[baseline-six.json](baseline-six.json) / [original-six-preserved.json](original-six-preserved.json) 记录原六只 PNG 和 character.json 共 12 个文件原字节未变；原六只的 96 帧既有证据保留在 [roster-v2](../roster-v2/README.md)，本轮未重复全部六套。旧别名、数据库行、偏好与流水的定向测试通过；原模型和 `.codex/config.toml` 无修改。

只读图片定位结果见 [final-image-qa.json](final-image-qa.json)，它是透明缝/矩形辅助资料，不能替代上述实际 Pixi 图片检查。生成提示词与 PNG 原字节来源在核心资产提交的 source-record.json 中。

## 检查与范围

- 原生 roster 领域测试 5/5：[日志](native-roster.log)。
- UI TypeScript 检查：[日志](typecheck-ui.log)。
- 资源 UI lint：[日志](lint-resources.log)。
- 生产构建通过：[日志](build-pc.log)，保留既有 Vite 大块提示。
- 正式 32 帧预览捕获 renderer/console 均无错误；定向八次重播通过且无 pageerror。

本轮资源自验完毕，交主会话合入与验收。统一 BattleScreen/Arena 的四模式、25 个有序元素组合、实际特性公式、日志与断线恢复属于 battle/foundation/main 的整合验收；本文不将这些项目标为完成，也没有云端验收结果。
