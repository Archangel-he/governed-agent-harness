import type { PluginBinding, PluginSeat } from '../contracts.js';
export function validateBinding(seat: PluginSeat, binding: PluginBinding): void {
  if (seat.id !== binding.seatId) throw new Error(`seat mismatch: ${binding.seatId}`);
  if (seat.contract !== binding.plugin.contract) throw new Error(`contract mismatch: ${seat.contract} != ${binding.plugin.contract}`);
  for (const capability of seat.requiredCapabilities) if (!binding.plugin.capabilities.includes(capability)) throw new Error(`capability missing: ${capability}`);
}
