import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CORE_EVENTS } from "@qingpet/shared-types";
import {
  createTrackingEvent,
  isSupportedCoreEvent,
  serializeErrorLog,
  shouldTriggerAlert,
  type AlertRule
} from "@qingpet/observability";

describe("T-004 observability baseline", () => {
  it("creates standardized tracking events", () => {
    const event = createTrackingEvent(CORE_EVENTS.BATTLE_FINISHED, {
      roomId: "r-1",
      winnerId: "u-1"
    });

    expect(event.name).toBe("battle_finished");
    expect(event.payload.roomId).toBe("r-1");
    expect(typeof event.occurredAt).toBe("string");
  });

  it("supports only whitelisted core event names", () => {
    expect(isSupportedCoreEvent("battle_room_created")).toBe(true);
    expect(isSupportedCoreEvent("unknown_event")).toBe(false);
  });

  it("redacts sensitive values in error logs", () => {
    const log = serializeErrorLog({
      module: "battle-edge",
      message: "failed for user mail test@example.com and id 123456789012",
      metadata: {
        email: "test@example.com",
        phone: "13800138000",
        requestId: "req-1"
      }
    });

    expect(log.message).toContain("***@***.***");
    expect(log.message).not.toContain("123456789012");
    expect(log.metadata.email).toBe("***");
    expect(log.metadata.phone).toBe("***");
    expect(log.metadata.requestId).toBe("req-1");
  });

  it("evaluates alert thresholds correctly", () => {
    const rule: AlertRule = {
      id: "battle-sync",
      metric: "battle_sync_p95_ms",
      threshold: 150,
      operator: "gte",
      severity: "warning"
    };

    expect(shouldTriggerAlert(rule, 149)).toBe(false);
    expect(shouldTriggerAlert(rule, 150)).toBe(true);
    expect(shouldTriggerAlert(rule, 151)).toBe(true);
  });

  it("contains required default alert rules", () => {
    const rulesJson = readFileSync(
      join(process.cwd(), "infra/observability/alert-rules.json"),
      "utf8"
    );

    expect(rulesJson).toContain("\"id\": \"api-latency-p95\"");
    expect(rulesJson).toContain("\"id\": \"battle-sync-p95\"");
    expect(rulesJson).toContain("\"id\": \"crash-rate\"");
  });
});

