import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProviderConnection, RegisteredModel } from '@aihot/contracts/providers';
import { rankAutomaticModels, stageComplexity, coolDownModel, rememberSuccessfulRoute, autoRouteFailureCooldownSeconds, activeFailedRouteIds, activeFailedFreeAccountIds, isOpenRouterDailyFreeQuota, nextUtcMidnight } from '@aihot/backend/providers/registry/selection';
import { ProviderRejectedError, parseRetryAfterSeconds } from '@aihot/backend/providers/receipts';
import { requestExtrasForTask } from '@aihot/backend/providers/llm';
import { complexityFromModelId } from '@aihot/contracts/providers';

const provider = (id: string, vendor: string, policy: ProviderConnection['policy'] = 'none'): ProviderConnection => ({
 id,name:vendor,vendor,policy,protocol:'openai-compatible',baseUrl:'https://example.com/v1',
 timeoutMs:30000,enabled:true,credential:{configured:true},version:1,updatedAt:new Date().toISOString()
});
const model = (id: string, providerId: string, modelId: string, complexity: RegisteredModel['complexity']): RegisteredModel => ({
 id,providerId,modelId,complexity,billing:id==='paid'?'paid':'free',adapter:'chat',endpointOverride:null,timeoutOverrideMs:null,
 capabilities:['text'],requestDefaults:{},probeSpec:null,stream:false,documentationUrl:null,
 notes:null,enabled:true,routeEnabled:true,upstreamMetadata:{},
 routing:{eligibleCapabilities:['text'],reasons:[]},version:1,updatedAt:new Date().toISOString(),
 checks:[{capability:'text',status:'verified',verifiedAt:new Date().toISOString(),latencyMs:100}]
});
const connections=[provider('or','openrouter'),provider('nv','nvidia','nvidia-free-trial')];
const candidates=[
 model('or-light','or','openai/gpt-oss-20b:free','light'),
 model('or-heavy','or','deepseek/deepseek-r1:free','heavy'),
 model('nv-light','nv','openai/gpt-oss-20b','light'),
 model('paid','or','anthropic/claude-sonnet','heavy'),
];
test('automatic routing includes paid and free registered models without tier downgrade',()=>{
 const ranked=rankAutomaticModels(candidates,connections,'prefilter');
 assert.deepEqual(ranked.map(m=>m.id),['nv-light','or-light','paid','or-heavy']);
 assert.ok(ranked.some(m=>m.id==='paid'));
 assert.ok(ranked.every(m=>m.enabled&&m.routeEnabled));
});
test('task complexity keeps light work on light models and deep work on deep models',()=>{
 assert.equal(stageComplexity('prefilter'),'light');
 assert.equal(stageComplexity('groupReview'),'heavy');
 assert.equal(stageComplexity('report'),'heavy');
 assert.equal(stageComplexity('summarize'),'light');
 for(const stage of ['understand','group','graphiti','english','digest','explain'])
  assert.equal(stageComplexity(stage),'medium',stage+' must not route every call to advanced tier');
 assert.equal(stageComplexity('unrecognized-future-stage'),'medium');
 assert.equal(stageComplexity('light'),'light');
 assert.deepEqual(rankAutomaticModels(candidates,connections,'groupReview').map(m=>m.id),['paid','or-heavy']);
});
test('failure cools only its model UUID, not other models on the same connection',()=>{
 coolDownModel('or-light',60);
 assert.deepEqual(rankAutomaticModels(candidates,connections,'prefilter').map(m=>m.id),['nv-light','paid','or-heavy']);
});
test('only enabled and explicitly routed chat models are eligible, without a probe prerequisite',()=>{
 const blocked={...candidates[0]!,routeEnabled:false};
 assert.deepEqual(rankAutomaticModels([blocked,candidates[2]!],connections,'prefilter').map(m=>m.id),['nv-light']);
});

