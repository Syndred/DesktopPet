# 灵境两个本地客户端的开发验证

更新于 2026-10-25。安装和正式入口见 [运行配置](runtime-config.md)。本说明只涉及同一台电脑上的两个独立进程，不能作为两台实体设备的证据。

先执行 `npm ci`、`npm run native:check` 和 `npm run build:pc`，再分别运行 scripts/desktop/start-online-a.cmd 与 start-online-b.cmd；双开包装脚本 start-online-dual.cmd 也调用同一正式构建。

A/B 使用新增的 profiles/cloud-clients/A 和 B，分别保留自己的 SQLite、deviceId 和 Windows 加密登录凭据。启动不清空会话、不共用 JSON、不读取旧 local-online-env.cmd，也不删除或迁移原 DesktopPetProfiles、用户 AppData 或任何旧存档。

普通构建自带 config/lingjing-cloud-public.json 公开配置，无需填旧 anon token 或 duel-online 名称。单独环境只能配置 LINGJING_PUBLIC_CONFIG，或 HTTPS URL 与 sb_publishable_ 公钥。服务端 secret/service role 不进入桌面配置。

登录同一个云账号用于验证跨客户端同步和冲突恢复；使用两个不同云账号才可验证好友对战的双方权限。同账号不能作为两个对战玩家。未批准的域或尚未完成的部署，以 docs/implementation/status/ 和主协调验收记录为准。

如需只检查启动路径而不创建档案，可运行 `node scripts/desktop/start-online-instance.cjs A --verify-only`。调试客户端属于独立普通云档案；若要跑模拟 QA，使用 create-scenario-profile.mjs 新建路径绑定场景，不要给这两个目录加 QA 标记。
