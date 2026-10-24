# 六伙伴 canonical 资源与近景构图契约

本轮对应集中清单 A07、A08、A12，资源页同时消费 A01 的公共字体及间距。首个可合入资产提交为 `2d0b5c8`；资产位于 `runtime/features/resources/assets/roster-v2/`，位图均来自 OpenAI 内置 `image_gen.imagegen`，不是旧 GLB 或几何占位。

| 模板 ID | 角色 | 唯一 canonical resourceId |
| --- | --- | --- |
| big-fish-gentle | 鱼丸 | builtin:lingjing-yuwan-v2 |
| big-fish-cheerful | 小蓝 | builtin:lingjing-xiaolan-v1 |
| big-fish-foodie | 饭团 | builtin:lingjing-fantuan-v1 |
| animal-shiba | 焰柴 | builtin:lingjing-shiba-v2 |
| animal-hat-cat | 礼帽喵 | builtin:lingjing-hatcat-v1 |
| animal-white-fox | 小狐 | builtin:lingjing-xiaohu-v1 |

`roster.cjs` 的 `listRosterTemplates()` 是模板与资源关联的单一来源；companions/templates 只补充原有 BASE_STATS，原先三个模板 ID 和属性公式保留。`registerRoster(resourcesService)` 完整解析六包后用共享 SQLite 事务登记，资源模块启动已接入。图集 PNG 校验精确 SHA256；描述文件按语义比较，兼容 Git 的 LF/CRLF 转换。

`pet.resource.resourceId` 始终是身份来源。领养、详情、桌面、聊天、出战和战报均以该字段获取资源；不要按 element 或战斗场景换另一套默认角色。资源服务 get/getRecord/resolve/resolveForPet 将明确的旧内置 ID 读穿到 canonical ID：yuwan-v1、battle-yuwan-v1 → yuwan-v2；battle-shiba-v1 → shiba-v2。原实例引用、旧资源行、旧偏好、流水和原位图不删除或重写。旧 URL 仍服务其原登记字节；新解析返回 canonical ID 和新资产 URL。用户导入的 UUID 不参与别名，也不会被折叠。新 canonical 资源的偏好独立于保留的旧版本偏好，避免把旧 attack=wave 当作新动作设置。

## 16 姿势与 12 动作

| 源帧 | 姿势 |
| --- | --- |
| 0 / 1 | 待机 / 眨眼 |
| 2 / 3 | 相反脚步的走路 |
| 4 / 5 | 两个招手姿势 |
| 6 / 7 | 拿食物入口 / 咀嚼 |
| 8 / 9 | 普通攻击起手 / 释放 |
| 10 | 后仰受击 |
| 11 / 12 | 技能蓄力 / 施放 |
| 13 | 胜利 |
| 14 / 15 | 坐着安睡 / 蜷缩安睡 |

公共动作名：`idle, blink, walk, wave, eat, attack_windup, attack_release, attack, hit, skill, victory, sleep`。普通攻击使用 8→9→待机，受击使用 10，技能使用 11→12→待机，均为非循环动画，不引用 wave 或 rest 充数。常规睡眠固定用 15，避免把坐睡与卧睡反复跳换；14 作为可选 `sleep_seated` clip。旧包缺失动作仍明确回退待机。

每张源 PNG 实际为 1254×1254，逻辑上排列为 4×4，不能按 313.5 直接等分裁切。包内保存 16 个实际 Pixi `frame` 区域及 `trim/sourceSize/spriteSourceSize`；逻辑帧统一 512×512、底线 435、anchor=(0.5,435/512)。Pixi Spritesheet 原生处理裁切、定位和播放，没有自制动画引擎。位图字节完全保留，未按 alpha 阈值抹除；Python 仅只读检查并输出矩形。边界统计采用 alpha≥128，只作定位辅助，最终以真实 Pixi 截图检查主体、特效和相邻帧为准。极低 alpha 的彩色杂点不能当作不透明背景。

`character.clips` 支持标准 Pixi 图集每个动画的 fps/loop 元数据；不再把普通攻击和技能强制当循环。`ResourceStage` 根据 Pixi 实际 trim 的内容尺寸适配舞台，统一逻辑透明边距不缩小主体；同资源纹理共享，各 petId 的动作、帧、播放状态独立。

## 统一头像与上身近景

公共入口从 `ui/src/features/resources/index.tsx` 导出 `ResourcePortrait`、`resolveResourcePortrait`；也可直接引用 `ResourcePortrait.tsx` 和 `display.ts`。

```tsx
// resource 必须是当前 pet.resource 解析出的 CharacterResource。
<div className="pet-avatar">
  <ResourcePortrait resource={resource} label={`${pet.name}头像`} />
</div>
```

```css
.pet-avatar { width: 40px; height: 40px; border-radius: 50%; overflow: hidden; }
```

默认 `framing="portrait"` 从同一 canonical 待机帧的实际主体区域取头部/上身，忽略 512×512 逻辑帧的透明边距；六种轮廓各有集中维护的构图参数。函数返回源帧、viewBox、原图尺寸及 SVG imageTransform，消费方也可自行组合 SVG。支持 TexturePacker 旋转帧；视口始终在同一个源帧内。`framing="full"` 可用于需要全身的静态卡片；动态桌面与战斗舞台继续使用 ResourceStage，不全局放大、不换角色、不生成新头像图。

领养/详情缩略图由 companions 接入，聊天侧图与圆头像由 conversations 接入，HUD 与出战卡由 battle 接入，foundation 统一集成。资源卡已采用该公共构图。`decorative` 用于旁边已有名字的装饰图；`label` 用于独立头像的可访问名称。自定义 assetUrl 只接收资源 ID 和登记 key，默认仍走安全资源协议。

完整生成提示词、原始工具输出来源、PNG 哈希与动作分配分别见 `generation-prompts.json`、`layout-refinement-prompts.json`、`source-record.json`；源角色参考批准图稿 03。代码库许可证与“项目生成素材”的来源记录分开。
