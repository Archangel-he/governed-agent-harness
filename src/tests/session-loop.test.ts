import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentLoop, type LoopOptions } from '../runtime/agent-loop.js';
import { JsonlSessionStore, FileWorkspaceStore } from '../services/file-store.js';
import { MemorySessionStore } from '../services/memory.js';
import type { AgentVersion } from '../contracts/domain.js';

const version: AgentVersion = { id: 'v1', agentDefinitionId: 'test', policyVersion: 'p1', bindings: [] };
const identity = { seatId: 'model', pluginId: 'model', pluginVersion: '1' };
const fixture = () => mkdtempSync(join(tmpdir(), 'agent-brick-test-'));
const options = (): LoopOptions => ({
  systemPrompt: 'Test', maxSteps: 3,
  model: { ...identity, invoke: async () => ({ content: 'done', toolCalls: [] }) },
  tools: {},
});

test('file history reopens, tool result enters next request, completed request is deduplicated', async () => {
  const file = join(fixture(), 'session.jsonl');
  let calls = 0;
  let tools = 0;
  const config = options();
  config.tools.echo = { ...identity, seatId: 'echo', invoke: async () => { tools++; return 'tool output'; } };
  config.model.invoke = async request => {
    calls++;
    if (calls === 1) return { content: 'call', toolCalls: [{ id: 'c1', name: 'echo', input: null }] };
    assert.equal(request.history.at(-1)?.role, 'tool');
    assert.deepEqual(request.history.at(-1)?.content, { callId: 'c1', output: 'tool output' });
    return { content: 'done', toolCalls: [] };
  };
  const request = { id: 'r1', content: 'input' };
  const first = await new AgentLoop('s1', version, new JsonlSessionStore(file), config).run(request);
  assert.equal(first.status, 'completed');
  const reopened = new AgentLoop('s1', version, new JsonlSessionStore(file), config);
  assert.deepEqual(await reopened.run(request), first);
  assert.equal(calls, 2);
  assert.equal(tools, 1);
  await assert.rejects(reopened.run({ id: 'r1', content: 'changed' }), /reused/);
  const events = reopened.history();
  assert.equal(events.filter(e => e.type === 'step/start').length, 2);
  assert.equal(events.filter(e => e.type === 'step/end').length, 2);
  assert.equal(reopened.recoverable(), false);
  const modelEvent = events.find(e => e.type === 'model/request')!;
  assert.equal((modelEvent.payload as Record<string, unknown>).seatId, 'model');
});

test('unknown external effects are closed as interrupted, never silently rerun', async () => {
  const file = join(fixture(), 'session.jsonl');
  const store = new JsonlSessionStore(file);
  const base = { requestId: 'old', executionId: 'execution-old', stepId: 'step-old' };
  for (const [type, payload] of [
    ['turn/start', { ...base, content: 'input' }],
    ['step/start', base],
    ['tool/call', { ...base, name: 'external-effect' }],
  ] as const) store.append({ id: crypto.randomUUID(), sessionId: 's', type, payload });
  let calls = 0;
  const config = options();
  config.model.invoke = async () => { calls++; return { content: 'done', toolCalls: [] }; };
  const loop = new AgentLoop('s', version, new JsonlSessionStore(file), config);
  assert.equal(loop.recoverable(), true);
  assert.equal(loop.resume(), 1);
  assert.equal(loop.resume(), 0);
  assert.equal((await loop.run({ id: 'old', content: 'input' })).status, 'interrupted');
  assert.equal(calls, 0);
  assert.equal((await loop.run({ id: 'new', content: 'new input' })).status, 'completed');
});

test('tool failure closes step and turn; loop can accept another request', async () => {
  const store = new MemorySessionStore();
  const config = options();
  config.model.invoke = async () => ({ content: null, toolCalls: [{ id: 'c1', name: 'broken', input: null }] });
  config.tools.broken = { ...identity, invoke: async () => { throw new Error('provider failure'); } };
  const loop = new AgentLoop('s', version, store, config);
  assert.equal((await loop.run({ id: 'r', content: null })).status, 'failed');
  assert.deepEqual(store.events('s').slice(-3).map(e => e.type), ['tool/result', 'step/end', 'turn/end']);
  assert.equal(loop.recoverable(), false);
});

test('cancellation reaches provider and settles the turn', async () => {
  const store = new MemorySessionStore();
  const config = options();
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  config.model.invoke = async (_input, signal) => {
    ready();
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  };
  const loop = new AgentLoop('s', version, store, config);
  const run = loop.run({ id: 'r', content: null });
  await started;
  loop.cancel();
  assert.equal((await run).status, 'cancelled');
  assert.equal(loop.recoverable(), false);
});

test('store ownership prevents two loops running the same persisted session', async () => {
  const file = join(fixture(), 'session.jsonl');
  const a = new JsonlSessionStore(file);
  const b = new JsonlSessionStore(file);
  const release = a.acquire('s');
  await assert.rejects(new AgentLoop('s', version, b, options()).run({ id: 'r', content: null }), /EEXIST/);
  release();
  assert.equal((await new AgentLoop('s', version, b, options()).run({ id: 'r', content: null })).status, 'completed');
});

test('corrupt/truncated logs are rejected on read AND append without changing bytes', () => {
  for (const text of ['{"broken":', '{}\n', 'not-json\n']) {
    const file = join(fixture(), 'session.jsonl');
    writeFileSync(file, text);
    const store = new JsonlSessionStore(file);
    assert.throws(() => store.events('s'));
    assert.throws(() => store.append({ id: 'e', sessionId: 's', type: 'test', payload: null }));
    assert.equal(readFileSync(file, 'utf8'), text);
  }
});

test('both stores isolate event payloads and reject invalid JSON and duplicate IDs', () => {
  for (const store of [new MemorySessionStore(), new JsonlSessionStore(join(fixture(), 'log.jsonl'))]) {
    const event = { id: 'e', sessionId: 's', type: 'test', payload: { value: 1 } };
    store.append(event);
    event.payload.value = 2;
    (store.events('s')[0].payload as { value: number }).value = 3;
    assert.deepEqual(store.events('s')[0].payload, { value: 1 });
    assert.throws(() => store.append(event), /Duplicate/);
    assert.throws(() => store.append({ ...event, id: 'bad', payload: undefined }));
  }
});

test('workspace rejects escapes and persists replacement content', () => {
  const store = new FileWorkspaceStore(fixture());
  assert.throws(() => store.write('../bad', 'file', 'data'));
  assert.throws(() => store.write('a', '../b/file', 'data'), /escape/);
  assert.throws(() => store.write('a', 'C:\\escape', 'data'));
  store.write('a', 'dir/file', 'first');
  store.write('a', 'dir/file', 'second');
  assert.equal(store.read('a', 'dir/file'), 'second');
  assert.equal(store.read('a', 'missing'), undefined);
});

test('missing tools are denied and looping models hit the step budget', async () => {
  const config = options();
  config.model.invoke = async () => ({ content: null, toolCalls: [{ id: 'c', name: 'missing', input: null }] });
  const loop = new AgentLoop('s', version, new MemorySessionStore(), config);
  assert.match((await loop.run({ id: 'r', content: null })).error!, /not authorized/);
  config.tools.missing = { ...identity, invoke: async () => null };
  const endless = new AgentLoop('s2', version, new MemorySessionStore(), config);
  assert.match((await endless.run({ id: 'r', content: null })).error!, /budget exhausted/);
});

