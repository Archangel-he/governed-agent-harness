import type { AgentVersion } from '../contracts.js';
import { validateBinding } from './validate.js';
export function validateVersion(version: AgentVersion): void {
  const seats = version.seats ?? [];
  const ids = new Set<string>();
  for (const seat of seats) {
    if (ids.has(seat.id)) throw new Error(`duplicate seat: ${seat.id}`);
    ids.add(seat.id);
    const binding = version.bindings.find(item => item.seatId === seat.id);
    if (!binding) throw new Error(`missing binding: ${seat.id}`);
    validateBinding(seat, binding);
  }
  if (version.bindings.some(binding => seats.length > 0 && !ids.has(binding.seatId))) throw new Error('binding has no seat');
}
