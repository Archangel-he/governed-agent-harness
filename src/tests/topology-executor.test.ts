import test from 'node:test';
import assert from 'node:assert/strict';
import { TopologyExecutor } from '../runtime/topology-executor.js';
import { definePlugin } from '../plugins/contract.js';

test('executes stages and emits unified node trace', async () => {
  const events: any[] = [];
  const executor = new TopologyExecutor({
    agentId:'a', agentVersionId:'v', executionId:'e', emit: e => events.push(e),
    plugins: new Map([
      ['one', definePlugin({id:'one',version:'1',capabilitySurface:'x', async invoke(input, ctx) { ctx.emit({type:'plugin/one'}); return {output:{value:(input as any).value + 1}}; }})],
      ['two', definePlugin({id:'two',version:'1',capabilitySurface:'x', async invoke(input) { return {output:{value:(input as any).value * 2}}; }})]
    ])
  });
  const result = await executor.run({id:'t',version:'1',entry:['one'],nodes:[{id:'one',kind:'capability',pluginId:'one'},{id:'two',kind:'capability',pluginId:'two'}],edges:[{from:'one',to:'two',kind:'data'}]}, {value: 2});
  assert.deepEqual(result.output, {value:6});
  assert.ok(events.some(e => e.type === 'node/start'));
  assert.ok(events.some(e => e.type === 'node/end'));
});
