import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {HierarchyRuntime, type HierarchyDefinition} from '../team/hierarchy.js';
import {GovernedAgentRuntime} from '../runtime/governed-runtime.js';
import {definePlugin} from '../plugins/capability.js';
const version=(id:string)=>({id:id+'-v1',agentDefinitionId:id,policyVersion:'p',bindings:[],topology:{id,version:'1',entry:['work'],nodes:[{id:'work',kind:'capability' as const,pluginId:'work',pluginVersion:'1'}],edges:[]}});
const definition:HierarchyDefinition={id:'h',supremeId:'root',maxTasks:20,agents:[{id:'root',role:'supreme',version:version('root')},{id:'lead',role:'leader',parentId:'root',version:version('lead')},{id:'member',role:'member',parentId:'lead',version:version('member')}]};
function fixture(root:string,counter:{calls:number},reject=false){
 const team=new HierarchyRuntime(root,definition);
 for(const agent of definition.agents){const children=definition.agents.filter(a=>a.parentId===agent.id);
  team.register(agent.id,new GovernedAgentRuntime({root:join(root,agent.id),plugins:new Map([['work',definePlugin({id:'work',version:'1',capabilitySurface:children.length?'coordination':'work',invoke:async(input,ctx)=>{
   const task=input as {taskId:string;request:unknown};counter.calls++;
   if(!children.length)return{output:{value:task.request}};
   const reports=await Promise.all(children.map(child=>team.delegate(ctx.agentId,task.taskId,child.id,child.id,task.request,ctx.signal)));
   return{output:{summary:'reviewed',decisions:reports.map(r=>({taskId:r.taskId,accept:!reject,reason:'checked report',evidenceDigest:r.traceDigest}))}};
  }})]])}));
 }
 return team;
}
test('Supreme delegates through independent full Agents and acceptance survives reopen',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hierarchy-')),calls={calls:0};const team=fixture(root,calls);
 const result=await team.submit('human-request',{goal:'work'});assert.equal(result.status,'accepted');assert.equal(calls.calls,3);
 const rows=team.tasks();assert.equal(rows.length,3);assert.ok(rows.every(t=>t.status==='accepted'));
 assert.equal(new Set(rows.map(t=>t.report?.executionId)).size,3);
 const reopened=fixture(root,calls);assert.deepEqual(await reopened.submit('human-request',{goal:'work'}),result);assert.equal(calls.calls,3);
 await assert.rejects(reopened.submit('human-request',{goal:'different'}),/conflict/);
 await assert.rejects(team.delegate('root',rows[0].id,'member','skip-level',null),/authority|parent|running/);
});
test('a rejected child prevents accepted final response; fabricated evidence cannot pass review',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hierarchy-'));const team=fixture(root,{calls:0},true);
 const result=await team.submit('r',null);assert.notEqual(result.status,'accepted');assert.ok(team.events().some(e=>e.type==='review'));
});
test('hierarchy rejects malformed roles, extra roots and cycles before running',()=>{
 assert.throws(()=>new HierarchyRuntime(mkdtempSync(join(tmpdir(),'hierarchy-')),{...definition,agents:[...definition.agents,{id:'bad',role:'member',parentId:'root',version:version('bad')}]}),/parent|hierarchy/);
});

// A host can stop after durable Agent completion but before its report transaction.
test('cold recovery acknowledges completed execution without repeating plugin effects',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hierarchy-'));const single:HierarchyDefinition={id:'cold',supremeId:'root',maxTasks:10,agents:[definition.agents[0]]};let calls=0;
 const createRuntime=()=>new GovernedAgentRuntime({root:join(root,'agent'),plugins:new Map([['work',definePlugin({id:'work',version:'1',capabilitySurface:'work',invoke:async()=>{calls++;return{output:'done'}}})]])});
 const team=new HierarchyRuntime(root,single),runtime=createRuntime(),run=runtime.run.bind(runtime);
 runtime.run=async request=>{await run(request);throw new Error('crash before report')};team.register('root',runtime);
 await assert.rejects(team.submit('r','task'),/crash/);assert.equal(calls,1);
 const recovered=new HierarchyRuntime(root,single);recovered.register('root',createRuntime());
 assert.equal((await recovered.submit('r','task')).status,'accepted');assert.equal(calls,1);assert.ok(recovered.events().some(e=>e.type==='ack'));
});
test('one Agent serializes simultaneous assignments and cancelled queued work never starts',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hierarchy-')),single:HierarchyDefinition={id:'queue',supremeId:'root',maxTasks:10,agents:[definition.agents[0]]};
 const team=new HierarchyRuntime(root,single);let active=0,max=0;
 team.register('root',new GovernedAgentRuntime({root:join(root,'agent'),plugins:new Map([['work',definePlugin({id:'work',version:'1',capabilitySurface:'work',invoke:async input=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;return{output:input}}})]])}));
 const results=await Promise.all([team.submit('1',1),team.submit('2',2)]);assert.ok(results.every(r=>r.status==='accepted'));assert.equal(max,1);
 const controller=new AbortController();controller.abort();await assert.rejects(team.submit('3',3,controller.signal));assert.equal(team.tasks().find(t=>(t.input===3))?.status,'queued');
});

test('parent rejects child report changed after durable execution',async()=>{
 const root=mkdtempSync(join(tmpdir(),'hierarchy-')),single:HierarchyDefinition={id:'tamper',supremeId:'root',maxTasks:10,agents:definition.agents.slice(0,2)};
 const team=new HierarchyRuntime(root,single);
 team.register('lead',new GovernedAgentRuntime({root:join(root,'lead'),plugins:new Map([['work',definePlugin({id:'work',version:'1',capabilitySurface:'work',invoke:async()=>({output:'original'})})]])}));
 team.register('root',new GovernedAgentRuntime({root:join(root,'root'),plugins:new Map([['work',definePlugin({id:'work',version:'1',capabilitySurface:'coordination',invoke:async(input,ctx)=>{
  const task=input as {taskId:string};const report=await team.delegate(ctx.agentId,task.taskId,'lead','work',1);
  const {readFileSync,writeFileSync}=await import('node:fs'),path=join(root,'hierarchy.json'),state=JSON.parse(readFileSync(path,'utf8'));
  state.tasks.find((t:{id:string})=>t.id===report.taskId).report.output='forged';writeFileSync(path,JSON.stringify(state)+'\n');
  return{output:{decisions:[{taskId:report.taskId,accept:true,reason:'review',evidenceDigest:report.traceDigest}]}};
 }})]])}));
 const result=await team.submit('r',1);assert.equal(result.status,'rejected');assert.match(result.error!,/evidence/);
});
