import type { DiscoveryElement, DiscoverySnapshot } from '../../../../../../packages/shared-types/src/features/discovery';
export const elements: Record<DiscoveryElement, string> = { water: '水', fire: '火', wood: '木', metal: '金', earth: '土' };
export const locationLabels: Record<DiscoverySnapshot['location']['status'], string> = {
  idle: '获取系统位置', locating: '正在定位…', ready: '系统定位已开启', denied: '系统拒绝位置访问', timeout: '系统定位超时',
  unavailable: '系统位置不可用', imprecise: '定位精度不足', stale: '位置已过期', demo: '演示模式', privacy_disabled: '应用内定位未开启'
};
export function twoDimensional(kind?: string) { return kind === '2d' || kind === 'spritesheet'; }
