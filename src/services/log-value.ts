import type { SessionEvent } from '../contracts/runtime.js';

// Reject values JSON would silently drop or alter before persisting them.
export function jsonSnapshot<T>(value: T): T {
  const seen = new Set<object>();
  function check(item: unknown): void {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || item === null) throw new Error('Value is not JSON data');
    if (seen.has(item)) throw new Error('Cyclic JSON data');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('Expected plain JSON object');
    seen.add(item);
    if (Array.isArray(item)) { for (const child of item) check(child); }
    else { for (const child of Object.values(item)) check(child); }
    seen.delete(item);
  }
  check(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

export function validateSessionEvent(event: unknown): asserts event is SessionEvent {
  if (!event || typeof event !== 'object') throw new Error('Invalid SessionEvent');
  const row = event as Record<string, unknown>;
  for (const key of ['id', 'sessionId', 'type']) {
    if (typeof row[key] !== 'string' || row[key].length === 0) throw new Error('Invalid SessionEvent ' + key);
  }
  if (!Object.hasOwn(row, 'payload')) throw new Error('Missing SessionEvent payload');
  jsonSnapshot(row);
}
