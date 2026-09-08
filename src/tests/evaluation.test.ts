import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentTraceAggregator } from '../trace/aggregator.js';
import { evaluateTrace, defaultProfile } from '../governance/evaluation.js';

function trace() {
  const agg=new AgentTraceAggregator();
  agg.append({id:'s',executionId:'e',operationId:'n',nodeId:'decide',type:'node/start',status:'started',timestamp:10});
  agg.append({id:'e',executionId:'e',operationId:'n',nodeId:'decide',type:'node/end',status:'succeeded',timestamp:20});
  return agg.finish('e');
}
test('whole agent evaluation reports independent quality cost latency and hard gates',()=>{
  const evaluated=evaluateTrace(trace(),{...defaultProfile,maxCost:1},{completed:true,quality:1,safe:false,cost:2,humanInterventions:0});
  assert.equal(evaluated.metrics.quality,1);
  assert.equal(evaluated.metrics.latencyMs,10);
  assert.equal(evaluated.metrics.reliability,1);
  assert.equal(evaluated.passed,false);
  assert.ok(evaluated.failedGates.includes('safety'));
  assert.ok(evaluated.failedGates.includes('cost'));
});
test('better local reliability cannot override worse task quality or incomplete trace',()=>{
  const good=evaluateTrace(trace(),defaultProfile,{completed:true,quality:.95,safe:true,cost:0,humanInterventions:0});
  const bad=evaluateTrace(trace(),defaultProfile,{completed:true,quality:.2,safe:true,cost:0,humanInterventions:0});
  assert.equal(good.passed,true); assert.equal(bad.passed,false);
  assert.ok(bad.score<good.score);
  const broken=trace(); broken.events.pop();
  assert.equal(evaluateTrace(broken,defaultProfile,{completed:true,quality:1,safe:true,cost:0,humanInterventions:0}).passed,false);
});
