import {randomUUID} from 'node:crypto';
import {complexityFromModelId} from '@aihot/contracts/providers';
import {classifyOpenRouterFreeCatalog} from './openrouter-free-catalog.ts';
import {sql} from '../../db.ts';
import {audit} from '../../audit.ts';
import {guardedFetch} from '../../lib/http-fetch.ts';
import {loadConnection,clearRegisteredModelCache} from './connections.ts';
import {storedCredential} from './connection-secrets.ts';
import {ProviderConfigError} from './connection-types.ts';

/** Explicit operator sync: no scheduled refresh, model deletions, or workflow-binding mutations. */
export async function syncOpenRouterFreeModels(providerId:string,actor:string){
 const connection=await loadConnection(providerId);
 if(connection.vendor.toLowerCase()!=='openrouter'||connection.protocol!=='openai-compatible')
  throw new ProviderConfigError('Select an OpenRouter connection','providerId');
 const key=storedCredential(connection);
 if(!key)throw new ProviderConfigError('Configure the OpenRouter API key first','credential');
 const response=await guardedFetch('https://openrouter.ai/api/v1/models?output_modalities=all',{
  method:'GET',headers:{authorization:'Bearer '+key,accept:'application/json'},
  timeoutMs:connection.timeout_ms,maxRedirects:0,maxBytes:16*1024*1024
 });
 if(response.status<200||response.status>=300)
  throw new ProviderConfigError('OpenRouter catalog HTTP '+response.status,'providerId',502);
 let payload:{data?:unknown[]};
 try {payload=JSON.parse(response.text()) as {data?:unknown[]};}
 catch {throw new ProviderConfigError('Invalid OpenRouter catalog JSON','providerId',502);}
 if(!Array.isArray(payload.data)||payload.data.length===0)
  throw new ProviderConfigError('OpenRouter returned an empty or invalid model catalog','providerId',502);
 // Both token prices must be zero; a free input price alone does not make a model free.
 const catalog=classifyOpenRouterFreeCatalog(payload.data);
 const freeIds=new Set(catalog.models.map(m=>m.id));
 const timestamp=new Date().toISOString();
 const result=await sql.begin(async tx=>{
  await tx`SELECT id FROM provider_connections WHERE id=${providerId}::uuid FOR UPDATE`;
  const existing=await tx<{model_id:string;upstream_metadata:Record<string,unknown>}[]>`
   SELECT model_id,upstream_metadata FROM registered_models WHERE provider_id=${providerId}::uuid FOR UPDATE`;
  const previous=new Set(existing.map(m=>m.model_id));
  for(const model of catalog.models){
   const modelId=model.id;
   const metadata=tx.json({openrouterFreeSync:{free:true,checkedAt:timestamp,adapter:model.adapter}});
   await tx`INSERT INTO registered_models
    (id,provider_id,model_id,adapter,capabilities,probe_spec,enabled,route_enabled,billing,upstream_metadata,updated_by)
    VALUES (${randomUUID()}::uuid,${providerId}::uuid,${modelId},${model.adapter},${tx.json(model.capabilities)},
      ${model.probe?tx.json(model.probe):null},
      ${model.adapter!=='special'},false,'free',${metadata},${actor})
    ON CONFLICT(provider_id,model_id) DO UPDATE SET
      upstream_metadata=registered_models.upstream_metadata || EXCLUDED.upstream_metadata,
      billing='free'`;
  }
  let noLongerFree=0;
  for(const row of existing){
   if(freeIds.has(row.model_id)||!row.upstream_metadata?.openrouterFreeSync)continue;
   await tx`UPDATE registered_models SET billing='paid',upstream_metadata=upstream_metadata ||
    ${tx.json({openrouterFreeSync:{free:false,checkedAt:timestamp}})}
    WHERE provider_id=${providerId}::uuid AND model_id=${row.model_id}`;
   noLongerFree++;
  }
  const summary={catalogTotal:payload.data.length,freeCatalog:catalog.freeCatalog,
   chat:catalog.chat,embedding:catalog.embedding,other:catalog.other,invalid:catalog.invalid,
   total:freeIds.size,added:[...freeIds].filter(id=>!previous.has(id)).length,noLongerFree};
  await audit(actor,'provider.models.openrouter-free-sync',providerId,'后台手动同步 OpenRouter 免费模型',null,summary,{db:tx});
  return summary;
 });
 clearRegisteredModelCache();
 return result;
}