test('the last successful free model is reused until it fails',()=>{
 const alt=provider('alt','openrouter');
 const selected=model('cached','alt','another/model-20b','light');
 const second=model('second','alt','another/model-21b','light');
 rememberSuccessfulRoute('model:cached','light');
 assert.equal(rankAutomaticModels([second,selected],[alt],'light')[0]?.id,'cached');
 coolDownModel('cached',60);
 assert.equal(rankAutomaticModels([second,selected],[alt],'light')[0]?.id,'second');
});
test('a remembered higher-tier fallback never preempts an available exact-tier free model',()=>{
 const elevated=model('elevated-tier-cache','or','zz-advanced','heavy');
 const exact=model('exact-tier-free','nv','aa-light','light');
 rememberSuccessfulRoute('model:elevated-tier-cache','prefilter');
 const preferred=rankAutomaticModels([elevated,exact],connections,'prefilter');
 assert.deepEqual(preferred.map(m=>m.id),['exact-tier-free','elevated-tier-cache']);
 // An advanced task may not downgrade to an available light model.
 assert.deepEqual(rankAutomaticModels([elevated,exact],connections,'groupReview').map(m=>m.id),['elevated-tier-cache']);
});

test('standard task prefers standard free model and keeps higher-tier fallback',()=>{
 const medium=model('stage-medium-exact','or','aa-standard','medium');
 const heavy=model('stage-heavy-lastgood','nv','zz-advanced','heavy');
 const paid=model('paid','or','paid-model','medium');
 rememberSuccessfulRoute('model:stage-heavy-lastgood','understand');
 assert.deepEqual(rankAutomaticModels([heavy,medium,paid],connections,'understand').map(m=>m.id),
  ['stage-medium-exact','paid','stage-heavy-lastgood']);
 assert.deepEqual(rankAutomaticModels([heavy,paid],connections,'understand').map(m=>m.id),
  ['paid','stage-heavy-lastgood']);
});

test('parameter count supplies only an initial, overridable tier',()=>{
 assert.equal(complexityFromModelId('model-26b-a4b'),'light');
 assert.equal(complexityFromModelId('model-120b-a12b'),'medium');
 assert.equal(complexityFromModelId('model-550b-a55b'),'heavy');
 assert.equal(complexityFromModelId('openrouter/free'),'medium');
});

test('same vendor and same upstream name remain independent by internal model UUID',()=>{
 const a=provider('groq-a','groq'),b=provider('groq-b','groq');
 const first=model('groq-uuid-a',a.id,'openai/gpt-oss-120b','medium');
 const second=model('groq-uuid-b',b.id,'openai/gpt-oss-120b','medium');
 assert.deepEqual(rankAutomaticModels([first,second],[a,b],'medium').map(m=>m.id),['groq-uuid-a','groq-uuid-b']);
 coolDownModel(first.id,60);
 assert.deepEqual(rankAutomaticModels([first,second],[a,b],'medium').map(m=>m.id),['groq-uuid-b']);
});

test('the ninth and tenth eligible same-name instances remain available after earlier rejections',()=>{
 const accounts=Array.from({length:10},(_,i)=>provider('groq-account-'+i,'groq'));
 const entries=accounts.map((connection,i)=>model('instance-'+String(i).padStart(2,'0'),connection.id,'openai/gpt-oss-120b','medium'));
 const rejected=new Set(entries.slice(0,9).map(m=>m.id));
 assert.deepEqual(rankAutomaticModels(entries,accounts,'medium',Date.now(),false,rejected).map(m=>m.id),['instance-09']);
});

