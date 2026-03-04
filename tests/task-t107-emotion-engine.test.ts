import { describe, expect, it } from "vitest";

import {
  EmotionFeedbackScheduler,
  buildDailyEmotionSummary,
  buildEmotionFeedback,
  inferEmotionState,
  sanitizeBehaviorInput
} from "@qingpet/supabase-edge";

describe("T-107 emotion mirror engine", () => {
  it("sanitizes raw behavior input and strips text content", () => {
    const sanitized = sanitizeBehaviorInput({
      source: "pc",
      typingSpeedCpm: 280,
      activeMinutes: 130,
      clickFrequencyPerMin: 70,
      continuousUsageMinutes: 80,
      hourOfDay: 14,
      textSample: "private notes",
      clipboardContent: "secret"
    });

    expect(Object.prototype.hasOwnProperty.call(sanitized, "textSample")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(sanitized, "clipboardContent")).toBe(false);
    expect(sanitized.typingSpeedCpm).toBe(280);
  });

  it("maps high-pressure behavior to stressed state", () => {
    const state = inferEmotionState(
      sanitizeBehaviorInput({
        source: "pc",
        typingSpeedCpm: 450,
        clickFrequencyPerMin: 220,
        continuousUsageMinutes: 120,
        activeMinutes: 200,
        hourOfDay: 15
      })
    );

    expect(state).toBe("stressed");
    expect(buildEmotionFeedback(state).actionId).toBe("calm_breathing");
  });

  it("maps late-night long usage to tired state", () => {
    const state = inferEmotionState(
      sanitizeBehaviorInput({
        source: "mobile",
        activeMinutes: 90,
        clickFrequencyPerMin: 40,
        continuousUsageMinutes: 70,
        hourOfDay: 2
      })
    );

    expect(state).toBe("tired");
    expect(buildEmotionFeedback(state).actionId).toBe("coffee_offer");
  });

  it("throttles frequent feedback emissions", () => {
    const scheduler = new EmotionFeedbackScheduler(10 * 60 * 1000);
    const t0 = 1_000_000;

    expect(scheduler.shouldEmit(null, t0)).toBe(true);
    expect(scheduler.shouldEmit(t0, t0 + 4 * 60 * 1000)).toBe(false);
    expect(scheduler.shouldEmit(t0, t0 + 10 * 60 * 1000)).toBe(true);
  });

  it("builds daily summary with dominant state", () => {
    const summary = buildDailyEmotionSummary([
      {
        source: "pc",
        typingSpeedCpm: 260,
        activeMinutes: 120,
        clickFrequencyPerMin: 80,
        continuousUsageMinutes: 50,
        hourOfDay: 10,
        state: "focused",
        createdAt: "2026-03-04T10:00:00Z"
      },
      {
        source: "pc",
        typingSpeedCpm: 420,
        activeMinutes: 140,
        clickFrequencyPerMin: 220,
        continuousUsageMinutes: 90,
        hourOfDay: 15,
        state: "stressed",
        createdAt: "2026-03-04T15:00:00Z"
      },
      {
        source: "mobile",
        typingSpeedCpm: 0,
        activeMinutes: 20,
        clickFrequencyPerMin: 40,
        continuousUsageMinutes: 15,
        hourOfDay: 21,
        state: "focused",
        createdAt: "2026-03-04T21:00:00Z"
      }
    ]);

    expect(summary.dominantState).toBe("focused");
    expect(summary.counts.focused).toBe(2);
    expect(summary.summaryText).toContain("focused");
  });
});
