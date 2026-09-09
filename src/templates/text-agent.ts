import type {AgentTemplate} from '../agent.js';
import {definePlugin} from '../plugins/capability.js';

/** Copy this module: choose capabilities, edges, versions and an evaluation package. */
export function textAgentTemplate(trim=false):AgentTemplate {
 const cases=[
  {id:'spaces',input:'  governed agent  ',expected:'governed agent'},
  {id:'clean',input:'governed agent',expected:'governed agent'}
 ];
 return {
  agentId:'text-agent',
  version:{id:trim?'text-v2':'text-v1',agentDefinitionId:'text',policyVersion:'local-1',bindings:[],topology:{id:'text',version:'1',entry:['normalize'],nodes:[
   {id:'normalize',kind:'capability',pluginId:'normalize',pluginVersion:'1',config:{trim}},
   {id:'verify',kind:'validation',pluginId:'verify',pluginVersion:'1',required:true}
  ],edges:[{from:'normalize',to:'verify',kind:'data'}]}},
  plugins:[
   definePlugin({id:'normalize',version:'1',capabilitySurface:'interpretation',invoke:async(input,ctx)=>{
    if(typeof input!=='string')throw new Error('Expected text');
    ctx.emit({type:'knowledge/used',payload:{releaseId:ctx.memory?.releaseId??'none'}});
    return{output:ctx.config?.trim?input.trim():input};
   }}),
   definePlugin({id:'verify',version:'1',capabilitySurface:'validation',invoke:async input=>{
    if(typeof input!=='string'||!input||input.trim()!==input)throw new Error('Text must be nonempty and trimmed');
    return{output:input};
   }})
  ],
  evaluation:{version:'1',evaluator:{id:'trimmed-text',version:'1',judge:(input,output)=>{
   const correct=typeof input==='string'&&output===input.trim();
   return{completed:correct,quality:Number(correct),safe:true,cost:0,humanInterventions:0};
  }},dataset:{id:'text-agent-cases',version:'1',cases},gates:{id:'trimmed-text-gates',version:'1',minQuality:.8,minReliability:1,maxCost:10,maxLatencyMs:60_000,maxRetries:3,maxHumanInterventions:0}},
  services:{environmentSnapshot:{provider:'deterministic-template',providerVersion:'1'}}
 };
}
