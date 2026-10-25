# 2D 角色资源模块

以 `scope-2d-ui-first.txt`（d6a1ab1）与 `cloud-upgrade-2026-10-25.md` 为当前范围。入口为 `ui/src/features/resources/index.tsx`、`runtime/features/resources/index.cjs`；数据表使用 foundation 注入的同一 SQLite 连接。本版导入、列表、预览、动作映射、校准及资源访问只处理 2D 图集。确认无消费者的旧 3D 运行/导入源码已清理；正式 `history.cjs` 保留已有模型档案的只读查询、安全文件验证与云端档案恢复。原模型文件、历史数据库行、偏好与导入流水保留，也不执行旧 3D localStorage 校准。清理快照与恢复方法见 cloud resources 验收目录。

## 导入与存储

`resources:list/import/save/resolve` 使用经过主进程验证的当前账号。导入仅由 Windows 原生文件选择器选择 JSON；renderer 不传文件路径或 owner。支持解压后的 `lingjing.character` v1 网格角色包，以及单图片的 PixiJS / TexturePacker JSON 图集。图片支持 PNG/WebP。网格数据转成标准 Spritesheet JSON；旋转帧、裁剪帧、原始尺寸和动画帧由 PixiJS `Spritesheet.parse()` 处理。

当前项目角色集合在 `runtime/features/resources/assets/roster-v2/catalog.json`：鱼丸、小蓝、饭团、焰柴、礼帽喵、小狐、青芽（木）、岩团（土），各有 16 个独立姿势，完整覆盖金木水火土。资源模块 `registerRoster` 登记同一 canonical 集合，原有 v1 及 battle 专用 ID 保留为明确的读穿别名。旧测试鱼和旧位图文件继续保留，不作为当前默认角色。完整关联、兼容策略及 prompt 来源见 `roster-contract.md` 与 `five-element-resources-contract.md`。

网格包字段：`format:'lingjing.character', version:1, kind:'spritesheet', name, image, sheet:{width,height,columns,rows}, clips:{name:{frames,fps,loop}}, actions, calibration, provenance`。标准图集字段：`frames, meta:{image,size,scale}, animations`，可选 `character:{name,fps,actions,calibration,provenance}`。来源、作者、许可及署名随记录保存；同哈希项目素材可以沿用明确登记的来源，不将任意用户素材标为已授权。

限制：单文件 128 MiB、总量 256 MiB、128 文件、JSON 4 MiB、图片不超过 4096² 像素且单边不超过 8192、4096 图集帧、128 动作、每动作 1024 帧、1–60 fps。拒绝绝对路径、上级目录、网络 URI、编码路径及指向包外的符号链接。完整校验后才复制到 UUID 目录并写入事务；导入串行执行。同内容重试保留资源 ID、增加流水，并可修复缺失托管副本，原文件不变。

## 动作、显示与实例

`resourceId` 标识共享形象，`petId` 标识独立伙伴。桌面和战斗分别保存 `scale, rotationDeg, verticalOffset, mirrorX, anchorX, anchorY, fps`；fps 为 0 时使用动作原始帧率。保存携带 `expectedRevision`；冲突返回 `REVISION_CONFLICT`。公共动作包括 idle、blink、walk、wave、eat、attack_windup、attack_release、attack、hit、skill、victory、sleep，缺失时明确回退待机。标准图集 `character.clips` 可为每个动作分别指定 fps 和 loop。

UI 共用 `ResourceStage`，传入 `resource, petId, context, action, facing, playing, motionEnabled`。可选 `playbackKey` 在真实新动作事件发生时改变，可重播同名动作而不卸载舞台；消费者需要区分本次事件与恢复的历史事件。采用方式见五行扩展契约。同资源共享 Pixi Assets 纹理来源和图集，各实例持有独立 Application、AnimatedSprite、播放帧和生命周期；销毁实例不卸载其他实例使用的纹理。帧率、锚点和动作直接更新 Pixi 对象，没有自制帧循环、裁图或动画引擎。DOM 的 `data-texture-source` 是实际 TextureSource UID，data-texture-frame 与 data-content-bounds 记录当前真实纹理区域和绘制边界供验收。内容拟合留出顶部空间，脚底基线不变，避免最大技能特效贴舞台边。

头像与领养卡的上身近景使用公共 ResourcePortrait / resolveResourcePortrait；它从同一 canonical 待机帧的实际主体区域取景，不使用带透明边距的逻辑全帧。动态桌面和战斗舞台继续全身。使用方式见 `roster-contract.md`。

主进程 `resolve(owner,{resourceId,petId,context,action,facing})` 返回资源、实际动作与独立校准副本。`resolveForPet(owner,pet)` 等待资源就绪，返回 `kind:'spritesheet',url,sheet,atlas,resource,clip,calibration,resourceRevision` 供桌面窗口适配，FPS 覆盖已应用到 clip。调用方确认 petId 属于当前账号。事务内可用无磁盘访问的 `getRecord`；异步磁盘检查在事务外调用。

`ApplyToCompanion` 通过现有 companions 列表及 appearance CAS 命令给一个真实伙伴绑定 resourceId，不复制资源或改变其他伙伴。`resources:changed` 通知页面重新读取，事件载荷不是权限凭据。

## 公共 UI 与动画

正式页拆成 ResourceLibrary、ResourceEditor、ResourceControls、ResourceStage、ApplyToCompanion 和 useResources。沿用 foundation 官方 shadcn Radix Nova 的 Tabs、Select、Slider、Switch、ScrollArea、Popover、Input 与 Button，来源及哈希见 `shadcn-source-record.json`。选择器使用 Radix Portal、键盘导航及 Esc 焦点恢复，标签页使用实际 Tabs 状态。Slider 命名 group 标明用途，公共 Slider 已将无障碍标签传给实际 thumb；范围、数值及方向键行为由 Radix 提供。已合入 foundation `7f0e896` 的公共无障碍及实时减少动画修正。

列表用公共 AnimatedList，页面用 foundation Motion for React 的 PageTransition/AppMotionProvider。Pixi 监听系统减少动画、document visibility、playing/motionEnabled 和祖先 `data-motion` 策略，关闭动画时暂停精灵和 ticker。按钮无阴影或 hover 位移。图稿 07 下半部分保留左资源库、右预览和校准结构，按最新范围改成图集、FPS、锚点与动作配置。

## 权限与数据保留

文件只经 `lingjing-resource://asset/<id>/<key>` 读取，主进程再次校验账号、文件登记、扩展名和允许目录，renderer 不接收绝对文件路径。foundation 在 ready 前注册安全协议，CSP 允许该协议加载图片及连接。舞台加载 Pixi 静态 `pixi.js/unsafe-eval` 同步实现，不为 2D 放宽一般 unsafe-eval。

账号升级只依据 `account_aliases` 已验证映射，把 canonical owner 和无歧义旧 subject ID 归到同一访问范围。旧资源、流水及偏好保持原 owner；新偏好写 canonical owner。subject 映射到不同 provider owner 时不猜测合并。完整安装及数据目录迁移通过登记资源键重新定位，不向 renderer 开放路径。

## 验收

领域检查：`node scripts/desktop/run-native-tests.cjs apps/pc-app/runtime/features/resources/verification/resources.test.cjs`，使用真实 Electron ABI SQLite、文件复制、内容哈希、CAS、账号别名及历史记录保留断言。

原生导入、校准保存、双实例、动画策略、错误回执、数据库及重启证据见 `evidence/resources/` 与 `status/resources.json`。模块验收不代替 foundation 在最终整合版本中进行的桌面多伙伴和战斗完整回归。
