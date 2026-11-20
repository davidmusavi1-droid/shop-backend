'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const budget = require('../src/lib/smart-panel/ai-budget');
const { lifecycle, releaseStaleUnsent } = require('../src/lib/smart-panel/ai-lifecycle');
const { liaraProvider, storeConfiguration } = require('../src/lib/smart-panel/liara');
const cfg = { operations:['analyze','research'], dailyLimit:20, estimatesToman:{analyze:1000,research:3000}, dailyBudgetToman:40000,
  key:'fixture-only-not-a-secret', endpoint:'https://fixture.invalid/no-network', model:'google/gemini-2.5-flash', researchModel:'perplexity/sonar' };
const images = [{id:'image',bytes:Buffer.from('fixture')}];
function fixture() {
  const row = { id:'run', operation:'analyze', scope:'same-scope', status:'pending', usage:null };
  const db = {smartAiRun:{updateMany:async ({where,data})=>{
    const matches = typeof where.status==='string' ? row.status===where.status : where.status.in.includes(row.status);
    if(where.id!==row.id||!matches)return {count:0}; Object.assign(row,data); return {count:1};
  }}};
  const track = lifecycle(db,row.id,row.scope,{estimateToman:1000});row.usage=track.reservationUsage;
  return {row,track};
}
const failure = async fn => {try{await fn();assert.fail('Expected failure');}catch(e){return e;}};

test('cancellation before dispatch releases count/budget, keeps history, and never calls fetch',async()=>{
  const {row,track}=fixture();let calls=0;
  const p=liaraProvider(cfg,{fetcher:async()=>{calls++;throw Error('never');}});
  const err=await failure(()=>p.analyze(images,undefined,{beforeSend:track.beforeSend,isCancelled:()=>true}));
  assert.equal(err.requestSent,false);await track.failed(err,{providerInvoked:true});
  assert.equal(calls,0);assert.equal(row.status,'released');assert.match(row.scope,/:released:run$/);
  const u=budget.summarize([row],cfg);assert.equal(u.used,0);assert.equal(u.remaining,20);assert.equal(u.reservedToman,0);
  assert.deepEqual(u.statusCounts,{started:1,sent:0,successful:0,failed:1,unknown:0,reserved:0,released:1});
});

test('cancellation after durable marker but before fetch is proven unsent and released',async()=>{
  const {row,track}=fixture();let cancelled=false,calls=0;
  const p=liaraProvider(cfg,{fetcher:async()=>{calls++;}});
  const err=await failure(()=>p.analyze(images,undefined,{beforeSend:async()=>{await track.beforeSend();cancelled=true;},isCancelled:()=>cancelled}));
  await track.failed(err,{providerInvoked:true});assert.equal(calls,0);assert.equal(row.status,'released');assert.equal(budget.summarize([row],cfg).used,0);
});

test('failed durable dispatch lock blocks fetch; pre-provider blocking also frees reservation',async()=>{
  let calls=0;const p=liaraProvider(cfg,{fetcher:async()=>{calls++;}});
  const err=await failure(()=>p.analyze(images,undefined,{beforeSend:async()=>{throw Error('db failed before fetch');}}));
  assert.equal(err.requestSent,false);assert.equal(calls,0);
  const {row,track}=fixture();await track.failed(Error('window closed'),{providerInvoked:false});assert.equal(row.status,'released');
});

for(const kind of ['timeout','disconnect','http','invalid'])test('sent '+kind+' is retained, classified and never automatically retried',async()=>{
  const {row,track}=fixture();let calls=0;
  const p=liaraProvider(cfg,{fetcher:async()=>{
    calls++;assert.equal(row.status,'dispatching');
    if(kind==='timeout')throw new DOMException('timeout','TimeoutError');
    if(kind==='disconnect')throw new TypeError('network disconnected');
    if(kind==='http')return new Response('private failure',{status:429});
    return Response.json({id:'official-fixture-id',usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2,total_cost_toman:2400},choices:[]});
  }});
  const err=await failure(()=>p.analyze(images,undefined,{beforeSend:track.beforeSend}));
  assert.equal(err.requestSent,true);await track.failed(err,{providerInvoked:true});assert.equal(calls,1);
  assert.equal(row.status,['timeout','disconnect'].includes(kind)?'unknown':'failed');assert.equal(row.scope,'same-scope');
  const u=budget.summarize([row],cfg);assert.equal(u.used,1);assert.equal(u.remaining,19);assert.ok(u.reservedToman>=1000);
  assert.equal(u.statusCounts.unknown,['timeout','disconnect'].includes(kind)?1:0);
  if(kind==='invalid'){assert.equal(u.reportedToman,2400);assert.equal(u.reservedToman,2400);}
});

