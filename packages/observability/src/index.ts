import {
  CORE_EVENTS,
  type CoreEventName,
  type TrackingEvent
} from "@qingpet/shared-types";

export type AlertSeverity = "warning" | "critical";

export interface AlertRule {
  id: string;
  metric: string;
  threshold: number;
  severity: AlertSeverity;
  operator: "gt" | "gte";
}

export interface ErrorLogInput {
  module: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export interface ErrorLogRecord {
  module: string;
  message: string;
  stack?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export function createTrackingEvent<TPayload extends Record<string, unknown>>(
  name: CoreEventName,
  payload: TPayload,
  occurredAt = new Date()
): TrackingEvent<TPayload> {
  return {
    name,
    occurredAt: occurredAt.toISOString(),
    payload
  };
}

export function serializeErrorLog(
  input: ErrorLogInput,
  createdAt = new Date()
): ErrorLogRecord {
  return {
    module: input.module,
    message: redactSensitive(input.message),
    stack: input.stack ? redactSensitive(input.stack) : undefined,
    metadata: redactMetadata(input.metadata),
    createdAt: createdAt.toISOString()
  };
}

export function shouldTriggerAlert(rule: AlertRule, value: number): boolean {
  if (rule.operator === "gt") return value > rule.threshold;
  return value >= rule.threshold;
}

export function isSupportedCoreEvent(name: string): name is CoreEventName {
  return Object.values(CORE_EVENTS).includes(name as CoreEventName);
}

export * from "./performance-budget.js";
export * from "./cost-model.js";
export * from "./privacy-audit.js";

function redactMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> {
  if (!metadata) return {};
  const result: Record<string, unknown> = {};
  const redactedKeys = ["email", "phone", "accessToken", "refreshToken"];

  for (const [key, value] of Object.entries(metadata)) {
    if (redactedKeys.includes(key)) {
      result[key] = "***";
      continue;
    }
    result[key] = typeof value === "string" ? redactSensitive(value) : value;
  }

  return result;
}

function redactSensitive(text: string): string {
  // Minimal redaction for obvious patterns in early-stage logs.
  return text
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "***@***.***"
    )
    .replace(/\b\d{11,16}\b/g, "***");
}
