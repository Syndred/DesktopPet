# QA014 好友房间编号只读接口

本变更是第 24 个候选增量迁移，当前清单保持 23 个已部署版本，新增文件仅列入 `pendingReviewFiles`。它不代表云端部署或真实登录验收完成。迁移由 Supabase CLI `migration new lingjing_battle_serial_views --workdir infra` 创建。总协调负责实际部署、账本对齐和真实账号验收。

## SQL 与鉴权

`public.lingjing_battle_serial_views(p_actor jsonb, p_room_ids uuid[]) RETURNS jsonb` 是 STABLE、SECURITY INVOKER、空 search_path，只有 service_role 有执行权。每批接受 1–20 个唯一、非空 UUID；结果按请求顺序返回。未知房间、非成员、仅受邀、room 与 member 的身份不一致，整批统一拒绝 `LJ_ROOM_FORBIDDEN`。已结束房间的原成员保留查询权，`active=false` 不影响历史报告。

新的 `lingjing_private.global_serial_read_actor_namespace(p_actor jsonb) RETURNS text` 是 STABLE、SECURITY DEFINER、空 search_path，只有 service_role 可调用；可供后续领地只读接口复用。它逐项验证 actor 格式、active canonical owner/Auth UID、非匿名 Auth 用户、真实 session 的 UID 与 not_after、不可变撤销账本及 device/SID 绑定。它按整个账号的 QA 墓碑和当前设备有效 grant 返回 `live` 或 `qa:<scenario>`；过期、删除或缺失授权拒绝，不能回落 live；多个历史 scope 或授权冲突拒绝。不会扩展 service_role 对 Auth 表的权限。

两函数仅用 SELECT，支持 `BEGIN READ ONLY`，不会调用写入式 actor guard、allocator、owned 注册或 backfill。鉴权和数据读取共享当前语句的 MVCC 快照；此只读接口不承诺写事务行锁的撤销串行化。有效期使用 `statement_timestamp()`，不能以旧事务开始时间延长会话或 grant。

每侧 owner、Auth UID、petId 都从服务器保存的 room/member 交叉绑定，再按 owner+petId 读取不可变 sidecar。peer 必须属于同一服务器 scope，且 canonical account 仍 active。读取不要求离线 peer 的现行 session。未登记、不同 scope 或不完整绑定都省略该 participant，UI 显示待同步，不捏造编号。不读取历史 room/report JSON 中的自带号码，不回传 Auth UID、device、session、凭据或其他账号的 registry。

## Edge 与客户端契约

`op=get_display_metadata` 只接受 `{op, roomIds}`，由现有 `withActor` 的真实调用者授权，不接受 owner、pet 或目标 actor。房间 ID 在 Edge 归一为小写并检查唯一性。这是独立纯读操作，不触发回合解决或结算；权限、会话与 scope 失败严格返回对应错误。

成功的 `data`：

```json
{
  "format": "lingjing.battle.serial-views",
  "version": 1,
  "ownerAccountId": "caller-canonical-owner",
  "namespace": "live",
  "rooms": [{
    "roomId": "server-room-uuid",
    "roomRevision": "9007199254740993",
    "participants": [{
      "side": "host",
      "ownerAccountId": "server-side-owner",
      "petId": "original-pet-id",
      "templateId": "animal-wood-deer",
      "globalSerial": "900719925474099312345678901234567890"
    }]
  }]
}
```

roomRevision 和 globalSerial 均直接在 SQL 转 text，客户端不得转 Number。participants 最多 host/guest 两项；缺号、空 guest 为无对应项。客户端应验证 caller、room、side、owner、petId 绑定，并用独立 view/cache 投影，不写回 session/report/store/receipt。

现有 room snapshot 与 claim settlement 仅增加独立的 `data.displayMetadata` sibling。显示读取失败则该 sibling 为 null，原操作保持成功；原 room、receipt、command input/result/hash、对局协议与规则都不变。专用批量读取用于历史报告，客户端每批最多 20 个并限制请求并发。

## 本地验证

以下均为本地 PostgreSQL/WASM 或明确标注的 scripted Edge 夹具，不代表真实 Auth、云端并发或原生窗口证据：

- `node --test apps/pc-app/runtime/features/battle/tests/serial-views-sql.test.mjs`：原表/JSON/counter 保留、READ ONLY、ACL、同 petId 不同 owner、大整数、历史成员、有界批量、整批拒绝、缺号、跨 scope、匿名/撤销/过期/新设备/多 scope。
- Deno 使用 `--no-config --node-modules-dir=none --lock=infra/supabase/functions/_shared/deno.lock --frozen` 检查并运行 `handler.test.ts` 与 `serial-views.test.ts`：专用读入口不进入写路径；原 leave replay/settlement 成功且 metadata 失败时 HTTP 成功、原 receipt/命令 JSON 与 hash 不变。
- `node scripts/battle/build-cloud.mjs --check`、迁移名称门禁和迁移提升夹具。新测试已接入 `scripts/cloud/verify-source.mjs`，本分支只运行相关检查；最终整体验证由总协调执行。

本变更只覆盖好友 canonical rooms。领地接口另行依赖这个 private 纯读 helper，不扩展本 RPC 的授权范围。
