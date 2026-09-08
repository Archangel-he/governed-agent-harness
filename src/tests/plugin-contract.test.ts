import test from 'node:test';
import assert from 'node:assert/strict';
import { definePlugin, type CapabilityContext } from '../plugins/capability.js';

test('plugin contract invokes with immutable context and result', async () => {
  const seen: string[] = [];
  const plugin = definePlugin({
    id: 'echo', version: '1.0.0', capabilitySurface: 'test',
    async invoke(input, context: CapabilityContext) {
      context.emit({ type: 'plugin/output', payload: input });
      seen.push(context.nodeId);
      return { output: { echoed: input } };
    }
  });
  const events: unknown[] = [];
  const result = await plugin.invoke('hi', {
    executionId: 'e', agentId: 'a', agentVersionId: 'v', nodeId: 'n', seatId: 's',
    emit: event => events.push(event)
  });
  assert.deepEqual(result.output, { echoed: 'hi' });
  assert.deepEqual(seen, ['n']);
  assert.equal(events.length, 1);
});
