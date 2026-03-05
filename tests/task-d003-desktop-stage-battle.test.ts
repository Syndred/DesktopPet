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

    expect(rendererCode).toContain("setBattleMode(true);");
    expect(rendererCode).toContain("setBattleMode(false);");
    expect(rendererCode).toContain("void window.petApi.setLayoutMode(active ? \"battle\" : \"idle\")");
    expect(rendererCode).toContain("enemyCard.classList.toggle(\"hidden\", !active)");
    expect(rendererCode).toContain("enemyHudElement.classList.toggle(\"hidden\", !active)");
    expect(rendererCode).toContain("roundFeedElement.classList.toggle(\"hidden\", !active)");
    expect(rendererCode).toContain("showBattleSettlement(round.winner)");
    expect(rendererCode).toContain("battleSettlementConfirmLog");
    expect(rendererCode).toContain("updateBattleRelationTag(");
    expect(rendererCode).toContain("updateBattleCountdown(");
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
    expect(html).toContain("id=\"btn-close-panel\" class=\"panel-close-icon\"");
    expect(html).toContain("id=\"btn-settlement-confirm\"");
    expect(html).not.toContain("class=\"battle-action\"");
    expect(html).toContain("id=\"battle-action-tags\"");
    expect(html).toContain("class=\"battle-tag\" data-action=\"normal_attack\"");
    expect(html).toContain("id=\"pet-detail-placeholder\"");
    expect(html).toContain("id=\"battle-report-list\"");

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
    expect(rendererCode).toContain("class=\"pet-avatar-item");
    expect(rendererCode).toContain("isUltimateAction && playerAnger < 100");
    expect(rendererCode).toContain("setElementTagTheme(playerElementLabel, state.player.element)");

    expect(stylesCode).toContain("grid-template-columns: repeat(6, minmax(0, 1fr))");
    expect(stylesCode).toContain("overflow-x: hidden;");
    expect(stylesCode).toContain(".battle-settlement");
    expect(stylesCode).toContain("z-index: 40");
    expect(stylesCode).toContain("min-width: 42px");
  });
});
