import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("D-001 pc runnable runtime", () => {
  it("provides dev and start scripts for desktop app", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts["dev:pc"]).toBe(
      "node scripts/desktop/run-electron.cjs apps/pc-app/runtime"
    );
    expect(pkg.scripts["start:pc"]).toBe(
      "node scripts/desktop/run-electron.cjs apps/pc-app/runtime"
    );
    expect(pkg.scripts["pc:smoke"]).toBe("node scripts/smoke/check-pc-runtime.mjs");
  });

  it("configures transparent frameless window and tray in main process", () => {
    const mainCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/main.cjs"),
      "utf8"
    );

    expect(mainCode).toContain("transparent: true");
    expect(mainCode).toContain("frame: false");
    expect(mainCode).toContain("new Tray(");
    expect(mainCode).toContain("pet:set-hit-region");
    expect(mainCode).toContain("pet:battle-reset");
    expect(mainCode).toContain("pet:battle-act");
    expect(mainCode).toContain("pet:set-layout-mode");
    expect(mainCode).toContain("pet:get-inventory");
    expect(mainCode).toContain("pet:set-active-pet");
    expect(mainCode).toContain("pet:get-battle-reports");
    expect(mainCode).toContain("pet-runtime-data.json");
    expect(mainCode).toContain("RuntimeDataStore");
  });

  it("includes renderer entry and control panel actions", () => {
    const html = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/index.html"),
      "utf8"
    );
    const rendererCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/renderer.mjs"),
      "utf8"
    );

    expect(html).toContain("btn-capture");
    expect(html).toContain("btn-occupy");
    expect(html).toContain("btn-battle-reset");
    expect(html).toContain("battle-action-tags");
    expect(html).not.toContain("class=\"battle-action\"");
    expect(html).toContain("model-viewer");
    expect(html).toContain("btn-language");
    expect(html).toContain("pet-inventory-list");
    expect(html).toContain("pet-detail-placeholder");
    expect(html).toContain("battle-report-list");
    expect(html).toContain("battle-report-title");
    expect(html).toContain("hp-fill-player");
    expect(html).toContain("anger-fill-enemy");
    expect(html).toContain("Fox.glb");
    expect(html).toContain("CesiumMan.glb");
    expect(html).toContain("desktop-stage");
    expect(html).toContain("btn-end-battle");
    expect(html).toContain("btn-close-panel");
    expect(html).toContain("battle-settlement");
    expect(html).toContain("battle-countdown");
    expect(html).not.toContain("panel-toggle");
    expect(html).toContain("enemy-card\" class=\"battle-actor enemy hidden");
    expect(rendererCode).toContain("window.petApi.getRuntimeInfo()");
    expect(rendererCode).toContain("window.petApi.setHitRegion");
    expect(rendererCode).toContain("window.petApi.battleAct");
    expect(rendererCode).toContain("window.petApi.getPetInventory()");
    expect(rendererCode).toContain("window.petApi.setActivePet");
    expect(rendererCode).toContain("window.petApi.getBattleReports");
    expect(rendererCode).toContain("loadInventorySnapshot()");
    expect(rendererCode).toContain("refreshBattleReports()");
    expect(rendererCode).toContain("insideInteractiveRegion");
    expect(rendererCode).toContain("panelElement.getBoundingClientRect()");
    expect(rendererCode).toContain("localStorage.getItem");
    expect(rendererCode).toContain("const i18n =");
    expect(rendererCode).toContain("let selectedPetDetailId = null");
    expect(rendererCode).toContain("if (!selectedPetDetailId)");
    expect(rendererCode).toContain("showBattleSettlement(winner)");
    expect(rendererCode).toContain("battleSettlementConfirmLog");
    expect(rendererCode).toContain("updateBattleRelationTag(");
    expect(rendererCode).toContain("updateBattleCountdown(");
    expect(rendererCode).toContain("void setActivePet(pet.id, { closePanel: true })");
  });

  it("ships multiple local GLB models for pet inventory", () => {
    const modelDir = join(process.cwd(), "apps/pc-app/runtime/assets/models");
    const glbFiles = readdirSync(modelDir).filter((name) => name.toLowerCase().endsWith(".glb"));

    expect(glbFiles.length).toBeGreaterThanOrEqual(6);
    expect(glbFiles).toContain("Fox.glb");
    expect(glbFiles).toContain("CesiumMan.glb");
    expect(glbFiles).toContain("Astronaut.glb");
    expect(glbFiles).toContain("Horse.glb");
    expect(glbFiles).toContain("NeilArmstrong.glb");
    expect(glbFiles).toContain("RobotExpressive.glb");
  });
});
