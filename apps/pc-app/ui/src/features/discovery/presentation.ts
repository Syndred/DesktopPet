import type { DiscoveryElement, DiscoverySnapshot, WildSpawn } from '../../../../../../packages/shared-types/src/features/discovery/index.js';
export const elements: Record<DiscoveryElement, string> = { water: '水', fire: '火', wood: '木', metal: '金', earth: '土' };
export const locationLabels: Record<DiscoverySnapshot['location']['status'], string> = {
  idle: '获取系统位置', locating: '正在定位…', ready: '系统定位已开启', denied: '系统拒绝位置访问', timeout: '系统定位超时',
  unavailable: '系统位置不可用', imprecise: '定位精度不足', stale: '位置已过期', demo: '演示模式', privacy_disabled: '应用内定位未开启'
};
export function twoDimensional(kind?: string) { return kind === '2d' || kind === 'spritesheet'; }

type LocationPresentation = Pick<DiscoverySnapshot, 'scenario' | 'location'>;
export function locationBlockingReason(state: LocationPresentation): string {
  const { status, lastError } = state.location;
  if (status === 'ready') return '';
  const refresh = state.scenario === 'qa' ? '请点击右上角“更新场景位置”' : '请点击右上角定位按钮重新定位';
  if (status === 'stale' || lastError?.code === 'LOCATION_STALE') return `位置已过期，${refresh}`;
  if (status === 'imprecise') return `定位精度不足，${refresh}`;
  if (status === 'locating') return '正在更新位置，请稍候';
  if (status === 'demo') return '演示仅供浏览';
  return lastError?.message || `${locationLabels[status]}，${refresh}`;
}
export function encounterAvailability(state: LocationPresentation, spawn: Pick<WildSpawn, 'demo' | 'inRange'>): string {
  return spawn.demo ? '演示' : locationBlockingReason(state) || (spawn.inRange ? '可挑战' : '前往附近');
}
