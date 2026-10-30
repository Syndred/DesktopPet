import { describe, expect, it } from 'vitest';
import { isNavigationCurrent, routePathFromHash } from '../../../apps/pc-app/ui/src/app/navigation';

describe('route fragment decoding', () => {
  it.each(['', '#'])('keeps the default for %j', hash => {
    expect(routePathFromHash(hash)).toBe('/companions');
  });
  it.each(['#/chat/%', '#/companions/%E0%A4%A', '#/%GG'])('recovers malformed %j without throwing', hash => {
    expect(routePathFromHash(hash)).toBe('/companions');
  });
  it.each([
    ['#/settings/about', '/settings/about'],
    ['#/companions/%E7%81%B5%E5%AE%A0', '/companions/灵宠'],
    ['#/chat/a%2Fb', '/chat/a%2Fb'],
    ['#/chat/100%25', '/chat/100%'],
  ])('preserves existing decodeURI semantics for %s', (hash, expected) => {
    expect(routePathFromHash(hash)).toBe(expected);
  });
});
describe('current navigation page', () => {
  it.each(['/companions', '/companions/pet-1'])('marks the destination and its descendant %s', path => {
    expect(isNavigationCurrent(path, '/companions')).toBe(true);
  });
  it.each(['/companionship', '/companions-other', '/chat'])('does not mark a shared prefix %s', path => {
    expect(isNavigationCurrent(path, '/companions')).toBe(false);
  });
});
