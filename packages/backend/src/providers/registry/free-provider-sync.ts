import {randomUUID} from 'node:crypto';
import {sql} from '../../db.ts';
import {audit} from '../../audit.ts';
import {loadConnection,clearRegisteredModelCache} from './connections.ts';
import {storedCredential} from './connection-secrets.ts';
import {ProviderConfigError} from './connection-types.ts';
import {isFreePoolVendor,requiresFreeTier,verifiedProviderUrl,freePoolCandidates} from './free-provider-catalog.ts';

/** A deliberate import: existing model settings/bindings are never changed. */
export async function syncFreePool(providerId:string,actor:string,confirmedFreeTier:boolean){
 const connection=await loadConnection(providerId);
 const vendor=connection.vendor.toLowerCase();
 if(!isFreePoolVendor(vendor)||connection.protocol!=='openai-compatible')
  throw new ProviderConfigError('Choose a supported OpenAI-compatible free provider','providerId');
 if(!verifiedProviderUrl(vendor,connection.base_url))
  throw new ProviderConfigError('Use the official provider API Base URL','baseUrl');
 if(requiresFreeTier(vendor)&&confirmedFreeTier!==true)
  throw new ProviderConfigError('Confirm the API account uses the provider Free Tier','confirmFreeTier');
 if(!storedCredential(connection))
  throw new ProviderConfigError('Configure the provider API key first','credential');
 const models=freePoolCandidates(vendor);
 const summary=await sql.begin(async tx=>{
  await tx`SELECT id FROM provider_connections WHERE id=${providerId}::uuid FOR UPDATE`;
  const existing=await tx<{model_id:string}[]>`SELECT model_id FROM registered_models WHERE provider_id=${providerId}::uuid FOR UPDATE`;
  const seen=new Set(existing.map(x=>x.model_id));
  for(const m of models){
   const meta=tx.json({freePool:{vendor,reviewedAt:'2026-11-06',freeTierOnly:requiresFreeTier(vendor)}});
   await tx`INSERT INTO registered_models
    (id,provider_id,model_id,adapter,capabilities,probe_spec,complexity,enabled,route_enabled,billing,upstream_metadata,updated_by)
    VALUES (${randomUUID()}::uuid,${providerId}::uuid,${m.modelId},${m.adapter},
     ${tx.json([...m.capabilities])},${tx.json(m.probeSpec)},${m.complexity},false,false,'free',${meta},${actor})
    ON CONFLICT(provider_id,model_id) DO NOTHING`;
  }
  const result={vendor,total:models.length,added:models.filter(m=>!seen.has(m.modelId)).length,
   existing:models.filter(m=>seen.has(m.modelId)).length};
  await audit(actor,'provider.models.free-pool-sync',providerId,'手动导入免费模型候选',null,result,{db:tx});
  return result;
 });
 clearRegisteredModelCache();
 return summary;
}
