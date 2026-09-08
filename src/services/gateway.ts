import type { Gateway, GatewayPrincipal } from '../contracts/runtime.js';
export class CapabilityError extends Error {}
export class MemoryGateway implements Gateway {
  constructor(private readonly allowed: Set<string>) {}
  async invoke<T>(principal: GatewayPrincipal, capability: string, _request: T): Promise<unknown> {
    for (const [key, value] of Object.entries(principal)) if (!value) throw new CapabilityError(`identity missing: ${key}`);
    if (!this.allowed.has(capability)) throw new CapabilityError(`capability denied: ${capability}`);
    return undefined;
  }
}
