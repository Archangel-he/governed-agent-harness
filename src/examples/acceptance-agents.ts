import type { AgentVersion } from '../contracts/domain.js';
import type { KernelDependencies } from '../contracts/kernel.js';
import { definePlugin, type CapabilityPlugin } from '../plugins/capability.js';
import type { TopologyNode } from '../topology/schema.js';

function version(id:string,nodes:TopologyNode[]):AgentVersion {
  return {id:id+'-v1',agentDefinitionId:id,policyVersion:'fixture-policy-1',bindings:[],topology:{id,version:'1',entry:[nodes[0].id],nodes,edges:nodes.slice(1).map((node,i)=>({from:nodes[i].id,to:node.id,kind:'data'}))}};
}
const node=(id:string,kind:TopologyNode['kind']='capability'):TopologyNode=>({id,kind,seatId:id,pluginId:kind==='kernel'?'fixture-kernel':id,pluginVersion:'1',inputSchema:{type:'object'},outputSchema:{type:'object'}});
export const decisionVersion=version('decision',[
  node('intent'),node('constraints'),node('candidate-generation','kernel'),{...node('risk','validation'),required:true},node('decision'),node('decision-validation','validation')
]);
export const toolVersion=version('tool',[
  node('task'),node('tool-selection'),node('argument-construction'),{...node('permission','validation'),required:true},node('execution','kernel'),node('result-validation','validation')
]);

interface Option {id:string;score:number;risk:number}
type State=Record<string,unknown>;
export function acceptancePlugins():Map<string,CapabilityPlugin> {
  const plugins:CapabilityPlugin[]=[];
  const add=(id:string,transform:(input:State)=>State)=>plugins.push(definePlugin({id,version:'1',capabilitySurface:id,invoke:async(input,ctx)=>{
    const result=transform(input as State);ctx.emit({type:'decision/evidence',payload:{step:id}});return{output:result};
  }}));
  add('intent',input=>({...input,mode:'decision',intent:String(input.goal)}));
  add('constraints',input=>{
    if(!Array.isArray(input.options)||!Number.isFinite(input.maxRisk)||Number(input.maxRisk)<0)throw new Error('Invalid decision constraints');
    return {...input,constraintsChecked:true};
  });
  add('risk',input=>({...input,candidates:(input.candidates as Option[]).filter(option=>option.risk<=Number(input.maxRisk))}));
  add('decision',input=>{
    const sorted=[...(input.candidates as Option[])].sort((a,b)=>b.score-a.score);
    if(!sorted.length)throw new Error('No candidate satisfies risk constraint');
    return {...input,decision:sorted[0]};
  });
  add('decision-validation',input=>{
    const decision=input.decision as Option;
    if(!decision||decision.risk>Number(input.maxRisk))throw new Error('Unsafe decision');
    return {...input,valid:true};
  });
  add('task',input=>({...input,mode:'tool'}));
  add('tool-selection',input=>({...input,tool:'uppercase'}));
  add('argument-construction',input=>{
    if(typeof input.text!=='string')throw new Error('Tool text must be string');
    return {...input,args:{text:input.text}};
  });
  add('permission',input=>{
    if(input.tool!=='uppercase')throw new Error('Tool permission denied');
    return {...input,authorized:true};
  });
  add('result-validation',input=>{
    if(input.result!==String(input.text).toUpperCase())throw new Error('Unexpected tool result');
    return {...input,valid:true};
  });
  return new Map(plugins.map(plugin=>[plugin.manifest.id,plugin]));
}

/** Frozen deterministic providers: exercises the real Loop/tool path without paid API calls. */
export function acceptanceKernel():KernelDependencies {
  const identity={seatId:'fixture-model',pluginId:'fixture-model',pluginVersion:'1'};
  return {model:{...identity,invoke:async request=>{
    const state=request.history.find(item=>item.role==='user')!.content as State;
    if(state.mode==='decision')return{content:{...state,candidates:state.options},toolCalls:[],usage:{inputTokens:1,outputTokens:1}};
    const tool=request.history.find(item=>item.role==='tool')?.content as {output?:unknown}|undefined;
    if(tool)return{content:{...state,result:tool.output},toolCalls:[]};
    if(state.authorized!==true)throw new Error('Permission step missing');
    return{content:'Using approved tool',toolCalls:[{id:'uppercase-call',name:'uppercase',input:state.args}]};
  }},tools:{uppercase:{seatId:'uppercase',pluginId:'uppercase',pluginVersion:'1',invoke:async input=>String((input as {text:string}).text).toUpperCase()}}};
}
