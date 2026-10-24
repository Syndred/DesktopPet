import type { ResourcesClient, ResourceResult } from '../../../../../../packages/shared-types/src/features/resources';

type BridgeResult<T> = { ok: true; data: T; revision?: number } | { ok: false; code: string; message: string; error?: { code: string; message: string } };
interface Bridge { invoke<T>(feature: 'resources', command: string, payload?: unknown): Promise<BridgeResult<T>> }
export function resourceAssetUrl(resourceId: string, key: string): string {
  return `lingjing-resource://asset/${encodeURIComponent(resourceId)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}
async function invoke<T>(command: string, payload?: unknown): Promise<ResourceResult<T>> {
  const bridge = (window as unknown as { lingjing?: Bridge }).lingjing;
  if (!bridge) return { ok: false, error: { code: 'DESKTOP_REQUIRED', message: '请在灵境桌面应用中打开角色资源。' } };
  try {
    const result = await bridge.invoke<T>('resources', command, payload);
    return result.ok ? result : { ok: false, error: result.error ?? { code: result.code, message: result.message } };
  } catch { return { ok: false, error: { code: 'BRIDGE_UNAVAILABLE', message: '资源服务连接中断，请重新载入。' } }; }
}
export const resourcesClient: ResourcesClient = {
  list: () => invoke('list'), importResource: metadata => invoke('import', metadata), save: payload => invoke('save', payload),
  resolve: payload => invoke('resolve', payload), assetUrl: resourceAssetUrl,
};
