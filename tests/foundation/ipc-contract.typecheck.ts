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
  void bridge.call('resources', 'cloudStatus').then(result => {
    if (!result.ok) return;
    const enabled: boolean = result.data.enabled; void enabled;
    const mode: 'live' | 'simulated' = result.data.dataMode; void mode;
  });
  void bridge.call('resources', 'history').then(result => {
    if (!result.ok) return;
    result.data.forEach(resource => { const archiveOnly: true = resource.archiveOnly; void archiveOnly; });
  });
  void bridge.call('resources', 'cloudSync', { actionId: 'resource-upload-once', resourceIds: ['private-resource'] }).then(result => {
    if (!result.ok || !('verified' in result.data)) return;
    result.data.verified.forEach(receipt => { const resourceId: string = receipt.resourceId; void resourceId; });
  });
  void bridge.call('resources', 'cloudPull');
  void bridge.call('resources', 'cloudPull', { offset: 10, limit: 20 });
  void bridge.call('resources', 'import');
  // @ts-expect-error Feature and command must belong to the same domain.
  void bridge.call('accounts', 'rename', { petId: 'existing-pet' });
  // @ts-expect-error A required pet ID cannot be omitted.
  void bridge.call('companions', 'get');
  // @ts-expect-error Resource actions use the canonical public action union.
  void bridge.call('resources', 'resolve', { petId: 'existing-pet', resourceId: 'appearance', action: 'fly' });
  // @ts-expect-error Snapshot request IDs must be strings.
  void bridge.call('battle', 'snapshot', { sessionId: 123 });
  // @ts-expect-error Uploads require an idempotent action ID.
  void bridge.call('resources', 'cloudSync');
  // @ts-expect-error Renderer cannot supply a cloud owner through the typed API.
  void bridge.call('resources', 'cloudSync', { actionId: 'upload', ownerAccountId: 'foreign-owner' });
  // @ts-expect-error Resource download offsets are numeric.
  void bridge.call('resources', 'cloudPull', { offset: '10' });
  // @ts-expect-error assetUrl is a synchronous renderer helper, not an IPC command.
  void bridge.call('resources', 'assetUrl', { resourceId: 'private-resource', assetKey: 'image.png' });
  // @ts-expect-error The native dialog command uses the registered IPC name.
  void bridge.call('resources', 'importResource');
}
