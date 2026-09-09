import test from 'node:test';
import assert from 'node:assert/strict';
import {DynamicEvaluationStore} from '../governance/dynamic-evaluation.js';

test('dynamic evaluation records delayed feedback and freezes a reproducible snapshot',()=>{
 const store=new DynamicEvaluationStore('live','1');
 store.recordDecision({id:'d1',input:{x:1},output:{prediction:2},decisionAt:100});
 assert.equal(store.list()[0].status,'pending');
 store.recordFeedback({id:'f1',caseId:'d1',observedAt:200,value:{actual:3},source:'observations'});
 const snapshot=store.snapshot(250);
 assert.equal(snapshot.cases[0].status,'scored');
 assert.match(snapshot.digest,/^[a-f0-9]{64}$/);
 assert.throws(()=>store.recordFeedback({id:'f2',caseId:'d1',observedAt:300,value:4,source:'observations'}),/already settled/);
});

test('dynamic evaluation rejects future and causally invalid feedback',()=>{
 const store=new DynamicEvaluationStore('live');
 store.recordDecision({id:'d1',input:'in',output:'out',decisionAt:100});
 assert.throws(()=>store.recordFeedback({id:'f',caseId:'d1',observedAt:99,value:null,source:'x'}),/precedes decision/);
 assert.throws(()=>store.snapshot(99),/future evidence/);
});
