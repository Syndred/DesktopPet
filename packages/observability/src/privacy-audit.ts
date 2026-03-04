export interface PrivacyPolicy {
  allowedTelemetryFields: string[];
  maxRetentionDays: number;
  forbiddenFields: string[];
}

export interface PrivacyAuditInput {
  telemetryPayload: Record<string, unknown>;
  retentionDays: number;
}

export interface PrivacyAuditResult {
  passed: boolean;
  violations: string[];
}

export function auditPrivacyCompliance(
  input: PrivacyAuditInput,
  policy: PrivacyPolicy
): PrivacyAuditResult {
  const violations: string[] = [];
  const payloadKeys = Object.keys(input.telemetryPayload);

  for (const key of payloadKeys) {
    if (policy.forbiddenFields.includes(key)) {
      violations.push(`forbidden_field:${key}`);
    }
    if (!policy.allowedTelemetryFields.includes(key)) {
      violations.push(`not_allowlisted_field:${key}`);
    }
  }

  if (input.retentionDays > policy.maxRetentionDays) {
    violations.push(
      `retention_exceeds_limit:${input.retentionDays}>${policy.maxRetentionDays}`
    );
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

export function createDefaultPrivacyPolicy(): PrivacyPolicy {
  return {
    allowedTelemetryFields: [
      "event_name",
      "timestamp",
      "device_type",
      "app_version",
      "session_id",
      "feature_flag_state",
      "latency_ms"
    ],
    maxRetentionDays: 180,
    forbiddenFields: ["email", "phone", "id_card", "exact_gps", "chat_content"]
  };
}

