import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { describe, expect, it } from "vitest";

import {
  estimateMonthlyCost,
  evaluatePerformanceBudget,
  isPerformanceBudgetHealthy,
  type CostModel,
  type MonthlyUsage,
  type PerformanceBudget,
  type PerformanceMetrics
} from "@qingpet/observability";

describe("T-303 performance and cost governance", () => {
  it("evaluates performance budget with violations", () => {
    const budget: PerformanceBudget = {
      apiLatencyP95Ms: 100,
      battleSyncP95Ms: 150,
      pcMemoryP95Mb: 150,
      mobileMemoryP95Mb: 220,
      crashRatePercent: 0.1
    };
    const metrics: PerformanceMetrics = {
      apiLatencyP95Ms: 120,
      battleSyncP95Ms: 130,
      pcMemoryP95Mb: 160,
      mobileMemoryP95Mb: 200,
      crashRatePercent: 0.09
    };

    const violations = evaluatePerformanceBudget(metrics, budget);
    expect(violations.length).toBe(2);
    expect(isPerformanceBudgetHealthy(metrics, budget)).toBe(false);
  });

  it("estimates monthly cost from model and usage", () => {
    const model: CostModel = {
      supabaseProMonthlyUsd: 25,
      mapPerThousandCallsUsd: 0.2,
      realtimePerThousandMessagesUsd: 0.02,
      alertingBaseMonthlyUsd: 5
    };
    const usage: MonthlyUsage = {
      mapCalls: 200000,
      realtimeMessages: 1000000
    };

    const cost = estimateMonthlyCost(usage, model);
    expect(cost.totalUsd).toBeGreaterThan(25);
    expect(cost.mapCostUsd).toBe(40);
    expect(cost.realtimeCostUsd).toBe(20);
  });

  it("generates weekly ops report via script", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "qp-perf-"));
    try {
      execSync("node scripts/perf/generate-weekly-report.mjs", {
        cwd: process.cwd(),
        env: {
          ...process.env,
          ROOT_DIR: process.cwd(),
          REPORT_DIR: sandbox
        },
        stdio: "pipe"
      });

      const reportPath = join(sandbox, "weekly-ops-report.json");
      expect(existsSync(reportPath)).toBe(true);
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
        budgetHealthy: boolean;
        cost: { totalUsd: number };
      };
      expect(report.budgetHealthy).toBe(true);
      expect(report.cost.totalUsd).toBeGreaterThan(0);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});

