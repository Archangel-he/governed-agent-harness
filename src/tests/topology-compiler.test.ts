import test from 'node:test';
import assert from 'node:assert/strict';
import { compileTopology } from '../topology/compiler.js';

test('compiles topology into deterministic execution stages', () => {
  const plan = compileTopology({ id:'x', version:'1', entry:['a'], nodes:[
    {id:'a',kind:'capability'},{id:'b',kind:'capability'},{id:'c',kind:'capability'}
  ], edges:[{from:'a',to:'b',kind:'data'},{from:'a',to:'c',kind:'data'}] });
  assert.deepEqual(plan.stages, [['a'], ['b','c']]);
});

test('rejects execution cycles; loops require explicit bounds', () => {
  assert.throws(() => compileTopology({ id:'x', version:'1', entry:['a'], nodes:[{id:'a',kind:'capability'},{id:'b',kind:'capability'}], edges:[{from:'a',to:'b',kind:'data'},{from:'b',to:'a',kind:'data'}] }), /cycle|incoming execution edge/i);
});
