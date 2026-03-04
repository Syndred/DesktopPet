import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ensureDir, nowIso, resolvePathFromEnvOrDefault, writeJson } from "../release/_utils.mjs";

function estimateMonthlyCost(usage, model) {
  const mapCostUsd = (usage.mapCalls / 1000) * model.mapPerThousandCallsUsd;
  const realtimeCostUsd =
    (usage.realtimeMessages / 1000) * model.realtimePerThousandMessagesUsd;
  const totalUsd =
    model.supabaseProMonthlyUsd + mapCostUsd + realtimeCostUsd + model.alertingBaseMonthlyUsd;
  return {
    infraBaseUsd: model.supabaseProMonthlyUsd,
    mapCostUsd: Number(mapCostUsd.toFixed(2)),
    realtimeCostUsd: Number(realtimeCostUsd.toFixed(2)),
    alertingCostUsd: model.alertingBaseMonthlyUsd,
    totalUsd: Number(totalUsd.toFixed(2))
  };
}

function evaluateBudget(metrics, budget) {
  const violations = [];
  for (const key of Object.keys(budget)) {
    if (metrics[key] > budget[key]) {
      violations.push({
        metric: key,
        actual: metrics[key],
        limit: budget[key]
      });
    }
  }
  return violations;
}

const rootDir = resolvePathFromEnvOrDefault("ROOT_DIR", process.cwd());
const reportDir = resolvePathFromEnvOrDefault("REPORT_DIR", join(rootDir, "reports"));
ensureDir(reportDir);

const budget = JSON.parse(readFileSync(join(rootDir, "infra/performance/perf-budget.json"), "utf8"));
const metrics = JSON.parse(readFileSync(join(rootDir, "infra/performance/sample-metrics.json"), "utf8"));
const costModel = JSON.parse(readFileSync(join(rootDir, "infra/cost/cost-model.json"), "utf8"));
const usage = JSON.parse(readFileSync(join(rootDir, "infra/cost/sample-usage.json"), "utf8"));

const violations = evaluateBudget(metrics, budget);
const cost = estimateMonthlyCost(usage, costModel);

writeJson(join(reportDir, "weekly-ops-report.json"), {
  generatedAt: nowIso(),
  budgetHealthy: violations.length === 0,
  violations,
  metrics,
  budget,
  usage,
  cost
});

console.log("Weekly ops report generated:", join(reportDir, "weekly-ops-report.json"));

