import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpenAICompatibleModel} from '../providers/openai-compatible.js';

test('OpenAI-compatible provider maps chat completion and preserves identity',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async (_input,init)=>{const body=JSON.parse(String(init?.body));assert.equal(body.model,'demo');return new Response(JSON.stringify({choices:[{message:{content:'ok',tool_calls:[]}}],usage:{total_tokens:2}}),{status:200,headers:{'content-type':'application/json'}})};
 try {const model=createOpenAICompatibleModel({apiKey:'secret',model:'demo',endpoint:'https://example.test/v1'});const result=await model.invoke({systemPrompt:'s',history:[{role:'user',content:'hi'}],tools:[]},new AbortController().signal);assert.equal(result.content,'ok');assert.deepEqual(result.toolCalls,[]);assert.deepEqual(result.usage,{total_tokens:2});assert.equal(model.pluginId,'openai-compatible')} finally {globalThis.fetch=old}
});

test('OpenAI-compatible provider surfaces HTTP failures',async()=>{
 const old=globalThis.fetch;globalThis.fetch=async()=>new Response('bad',{status:429,statusText:'Too Many'});
 try {const model=createOpenAICompatibleModel({apiKey:'secret',model:'demo',endpoint:'https://example.test'});await assert.rejects(model.invoke({systemPrompt:'',history:[],tools:[]},new AbortController().signal),/429/)} finally {globalThis.fetch=old}
});
