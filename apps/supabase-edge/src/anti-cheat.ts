export interface BattleBehaviorWindow {
  playerId: string;
  totalMatches: number;
  wins: number;
  actionsPerMinute: number;
  averageDecisionMs: number;
  perfectCounterRate: number;
}

export interface AntiCheatResult {
  riskScore: number;
  level: "low" | "medium" | "high";
  reasons: string[];
}

export interface AntiCheatThresholds {
  minMatchesForWinRateCheck: number;
  suspiciousWinRate: number;
  suspiciousApm: number;
  suspiciousDecisionMs: number;
  suspiciousPerfectCounterRate: number;
}

const DEFAULT_THRESHOLDS: AntiCheatThresholds = {
  minMatchesForWinRateCheck: 20,
  suspiciousWinRate: 0.85,
  suspiciousApm: 320,
  suspiciousDecisionMs: 120,
  suspiciousPerfectCounterRate: 0.75
};

export function evaluateAntiCheatRisk(
  window: BattleBehaviorWindow,
  thresholds: Partial<AntiCheatThresholds> = {}
): AntiCheatResult {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const reasons: string[] = [];
  let score = 0;

  const winRate = window.totalMatches <= 0 ? 0 : window.wins / window.totalMatches;
  if (window.totalMatches >= t.minMatchesForWinRateCheck && winRate >= t.suspiciousWinRate) {
    reasons.push("abnormally_high_win_rate");
    score += 40;
  }

  if (window.actionsPerMinute >= t.suspiciousApm) {
    reasons.push("abnormally_high_apm");
    score += 25;
  }

  if (window.averageDecisionMs <= t.suspiciousDecisionMs) {
    reasons.push("decision_time_too_fast");
    score += 20;
  }

  if (window.perfectCounterRate >= t.suspiciousPerfectCounterRate) {
    reasons.push("abnormally_high_perfect_counter_rate");
    score += 25;
  }

  score = Math.min(100, score);
  const level = score >= 70 ? "high" : score >= 40 ? "medium" : "low";

  return {
    riskScore: score,
    level,
    reasons
  };
}

