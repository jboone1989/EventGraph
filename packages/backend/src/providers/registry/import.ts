import {randomUUID} from 'node:crypto';
import {sql} from '../../db.ts';
import {audit} from '../../audit.ts';
import {loadConnection,connectionView,listRegisteredModels} from './connections.ts';
import {checkModel} from './connection-validation.ts';
import {ProviderConfigError,type ModelInput} from './connection-types.ts';

/** Only selected model identifiers are imported; existing operator configuration is never replaced. */
export async function importModels(providerId:string,modelIds:unknown,reason:string,actor:string) {
 if(!Array.isArray(modelIds)||!modelIds.length||modelIds.length>200||modelIds.some(x=>typeof x!=='string'||!x.trim()||x.length>300))
  throw new ProviderConfigError('Select between 1 and 200 models','modelIds');
 if(typeof reason!=='string'||!reason.trim()||reason.length>1500)throw new ProviderConfigError('Enter a reason','reason');
 await sql.begin(async tx=>{
  const connection=await loadConnection(providerId,tx);
  await tx`SELECT id FROM provider_connections WHERE id=${providerId}::uuid FOR UPDATE`;
  for(const modelId of new Set(modelIds as string[])) {
   const input:ModelInput={providerId,modelId,adapter:'chat',endpointOverride:null,capabilities:[],requestDefaults:{},probeSpec:null,
    stream:false,complexity:'medium',documentationUrl:null,notes:null,enabled:false,routeEnabled:false};
   checkModel(input,connectionView(connection));
   await tx`INSERT INTO registered_models(id,provider_id,model_id,adapter,upstream_metadata,updated_by)
    VALUES (${randomUUID()}::uuid,${providerId}::uuid,${modelId},'chat',${tx.json({importedAt:new Date().toISOString()})},${actor})
    ON CONFLICT(provider_id,model_id) DO UPDATE SET upstream_metadata=registered_models.upstream_metadata||EXCLUDED.upstream_metadata`;
  }
  await audit(actor,'provider.models.import',providerId,reason,null,{modelIds},{db:tx});
 });
 return {models:(await listRegisteredModels()).filter(m=>m.providerId===providerId)};
}
