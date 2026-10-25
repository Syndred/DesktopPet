import { describe, expect, it } from 'vitest';
import type { DiscoverySnapshot } from '../packages/shared-types/src/features/discovery';
import { encounterAvailability, locationBlockingReason } from '../apps/pc-app/ui/src/features/discovery/presentation';

const state = (status: DiscoverySnapshot['location']['status'], scenario: DiscoverySnapshot['scenario'] = 'qa'): Pick<DiscoverySnapshot, 'scenario' | 'location'> => ({
  scenario, location: { mode: 'real', status, permission: scenario === 'qa' ? 'unknown' : 'granted', fix: null, watching: false,
    lastError: status === 'stale' ? { code: 'LOCATION_STALE', message: '位置已过期，请重新定位' } : null }
});
describe('QA013 position reason precedes distance presentation', () => {
  it('preserves the captured57m stale→ready distinction and gives the actual QA refresh control name', () => {
    const before = state('stale'), after = state('ready');
    const oldSpawn = { distanceMeters: 57, inRange: false, demo: false }, freshSpawn = { ...oldSpawn, inRange: true };
    const bytes = JSON.stringify({ before, after, oldSpawn, freshSpawn });
    expect(locationBlockingReason(before)).toBe('位置已过期，请点击右上角“更新场景位置”');
    expect(encounterAvailability(before, oldSpawn)).toBe(locationBlockingReason(before));
    expect(encounterAvailability(before, oldSpawn)).not.toContain('前往附近');
    expect(locationBlockingReason(after)).toBe('');
    expect(encounterAvailability(after, freshSpawn)).toBe('可挑战');
    expect(oldSpawn.distanceMeters).toBe(freshSpawn.distanceMeters);
    expect(JSON.stringify({ before, after, oldSpawn, freshSpawn })).toBe(bytes);
  });
  it('keeps fresh out-of-range messaging and native stale refresh wording distinct', () => {
    expect(encounterAvailability(state('ready'), { inRange: false, demo: false })).toBe('前往附近');
    expect(locationBlockingReason(state('stale', 'live'))).toContain('重新定位');
    expect(locationBlockingReason(state('stale', 'live'))).not.toContain('场景位置');
  });
  it('does not label precision failure, pending location or demo as a distance failure', () => {
    expect(encounterAvailability(state('imprecise'), { inRange: false, demo: false })).toContain('定位精度不足');
    expect(encounterAvailability(state('locating'), { inRange: false, demo: false })).toBe('正在更新位置，请稍候');
    expect(encounterAvailability(state('stale'), { inRange: false, demo: true })).toBe('演示');
  });
});
