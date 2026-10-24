# 2D 角色资源模块

以 `scope-2d-ui-first.txt`（d6a1ab1）为当前范围。入口为 `ui/src/features/resources/index.tsx`、`runtime/features/resources/index.cjs`；数据表使用 foundation 注入的同一 SQLite 连接。本版导入、列表、预览、动作映射、校准及资源访问只处理 2D 图集。旧 3D 实现封存在资源模块的 `legacy/`，不进入活动链路；原模型文件、历史数据库行、偏好与导入流水保留，也不迁移旧 3D localStorage 校准。

## 导入与存储

`resources:list/import/save/resolve` 使用经过主进程验证的当前账号。导入仅由 Windows 原生文件选择器选择 JSON；renderer 不传文件路径或 owner。支持解压后的 `lingjing.character` v1 网格角色包，以及单图片的 PixiJS / TexturePacker JSON 图集。图片支持 PNG/WebP。网格数据转成标准 Spritesheet JSON；旋转帧、裁剪帧、原始尺寸和动画帧由 PixiJS `Spritesheet.parse()` 处理。

项目角色示例为 `runtime/assets/illustrations/yuwan-character-v1.json` 及 `yuwan-sprites-v1.png`，使用项目图稿中的鱼丸二次元形象。旧测试鱼素材保留为历史文件，不作为新安装默认角色。常规注册由 foundation `registerBuiltinArt` 提供 `builtin:lingjing-yuwan-v1`，资源模块不另造默认角色或扫描模型目录。

网格包字段：`format:'lingjing.character', version:1, kind:'spritesheet', name, image, sheet:{width,height,columns,rows}, clips:{name:{frames,fps,loop}}, actions, calibration, provenance`。标准图集字段：`frames, meta:{image,size,scale}, animations`，可选 `character:{name,fps,actions,calibration,provenance}`。来源、作者、许可及署名随记录保存；同哈希项目素材可以沿用明确登记的来源，不将任意用户素材标为已授权。

限制：单文件 128 MiB、总量 256 MiB、128 文件、JSON 4 MiB、图片不超过 4096² 像素且单边不超过 8192、4096 图集帧、128 动作、每动作 1024 帧、1–60 fps。拒绝绝对路径、上级目录、网络 URI、编码路径及指向包外的符号链接。完整校验后才复制到 UUID 目录并写入事务；导入串行执行。同内容重试保留资源 ID、增加流水，并可修复缺失托管副本，原文件不变。

## 动作、显示与实例

`resourceId` 标识共享形象，`petId` 标识独立伙伴。桌面和战斗分别保存 `scale, rotationDeg, verticalOffset, mirrorX, anchorX, anchorY, fps`；fps 为 0 时使用动作原始帧率。保存携带 `expectedRevision`；冲突返回 `REVISION_CONFLICT`。动作 `idle/walk/attack/hit/skill/victory/sleep` 缺失时回退映射待机或首个动画。

UI 共用 `ResourceStage`，传入 `resource, petId, context, action, facing, playing, motionEnabled`。同资源共享 Pixi Assets 纹理来源和图集，各实例持有独立 Application、AnimatedSprite、播放帧和生命周期；销毁实例不卸载其他实例使用的纹理。帧率、锚点和动作直接更新 Pixi 对象，没有自制帧循环、裁图或动画引擎。DOM 的 `data-texture-source` 是实际 TextureSource UID，可核验共享来源。

主进程 `resolve(owner,{resourceId,petId,context,action,facing})` 返回资源、实际动作与独立校准副本。`resolveForPet(owner,pet)` 等待资源就绪，返回 `kind:'spritesheet',url,sheet,atlas,resource,clip,calibration,resourceRevision` 供桌面窗口适配，FPS 覆盖已应用到 clip。调用方确认 petId 属于当前账号。事务内可用无磁盘访问的 `getRecord`；异步磁盘检查在事务外调用。

`ApplyToCompanion` 通过现有 companions 列表及 appearance CAS 命令给一个真实伙伴绑定 resourceId，不复制资源或改变其他伙伴。`resources:changed` 通知页面重新读取，事件载荷不是权限凭据。

## 公共 UI 与动画

正式页拆成 ResourceLibrary、ResourceEditor、ResourceControls、ResourceStage、ApplyToCompanion 和 useResources。沿用 foundation 官方 shadcn Radix Nova 的 Tabs、Select、Slider、Switch、ScrollArea、Popover、Input 与 Button，来源及哈希见 `shadcn-source-record.json`。选择器使用 Radix Portal、键盘导航及 Esc 焦点恢复，标签页使用实际 Tabs 状态。Slider 命名 group 标明用途，thumb 范围、数值及方向键行为由 Radix 提供；公共 Slider 的 thumb 命名改进由 foundation 维护。

列表用公共 AnimatedList，页面用 foundation Motion for React 的 PageTransition/AppMotionProvider。Pixi 监听系统减少动画、document visibility、playing/motionEnabled 和祖先 `data-motion` 策略，关闭动画时暂停精灵和 ticker。按钮无阴影或 hover 位移。图稿 07 下半部分保留左资源库、右预览和校准结构，按最新范围改成图集、FPS、锚点与动作配置。

## 权限与数据保留

文件只经 `lingjing-resource://asset/<id>/<key>` 读取，主进程再次校验账号、文件登记、扩展名和允许目录，renderer 不接收绝对文件路径。foundation 在 ready 前注册安全协议，CSP 允许该协议加载图片及连接。舞台加载 Pixi 静态 `pixi.js/unsafe-eval` 同步实现，不为 2D 放宽一般 unsafe-eval。

账号升级只依据 `account_aliases` 已验证映射，把 canonical owner 和无歧义旧 subject ID 归到同一访问范围。旧资源、流水及偏好保持原 owner；新偏好写 canonical owner。subject 映射到不同 provider owner 时不猜测合并。完整安装及数据目录迁移通过登记资源键重新定位，不向 renderer 开放路径。

## 验收

领域检查：`node scripts/desktop/run-native-tests.cjs apps/pc-app/runtime/features/resources/verification/resources.test.cjs`，使用真实 Electron ABI SQLite、文件复制、内容哈希、CAS、账号别名及历史记录保留断言。

原生导入、校准保存、双实例、动画策略、错误回执、数据库及重启证据见 `evidence/resources/` 与 `status/resources.json`。模块验收不代替 foundation 在最终整合版本中进行的桌面多伙伴和战斗完整回归。
