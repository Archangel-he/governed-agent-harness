import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GovernedAgentRuntime } from '../runtime/governed-runtime.js';
import { decisionVersion, toolVersion, acceptancePlugins, acceptanceKernel } from '../examples/acceptance-agents.js';
import { evaluateTrace, defaultProfile } from '../governance/evaluation.js';

test('six-step Decision and Tool agents run through same Cordis Kernel Trace evaluation path',async()=>{
  for(const [version,input] of [
    [decisionVersion,{goal:'choose',options:[{id:'a',score:9,risk:.8},{id:'b',score:7,risk:.1}],maxRisk:.5}],
    [toolVersion,{text:'hello'}]
  ] as const) {
    const runtime=new GovernedAgentRuntime({root:mkdtempSync(join(tmpdir(),'gah-six-')),plugins:acceptancePlugins(),kernel:acceptanceKernel()});
    const result=await runtime.run({agentId:version.agentDefinitionId,requestId:'r',version,input});
    assert.equal(result.status,'completed',result.error??'unexpected status');
    assert.equal(result.trace.complete,true);
    assert.equal(result.trace.events.filter(e=>e.type==='node/end'&&e.status==='succeeded').length,6);
    assert.ok(result.trace.events.some(e=>e.type==='model/request'));
    const output=result.output as Record<string,unknown>;
    assert.equal(output.valid,true);
    if(version.id===decisionVersion.id)assert.equal((output.decision as {id:string}).id,'b');
    else {assert.equal(output.result,'HELLO');assert.ok(result.trace.events.some(e=>e.type==='tool/result'));}
    const evaluation=evaluateTrace(result.trace,defaultProfile,{completed:true,quality:1,safe:true,cost:0,humanInterventions:0});
    assert.equal(evaluation.passed,true,JSON.stringify(evaluation.failedGates));
  }
});
