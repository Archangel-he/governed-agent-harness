import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentTraceAggregator } from '../trace/aggregator.js';
import { projectSessionEvents } from '../trace/session-projector.js';

test('reconstructs complete agent trace with stable sequence', () => {
  const agg = new AgentTraceAggregator();
  agg.append({id:'n1',executionId:'e',type:'node/start',operationId:'op',nodeId:'a',status:'started'});
  agg.append({id:'n2',executionId:'e',type:'node/end',operationId:'op',nodeId:'a',status:'succeeded'});
  const trace = agg.finish('e');
  assert.equal(trace.complete, true);
  assert.deepEqual(trace.events.map(e => e.sequence), [1,2]);
  assert.equal(trace.operations.get('op')?.status, 'succeeded');
});

test('missing terminal state is incomplete', () => {
  const agg = new AgentTraceAggregator();
  agg.append({id:'n1',executionId:'e',type:'node/start',operationId:'op',nodeId:'a',status:'started'});
  assert.equal(agg.finish('e').complete, false);
});

test('trace rejects invalid operation transitions and isolates caller mutations', () => {
  const agg = new AgentTraceAggregator();
  assert.throws(() => agg.append({id:'end',executionId:'e',type:'node/end',operationId:'o',status:'succeeded'}), /start/);
  const event = {id:'start',executionId:'e',type:'node/start',operationId:'o',status:'started' as const,payload:{value:1}};
  agg.append(event);
  event.payload.value=99;
  agg.append({id:'end',executionId:'e',type:'node/end',operationId:'o',status:'succeeded'});
  assert.throws(() => agg.append({id:'twice',executionId:'e',type:'node/end',operationId:'o',status:'failed'}), /terminal/);
  const trace = agg.finish('e');
  assert.deepEqual(trace.events[0].payload,{value:1});
  trace.operations.get('o')!.status='failed';
  assert.equal(agg.finish('e').operations.get('o')!.status,'succeeded');
});

test('facts preserve operation state, dependencies, and per-operation sequence', () => {
  const agg=new AgentTraceAggregator();
  agg.append({id:'a1',executionId:'e',type:'node/start',operationId:'a',status:'started'});
  agg.append({id:'a2',executionId:'e',type:'node/end',operationId:'a',status:'succeeded'});
  agg.append({id:'b1',executionId:'e',type:'node/start',operationId:'b',status:'started',dependencyOperationIds:['a']});
  agg.append({id:'b2',executionId:'e',type:'plugin/fact',operationId:'b',status:'started',phase:'fact',payload:{answer:42}});
  assert.equal(agg.finish('e').complete,false);
  agg.append({id:'b3',executionId:'e',type:'node/end',operationId:'b',status:'unknown'});
  const trace=agg.finish('e');
  assert.equal(trace.complete,false);
  assert.deepEqual(trace.events.filter(e=>e.operationId==='b').map(e=>e.operationSequence),[1,2,3]);
  assert.equal(trace.unknownOperations.length,1);
});

test('session projection preserves every observable fact and reconstructs without model calls', () => {
  const base={executionId:'e',requestId:'r',agentVersionId:'v',stepId:'step'};
  const rows=[
    ['turn/start',{...base,content:'input'}], ['user/message',{...base,content:'input'}],
    ['step/start',base], ['model/request',{...base,operationId:'m',input:{messages:['input']}}],
    ['assistant/stream',{...base,operationId:'m',chunk:{content:'answer'},usage:{outputTokens:1}}],
    ['assistant/message',{...base,operationId:'m',content:{content:'answer',toolCalls:[]}}],
    ['step/end',{...base,status:'completed'}], ['turn/end',{...base,status:'completed',output:'answer'}]
  ].map(([type,payload],index)=>({id:String(index),sessionId:'s',type:String(type),payload}));
  const projected=projectSessionEvents(rows);
  assert.equal(projected.length,rows.length);
  assert.deepEqual(projected[4].payload,rows[4].payload);
  assert.equal(projected[4].sourceEventId,'4');
  const agg=new AgentTraceAggregator(); projected.forEach(event=>agg.append(event));
  assert.equal(agg.finish('e').complete,true);
});
