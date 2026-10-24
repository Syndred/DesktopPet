# 五行角色资源扩展与动作事件重播

本轮资源范围对应 `unified-battle-goal.txt` 的 U02、U04 公共接口、U05 资源页与 U07 自验。原六角色的 PNG 与 character.json 共 12 个文件保持字节一致，追加两只不同轮廓的伙伴，集合为八只。没有修改现行战斗公式、成长数值或旧实例的 element/resourceId。

| 角色 | 元素 | templateId | canonical resourceId |
| --- | --- | --- | --- |
| 鱼丸 | 水 | big-fish-gentle | builtin:lingjing-yuwan-v2 |
| 小蓝 | 水 | big-fish-cheerful | builtin:lingjing-xiaolan-v1 |
| 饭团 | 水 | big-fish-foodie | builtin:lingjing-fantuan-v1 |
| 焰柴 | 火 | animal-shiba | builtin:lingjing-shiba-v2 |
| 礼帽喵 | 金 | animal-hat-cat | builtin:lingjing-hatcat-v1 |
| 小狐 | 水 | animal-white-fox | builtin:lingjing-xiaohu-v1 |
| 青芽 | 木 | animal-wood-deer | builtin:lingjing-qingya-v1 |
| 岩团 | 土 | animal-earth-pangolin | builtin:lingjing-yantuan-v1 |

`roster.cjs` 的 `listRosterTemplates()` 同时供领养使用；`getRosterDefinition(resourceId)` 支持明确旧别名并返回 canonical 定义。`withRosterElement(resource)` 只在读取时补充 canonical 默认元素，资源接口的 `CharacterResource.element` 可选。旧六包 JSON、数据库 document、偏好、导入流水不因此重写。带元素的用户导入包只接受 metal/wood/water/fire/earth；未提供则保留未知，不猜测元素。实际战斗仍以 `pet.element` 与战斗快照为准，不能用头像资源覆盖旧实例属性。

旧别名继续为 yuwan-v1、battle-yuwan-v1 → yuwan-v2，battle-shiba-v1 → shiba-v2；青芽与岩团是首次发布，没有虚构旧 ID。`pet.resource.resourceId` 仍为跨页身份来源。头像沿用公共 `ResourcePortrait` / `resolveResourcePortrait`，只追加两只的近景构图参数。

## 图集与动作

两只均由内置 `image_gen.imagegen` 生成。青芽是枝角、叶披肩的小鹿；岩团是有鳞片长尾与掘土爪的穿山甲。完整提示词和仅青芽的留白修订在 `assets/roster-v2/element-extension-prompts.json`、`element-extension-refinement.json`。最终 PNG 是工具原字节，`source-record.json` 保存哈希、工具来源及精确帧矩形，Python 仅只读测量。

两包复用既有 16 姿势 / 12 公共动作 / 13 clips 契约，逻辑尺寸 512×512、脚底基线 435、anchor=(0.5,435/512)。PNG 实际均为 1254×1254，使用精确 Pixi trim 矩形，禁止按等分格直接裁图。0/1 待机眨眼、2/3 行走、4/5 招手、6/7 进食、8/9 普攻起手释放、10 受击、11/12 技能蓄力施放、13 胜利、14 坐睡、15 蜷睡。默认睡眠 15；14 是可选 sleep_seated。

木的叶藤用于寄生攻击，土的砂岩波用于迟钝攻击；不能从外观推导成木主动治疗或土自身护盾。当前权威规则来自 `runtime/services/battle-runtime.cjs`：木寄生扣血并回复来源，土 petrify 降低目标输出，水减怒且禁止受伤涨怒（没有冻结/禁止行动），金 vulnerability 增加承伤，火 burn 持续扣血。资源层不实现、复制或改写这些规则，25 个有序组合与四模式由 battle/main 按同一引擎验收。

## 同名动作重新播放

`ResourceStageProps.playbackKey?: string | number` 是可选增量接口。新 key 会停止当前片段并 `gotoAndStop(0)`，随后依照 playing/motionEnabled/系统减少动画策略播放。只换 key 时不重建 Application、图集、画布或共享 TextureSource，动作没有变化也会重新开始。原有未传 key 的消费者行为保持。

```tsx
// animationEvent 只在本次新动作阶段产生；每个 side 独立跟踪。
const replayKey = `${battle.id}:${round}:${phase}:${side}:${animationEvent.id}`;
<ResourceStage
  resource={resource}
  petId={pet.petId}
  context="battle"
  action={animationEvent.action}
  playbackKey={replayKey}
  motionEnabled={motionEnabled}
/>
```

消费者应让起手/释放/冲击阶段使用各自的新事件 ID，不能只使用 action 字符串。特别是 release 已显示 hit 后，impact 仍为 hit 时也要推进 key，才能在真正冲击时重新显示受击帧。优先用已有真实动作事件 ID；round:phase:side 只有在一个阶段内每侧至多一个动作时才唯一。禁止每次 React render 生成随机 key，否则会持续回到首帧。恢复对局时先还原静态状态并把历史事件标记已消费；日志重读或断线恢复不能重新派发历史动作。

资源预览的“重播”图标消费相同接口。定向脚本 `verification/roster-replay.electron.mjs` 在真实 Electron 中对两只分别连续两次普通攻击、两次受击，共 8 次重播，记录实际 `textureFrame`、`frameTexture` UID、`textureSource` UID 和画布身份；因此不是只检查 data-action 文本。角色逐帧脚本另记录 32 帧和同资源的 16 个独立帧 Texture UID。

## 验收边界与交接

实际资源页、头像、图集边界、连续重播、模板元素以及正式 IPC 领养/出战选择均已在隔离本机 QA profile 验证，详见 [evidence/resources/five-elements/README.md](evidence/resources/five-elements/README.md)。数据模式为 local-qa、simulated=false，未连接或冒充云端。SQLite 只读回读保留旧内置行与导入流水；出战选择完成后恢复 QA profile 原选择。

这份资源自验不代表统一 BattleScreen 已接入 playbackKey，也不代表四模式、25 个有序元素组合、云端或恢复语义全产品验收完成。battle/foundation/main 需合入本接口，再在整合 Electron 中检查真正 impact 的纹理、四模式与现行规则，并由主会话独立验收。
