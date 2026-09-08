import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentLoop } from '../runtime/agent-loop.js';
import { MemorySessionStore } from '../services/memory.js';

test('stream frames preserve usage replay state and request header', async () => {
  const sessions = new MemorySessionStore();
  const loop = new AgentLoop('s', {id:'v',agentDefinitionId:'a',bindings:[],policyVersion:'1'}, sessions, {
    systemPrompt:'x', maxSteps:2, model:{seatId:'m',pluginId:'p',pluginVersion:'1', async invoke(){return {content:'fallback',toolCalls:[]}}, async *stream(){yield {content:'ok',usage:{inputTokens:1},replayState:{cursor:'c'},requestHeader:{trace:'t'},done:true};}}, tools:{}
  });
  await loop.run({id:'r',content:'hi'});
  const stream = sessions.events('s').find(e=>e.type==='assistant/stream');
  assert.deepEqual((stream?.payload as any).usage,{inputTokens:1});
  assert.equal((stream?.payload as any).replayState.cursor,'c');
  assert.equal((stream?.payload as any).requestHeader.trace,'t');
});
