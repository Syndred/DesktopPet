import { describe, it, expect } from 'vitest';
import { deviceLabel } from '../../../apps/pc-app/ui/src/features/accounts/device-label';
describe('account current device uses app:info platform', () => {
  it.each([['win32', 'Windows PC'], ['darwin', 'Mac'], ['linux', 'Linux PC']])('maps %s without user-agent inference', (platform, expected) => {
    expect(deviceLabel(platform)).toBe(expected);
  });
  it.each([undefined, '', 'unknown', 'Windows', 'Linux', '<script>'])('uses a neutral label before info, after errors or for unknown platform %s', platform => {
    expect(deviceLabel(platform)).toBe('本机设备');
  });
});
