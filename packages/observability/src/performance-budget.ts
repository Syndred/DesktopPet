export interface PerformanceBudget {
  apiLatencyP95Ms: number;
  battleSyncP95Ms: number;
  pcMemoryP95Mb: number;
  mobileMemoryP95Mb: number;
  crashRatePercent: number;
}

export interface PerformanceMetrics {
  apiLatencyP95Ms: number;
  battleSyncP95Ms: number;
  pcMemoryP95Mb: number;
  mobileMemoryP95Mb: number;
  crashRatePercent: number;
}

export interface BudgetViolation {
  metric: keyof PerformanceMetrics;
  actual: number;
  limit: number;
}

export function evaluatePerformanceBudget(
  metrics: PerformanceMetrics,
  budget: PerformanceBudget
): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  for (const key of Object.keys(budget) as Array<keyof PerformanceBudget>) {
    const actual = metrics[key];
    const limit = budget[key];
    if (actual > limit) {
      violations.push({ metric: key, actual, limit });
    }
  }
  return violations;
}

export function isPerformanceBudgetHealthy(
  metrics: PerformanceMetrics,
  budget: PerformanceBudget
): boolean {
  return evaluatePerformanceBudget(metrics, budget).length === 0;
}