test('NVIDIA Ultra uses non-reasoning mode only for schema-constrained grouping', () => {
 const spec = { service: 'nvidia', model: 'nvidia/nemotron-3-ultra-550b-a55b', extra: { temperature: 0.5, reasoning_effort: 'high' } };
 for (const purpose of ['group_article', 'group_review', 'group_signal', 'group_story', 'group_story_review']) {
  assert.deepEqual(requestExtrasForTask(spec, purpose), { temperature: 0.5, reasoning_effort: 'none' });
 }
 assert.deepEqual(requestExtrasForTask(spec, 'understand_article'), spec.extra);
 assert.deepEqual(requestExtrasForTask(spec, 'score_article'), spec.extra);
 assert.deepEqual(requestExtrasForTask({ ...spec, service: 'openrouter' }, 'group_article'), spec.extra);
 assert.deepEqual(requestExtrasForTask({ ...spec, model: 'nvidia/nemotron-3.5-super-vl-120b-a12b' }, 'group_article'), spec.extra);
 assert.deepEqual(requestExtrasForTask({ ...spec, extra: undefined }, 'group_article'), { reasoning_effort: 'none' });
 assert.equal(requestExtrasForTask({ ...spec, extra: undefined }, 'score_article'), undefined);
});

test('automatic routing can fail over across six providers and a paid instance',()=>{
 const owners=[provider('pool-or','openrouter'),provider('pool-nv','nvidia','nvidia-free-trial'),
  provider('pool-groq','groq'),provider('pool-gemini','gemini'),
  provider('pool-zai','zai'),provider('pool-cf','cloudflare')];
 const choices=owners.map((p,i)=>model('candidate-'+i,p.id,'test/free-20b','light'));
 const paid={...model('candidate-paid','pool-groq','paid-20b','light'),billing:'paid' as const};
 const first=rankAutomaticModels([...choices,paid],owners,'light');
 assert.equal(first.length,7);
 assert.ok(first.some(m=>m.id==='candidate-paid'));
 for(const entry of first.slice(0,6))coolDownModel(entry.id,60);
 const last=rankAutomaticModels([...choices,paid],owners,'light');
 assert.deepEqual(last.map(m=>m.id),[first[6]!.id]);
 assert.equal(last.length,1);
});

test('failed automatic model calls cool briefly rather than through the rest of the UTC day',()=>{
 assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('HTTP 429 rate limit',429,true)),300);
 assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('HTTP 413 too large',413,false)),60);
 assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('HTTP 503',503,true)),120);
 assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('HTTP 401 invalid key',401,false)),1800);
 assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('HTTP 410 retired',410,false)),1800);
 assert.equal(autoRouteFailureCooldownSeconds(new Error('No JSON object in model output')),60);
 assert.equal(autoRouteFailureCooldownSeconds(new Error('output token limit reached')),60);
});
test('expired or legacy UTC-day failed-route records do not exclude tested healthy models',()=>{
 const now=Date.parse('2026-11-13T07:30:00.000Z');
 const active=activeFailedRouteIds([
  {key:'routing.failed:legacy',value:{reason:'previous release',at:'2026-11-13T00:00:01Z'}},
  {key:'routing.failed:expired',value:{until:'2026-11-13T07:29:59.999Z'}},
  {key:'routing.failed:current',value:{until:'2026-11-13T07:30:30.000Z'}},
  {key:'routing.failed:bad-date',value:{until:'not-a-date'}},
  {key:'irrelevant:other',value:{until:'2026-11-14T00:00:00Z'}},
  {key:'routing.failed:malformed',value:null},
 ],now);
 assert.deepEqual([...active],['current']);
 assert.equal(activeFailedRouteIds([{key:'routing.failed:current',value:{until:'2026-11-13T07:30:30.000Z'}}],now+30001).size,0);
});

test('persisted cooldown excludes only the failed model instance, not a second account with the same upstream model',()=>{
 const now=Date.parse('2026-11-13T07:30:00Z');
 const excluded=activeFailedRouteIds([{key:'routing.failed:groq-uuid-a',value:{until:'2026-11-13T07:35:00Z'}}],now);
 assert.ok(excluded.has('groq-uuid-a'));
 assert.equal(excluded.has('groq-uuid-b'),false);
});