test('ambiguous legacy rows and interrupted dispatch stay charged; unproven release cannot free quota',()=>{
  const rows=[{operation:'analyze',status:'failed',usage:{estimateToman:1000}},
    {operation:'analyze',status:'dispatching',usage:{estimateToman:1000,lifecycle:{phase:'dispatching'}}},
    {operation:'research',status:'released',usage:{estimateToman:3000}}];
  const u=budget.summarize(rows,cfg);assert.equal(u.used,3);assert.equal(u.statusCounts.unknown,3);assert.equal(u.reservedToman,5000);
});

test('uncertain database completion never overwrites a committed success or clears costs',async()=>{
  const {row,track}=fixture();await track.beforeSend();row.status='completed';row.usage=track.completed({costToman:260});
  await track.failed(Error('commit acknowledgement lost'),{providerInvoked:true});
  assert.equal(row.status,'completed');assert.equal(row.usage.costToman,260);
  const u=budget.summarize([row],cfg);assert.equal(u.statusCounts.successful,1);assert.equal(u.reportedToman,260);assert.equal(u.estimatedToman,1000);
});

test('20 requests and 40000 toman are enforced independently; no hidden currency conversion',()=>{
  const rows=Array.from({length:20},()=>({operation:'analyze',status:'unknown',usage:{estimateToman:1000}}));
  assert.throws(()=>budget.checkCapacity(budget.summarize(rows,cfg),cfg,'analyze'),{code:'AI_DAILY_LIMIT'});
  const money=[{operation:'research',status:'failed',usage:{costToman:39000,lifecycle:{phase:'responded'}}}];
  assert.throws(()=>budget.checkCapacity(budget.summarize(money,cfg),cfg,'research'),{code:'AI_DAILY_LIMIT'});
  assert.doesNotThrow(()=>budget.checkCapacity(budget.summarize(money,cfg),cfg,'analyze'));
  const q=budget.quote({id:'dossier',version:1},'research',cfg,budget.summarize([],cfg));
  assert.equal(q.estimateToman,3000);assert.equal(q.estimateUsd,null);assert.equal(budget.verifyQuote(q.token,{id:'dossier',version:1},'research',cfg).estimateToman,3000);
  assert.throws(()=>budget.verifyQuote(q.token,{id:'dossier',version:1},'research',{...cfg,estimatesToman:{research:4000}}),{code:'AI_QUOTE_REQUIRED'});
  assert.throws(()=>budget.quote({id:'dossier',version:1},'research',{...cfg,estimatesToman:{}},budget.summarize([],cfg)),{code:'AI_BUDGET_REQUIRED'});
  const env={MOTIF_C22_VISION:'on',MOTIF_C22_DAILY_LIMIT:'100',MOTIF_C2_API_KEY:cfg.key,MOTIF_C2_BASE_URL:'https://ai.liara.ir/api/000000000000000000000000/v1',MOTIF_C22_DAILY_BUDGET_TOMAN:'100000'};
  const config=storeConfiguration(env);assert.equal(config.dailyLimit,20);assert.equal(config.dailyBudgetToman,40000);
});

test('crashed pre-dispatch reservation can be reclaimed, but suspended worker cannot later fetch',async()=>{
  const {row,track}=fixture();
  const db={smartAiRun:{findMany:async()=>[structuredClone(row),{id:'legacy',scope:'legacy',usage:null}],updateMany:async({where,data})=>{
    if(where.id!==row.id||row.status!==where.status)return {count:0};Object.assign(row,data);return {count:1};
  }}};
  await releaseStaleUnsent(db);assert.equal(row.status,'released');
  let calls=0;const p=liaraProvider(cfg,{fetcher:async()=>{calls++;}});
  const error=await failure(()=>p.analyze(images,undefined,{beforeSend:track.beforeSend}));
  assert.equal(error.requestSent,false);assert.equal(calls,0);assert.equal(budget.summarize([row],cfg).used,0);
});
