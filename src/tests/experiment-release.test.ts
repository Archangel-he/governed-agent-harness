import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalVersionStore } from '../services/version-store.js';
import { runExperiment, promoteCandidate } from '../governance/experiment.js';
import { defaultProfile } from '../governance/evaluation.js';
import { AgentTraceAggregator } from '../trace/aggregator.js';

test('candidate uses identical inputs, whole agent hard gates, immutable versions and CAS rollback',async()=>{
  const store=new LocalVersionStore(mkdtempSync(join(tmpdir(),'gah-experiment-')));
  const topology={id:'t',version:'1',entry:['a'],nodes:[{id:'a',kind:'capability' as const}],edges:[]};
  store.publish({id:'base',topology});store.publish({id:'candidate',topology});store.activate('base');
  const seen:unknown[]=[];
  const runner=async(version:{id:string},input:unknown)=>{
    seen.push(input);const agg=new AgentTraceAggregator();const executionId=crypto.randomUUID();
    agg.append({id:crypto.randomUUID(),executionId,operationId:'a',nodeId:'a',agentVersionId:version.id,type:'node/start',status:'started'});
    agg.append({id:crypto.randomUUID(),executionId,operationId:'a',nodeId:'a',agentVersionId:version.id,type:'node/end',status:'succeeded'});
    return{trace:agg.finish(executionId),output:version.id==='base'?.8:1};
  };
  const report=await runExperiment(store,{id:'experiment',baselineVersionId:'base',candidateVersionId:'candidate',hypothesis:'improve outcome',evidenceEventIds:['baseline-evidence']},[{id:'case',input:{value:1}}],defaultProfile,runner,(_input,output)=>({completed:true,quality:Number(output),safe:true,cost:0,humanInterventions:0}));
  assert.deepEqual(seen,[{value:1},{value:1}]);assert.equal(report.passed,true);
  assert.equal(store.active().id,'base');
  assert.throws(()=>promoteCandidate(store,report,false),/approval/);
  promoteCandidate(store,report,true);assert.equal(store.active().id,'candidate');
  store.rollback('base');assert.equal(store.active().id,'base');
  const altered=structuredClone(report);altered.cases[0].candidate.outcome.safe=false;
  assert.throws(()=>promoteCandidate(store,altered,true),/evidence|gate/);
  store.activate('candidate');assert.throws(()=>promoteCandidate(store,report,true),/baseline|CAS/);
});