test('only the closed set of OpenRouter free daily quota markers is connection-wide',()=>{
  const rejected=(detail:string,status=429)=>new ProviderRejectedError('Provider HTTP '+status,status,true,detail);
  for(const daily of ['free-models-per-day-high-balance','free-models-per-day','limit_source=openrouter_free_tier_daily']){
    assert.equal(isOpenRouterDailyFreeQuota(rejected('code 429: '+daily+'.')),true,daily);
  }
  for(const transient of ['free-models-per-min','limit_source=openrouter_free_tier_per_minute',
    'limit_source=upstream_provider_shared_pool','free-models-per-day-next','rate limit exceeded']){
    assert.equal(isOpenRouterDailyFreeQuota(rejected('code 429: '+transient+'.')),false,transient);
  }
  assert.equal(isOpenRouterDailyFreeQuota(rejected('free-models-per-day-high-balance',413)),false);
  assert.equal(isOpenRouterDailyFreeQuota(new Error('free-models-per-day-high-balance')),false);
});

test('Retry-After preserves bounded numeric seconds but not untrusted date or malformed headers',()=>{
  assert.equal(parseRetryAfterSeconds('1200'),1200);
  assert.equal(parseRetryAfterSeconds(' 0.25 '),1);
  assert.equal(parseRetryAfterSeconds('999999'),86400);
  for(const invalid of [null,'0','-1','NaN','Infinity','bad','Fri, 20 Nov 2026 12:00:00 GMT']){
    assert.equal(parseRetryAfterSeconds(invalid),undefined,String(invalid));
  }
  assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('429',429,true,undefined,1200)),1200);
  assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('429',429,true,undefined,999999)),86400);
  assert.equal(autoRouteFailureCooldownSeconds(new ProviderRejectedError('429',429,true,undefined,30)),300);
});

test('free quota reset expires at next UTC midnight including across month boundaries',()=>{
  assert.equal(nextUtcMidnight(Date.parse('2026-11-20T23:50:00Z')).toISOString(),'2026-11-21T00:00:00.000Z');
  assert.equal(nextUtcMidnight(Date.parse('2026-12-31T23:59:59Z')).toISOString(),'2027-01-01T00:00:00.000Z');
  assert.equal(nextUtcMidnight(Date.parse('2026-11-21T00:00:00Z')).toISOString(),'2026-11-22T00:00:00.000Z');
});

test('a daily free quota blocks free models only on the affected provider account',()=>{
  const now=Date.parse('2026-11-20T12:00:00Z');
  const owners=[provider('or-quota-account','openrouter'),provider('or-healthy-account','openrouter')];
  const freeA=model('quota-free-a',owners[0]!.id,'shared/free-120b','medium');
  const freeB=model('quota-free-b',owners[0]!.id,'another/free-120b','medium');
  const paidA={...model('quota-paid',owners[0]!.id,'paid-120b','medium'),billing:'paid' as const};
  const freeOther=model('healthy-free',owners[1]!.id,'shared/free-120b','medium');
  const models=[freeA,freeB,paidA,freeOther];
  const rows=[
    {key:'routing.failed.free-account:or-quota-account',value:{until:'2026-11-21T00:00:00.000Z'}},
    {key:'routing.failed:old',value:{until:'2026-11-19T00:00:00.000Z'}},
  ];
  const freeAccounts=activeFailedFreeAccountIds(rows,now);
  assert.deepEqual([...freeAccounts],['or-quota-account']);
  assert.equal(activeFailedRouteIds(rows,now).has('free-account:or-quota-account'),false);
  const excluded=new Set(models.filter(m=>m.billing==='free'&&freeAccounts.has(m.providerId)).map(m=>m.id));
  assert.deepEqual(new Set(rankAutomaticModels(models,owners,'medium',now,false,excluded).map(m=>m.id)),
    new Set(['quota-paid','healthy-free']));
  assert.equal(activeFailedFreeAccountIds(rows,Date.parse('2026-11-21T00:00:00Z')).size,0);
  assert.equal(activeFailedFreeAccountIds([{key:'routing.failed:quota-free-a',value:{until:'2026-11-20T12:05:00Z'}}],now).size,0);
});
