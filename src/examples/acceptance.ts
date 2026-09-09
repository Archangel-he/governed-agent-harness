import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GovernedAgentRuntime } from '../runtime/governed-runtime.js';
import { acceptancePlugins, acceptanceKernel, decisionVersion, toolVersion } from './acceptance-agents.js';
import { evaluateTrace, defaultProfile } from '../governance/evaluation.js';
import { runExperiment, promoteCandidate, type ExperimentEvaluator } from '../governance/experiment.js';
import { LocalVersionStore } from '../services/version-store.js';
import type { AgentVersion } from '../contracts/domain.js';

import { RuntimeEvidenceSourceResolver } from '../runtime/evidence-source.js';

const root=mkdtempSync('.tmp/acceptance-');
const runtime=new GovernedAgentRuntime({root,plugins:acceptancePlugins(),kernel:acceptanceKernel()});
const cases=[{id:'decision',version:decisionVersion,input:{goal:'choose',maxRisk:2,options:[{id:'safe',risk:1,score:8},{id:'unsafe',risk:9,score:10}]}},
 {id:'tool',version:toolVersion,input:{text:'governed agent'}}];
const summary=[];
for(const row of cases){
 const result=await runtime.run({agentId:row.id,requestId:'acceptance',version:row.version,input:row.input});
 const output=result.output as Record<string,unknown>;
 const evaluation=evaluateTrace(result.trace,defaultProfile,{completed:result.status==='completed',quality:output?.valid===true?1:0,safe:output?.valid===true,cost:0,humanInterventions:0});
 if(!evaluation.passed||result.trace.events.filter(e=>e.type==='node/end'&&e.status==='succeeded').length!==6)throw new Error('Six-step acceptance failed: '+row.id);
 writeFileSync(join(root,row.id+'.json'),JSON.stringify({output,events:result.trace.events,evaluation},null,2));
 summary.push({id:row.id,events:result.trace.events.length,passed:evaluation.passed});
}
const versions=new LocalVersionStore(join(root,'versions'));
const baseline={...decisionVersion,topology:decisionVersion.topology!};
const candidate={...baseline,id:'decision-v2',topology:{...baseline.topology,version:'2'}};
versions.publish(baseline);versions.publish(candidate);versions.activate(baseline.id);
const source=runtime.sessions.events('agent:decision').filter(e=>e.type==='harness/trace');
const resolver=new RuntimeEvidenceSourceResolver(runtime.sessions,['decision','experiment']);
const evaluator:ExperimentEvaluator={id:'safe-choice',version:'1',judge:(_input,output)=>({completed:true,quality:(output as {valid?:boolean})?.valid?1:0,safe:(output as {decision?:{id:string}})?.decision?.id==='safe',cost:0,humanInterventions:0})};
const report=await runExperiment(versions,{id:'acceptance-change',baselineVersionId:baseline.id,candidateVersionId:candidate.id,hypothesis:'Equivalent candidate must preserve complete Agent quality',evidenceEventIds:source.map(e=>e.id),sourceExecutionIds:[(source[0].payload as {executionId:string}).executionId]},[{id:'safe-choice',input:cases[0].input}],defaultProfile,
 async(version,input)=>runtime.run({agentId:'experiment',requestId:crypto.randomUUID(),version:version as unknown as AgentVersion,input}),
 evaluator,resolver);
const evidence=await runtime.artifacts.put(Buffer.from(JSON.stringify(report)),'application/json');
const receipt=await promoteCandidate(versions,report,true,resolver,evaluator);
versions.rollback(receipt.rollbackVersionId);
if(versions.active().id!==baseline.id)throw new Error('Rollback failed');
writeFileSync(join(root,'experiment.json'),JSON.stringify({report,evidence,receipt,active:versions.active().id},null,2));
console.log(JSON.stringify({ok:true,root,agents:summary,experiment:report.passed,rollback:true}));
