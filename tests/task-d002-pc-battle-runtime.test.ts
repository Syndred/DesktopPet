import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

type BattleRuntimeServiceType = new () => {
  reset: (config?: { playerElement?: string; enemyElement?: string }) => {
    round: number;
    player: {
      element: string;
      hp: number;
      anger: number;
      statuses: Array<{ type: string; stacks?: number; duration?: number }>;
    };
    enemy: {
      element: string;
      hp: number;
      anger: number;
      statuses: Array<{ type: string; stacks?: number; duration?: number }>;
    };
  };
  act: (action: string) => {
    playerAction: string;
    enemyAction: string;
    roundResult: {
      round: number;
      actions: { player: string; enemy: string };
      winner: "player" | "enemy" | "draw" | null;
      notes: string[];
      statusesAfter: { enemy: Array<{ type: string; stacks?: number; duration?: number }> };
      healEvents?: {
        player: Array<{ type: string; amount: number }>;
        enemy: Array<{ type: string; amount: number }>;
      };
    };
    state: {
      round: number;
      player: { hp: number; anger: number };
      enemy: { hp: number; anger: number };
    };
  };
};

let BattleRuntimeService: BattleRuntimeServiceType;

function mockRandomSequence(values: number[]): void {
  let idx = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    const value = values[idx] ?? values[values.length - 1] ?? 0.5;
    idx += 1;
    return value;
  });
}

