import {complexityFromModelId} from '@aihot/contracts/providers';

export type FreeProviderVendor='groq'|'gemini'|'zai'|'cloudflare';
type Seed={id:string;adapter:'chat'|'embedding';vision?:boolean};
const catalogs:Record<FreeProviderVendor,readonly Seed[]>={
 // https://console.groq.com/docs/rate-limits
 groq:[{id:'openai/gpt-oss-20b',adapter:'chat'},
       {id:'openai/gpt-oss-120b',adapter:'chat'},
       {id:'qwen/qwen3.8-27b',adapter:'chat'}],
 // Free Tier only: https://ai.google.dev/gemini-api/docs/pricing
 gemini:[{id:'gemini-2.5-flash-lite',adapter:'chat'},{id:'gemini-2.5-flash',adapter:'chat'}],
 // Free input + output: https://docs.z.ai/guides/overview/pricing
 zai:[{id:'glm-4.7-flash',adapter:'chat'},{id:'glm-4.5-flash',adapter:'chat'},
      {id:'glm-4.6v-flash',adapter:'chat',vision:true}],
 // Workers Free 10,000 neurons/day; no automatic excess on Free plan.
 // https://developers.cloudflare.com/workers-ai/platform/pricing/
 cloudflare:[{id:'@cf/meta/llama-3.1-8b-instruct',adapter:'chat'},
             {id:'@cf/openai/gpt-oss-20b',adapter:'chat'},
             {id:'@cf/baai/bge-large-en-v1.5',adapter:'embedding'}],
};
const URLs:Record<Exclude<FreeProviderVendor,'cloudflare'>,string>={
 groq:'https://api.groq.com/openai/v1',
 gemini:'https://generativelanguage.googleapis.com/v1beta/openai',
 zai:'https://api.z.ai/api/paas/v4',
};
export const isFreePoolVendor=(v:string):v is FreeProviderVendor=>Object.hasOwn(catalogs,v);
export const requiresFreeTier=(v:FreeProviderVendor):boolean=>v!=='zai';
export function verifiedProviderUrl(v:FreeProviderVendor,url:string):boolean{
 const normalized=url.replace(/\/$/,'');
 if(v==='cloudflare')return /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/[0-9a-f]{32}\/ai\/v1$/i.test(normalized);
 return normalized===URLs[v];
}
export function freePoolCandidates(v:FreeProviderVendor){
 return catalogs[v].map(m=>({
  modelId:m.id,adapter:m.adapter,complexity:complexityFromModelId(m.id),
  capabilities:m.adapter==='embedding'?(['embedding'] as const):m.vision?(['text','vision'] as const):(['text'] as const),
  probeSpec:m.adapter==='embedding'
   ?{capability:'embedding' as const,body:{input:'Hello world'},response:'embedding' as const}
   :{capability:'text' as const,body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat' as const},
 }));
}
