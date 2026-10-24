# 角色资源模块 v1

入口：`ui/src/features/resources/index.tsx` 与 `runtime/features/resources/index.cjs`。模块按 foundation v1 自动注册；只使用注入的同一 SQLite 连接。

`resources:list/import/save/resolve/migrate-legacy-calibration` 均经已验证账号调用。导入文件由主进程原生选择器获取，renderer 不能传入文件路径或 owner。保存需携带 `expectedRevision`；冲突返回 `REVISION_CONFLICT`，不覆盖另一窗口设置。

资源 ID 指共享形象，petId 指独立伙伴；companions 保存 resourceId，不复制模型库。事务内校验可以使用 `services.get('resources').getRecord(ownerAccountId, resourceId)`，旧形象路径可由同步 `resolveLegacyReference(ownerAccountId, legacyModel)` 映射；两者不访问磁盘、不启动其他事务。磁盘状态检查 `get/list/resolve` 是异步操作，应放在事务之外。调用方负责确认 petId 属于当前账号。

UI 共用 `ResourceStage`，传入 `resource, petId, context: 'desktop'|'battle', action, facing, playing`。PixiJS 共享 Assets 纹理来源，各实例的 AnimatedSprite、帧、ticker、动作和生命周期独立。销毁实例不卸载其他实例正在使用的纹理。model-viewer 保留原有 3D 渲染能力，不添加另一套 Three.js 场景。

companions 原生窗口适配可调用 `resolveForPet(ownerAccountId, pet)`，返回既有窗口所需的 `kind,url,sheet,clip,calibration,resourceRevision`；URL 仍使用安全协议，不返回 file 路径。该方法等待首次资源扫描完成。

主进程 `resolve(ownerAccountId,{resourceId,petId,context,action,facing})` 返回相同资源描述、独立校准副本和实际动画选择。动作 `idle/walk/attack/hit/skill/victory/sleep` 未提供时回退映射待机或首个动画；无动画的模型显示静态姿势。两场景分别保存大小、朝向、俯仰、垂直偏移和水平翻转；每个账号的内置形象校准也分别保存。

`resources:changed` 事件提供 ownerAccountId、resourceId、revision，供已登录的伙伴和战斗页面重新读取；不要把事件载荷当成账号验证。所有文件通过 `lingjing-resource://asset/<id>/<key>` 读取，主进程再次核对账号、文件登记和允许目录。绝对路径不返回 renderer。

公共接线由 foundation 完成：在 app.ready 前调用 `registerResourceScheme(protocol)`；CSP 的 `img-src/media-src/connect-src` 允许 `lingjing-resource:`，`connect-src` 还需 `blob:` 以读取 GLTFLoader 的内嵌贴图，`script-src` 需 `'wasm-unsafe-eval'` 供 model-viewer 自带解码器初始化。**不需要**一般 `'unsafe-eval'`；资源舞台使用 PixiJS 的静态同步 polyfill。

2D 包选择解压目录内的 JSON 描述，不直接读取 ZIP。示例及原创素材在 `runtime/features/resources/assets/fat-fish/character.json`。格式为 `format: 'lingjing.character', version: 1, kind: 'spritesheet'`，附 `name,image,sheet:{width,height,columns,rows},clips:{name:{frames,fps,loop}},actions,calibration,provenance:{author,source,license,licenseUrl,attribution}`。精灵图支持 PNG/WebP，必须与网格尺寸一致。3D 包可改为 `kind:'model3d',model:'subdirectory/model.gltf'`，相对缓冲区与贴图会一起复制。也可直接导入 GLB/GLTF。

导入限制：单文件 128 MiB，包总量 256 MiB，最多 128 文件；JSON 4 MiB；精灵图 1600 万像素、单边 8192；动画 1–60 fps。禁止绝对路径、上级目录、编码路径、网络 URI 和指向包外的符号链接。文件先完整解析，成功后写入独立 UUID 目录及导入流水；同内容重试保留资源 ID，新增导入记录，补回缺失的托管副本。

已有 17 个 GLB 与 catalog.json 只读，台账已登记的作者/许可沿用为 recorded，不宣称重新核验授权；未知素材显示 unverified。原创鱼素材附 SVG、生成代码和独立权属说明。旧 localStorage 校准键 `qp_model_view_calibration_v3` 只读迁入当前账号尚未自定义的形象，原键保留。旧 JSON 账号、宠物、历史和用户原始资源不会被删除或重写。

账号升级兼容读取仅依据 `account_aliases` 的已验证映射，将当前 canonical owner 与无歧义的旧 subject ID 归为同一资源访问范围。旧资源、导入流水和旧校准行保持原样；新保存使用 canonical owner，版本冲突检查仍适用。同一个 subject ID 如映射到多个 provider 的不同 owner，不会猜测归属或跨账号合并。

参考实现文档：[PixiJS 纹理](https://pixijs.com/8.x/guides/components/textures)、[model-viewer API](https://modelviewer.dev/docs/)。渲染器代码许可与角色素材许可分开记录。