describe("D-002 pc battle runtime service", () => {
  beforeAll(async () => {
    const modulePath = pathToFileURL(
      join(process.cwd(), "apps/pc-app/runtime/services/battle-runtime.cjs")
    ).href;
    const loaded = (await import(modulePath)) as { BattleRuntimeService: BattleRuntimeServiceType };
    BattleRuntimeService = loaded.BattleRuntimeService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets session with selected elements", () => {
    const service = new BattleRuntimeService();
    const state = service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    expect(state.round).toBe(0);
    expect(state.player.element).toBe("fire");
    expect(state.enemy.element).toBe("metal");
    expect(state.player.hp).toBe(120);
    expect(state.enemy.hp).toBe(120);
  });

  it("downgrades ultimate when anger is not full", () => {
    mockRandomSequence([0.99, 0.99, 0.99]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "earth",
      enemyElement: "water"
    });

    const result = service.act("ultimate");
    expect(result.playerAction).toBe("ultimate");
    expect(result.roundResult.actions.player).toBe("normal_attack");
  });

  it("applies elemental status when element attack lands", () => {
    // For element_attack:
    // 1) skip normal interrupt branch (>= 0.45), 2) dice -> element_attack (< 0.25).
    mockRandomSequence([0.9, 0.1]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    const result = service.act("element_attack");
    const burn = result.roundResult.statusesAfter.enemy.find((item) => item.type === "burn");
    expect(result.enemyAction).toBe("element_attack");
    expect(Boolean(burn)).toBe(true);
    expect(burn?.duration).toBe(1);
    expect(result.state.round).toBe(1);
  });

  it("stacks burn layers when fire element attack lands repeatedly", () => {
    // For each act with player element_attack:
    // 1) skip interrupt branch (>= 0.45), 2) dice -> element_attack (< 0.25)
    mockRandomSequence([0.9, 0.1, 0.9, 0.1]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    service.act("element_attack");
    const second = service.act("element_attack");
    const burn = second.roundResult.statusesAfter.enemy.find((item) => item.type === "burn");

    expect(second.enemyAction).toBe("element_attack");
    expect(burn).toBeTruthy();
    expect(burn?.stacks).toBe(2);
  });

  it("applies parasite drain and emits heal event to source", () => {
    // player uses wood element attack; enemy responds with element attack
    // so player first takes damage, then receives parasite heal at round end.
    mockRandomSequence([0.9, 0.1]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "wood",
      enemyElement: "metal"
    });

    const result = service.act("element_attack");
    const playerHealEvents = result.roundResult.healEvents?.player ?? [];

    expect(result.roundResult.statusesAfter.enemy.some((item) => item.type === "parasite")).toBe(true);
    expect(playerHealEvents.length).toBeGreaterThan(0);
    expect(playerHealEvents[0]?.type).toBe("parasite");
    expect(playerHealEvents[0]?.amount).toBeGreaterThan(0);
  });

  it("allows first dodge at 0 anger, then downgrades when anger remains 0", () => {
    mockRandomSequence([0.9, 0.9]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    const first = service.act("dodge");
    expect(first.playerAction).toBe("dodge");
    expect(first.roundResult.actions.player).toBe("dodge");

    const second = service.act("dodge");
    expect(second.playerAction).toBe("dodge");
    expect(second.roundResult.actions.player).toBe("normal_attack");
    expect(second.roundResult.notes).toContain("player dodge downgraded to normal_attack (anger <= 0)");
  });

  it("allows ultimate at 50 anger and consumes 50 anger", () => {
    mockRandomSequence([0.9]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    (service as unknown as { session: { player: { anger: number } } }).session.player.anger = 50;
    const result = service.act("ultimate");
    expect(result.playerAction).toBe("ultimate");
    expect(result.roundResult.actions.player).toBe("ultimate");
    expect(result.state.player.anger).toBe(0);
  });

  it("never returns draw when both pets reach 0 HP in same round", () => {
    mockRandomSequence([0.4, 0.4]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    const mutable = service as unknown as {
      session: { player: { hp: number }; enemy: { hp: number } };
    };
    mutable.session.player.hp = 10;
    mutable.session.enemy.hp = 10;

    const result = service.act("normal_attack");
    expect(result.roundResult.winner).toBe("player");
    expect(result.roundResult.winner).not.toBe("draw");
  });

  it("consumes 20 anger when player chooses dodge", () => {
    // Round 1: build up player anger to 20 via advantaged element hit.
    // Round 2: both sides dodge, so only dodge cost applies for player.
    mockRandomSequence([0.99, 0.1, 0.9]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    const firstRound = service.act("element_attack");
    const angerBeforeDodge = firstRound.state.player.anger;
    const dodgeRound = service.act("dodge");

    expect(dodgeRound.playerAction).toBe("dodge");
    expect(dodgeRound.roundResult.actions.player).toBe("dodge");
    expect(dodgeRound.roundResult.actions.enemy).toBe("dodge");
    expect(dodgeRound.state.player.anger).toBe(Math.max(0, angerBeforeDodge - 20));
  });

  it("refunds 30 anger when dodge avoids enemy normal attack", () => {
    // Round 1: build up player anger to 20.
    // Round 2: enemy picks normal attack against player dodge.
    mockRandomSequence([0.99, 0.1, 0.4]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    const firstRound = service.act("element_attack");
    const angerBeforeDodge = firstRound.state.player.anger;
    const dodgeRound = service.act("dodge");

    expect(dodgeRound.roundResult.actions.player).toBe("dodge");
    expect(dodgeRound.roundResult.actions.enemy).toBe("normal_attack");
    expect(dodgeRound.state.player.anger).toBe(Math.min(100, Math.max(0, angerBeforeDodge - 20) + 30));
    expect(dodgeRound.roundResult.notes).toContain(
      "player dodged normal attack and refunded 30 anger"
    );
  });

  it("does not refund anger when both sides dodge", () => {
    // Round 1-2: build up player anger to 40.
    // Round 3: both dodge, so only -20 applies and no refund.
    mockRandomSequence([0.99, 0.1, 0.99, 0.1, 0.9]);
    const service = new BattleRuntimeService();
    service.reset({
      playerElement: "fire",
      enemyElement: "metal"
    });

    service.act("element_attack");
    const secondRound = service.act("element_attack");
    const angerBeforeDodge = secondRound.state.player.anger;
    const dodgeRound = service.act("dodge");

    expect(dodgeRound.roundResult.actions.player).toBe("dodge");
    expect(dodgeRound.roundResult.actions.enemy).toBe("dodge");
    expect(dodgeRound.state.player.anger).toBe(Math.max(0, angerBeforeDodge - 20));
    expect(dodgeRound.roundResult.notes).not.toContain(
      "player dodged normal attack and refunded 30 anger"
    );
  });
});
