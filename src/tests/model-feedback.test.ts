import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runModelFeedbackExperiment} from '../examples/model-feedback.js';

test('full template records model evidence and evaluates only after delayed feedback',async()=>{
 const root=mkdtempSync(join(tmpdir(),'model-feedback-'));
 try {
  const report=await runModelFeedbackExperiment(root,{seatId:'model',pluginId:'fixture',pluginVersion:'1',invoke:async()=>({content:'ACK-42',toolCalls:[],usage:{total_tokens:3}})},{provider:'fixture',model:'fixture-v1'});
  assert.equal(report.evaluation.passed,true);
  assert.ok(report.evaluation.evidenceEventIds.length>0);
  assert.equal(report.snapshot.cases[0].feedback?.source,'simulated-acceptance');
  assert.ok(report.modelEvents>0);
  assert.deepEqual(JSON.parse(readFileSync(join(root,'report.json'),'utf8')),report);
 } finally {rmSync(root,{recursive:true,force:true})}
});
