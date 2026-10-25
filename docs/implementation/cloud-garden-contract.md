# 云端领地与菜园契约 · 2026-10-25

本模块在原 `codex/lingjing-garden` 工作树推进。原本地菜园目标已完成；这轮云端目标仍为 active。生产迁移和部署只由主协调执行。本模块未远程写入、修改原 Text Comparision 数据、切换共享源码 checkout 或触碰 04 UI/工作树。

## 可部署服务端检查点

前置：08 身份 / Auth bridge / protected save CAS 已部署；03 `20261025020719` 定位 schema 和 `20261025025641` live actor guard 已部署；02 `9497e8d` 纯成长函数已合入。02 合法领养入口现已由主协调上线，真实验收应通过 `companions-sync` 领养，不能 SQL 造宠物。

主协调审查并应用 `infra/supabase/migrations/20261025024617_lingjing_territory_authority.sql`，随后部署 `garden-sync/index.ts` 和 `territory-sync/index.ts`，均 `verify_jwt=false`。统一 `withActor/getUser/设备会话` 严格验证仍在入口执行。随函数携带 `_shared/lingjing-auth.ts`、`_shared/garden-runtime.bundle.mjs`、`_shared/battle-core.js`。bundle 没有仓库外相对导入；按 `node scripts/acceptance/cloud-territory/build-edge.mjs --check` 核对来源。迁移是 CLI 2.122.0 `migration new` 生成的新追加文件；旧 `20261025020010` 草案从未部署，已在本地以新规范文件替换，历史仍在 Git。

`garden-sync` 接受 `snapshot` 和 `command:{plant,harvest,craft,feed}`。首次 snapshot 只创建标准六块地和每种两颗种子，不创建宠物，不导入本地库存。奖励只能随可信战斗/捕捉领域提交，不再开放 renderer claimReward。

`territory-sync` 接受 `snapshot/session/locate/challenge/act/settle/garrison`。写操作携带 actionId；挑战/驻守检查世界 revision，经济提交检查完整存档及菜园 revision。服务器保存并推进战斗，客户端只能选动作。公开请求不能携带可信 owner、旧 sessionToken、胜者、奖励、battle 或 envelope。

## 原子存档和规则

唯一账号头是08的 `lingjing_saves`；`lingjing_private.commit_authority` 重建统一受保护存档。所有变更顺序为 `lock_save_owner → 领域行 → commit_authority`，同一 SQL 事务保存账号 revision、伙伴成长、库存、世界归属和不可变回执。服务端 RPC 仅 service_role 可执行，领域表启用 RLS，无 anon/authenticated 直接写权限，不增加 auth.users 权限。

仅02注册合法 `(owner,petId)`。05检查目标和未变的 petId 集合，不自行注册宠物。新 companions 模块和旧完整六表格式各自作为一个一致性单位，拒绝两份状态、残缺格式和跨 owner 行。园地操作验证其他伙伴、资源、设置、聊天和历史保持原样。

成长直接调用02 `awardBattleResult` / `applyGrowthEffect`；标准20/5 XP规则无第二份公式。战斗直接导入04批准的 `_shared/battle-core.js`，桌面分发由 `scripts/battle/build-core.mjs` 按 SHA 核验。园地 bundle 保留该核心的直接导入，不内嵌另一个战斗实现。不改04界面。

## 定位和并发

`locate` 的 `input.locationReceiptId` 对应 `territory:read` / 空 reference；`challenge` 对应 `territory:challenge` / territoryId；胜利 `settle` 对应 `territory:settle` / battle sessionId。每次使用新许可，不能复用不同用途的许可。桌面私有签名器是 `services.get('locationProofs').prove(purpose,reference)`，不接收 renderer 坐标。

05只在 SQL 事务内调用 `public.lingjing_discovery_take_location(actor,proofId,purpose,reference,'territory:'||requestHash)`；不能先 HTTP 消费许可再提交。原 action 回执在可变许可时效检查之前读回，断网后原请求可按相同 actionId/hash 恢复。OS位置和受控模拟位置保留不同来源；模拟区域使用 `qa:<scenarioId>:territory:...` 独立命名空间。

PostGIS Polygon/Point + GiST负责当前位置及区域围栏。两个当前 revision 的胜利竞争只能一方更新归属；过时挑战持久化 superseded，不能重领成长或种子。败局不占领、不推进区域 revision，不阻挡同时的合法胜利；合法完成仍沿用参与成长和两颗种子奖励，一次入账。驻守仅引用同账号现有 petId，不改变成长或独立选择。

03捕捉在其自己的 SQL 事务内调用 `runtime_territory_capture_context(owner,lat,lng,scenarioId)`，以 FOR SHARE 持有该世界区域直到捕捉奖励提交。该函数不是 HTTP 权威入口。模拟 scenario 必须显式传入，null 仅查 live 世界。捕捉的规范伙伴/奖励 fragment 由03和02生成后在其事务统一 CAS，不由05再提交一次。

## 已验证与剩余

10项本地专项通过：400种共享核心有序元素/动作对、真实 SQLite 实例身份、完整伙伴格式、02规范成长、160字符 owner、幂等/版本拒绝、真实08 identity/CAS +05非空间提交、角色拒绝、撤销回滚、库存与同一伙伴原子变化和其他受保护模块保全。两个完整 Edge 入口通过 Deno2.9.6 `check --no-config`。

这些是本地检查；PGlite未替换或模拟 PostGIS，不代表真实 Auth/空间/并发验收。实际 PostGIS应用、真实 HTTPS 独立客户端、同账号并发、双账号争夺、失败/重试、响应流中断恢复，以及桌面恢复桥仍须完成。不能将同机进程称作两个实体设备。状态详见 `status/cloud-garden.json`。

已 `git fetch origin --prune`，远端 main 仍为 `4786f97`，本工作树已包含它及主协调批准的公共检查点。官方依据：[PostGIS](https://supabase.com/docs/guides/database/extensions/postgis)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)。
