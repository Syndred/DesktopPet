export interface CostModel {
  supabaseProMonthlyUsd: number;
  mapPerThousandCallsUsd: number;
  realtimePerThousandMessagesUsd: number;
  alertingBaseMonthlyUsd: number;
}

export interface MonthlyUsage {
  mapCalls: number;
  realtimeMessages: number;
}

export interface CostEstimate {
  infraBaseUsd: number;
  mapCostUsd: number;
  realtimeCostUsd: number;
  alertingCostUsd: number;
  totalUsd: number;
}

export function estimateMonthlyCost(
  usage: MonthlyUsage,
  model: CostModel
): CostEstimate {
  const mapCostUsd = (usage.mapCalls / 1000) * model.mapPerThousandCallsUsd;
  const realtimeCostUsd =
    (usage.realtimeMessages / 1000) * model.realtimePerThousandMessagesUsd;
  const infraBaseUsd = model.supabaseProMonthlyUsd;
  const alertingCostUsd = model.alertingBaseMonthlyUsd;
  const totalUsd = Number(
    (infraBaseUsd + mapCostUsd + realtimeCostUsd + alertingCostUsd).toFixed(2)
  );

  return {
    infraBaseUsd,
    mapCostUsd: Number(mapCostUsd.toFixed(2)),
    realtimeCostUsd: Number(realtimeCostUsd.toFixed(2)),
    alertingCostUsd,
    totalUsd
  };
}

