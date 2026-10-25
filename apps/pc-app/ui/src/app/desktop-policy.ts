/** Ignore unchanged periodic policy broadcasts; visibility-changing inputs only. */
export function desktopPolicyFingerprint(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const policy = value as { ownerAccountId?: unknown; desktopDisplayFingerprint?: unknown; companionLimit?: unknown; fullscreen?: unknown; settings?: { desktop?: { hideInFullscreen?: unknown } } };
  if (!Number.isInteger(policy.companionLimit) || typeof policy.fullscreen !== 'boolean') return null;
  return JSON.stringify([policy.ownerAccountId, policy.companionLimit, policy.fullscreen, policy.settings?.desktop?.hideInFullscreen === true,
    typeof policy.desktopDisplayFingerprint === 'string' ? policy.desktopDisplayFingerprint : null]);
}
