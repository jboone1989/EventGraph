import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProviderConnection, RegisteredModel } from '@aihot/contracts/providers';
import { rankFreeModels, stageComplexity, coolDownModel } from '@aihot/backend/providers/registry/selection';
import { requestExtrasForTask } from '@aihot/backend/providers/llm';

const provider = (id: string, vendor: string, policy: ProviderConnection['policy'] = 'none'): ProviderConnection => ({
 id,name:vendor,vendor,policy,protocol:'openai-compatible',baseUrl:'https://example.com/v1',
 timeoutMs:30000,enabled:true,credential:{configured:true},version:1,updatedAt:new Date().toISOString()
});
const model = (id: string, providerId: string, modelId: string, complexity: RegisteredModel['complexity']): RegisteredModel => ({
 id,providerId,modelId,complexity,adapter:'chat',endpointOverride:null,timeoutOverrideMs:null,
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
 assert.deepEqual(ranked.map(m=>m.id),['or-light','nv-light','or-heavy']);
 assert.ok(!ranked.some(m=>m.id==='paid'));
});
test('task complexity keeps light work on light models and deep work on deep models',()=>{
 assert.equal(stageComplexity('prefilter'),'light');
 assert.equal(stageComplexity('groupReview'),'heavy');
 assert.equal(stageComplexity('light'),'light');
 assert.deepEqual(rankFreeModels(candidates,connections,'groupReview').map(m=>m.id),['or-heavy']);
});
test('temporary OpenRouter outage falls back to NVIDIA and cooling is per account',()=>{
 coolDownModel('or-light','or',60,true);
 assert.deepEqual(rankFreeModels(candidates,connections,'prefilter').map(m=>m.id),['nv-light']);
});
test('only tested and explicitly routed chat models are eligible',()=>{
 const blocked={...candidates[0]!,routing:{eligibleCapabilities:[],reasons:['retest required']}};
 assert.deepEqual(rankFreeModels([blocked,candidates[2]!],connections,'prefilter').map(m=>m.id),['nv-light']);
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
