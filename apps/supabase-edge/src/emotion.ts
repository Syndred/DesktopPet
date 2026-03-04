export type EmotionSource = "pc" | "mobile";
export type EmotionState = "calm" | "focused" | "stressed" | "tired" | "lonely";

export interface RawBehaviorInput {
  source: EmotionSource;
  typingSpeedCpm?: number;
  activeMinutes?: number;
  clickFrequencyPerMin?: number;
  continuousUsageMinutes?: number;
  hourOfDay: number;
  textSample?: string;
  clipboardContent?: string;
}

export interface SanitizedBehaviorInput {
  source: EmotionSource;
  typingSpeedCpm: number;
  activeMinutes: number;
  clickFrequencyPerMin: number;
  continuousUsageMinutes: number;
  hourOfDay: number;
}

export interface EmotionFeedback {
  state: EmotionState;
  actionId:
    | "idle_companion"
    | "coffee_offer"
    | "calm_breathing"
    | "focus_guard"
    | "gentle_wave";
  summary: string;
}

export interface EmotionSnapshot extends SanitizedBehaviorInput {
  state: EmotionState;
  createdAt: string;
}

export function sanitizeBehaviorInput(input: RawBehaviorInput): SanitizedBehaviorInput {
  return {
    source: input.source,
    typingSpeedCpm: clamp(input.typingSpeedCpm ?? 0, 0, 800),
    activeMinutes: clamp(input.activeMinutes ?? 0, 0, 24 * 60),
    clickFrequencyPerMin: clamp(input.clickFrequencyPerMin ?? 0, 0, 1200),
    continuousUsageMinutes: clamp(input.continuousUsageMinutes ?? 0, 0, 24 * 60),
    hourOfDay: clamp(input.hourOfDay, 0, 23)
  };
}

export function inferEmotionState(input: SanitizedBehaviorInput): EmotionState {
  if (input.hourOfDay >= 0 && input.hourOfDay <= 5 && input.continuousUsageMinutes >= 45) {
    return "tired";
  }

  if (
    input.clickFrequencyPerMin >= 180 ||
    (input.typingSpeedCpm >= 420 && input.continuousUsageMinutes >= 90)
  ) {
    return "stressed";
  }

  if (input.typingSpeedCpm >= 260 && input.clickFrequencyPerMin <= 120) {
    return "focused";
  }

  if (input.activeMinutes <= 15) {
    return "lonely";
  }

  return "calm";
}

export function buildEmotionFeedback(state: EmotionState): EmotionFeedback {
  if (state === "tired") {
    return {
      state,
      actionId: "coffee_offer",
      summary: "检测到你有点熬夜，给你一杯虚拟咖啡。"
    };
  }

  if (state === "stressed") {
    return {
      state,
      actionId: "calm_breathing",
      summary: "节奏有点快，宠物进入安抚呼吸陪伴。"
    };
  }

  if (state === "focused") {
    return {
      state,
      actionId: "focus_guard",
      summary: "你正专注，宠物切换为静默护航模式。"
    };
  }

  if (state === "lonely") {
    return {
      state,
      actionId: "gentle_wave",
      summary: "有点安静，宠物轻轻和你打个招呼。"
    };
  }

  return {
    state: "calm",
    actionId: "idle_companion",
    summary: "状态平稳，宠物保持低打扰陪伴。"
  };
}

export class EmotionFeedbackScheduler {
  constructor(private readonly minIntervalMs = 20 * 60 * 1000) {}

  shouldEmit(lastEmitAtMs: number | null, nowMs: number): boolean {
    if (lastEmitAtMs === null) return true;
    return nowMs - lastEmitAtMs >= this.minIntervalMs;
  }
}

export function buildDailyEmotionSummary(snapshots: EmotionSnapshot[]): {
  dominantState: EmotionState;
  counts: Record<EmotionState, number>;
  summaryText: string;
} {
  const counts: Record<EmotionState, number> = {
    calm: 0,
    focused: 0,
    stressed: 0,
    tired: 0,
    lonely: 0
  };

  for (const snapshot of snapshots) {
    counts[snapshot.state] += 1;
  }

  const dominantState = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    "calm") as EmotionState;

  const summaryText = `今日主要状态：${dominantState}，记录数：${snapshots.length}。`;
  return {
    dominantState,
    counts,
    summaryText
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

