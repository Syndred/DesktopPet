import { describe, expect, it } from "vitest";

import { evaluateAntiCheatRisk } from "@qingpet/supabase-edge";

describe("S-03 anti-cheat behavior detection", () => {
  it("returns low risk for normal behavior", () => {
    const result = evaluateAntiCheatRisk({
      playerId: "u-normal",
      totalMatches: 30,
      wins: 15,
      actionsPerMinute: 120,
      averageDecisionMs: 460,
      perfectCounterRate: 0.25
    });

    expect(result.level).toBe("low");
    expect(result.riskScore).toBeLessThan(40);
  });

  it("returns medium/high risk for suspicious patterns", () => {
    const result = evaluateAntiCheatRisk({
      playerId: "u-sus",
      totalMatches: 40,
      wins: 38,
      actionsPerMinute: 360,
      averageDecisionMs: 95,
      perfectCounterRate: 0.88
    });

    expect(result.riskScore).toBeGreaterThanOrEqual(70);
    expect(result.level).toBe("high");
    expect(result.reasons).toContain("abnormally_high_win_rate");
    expect(result.reasons).toContain("abnormally_high_apm");
  });

  it("caps risk score at 100", () => {
    const result = evaluateAntiCheatRisk({
      playerId: "u-cap",
      totalMatches: 100,
      wins: 100,
      actionsPerMinute: 999,
      averageDecisionMs: 1,
      perfectCounterRate: 1
    });
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });
});

