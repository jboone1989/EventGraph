import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {checkProviderChanges} from "@aihot/backend/providers/registry/validation";
import {instantiateProvider,ChatProvider,EmbeddingProvider,parseSseCompletion} from "@aihot/backend/providers/registry/adapter";
import type {ProviderProfile} from "@aihot/backend/providers/registry/types";
const now=Date.parse("2026-10-17T01:00:00Z");
const profile=(id:string,level:ProviderProfile["complexity"]):ProviderProfile=>({
 vendor:"nvidia",modelId:id,adapter:"chat",endpoint:"https://integrate.api.nvidia.com/v1/chat/completions",
 credentialEnv:"NVIDIA_API_KEY",capabilities:["text"],requestDefaults:{},probeSpec:null,timeoutMs:60000,stream:false,
 complexity:level,documentationUrl:null,notes:null,enabled:true,routeEnabled:true,
 version:1,updatedAt:new Date(now).toISOString(),checks:[{capability:"text",status:"verified",
 verifiedAt:new Date(now-1000).toISOString(),latencyMs:1000}],
});
test("each of the 81 model IDs has a separate database configuration, disabled by default",()=>{
 const sql=readFileSync(new URL("../database/migrations/0101_model_providers.sql",import.meta.url),"utf8");
 const seed=JSON.parse(readFileSync(new URL("../config/model-provider-seed.json",import.meta.url),"utf8"));
 const ids=seed.providers.map((p:{modelId:string})=>p.modelId);
 assert.equal(ids.length,81);assert.equal(new Set(ids).size,81);
 assert.ok(seed.providers.every((p:{vendor:string})=>p.vendor==="nvidia"));
 assert.match(sql,/enabled boolean NOT NULL DEFAULT false/);
 assert.match(sql,/route_enabled boolean NOT NULL DEFAULT false/);
 assert.match(readFileSync(new URL("../database/migrations/0102_model_provider_checks.sql",import.meta.url),"utf8"),/CREATE TABLE model_provider_checks/);
});
test("independent provider parameters reject manually entered test timeouts",()=>{
 const p=profile("nvidia/nemotron-3-super-120b-a12b","heavy");
 assert.doesNotThrow(()=>checkProviderChanges({requestDefaults:{reasoning_budget:1024,temperature:1},stream:true},p));
 assert.throws(()=>checkProviderChanges({endpoint:"https://evil.example/v1/chat/completions"},p),/approved NVIDIA/);
 assert.throws(()=>checkProviderChanges({requestDefaults:{authorization:"leaked"}},p),/unsafe/);
 assert.throws(()=>checkProviderChanges({timeoutMs:0} as never,p),/unknown provider configuration property/);
});
test("each instance uses its independent profile and adapter",()=>{
 const a=instantiateProvider(profile("openai/gpt-oss-20b","light"));
 const b=instantiateProvider(profile("nvidia/nemotron-3-super-120b-a12b","heavy"));
 assert.ok(a instanceof ChatProvider);assert.ok(b instanceof ChatProvider);
 assert.notStrictEqual(a,b);assert.notStrictEqual(a.profile,b.profile);
 const e={...profile("nvidia/nemotron-3-embed-1b","light"),adapter:"embedding" as const,
  endpoint:"https://integrate.api.nvidia.com/v1/embeddings",capabilities:["embedding" as const]};
 assert.ok(instantiateProvider(e) instanceof EmbeddingProvider);
});
test("streaming models separate reasoning content from final answer and require DONE",()=>{
 const raw=[
 'data: {"choices":[{"delta":{"reasoning_content":"thought"},"finish_reason":null}]}',
 'data: '+JSON.stringify({choices:[{delta:{content:'{"label":"OK"}'},finish_reason:'stop'}]}),
 'data: [DONE]'
 ].join("\n");
 const r=parseSseCompletion(raw);
 assert.deepEqual((r.choices as any[])[0].message.content,'{"label":"OK"}');
 assert.equal((r.choices as any[])[0].message.reasoning_content,"thought");
 assert.throws(()=>parseSseCompletion(raw.replace("data: [DONE]","")),/DONE/);
});
