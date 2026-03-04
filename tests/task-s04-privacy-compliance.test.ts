import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { auditPrivacyCompliance, createDefaultPrivacyPolicy } from "@qingpet/observability";

describe("S-04 privacy compliance", () => {
  it("passes audit for allowlisted payload and valid retention", () => {
    const policy = createDefaultPrivacyPolicy();
    const result = auditPrivacyCompliance(
      {
        telemetryPayload: {
          event_name: "battle_finished",
          timestamp: "2026-03-04T12:00:00Z",
          device_type: "pc",
          app_version: "0.1.0",
          session_id: "s-1",
          latency_ms: 88
        },
        retentionDays: 90
      },
      policy
    );

    expect(result.passed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it("fails audit for forbidden fields and retention overflow", () => {
    const policy = createDefaultPrivacyPolicy();
    const result = auditPrivacyCompliance(
      {
        telemetryPayload: {
          event_name: "emotion_feedback_triggered",
          timestamp: "2026-03-04T12:00:00Z",
          exact_gps: "31.2304,121.4737",
          chat_content: "private text"
        },
        retentionDays: 365
      },
      policy
    );

    expect(result.passed).toBe(false);
    expect(result.violations.some((x) => x.includes("forbidden_field:exact_gps"))).toBe(true);
    expect(result.violations.some((x) => x.includes("retention_exceeds_limit"))).toBe(true);
  });

  it("contains required privacy checklist sections", () => {
    const checklist = readFileSync(
      join(process.cwd(), "docs/privacy-compliance-checklist.md"),
      "utf8"
    );

    expect(checklist).toContain("数据采集");
    expect(checklist).toContain("存储与保留");
    expect(checklist).toContain("审计流程");
  });
});

