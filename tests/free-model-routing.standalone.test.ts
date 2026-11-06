import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProviderConnection, RegisteredModel } from '@aihot/contracts/providers';
import { rankFreeModels, stageComplexity, coolDownModel, rememberSuccessfulRoute } from '@aihot/backend/providers/registry/selection';
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
test('free-first routing never silently selects paid models',()=>{
 const ranked=rankFreeModels(candidates,connections,'prefilter');
 assert.deepEqual(ranked.map(m=>m.id),['nv-light','or-light','or-heavy']);
 assert.ok(!ranked.some(m=>m.id==='paid'));
});
test('task complexity keeps light work on light models and deep work on deep models',()=>{
 assert.equal(stageComplexity('prefilter'),'light');
 assert.equal(stageComplexity('groupReview'),'heavy');
 assert.equal(stageComplexity('light'),'light');
 assert.deepEqual(rankFreeModels(candidates,connections,'groupReview').map(m=>m.id),['or-heavy']);
});
test('failure cools only its model UUID, not other models on the same connection',()=>{
 coolDownModel('or-light',60);
 assert.deepEqual(rankFreeModels(candidates,connections,'prefilter').map(m=>m.id),['nv-light','or-heavy']);
});
test('only enabled and explicitly routed chat models are eligible, without a probe prerequisite',()=>{
 const blocked={...candidates[0]!,routeEnabled:false};
 assert.deepEqual(rankFreeModels([blocked,candidates[2]!],connections,'prefilter').map(m=>m.id),['nv-light']);
});

test('the last successful free model is reused until it fails',()=>{
 const alt=provider('alt','openrouter');
 const selected=model('cached','alt','another/model-20b','light');
 const second=model('second','alt','another/model-21b','light');
 rememberSuccessfulRoute('model:cached','light');
 assert.equal(rankFreeModels([second,selected],[alt],'light')[0]?.id,'cached');
 coolDownModel('cached',60);
 assert.equal(rankFreeModels([second,selected],[alt],'light')[0]?.id,'second');
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
 assert.deepEqual(rankFreeModels([first,second],[a,b],'medium').map(m=>m.id),['groq-uuid-a','groq-uuid-b']);
 coolDownModel(first.id,60);
 assert.deepEqual(rankFreeModels([first,second],[a,b],'medium').map(m=>m.id),['groq-uuid-b']);
});

test('the ninth and tenth eligible same-name instances remain available after earlier rejections',()=>{
 const accounts=Array.from({length:10},(_,i)=>provider('groq-account-'+i,'groq'));
 const entries=accounts.map((connection,i)=>model('instance-'+String(i).padStart(2,'0'),connection.id,'openai/gpt-oss-120b','medium'));
 const rejected=new Set(entries.slice(0,9).map(m=>m.id));
 assert.deepEqual(rankFreeModels(entries,accounts,'medium',Date.now(),false,rejected).map(m=>m.id),['instance-09']);
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

test('automatic free routing can fail over across six providers without selecting a paid model',()=>{
 const owners=[provider('pool-or','openrouter'),provider('pool-nv','nvidia','nvidia-free-trial'),
  provider('pool-groq','groq'),provider('pool-gemini','gemini'),
  provider('pool-zai','zai'),provider('pool-cf','cloudflare')];
 const choices=owners.map((p,i)=>model('candidate-'+i,p.id,'test/free-20b','light'));
 const paid={...model('candidate-paid','pool-groq','paid-20b','light'),billing:'paid' as const};
 const first=rankFreeModels([...choices,paid],owners,'light');
 assert.equal(first.length,6);
 for(const entry of first.slice(0,5))coolDownModel(entry.id,60);
 const last=rankFreeModels([...choices,paid],owners,'light');
 assert.deepEqual(last.map(m=>m.id),[first[5]!.id]);
 assert.equal(last.some(m=>m.id==='candidate-paid'),false);
});
