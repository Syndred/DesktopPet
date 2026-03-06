import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("D-008 pc online duel runtime bridge", () => {
  it("registers online duel ipc handlers in main process", () => {
    const mainCode = readFileSync(join(process.cwd(), "apps/pc-app/runtime/main.cjs"), "utf8");

    expect(mainCode).toContain("OnlineDuelService");
    expect(mainCode).toContain("pet:duel-online-status");
    expect(mainCode).toContain("pet:duel-online-create-room");
    expect(mainCode).toContain("pet:duel-online-join-room");
    expect(mainCode).toContain("pet:duel-online-sync-room");
    expect(mainCode).toContain("pet:duel-online-leave-room");
    expect(mainCode).toContain("pet:duel-online-reset");
    expect(mainCode).toContain("pet:duel-online-act");
    expect(mainCode).toContain("pet:duel-online-event");
  });

  it("exposes online duel apis in preload", () => {
    const preloadCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/preload.cjs"),
      "utf8"
    );

    expect(preloadCode).toContain("getOnlineDuelStatus");
    expect(preloadCode).toContain("createOnlineDuelRoom");
    expect(preloadCode).toContain("joinOnlineDuelRoom");
    expect(preloadCode).toContain("syncOnlineDuelRoom");
    expect(preloadCode).toContain("leaveOnlineDuelRoom");
    expect(preloadCode).toContain("onlineDuelReset");
    expect(preloadCode).toContain("onlineDuelAct");
    expect(preloadCode).toContain("onOnlineDuelEvent");
  });

  it("renders online duel controls and consumes online duel api in renderer", () => {
    const html = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/index.html"),
      "utf8"
    );
    const rendererCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/renderer.mjs"),
      "utf8"
    );

    expect(html).toContain("duel-online-room-code");
    expect(html).toContain("btn-duel-online-create");
    expect(html).toContain("btn-duel-online-join");
    expect(html).toContain("btn-duel-online-leave");
    expect(html).toContain("duel-online-status");

    expect(rendererCode).toContain("window.petApi.getOnlineDuelStatus");
    expect(rendererCode).toContain("window.petApi.createOnlineDuelRoom");
    expect(rendererCode).toContain("window.petApi.joinOnlineDuelRoom");
    expect(rendererCode).toContain("window.petApi.onlineDuelReset");
    expect(rendererCode).toContain("window.petApi.onlineDuelAct");
    expect(rendererCode).toContain("window.petApi.onOnlineDuelEvent");
  });

  it("configures supabase realtime ws transport for node/electron runtime", () => {
    const serviceCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/services/online-duel-service.cjs"),
      "utf8"
    );

    expect(serviceCode).toContain('require("ws")');
    expect(serviceCode).toContain("realtime: realtimeOptions");
  });
});
