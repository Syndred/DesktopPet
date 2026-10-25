import type { AppBridge } from '../../packages/shared-types/src/app';

/** Compile-time public API checks; no runtime renderer or credentials required. */
export function checkIpcContract(bridge: AppBridge) {
  void bridge.call('companions', 'get', { petId: 'existing-pet' }).then(result => {
    if (!result.ok) return;
    const id: string = result.data.petId; void id;
    // @ts-expect-error A typed pet ID cannot become a numeric ID.
    const wrong: number = result.data.petId; void wrong;
  });
  void bridge.call('companions', 'adopt', { actionId: 'adopt-once', templateId: 'big-fish-gentle', name: '已有伙伴', showOnDesktop: false });
  void bridge.call('accounts', 'session');
  void bridge.call('resources', 'resolve', { petId: 'existing-pet', resourceId: 'builtin:lingjing-yuwan-v2', action: 'walk' });
  // @ts-expect-error Feature and command must belong to the same domain.
  void bridge.call('accounts', 'rename', { petId: 'existing-pet' });
  // @ts-expect-error A required pet ID cannot be omitted.
  void bridge.call('companions', 'get');
  // @ts-expect-error Resource actions use the canonical public action union.
  void bridge.call('resources', 'resolve', { petId: 'existing-pet', resourceId: 'appearance', action: 'fly' });
  // @ts-expect-error Snapshot request IDs must be strings.
  void bridge.call('battle', 'snapshot', { sessionId: 123 });
}
