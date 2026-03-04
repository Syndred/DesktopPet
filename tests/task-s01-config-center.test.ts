import { describe, expect, it } from "vitest";

import { InMemoryConfigCenter } from "@qingpet/supabase-edge";

describe("S-01 config center and feature flags", () => {
  it("updates and reads feature flag config", () => {
    const center = new InMemoryConfigCenter();
    const cfg = center.setFlag({
      key: "battle_new_fx",
      operatorId: "op-1",
      rule: {
        enabled: true,
        rolloutPercent: 30
      }
    });

    expect(cfg.featureFlags.battle_new_fx.enabled).toBe(true);
    expect(cfg.featureFlags.battle_new_fx.rolloutPercent).toBe(30);
    expect(cfg.updatedBy).toBe("op-1");
  });

  it("always enables allowlist users even under low rollout", () => {
    const center = new InMemoryConfigCenter();
    center.setFlag({
      key: "social_guard_v2",
      operatorId: "op-2",
      rule: {
        enabled: true,
        rolloutPercent: 1,
        allowlistUserIds: ["u-special"]
      }
    });

    expect(center.isFlagEnabled("social_guard_v2", "u-special")).toBe(true);
  });

  it("uses stable bucketing for non-allowlist users", () => {
    const center = new InMemoryConfigCenter();
    center.setFlag({
      key: "core_loop_tuning",
      operatorId: "op-3",
      rule: {
        enabled: true,
        rolloutPercent: 40
      }
    });

    const first = center.isFlagEnabled("core_loop_tuning", "user-abc");
    const second = center.isFlagEnabled("core_loop_tuning", "user-abc");
    expect(first).toBe(second);
  });

  it("clamps rollout percent to [0, 100]", () => {
    const center = new InMemoryConfigCenter();
    center.setFlag({
      key: "invalid_rollout",
      operatorId: "op-4",
      rule: {
        enabled: true,
        rolloutPercent: 150
      }
    });
    const cfg = center.getConfig();
    expect(cfg.featureFlags.invalid_rollout.rolloutPercent).toBe(100);
  });
});

