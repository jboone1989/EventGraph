import {randomUUID} from 'node:crypto';
import {sql} from '../../db.ts';
import {audit} from '../../audit.ts';
import {guardedFetch} from '../../lib/http-fetch.ts';
import {loadConnection,clearRegisteredModelCache} from './connections.ts';
import {storedCredential} from './connection-secrets.ts';
import {ProviderConfigError} from './connection-types.ts';

type CatalogModel={id?:unknown;pricing?:Record<string,unknown>;architecture?:{output_modalities?:unknown}};
const isZero=(value:unknown)=>typeof value==='string'||typeof value==='number'?Number(value)===0&&String(value).trim()!=='':false;
const isFreeChat=(model:CatalogModel):model is CatalogModel&{id:string}=>typeof model.id==='string'&&
 model.id.length>0&&model.id.length<=300&&isZero(model.pricing?.prompt)&&isZero(model.pricing?.completion)&&
 (!Array.isArray(model.architecture?.output_modalities)||model.architecture.output_modalities.includes('text'));

/** Explicit operator sync: no scheduled refresh, model deletions, or workflow-binding mutations. */
export async function syncOpenRouterFreeModels(providerId:string,actor:string){
 const connection=await loadConnection(providerId);
 if(connection.vendor.toLowerCase()!=='openrouter'||connection.protocol!=='openai-compatible')
  throw new ProviderConfigError('Select an OpenRouter connection','providerId');
 const key=storedCredential(connection);
 if(!key)throw new ProviderConfigError('Configure the OpenRouter API key first','credential');
 const response=await guardedFetch('https://openrouter.ai/api/v1/models',{
  method:'GET',headers:{authorization:'Bearer '+key,accept:'application/json'},
  timeoutMs:connection.timeout_ms,maxRedirects:0,maxBytes:16*1024*1024
 });
 if(response.status<200||response.status>=300)
  throw new ProviderConfigError('OpenRouter catalog HTTP '+response.status,'providerId',502);
 let payload:{data?:CatalogModel[]};
 try {payload=JSON.parse(response.text()) as {data?:CatalogModel[]};}
 catch {throw new ProviderConfigError('Invalid OpenRouter catalog JSON','providerId',502);}
 if(!Array.isArray(payload.data)||payload.data.length===0)
  throw new ProviderConfigError('OpenRouter returned an empty or invalid model catalog','providerId',502);
 // Both token prices must be zero; a free input price alone does not make a model free.
 const freeIds=new Set(payload.data.filter(isFreeChat).map(m=>m.id));
 freeIds.add('openrouter/free');
 const catalog=new Map(payload.data.filter((m):m is CatalogModel&{id:string}=>typeof m.id==='string').map(m=>[m.id,m]));
 const timestamp=new Date().toISOString();
 const result=await sql.begin(async tx=>{
  await tx`SELECT id FROM provider_connections WHERE id=${providerId}::uuid FOR UPDATE`;
  const existing=await tx<{model_id:string;upstream_metadata:Record<string,unknown>}[]>`
   SELECT model_id,upstream_metadata FROM registered_models WHERE provider_id=${providerId}::uuid FOR UPDATE`;
  const previous=new Set(existing.map(m=>m.model_id));
  for(const row of existing){
   const entry=catalog.get(row.model_id);
   const rate=entry?.pricing;
   const valid=rate&&['prompt','completion'].every(k=>rate[k]!==undefined&&rate[k]!==null&&rate[k]!==''&&Number.isFinite(Number(rate[k]))&&Number(rate[k])>=0);
   const pricing=valid?{kind:isFreeChat(entry!)?'free':'paid',inputPerMillion:Number(rate!.prompt)*1e6,outputPerMillion:Number(rate!.completion)*1e6,checkedAt:timestamp,source:'openrouter'}:
    {kind:'unknown',checkedAt:timestamp,source:'openrouter'};
   await tx`UPDATE registered_models SET upstream_metadata=upstream_metadata || ${tx.json({pricing})}
    WHERE provider_id=${providerId}::uuid AND model_id=${row.model_id}`;
  }
  for(const modelId of freeIds){
   const metadata=tx.json({openrouterFreeSync:{free:true,checkedAt:timestamp},pricing:{kind:'free',inputPerMillion:0,outputPerMillion:0,checkedAt:timestamp,source:'openrouter'}});
   await tx`INSERT INTO registered_models
    (id,provider_id,model_id,adapter,capabilities,probe_spec,enabled,route_enabled,upstream_metadata,updated_by)
    VALUES (${randomUUID()}::uuid,${providerId}::uuid,${modelId},'chat',${tx.json(['text'])},
      ${tx.json({capability:'text',body:{messages:[{role:'user',content:'Reply OK'}]},response:'chat'})},
      true,false,${metadata},${actor})
    ON CONFLICT(provider_id,model_id) DO UPDATE SET
      upstream_metadata=registered_models.upstream_metadata || EXCLUDED.upstream_metadata`;
  }
  let noLongerFree=0;
  for(const row of existing){
   if(freeIds.has(row.model_id)||!row.upstream_metadata?.openrouterFreeSync)continue;
   await tx`UPDATE registered_models SET upstream_metadata=upstream_metadata ||
    ${tx.json({openrouterFreeSync:{free:false,checkedAt:timestamp}})}
    WHERE provider_id=${providerId}::uuid AND model_id=${row.model_id}`;
   noLongerFree++;
  }
  const summary={total:freeIds.size,added:[...freeIds].filter(id=>!previous.has(id)).length,noLongerFree};
  await audit(actor,'provider.models.openrouter-free-sync',providerId,'后台手动同步 OpenRouter 免费模型',null,summary,{db:tx});
  return summary;
 });
 clearRegisteredModelCache();
 return result;
}
