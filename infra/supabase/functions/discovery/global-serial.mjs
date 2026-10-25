import { requireValue } from './protocol.mjs';

export function confirmedGlobalSerial(value) {
  requireValue(typeof value === 'string' && /^[1-9][0-9]*$/.test(value), 'GLOBAL_SERIAL_INVALID', '云端编号尚未确认', 503);
  return value;
}

/** Numbers are response metadata only. Never decorate stored sessions/receipts. */
export function serialProjection(value, globalSerial) {
  const projected = { ...value };
  delete projected.globalSerial;
  if (globalSerial !== undefined) projected.globalSerial = confirmedGlobalSerial(globalSerial);
  return projected;
}

/** Stored/imported numbers never establish authority, including nested receipts. */
export function withoutGlobalSerials(value) {
  if (Array.isArray(value)) return value.map(withoutGlobalSerials);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'globalSerial').map(([key, item]) => [key, withoutGlobalSerials(item)]));
}
