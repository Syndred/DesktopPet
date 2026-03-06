import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("D-003 desktop stage battle UX", () => {
  it("keeps desktop in solo-pet mode by default and enables dual-pet battle mode", () => {
    const html = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/index.html"),
      "utf8"
    );
    const rendererCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/renderer.mjs"),
      "utf8"
    );

    expect(html).toContain("id=\"desktop-stage\"");
    expect(html).toContain("id=\"battle-scene\"");
    expect(html).toContain("id=\"player-card\"");
    expect(html).toContain("id=\"enemy-card\" class=\"battle-actor enemy hidden");
    expect(html).toContain("id=\"battle-vs\" class=\"relation-badge hidden\"");
    expect(html).toContain("id=\"battle-countdown\" class=\"countdown-orb hidden\"");
    expect(html).toContain("id=\"capture-decision\" class=\"capture-decision no-drag hidden\"");
    expect(html).toContain("id=\"btn-capture-confirm\"");
    expect(html).toContain("id=\"btn-capture-cancel\"");
    expect(html).toContain("id=\"btn-settlement-secondary\" class=\"battle-settlement-secondary hidden\"");
    expect(html).toContain("id=\"battle-report-detail-popover\"");
    expect(html).not.toContain("id=\"panel-toggle\"");
    expect(html).toContain("id=\"battle-settlement\" class=\"battle-settlement no-drag hidden\"");
    expect(html).toContain("id=\"round-feed\" class=\"round-feed hidden\"");
    expect(html).toContain("id=\"last-round-result\" class=\"last-round-result hidden\"");
    expect(html).toContain("id=\"player-hud\" class=\"pet-hud\"");
    expect(html).toContain("id=\"enemy-hud\" class=\"pet-hud hidden\"");
    expect(html).not.toContain("id=\"hp-label-player\"");
    expect(html).not.toContain("id=\"anger-label-player\"");
    expect(html).toContain("id=\"hp-value-player\"");
    expect(html).toContain("id=\"anger-value-player\"");
    expect(html).toContain("id=\"player-hud-avatar\"");
    expect(html).toContain("id=\"player-hud-level\"");
    expect(html).toContain("id=\"enemy-hud-avatar\"");
    expect(html).toContain("id=\"enemy-hud-level\"");

    expect(rendererCode).toContain("setBattleMode(true);");
    expect(rendererCode).toContain("setBattleMode(false);");
    expect(rendererCode).toContain("void window.petApi.setLayoutMode(panelVisible ? \"panel\" : active ? \"battle\" : \"idle\")");
    expect(rendererCode).toContain("void applyIdleWindowScale(nextScale)");
    expect(rendererCode).toContain("enemyCard.classList.toggle(\"hidden\", !active)");
    expect(rendererCode).toContain("enemyHudElement.classList.toggle(\"hidden\", !active)");
    expect(rendererCode).toContain("roundFeedElement.classList.toggle(\"hidden\", !active)");
    expect(rendererCode).toContain("showBattleSettlement(round.winner)");
    expect(rendererCode).toContain("captureDecisionRequired");
    expect(rendererCode).toContain("window.petApi.resolveCapture");
    expect(rendererCode).toContain("showCaptureDecision(");
    expect(rendererCode).toContain("showCaptureDecisionSettlement(");
    expect(rendererCode).toContain("battleSettlementConfirmLog");
    expect(rendererCode).toContain("updateBattleRelationTag(");
    expect(rendererCode).toContain("updateBattleCountdown(");
    expect(rendererCode).toContain("updateBattleHudBadges(");
    expect(rendererCode).toContain("uiRefs.playerLabel.textContent = getPetDisplayName(activePet)");
    expect(rendererCode).toContain("uiRefs.enemyLabel.textContent = getPetDisplayName(enemyPetInBattle)");
  });

  it("uses panel as lightweight controller while battle actions stay on stage tags", () => {
    const html = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/index.html"),
      "utf8"
    );
    const rendererCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/renderer.mjs"),
      "utf8"
    );
    const stylesCode = readFileSync(
      join(process.cwd(), "apps/pc-app/runtime/renderer/styles.css"),
      "utf8"
    );

    expect(html).toContain("id=\"panel\"");
    expect(html).toContain("id=\"btn-battle-reset\"");
    expect(html).not.toContain("btn-close-panel");
    expect(html).toContain("id=\"btn-user-menu\"");
    expect(html).toContain("id=\"user-menu-dropdown\" class=\"user-menu-dropdown hidden\"");
    expect(html).toContain("id=\"profile-modal\" class=\"profile-modal hidden\"");
    expect(html).toContain("id=\"btn-settlement-confirm\"");
    expect(html).not.toContain("class=\"battle-action\"");
    expect(html).toContain("id=\"battle-action-tags\"");
    expect(html).toContain("class=\"battle-tag\" data-action=\"normal_attack\"");
    expect(html).toContain("id=\"pet-detail-placeholder\"");
    expect(html).toContain("id=\"pet-detail-popover\"");
    expect(html).toContain("id=\"battle-report-list\"");
    expect(html).toContain("id=\"wild-list\"");

    expect(rendererCode).toContain("if (!battleMode) {");
    expect(rendererCode).toContain("battleResetBtn.addEventListener(\"click\"");
    expect(rendererCode).toContain("setPanelVisible(false);");
    expect(rendererCode).toContain("endBattleBtn.addEventListener(\"click\"");
    expect(rendererCode).toContain("settlementConfirmBtn.addEventListener(\"click\"");
    expect(rendererCode).toContain("insideActionTags");
    expect(rendererCode).toContain("setActiveActionTag(action)");
    expect(rendererCode).toContain("spawnAttackTrail(\"player\", \"enemy\"");
    expect(rendererCode).toContain("spawnImpactBurst(\"enemy\", result.playerAction)");
    expect(rendererCode).toContain("enqueueRoundFeed(tickerMessages)");
    expect(rendererCode).toContain("window.petApi.setHitRegion(true);");
    expect(rendererCode).toContain("battleWaiting");
    expect(rendererCode).toContain("battleLastResult");
    expect(rendererCode).toContain("spawnMissPopup(\"enemy\")");
    expect(rendererCode).toContain("playerCard.addEventListener(\"contextmenu\"");
    expect(rendererCode).toContain("startActionCountdown()");
    expect(rendererCode).toContain("void actBattle(\"normal_attack\", { auto: true });");
    expect(rendererCode).toContain("void setActivePet(pet.id, { closePanel: true })");
    expect(rendererCode).toContain("syncInventoryListHeight()");
    expect(rendererCode).toContain("startCaptureBattle(");
    expect(rendererCode).toContain("class=\"pet-avatar-item");
    expect(rendererCode).toContain("pet-avatar-level-chip");
    expect(rendererCode).toContain("isUltimateAction && playerAnger < 50");
    expect(rendererCode).toContain("if (!event.ctrlKey) return;");
    expect(rendererCode).toContain("queueIdleScale(");
    expect(rendererCode).toContain("settlementActionMode === \"capture\"");
    expect(rendererCode).toContain("setElementTagTheme(playerElementLabel, playerDisplayElement)");
    expect(rendererCode).toContain("battleLevelUpLog");
    expect(rendererCode).toContain("wildCaptureReportLog");
    expect(rendererCode).toContain("battleReportCaptureSuccess");
    expect(rendererCode).toContain("setProfileModalVisible(false);");
    expect(rendererCode).toContain("toggleUserMenu()");
    expect(rendererCode).toContain("window.petApi.authUpdateProfile");

    expect(stylesCode).toContain("flex-wrap: wrap;");
    expect(stylesCode).toContain("overflow-x: hidden;");
    expect(stylesCode).toContain(".pet-detail-popover");
    expect(stylesCode).toContain("#panel::-webkit-scrollbar");
    expect(stylesCode).toContain("scrollbar-width: thin;");
    expect(stylesCode).toContain(".battle-settlement");
    expect(stylesCode).toContain("z-index: 40");
    expect(stylesCode).toContain(".capture-decision");
    expect(rendererCode).toContain("playerModel.orientation = \"0deg 0deg 0deg\";");
    expect(rendererCode).toContain("enemyModel.orientation = \"0deg 0deg 0deg\";");
    expect(rendererCode).toContain("function applyBattleView() {");
    expect(rendererCode).toContain("playerModel.cameraOrbit = `${playerAzimuth}deg ${pitch}deg auto`;");
    expect(rendererCode).toContain("enemyModel.cameraOrbit = `${enemyAzimuth}deg ${pitch}deg auto`;");
    expect(rendererCode).toContain("battleFacingOffsetDeg += deltaX * 0.45;");
    expect(rendererCode).toContain("enemyModel.cameraOrbit = \"0deg 74deg auto\";");
    expect(stylesCode).toContain("#battle-scene.panel-open {");
    expect(stylesCode).toContain("opacity: 0;");
    expect(stylesCode).toContain("top: var(--hud-top, 104px);");
    expect(rendererCode).toContain("function updateBattleHudTop()");
    expect(stylesCode).toContain("min-width: 42px");
    expect(stylesCode).toContain(".hud-badge");
    expect(stylesCode).toContain(".pet-avatar-level-chip");
  });
});
