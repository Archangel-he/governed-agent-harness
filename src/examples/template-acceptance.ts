import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {assembleAgent} from '../agent.js';
import {textAgentTemplate} from '../templates/text-agent.js';
import {attributeTrace,assessAttribution} from '../governance/attribution.js';
import {promoteCandidate} from '../governance/experiment.js';
import type {LocalVersion} from '../services/version-store.js';

export async function runTemplateAcceptance(root:string){
 const definition=textAgentTemplate(),agent=assembleAgent(root,definition),candidate=textAgentTemplate(true).version;
 agent.versions.publish(agent.version as unknown as LocalVersion);agent.versions.publish(candidate as unknown as LocalVersion);agent.versions.activate(agent.version.id);
 const base=agent.wiki.pinned('agent',definition.agentId),source=await agent.wiki.source(Buffer.from('Input text may contain surrounding whitespace.'));
 const proposal=await agent.wiki.propose({scope:'agent',owner:definition.agentId,pageId:'input-format',baseRelease:base.id,title:'Input format',markdown:'Check surrounding whitespace before validation.',status:'fact',sources:[source]});agent.wiki.publish(proposal.id,definition.agentId);
 const input='  governed agent  ',original=await agent.run('original',input);
 assert.equal(original.status,'failed');
 const hypotheses=attributeTrace(original.trace,agent.version.topology!);assert.equal(hypotheses.length,1);
 const report=await agent.compare({id:'trim-change',baselineVersionId:agent.version.id,candidateVersionId:candidate.id,hypothesis:hypotheses[0].statement,evidenceEventIds:hypotheses[0].evidenceEventIds,sourceExecutionIds:[original.executionId]},[{id:'spaces',input},{id:'already-clean',input:'governed agent'}]);
 assert.equal(report.passed,true);const attribution=assessAttribution(hypotheses[0],report,agent.version.topology!,candidate.topology!);assert.equal(attribution.status,'supported');
 const receipt=await promoteCandidate(agent.versions,report,true,agent.resolver,definition.evaluator);
 agent.versions.rollback(receipt.rollbackVersionId);
 const success=await agent.run('candidate',input,{version:candidate});assert.equal(success.output,'governed agent');assert.equal((await agent.evaluate(success,input)).passed,true);
 assert.ok(success.trace.events.some(e=>e.type==='memory/read'));
 writeFileSync(join(root,'acceptance.json'),JSON.stringify({hypotheses,attribution,report,receipt},null,2));
 return {ok:true,root,baseline:original.status,candidate:success.status,attribution:attribution.status,release:receipt.versionId,rollback:agent.versions.active().id};
}
if(process.argv[1]?.endsWith('template-acceptance.ts')){mkdirSync('.tmp',{recursive:true});console.log(JSON.stringify(await runTemplateAcceptance(mkdtempSync('.tmp/template-'))))}
