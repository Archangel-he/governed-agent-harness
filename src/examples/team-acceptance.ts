import assert from 'node:assert/strict';
import {join} from 'node:path';import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {HierarchyRuntime,type HierarchyDefinition} from '../team/hierarchy.js';
import {GovernedAgentRuntime} from '../runtime/governed-runtime.js';
import {definePlugin} from '../plugins/capability.js';
import {WikiStore} from '../memory/wiki.js';

export async function runTeamAcceptance(root:string){
 const wiki=new WikiStore(join(root,'wiki'));
 const version=(id:string)=>({id:id+'-v1',agentDefinitionId:id,policyVersion:'local-1',bindings:[],topology:{id,version:'1',entry:['work'],nodes:[{id:'work',kind:'capability' as const,pluginId:'work',pluginVersion:'1'}],edges:[]}});
 const definition:HierarchyDefinition={id:'experiment-team',supremeId:'supreme',maxTasks:30,agents:[
  {id:'supreme',role:'supreme',version:version('supreme')},
  ...['alpha','beta'].flatMap(id=>[{id,role:'leader' as const,parentId:'supreme',version:version(id)},{id:id+'-member',role:'member' as const,parentId:id,version:version(id+'-member')}])
 ]};
 const source=await wiki.source(Buffer.from('Return the task in uppercase.'));
 for(const lead of ['alpha','beta']){
  const initial=wiki.pinned('team',lead),proposal=await wiki.propose({scope:'team',owner:lead,proposedBy:lead+'-member',pageId:'rule',baseRelease:initial.id,title:'Team rule',markdown:'Return the task in uppercase.',status:'fact',sources:[source]});
  assert.throws(()=>wiki.publish(proposal.id,lead+'-member'),/Unauthorized/);wiki.publish(proposal.id,lead);
 }
 let calls=0;
 const build=()=>{
  const team=new HierarchyRuntime(root,definition,wiki);
  for(const agent of definition.agents){
   const children=definition.agents.filter(a=>a.parentId===agent.id);
   team.register(agent.id,new GovernedAgentRuntime({root:join(root,'agents',agent.id),plugins:new Map([['work',definePlugin({id:'work',version:'1',capabilitySurface:children.length?'coordination':'execution',invoke:async(input,ctx)=>{
    calls++;const task=input as {taskId:string;request:string};
    if(!children.length){
     assert.ok(ctx.memory?.pages.some(p=>p.pageId===`team:${agent.parentId}/rule`));
     assert.ok(!ctx.memory?.pages.some(p=>p.pageId.startsWith(`team:${agent.parentId==='alpha'?'beta':'alpha'}/`)));
     return{output:{answer:task.request.toUpperCase()}};
    }
    const reports=await Promise.all(children.map(child=>team.delegate(ctx.agentId,task.taskId,child.id,'work',task.request,ctx.signal)));
    const expected=task.request.toUpperCase();
    const decisions=reports.map(report=>({taskId:report.taskId,accept:report.status==='completed'&&(report.output as {answer?:string}).answer===expected,reason:'Compared result with task requirement',evidenceDigest:report.traceDigest}));
    return{output:{answer:decisions.every(d=>d.accept)?expected:'rejected',decisions}};
   }})]])}));
  }
  return team;
 };
 const team=build(),result=await team.submit('human-task','governed teams');assert.equal(result.status,'accepted');assert.equal(calls,5);
 const recovered=build();assert.deepEqual(await recovered.submit('human-task','governed teams'),result);assert.equal(calls,5);
 assert.equal(team.tasks().length,5);assert.equal(new Set(team.tasks().map(t=>t.report?.executionId)).size,5);
 writeFileSync(join(root,'acceptance.json'),JSON.stringify({result,tasks:team.tasks(),events:team.events()},null,2));
 return {ok:true,root,agents:5,accepted:team.tasks().filter(t=>t.status==='accepted').length,reopenedWithoutReexecution:true};
}
if(process.argv[1]?.endsWith('team-acceptance.ts')){mkdirSync('.tmp',{recursive:true});console.log(JSON.stringify(await runTeamAcceptance(mkdtempSync('.tmp/team-'))))}
