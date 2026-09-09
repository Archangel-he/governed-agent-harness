import type {ModelInput,ModelProvider,ModelResponse} from '../contracts/loop.js';

export interface OpenAICompatibleOptions {apiKey:string;model:string;endpoint:string;seatId?:string;pluginId?:string;pluginVersion?:string;temperature?:number}
/** Generic OpenAI-compatible adapter; provider-specific policy stays outside the runtime. */
export function createOpenAICompatibleModel(options:OpenAICompatibleOptions):ModelProvider {
 if(!options.apiKey||!options.model||!options.endpoint)throw new Error('Provider endpoint, model and API key are required');
 const endpoint=options.endpoint.replace(/\/$/,'')+'/chat/completions';
 return {seatId:options.seatId??'model',pluginId:options.pluginId??'openai-compatible',pluginVersion:options.pluginVersion??'1',invoke:async(input:ModelInput,signal:AbortSignal):Promise<ModelResponse>=>{
  const response=await fetch(endpoint,{method:'POST',signal,headers:{authorization:`Bearer ${options.apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:options.model,messages:[{role:'system',content:input.systemPrompt},...input.history.map(message=>({role:message.role,content:typeof message.content==='string'?message.content:JSON.stringify(message.content)}))],tools:input.tools.map(name=>({type:'function',function:{name,description:name,parameters:{type:'object',additionalProperties:true}}})),...(options.temperature===undefined?{}:{temperature:options.temperature})})});
  if(!response.ok)throw new Error(`Model provider HTTP ${response.status} ${response.statusText}`);
  const body=await response.json() as {choices?:{message?:{content?:unknown;tool_calls?:{id?:string;function?:{name?:string;arguments?:string}}[]}}[];usage?:unknown};
  const message=body.choices?.[0]?.message;if(!message)throw new Error('Model provider returned no choice');
  const toolCalls=(message.tool_calls??[]).map(call=>{const fn=call.function;if(!call.id||!fn?.name)throw new Error('Model provider returned invalid tool call');let input:unknown={};try{input=fn.arguments?JSON.parse(fn.arguments):{}}catch{throw new Error('Model provider returned invalid tool arguments')}return{id:call.id,name:fn.name,input}});
  return {content:message.content??'',toolCalls, ...(body.usage===undefined?{}:{usage:body.usage})};
 }};
}
