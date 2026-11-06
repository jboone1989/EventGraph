import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isFreePoolVendor,requiresFreeTier,verifiedProviderUrl,freePoolCandidates} from '@aihot/backend/providers/registry/free-provider-catalog';

test('only four supported providers receive curated free models',()=>{
 for(const vendor of ['groq','gemini','zai','cloudflare'] as const){
  assert.equal(isFreePoolVendor(vendor),true);
  const entries=freePoolCandidates(vendor);
  assert.ok(entries.length>0);
  assert.equal(new Set(entries.map(m=>m.modelId)).size,entries.length);
  for(const m of entries){
   assert.ok(m.capabilities.some(c=>c===(m.adapter==='embedding'?'embedding':'text')));
   assert.equal(m.probeSpec.response,m.adapter==='embedding'?'embedding':'chat');
  }
 }
 assert.equal(isFreePoolVendor('openrouter'),false);
 assert.equal(isFreePoolVendor('arbitrary'),false);
});
test('free plan acknowledgement is required where paid accounts may incur charges',()=>{
 assert.equal(requiresFreeTier('groq'),true);
 assert.equal(requiresFreeTier('gemini'),true);
 assert.equal(requiresFreeTier('cloudflare'),true);
 assert.equal(requiresFreeTier('zai'),false);
});
test('official free model catalog is never applied to arbitrary API URLs',()=>{
 assert.ok(verifiedProviderUrl('groq','https://api.groq.com/openai/v1'));
 assert.ok(verifiedProviderUrl('gemini','https://generativelanguage.googleapis.com/v1beta/openai'));
 assert.ok(verifiedProviderUrl('zai','https://api.z.ai/api/paas/v4'));
 assert.ok(verifiedProviderUrl('cloudflare','https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/v1'));
 assert.equal(verifiedProviderUrl('cloudflare','https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1'),false);
 assert.equal(verifiedProviderUrl('groq','https://example.com/openai/v1'),false);
});
test('paid GLM variants and paid-only Cloudflare models excluded',()=>{
 assert.equal(freePoolCandidates('zai').some(m=>m.modelId==='glm-5.3-flash'),false);
 assert.equal(freePoolCandidates('cloudflare').some(m=>m.modelId==='@cf/zai-org/glm-5.3'),false);
});
