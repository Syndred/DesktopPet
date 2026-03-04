import { createHash } from "node:crypto";

export interface FeatureFlagRule {
  enabled: boolean;
  rolloutPercent: number;
  allowlistUserIds?: string[];
}

export interface RuntimeConfig {
  featureFlags: Record<string, FeatureFlagRule>;
  updatedAt: string;
  updatedBy: string;
}

const DEFAULT_RULE: FeatureFlagRule = {
  enabled: false,
  rolloutPercent: 0
};

export class InMemoryConfigCenter {
  private config: RuntimeConfig = {
    featureFlags: {},
    updatedAt: new Date().toISOString(),
    updatedBy: "system"
  };

  setFlag(input: {
    key: string;
    rule: Partial<FeatureFlagRule>;
    operatorId: string;
  }): RuntimeConfig {
    const prev = this.config.featureFlags[input.key] ?? DEFAULT_RULE;
    const next: FeatureFlagRule = {
      enabled: input.rule.enabled ?? prev.enabled,
      rolloutPercent: clampRollout(input.rule.rolloutPercent ?? prev.rolloutPercent),
      allowlistUserIds: input.rule.allowlistUserIds ?? prev.allowlistUserIds
    };

    this.config = {
      ...this.config,
      updatedAt: new Date().toISOString(),
      updatedBy: input.operatorId,
      featureFlags: {
        ...this.config.featureFlags,
        [input.key]: next
      }
    };
    return this.getConfig();
  }

  getConfig(): RuntimeConfig {
    return {
      updatedAt: this.config.updatedAt,
      updatedBy: this.config.updatedBy,
      featureFlags: JSON.parse(JSON.stringify(this.config.featureFlags))
    };
  }

  isFlagEnabled(flagKey: string, userId: string): boolean {
    const rule = this.config.featureFlags[flagKey] ?? DEFAULT_RULE;
    if (!rule.enabled) return false;

    if (rule.allowlistUserIds?.includes(userId)) return true;
    if (rule.rolloutPercent <= 0) return false;
    if (rule.rolloutPercent >= 100) return true;

    const bucket = stableBucket(userId, flagKey);
    return bucket < rule.rolloutPercent;
  }
}

function stableBucket(userId: string, key: string): number {
  const hash = createHash("sha256").update(`${key}:${userId}`).digest("hex");
  const prefix = hash.slice(0, 8);
  const asNumber = Number.parseInt(prefix, 16);
  return asNumber % 100;
}

function clampRollout(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

