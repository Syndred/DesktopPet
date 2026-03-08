# 灵境模型来源与导入规范

更新时间：2026-03-08

补充：高质量候选清单见 `docs/high-quality-model-candidates.md`（先确认候选，再替换默认阵容）。

## 1. 结论先说

1. 可以接入更精美模型（包含 Sketchfab 资源）。
2. 不能“直接抓取就商用”，必须逐个确认授权协议、是否允许改编、是否允许商用、是否要求署名。
3. 建议先建立“模型白名单清单”，再进入项目资源目录，避免后续合规风险。

## 1.1 本次已接入（候选模型包，非默认）

以下模型已导入项目作为候选展示包（Poly by Google 系列）：

1. Beagle  
   - 来源：`https://poly.pizza/m/0BnDT3T1wTE`  
   - 本地文件：`apps/pc-app/runtime/assets/models/BeaglePoly.glb`
2. Puppy  
   - 来源：`https://poly.pizza/m/3nFLBC3aXen`  
   - 本地文件：`apps/pc-app/runtime/assets/models/PuppyPoly.glb`
3. Poodle  
   - 来源：`https://poly.pizza/m/eQmBaLcGbbE`  
   - 本地文件：`apps/pc-app/runtime/assets/models/PoodlePoly.glb`
4. Cat  
   - 来源：`https://poly.pizza/m/6dM1J6f6pm9`  
   - 本地文件：`apps/pc-app/runtime/assets/models/CatPoly.glb`
5. Kitten  
   - 来源：`https://poly.pizza/m/dBJgGEu5bHW`  
   - 本地文件：`apps/pc-app/runtime/assets/models/KittenPoly.glb`
6. Husky（保留）  
   - 来源：`https://poly.pizza/m/wcWiuEqwzq`  
   - 本地文件：`apps/pc-app/runtime/assets/models/Husky.glb`

当前默认阵容说明：
1. 默认阵容已切换为 `方案F`：`AnimatedDogShibaInu / AnAnimatedCat / TuxedoCatAnimated / MarcelPrizePug`。  
2. 上述 4 个文件已替换为真实 Sketchfab 模型（`1K` 质量档，含动画）。  
3. 完整来源与导入状态清单见 `apps/pc-app/runtime/assets/models/catalog.json`。

## 1.2 CC-BY 署名建议文本（内测包可直接复用）

1. Beagle / Puppy / Poodle / Cat / Kitten  
   - Creator: `Poly by Google`  
   - Source: `https://poly.pizza`（对应模型链接见上方）  
   - License: `CC-BY 3.0`（`https://creativecommons.org/licenses/by/3.0/`）

## 2. 合规检查清单（每个模型都要过）

1. 来源平台：例如 Sketchfab、Poly Pizza、Kenney。
2. 授权协议：CC-BY、CC0、Royalty Free、平台专有授权等。
3. 商用许可：是否允许商用。
4. 二次编辑：是否允许改材质、改贴图、改骨骼、转 GLB。
5. 署名要求：是否必须在游戏内/官网写明作者和链接。
6. 分发限制：是否允许随客户端一起分发原始资源。

## 3. 技术验收标准（桌宠场景）

1. 格式：优先 `glb`。
2. 单模型包体：建议 <= `8MB`（内测阶段）。
3. 面数：建议 <= `50k triangles`。
4. 贴图：优先 `1024` 或 `2048`，避免 `4k` 贴图堆积。
5. 动画：至少包含 idle；可选 attack/hit。
6. 原点与朝向：统一导入后修正，保证对战镜头下方向一致。

## 4. 建议的项目落地方式

1. 原始资源放到“外部素材仓”（不直接进主仓库）。
2. 通过导入脚本转成项目标准命名后再入库。
3. 在清单文件中记录来源、授权、作者、版本、导入日期。
4. 每次新增模型都跑一次对战视角冒烟：
   - idle 展示
   - 对战左右朝向
   - 元素染色可见性

## 5. 推荐目录结构（后续可扩展）

1. 运行时模型目录：`apps/pc-app/runtime/assets/models/`
2. 模型清单文档：`docs/model-sourcing-and-import.md`
3. 可选新增（建议后续加）：
   - `apps/pc-app/runtime/assets/models/catalog.json`（模型元数据）
   - `tools/model-import/`（导入与校验脚本）

## 6. 与 Sketchfab 集合接入建议

1. 先挑 5-10 个明确可商用且允许改编的模型做首批。
2. 每个模型保存以下字段：
   - 名称
   - 作者
   - 源链接
   - 协议
   - 是否要求署名
   - 导入版本号
3. 首批上线优先保证“风格统一 + 性能稳定”，不要一次性塞太多模型。

## 7. 你现在可直接执行的动作

1. 先给我一份目标模型链接清单（10 个以内）。
2. 我按上面清单帮你做“可用/不可用”判定。
3. 通过后我再批量导入、命名、挂载到灵宠目录并给出归属说明。
