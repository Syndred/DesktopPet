# 灵境 · 桌面伙伴

This repository contains the baseline monorepo for:
1. `apps/pc-app` (Electron + React + TypeScript + Vite)
2. `apps/mobile-app` (Flutter + Unity integration placeholder)
3. `apps/supabase-edge` (Supabase edge functions and validation)
4. `packages/shared-types` (cross-platform contracts)

## Quick Start

```bash
npm install
npm run native:electron
npm run dev:pc
```

## Scripts

1. `npm run lint`
2. `npm run typecheck`
3. `npm run test`
4. `npm run verify`
5. `npm run dev:pc`

## Notes

1. Copy `.env.example` to `.env` and fill required keys.
2. Mobile app implementation is tracked in `apps/mobile-app/README.md`.
3. Runtime setup and validation guide is in `docs/runtime-config.md`.
4. Delivery-grade task plan is in `docs/project-delivery-tasks.md`.
5. `npm run build:pc && npm run start:pc` 运行编译版本；`npm run package:pc:win` 生成 Windows 便携包。
6. `npm run pc:smoke:shell` 在真实 Electron 中检查窗口、导航与安全桥，证据在 `artifacts/foundation/`。
7. 新模块通过 `docs/implementation/foundation-contract.md` 的入口自动注册。旧版入口保留为 `npm run dev:pc:legacy`。
8. 原有 JSON 存档保留，首次读取前备份为 `.before-lingjing.bak`。新增功能使用同目录的 `lingjing.sqlite`，测试通过 `PET_USER_DATA_DIR` 隔离。
