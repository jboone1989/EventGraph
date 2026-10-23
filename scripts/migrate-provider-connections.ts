/** Run with the old API/worker stopped, after the additive schema migrations.
 * Copies in bounded batches, then verifies every alias and workflow target before commit.
 * Existing normalized rows, credentials and administrator edits are never overwritten on a rerun.
 */
import {createHash} from 'node:crypto';
import {PRESETS} from '@aihot/site/models';
import {sql,closeDb} from '@aihot/backend/db';
import {audit} from '@aihot/backend/audit';
import {connectionPolicy} from '@aihot/backend/providers/registry/connection-validation';
import {isVerifiedFreeTrialProvider,type ProviderProfile} from '@aihot/backend/providers/registry/types';
import {credential} from '@aihot/backend/config';
import {writeWorkflowModel,loadConnection,loadModel,configurationFingerprint,configurationSnapshot} from '@aihot/backend/providers/registry/connections';
import {storedCredential} from '@aihot/backend/providers/registry/connection-secrets';

interface LegacyRow {
 vendor:string;model_id:string;adapter:ProviderProfile['adapter'];endpoint:string|null;credential_env:string;
 timeout_ms:number;capabilities:ProviderProfile['capabilities'];request_defaults:Record<string,unknown>;
 probe_spec:ProviderProfile['probeSpec'];stream:boolean;complexity:ProviderProfile['complexity'];
 documentation_url:string|null;notes:string|null;enabled:boolean;route_enabled:boolean;version:number;
 updated_by:string|null;updated_at:Date;
}
/** Deterministic IDs make the mapping independently verifiable, including after a restart. */
export function migratedId(kind:string,identity:unknown):string {
 const hex=createHash('sha256').update(JSON.stringify([kind,identity])).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export function legacyConnection(row:Pick<LegacyRow,'vendor'|'endpoint'|'credential_env'|'timeout_ms'>) {
 // The legacy implementation only accepted these NVIDIA hosts; null endpoints retain that default.
 const endpoint=row.endpoint??'https://integrate.api.nvidia.com/v1/chat/completions';
 const url=new URL(endpoint);
 const baseUrl=url.origin+(url.pathname.includes('/v1/')?'/v1':url.pathname.replace(/\/(chat\/completions|embeddings)\/?$/,''));
 const identity=[row.vendor,baseUrl,row.credential_env];
 return {id:migratedId('connection',identity),baseUrl,policy:connectionPolicy(baseUrl,row.vendor==='nvidia'?'nvidia-free-trial':'none')};
}
// Importing historical data must not change active routing. Activation is a
// separate, explicit maintenance operation after capability probes are checked.
async function activateMigration(tx:import('@aihot/backend/db').Tx,sourceMappings:Array<{vendor:string;modelId:string;id:string}>) {
 const expected=new Map<string,string>();
 for(const source of sourceMappings){
  expected.set(source.vendor+':'+source.modelId,source.id);
  for(const [key,spec] of Object.entries(PRESETS))
   if(spec.service===source.vendor&&spec.model===source.modelId)expected.set(key,source.id);
 }
 const settings=await tx<{key:string;value:{model?:string}}[]>`SELECT key,value FROM settings WHERE key LIKE 'models.%'`;
 let migratedReferences=0;
 for(const setting of settings){
  const reference=setting.value?.model??'';
  const id=expected.get(reference)??(reference.startsWith('model:')?reference.slice(6):undefined);
  if(!id)continue;
  const [model]=await tx`SELECT id FROM registered_models WHERE id=${id}::uuid`;
  if(!model)throw Error('Migration target model missing: '+setting.key);
  if(reference!=='model:'+id)migratedReferences++;
  await writeWorkflowModel(tx,setting.key,id,'migration');
 }
 const bindings=await tx<{setting_key:string;model_id:string;reference:string}[]>`
  SELECT r.setting_key,r.model_id,s.value->>'model' AS reference
  FROM provider_workflow_models r JOIN settings s ON s.key=r.setting_key`;
 for(const binding of bindings)
  if(binding.reference!=='model:'+binding.model_id)throw Error('Workflow binding disagrees with its setting');
 await tx`INSERT INTO settings(key,value,updated_by)
  VALUES ('providerConnections.activation.v1',${tx.json({activatedAt:new Date().toISOString(),migratedReferences,verifiedBindings:bindings.length})},'migration')
  ON CONFLICT(key) DO NOTHING`;
 return {migratedReferences,verifiedBindings:bindings.length};
}
export async function migrateProviderConnections(options:{activate?:boolean}={}) {
 if(options.activate&&process.env.MODEL_PROVIDER_REGISTRY_ENABLED!=='true')
  throw Error('Explicit activation requires MODEL_PROVIDER_REGISTRY_ENABLED=true');
 return sql.begin(async tx=>{
  // A maintenance operation, outside release DDL. No old writes can race the snapshot or validation.
  await tx`LOCK TABLE model_providers,model_provider_checks IN SHARE MODE`;
  await tx`LOCK TABLE settings IN SHARE ROW EXCLUSIVE MODE`;
  const markerKey='providerConnections.migration.v1';
  const [completed]=await tx`SELECT value FROM settings WHERE key=${markerKey}`;
  if(completed) {
   // Completion and the snapshot are committed with the data. Never resurrect deleted objects.
   const bindings=await tx`SELECT r.setting_key,r.model_id,s.value->>'model' AS reference
    FROM provider_workflow_models r JOIN settings s ON s.key=r.setting_key`;
   for(const r of bindings)if(r.reference!=='model:'+r.model_id)throw Error('Workflow binding disagrees with its setting');
   const dangling=await tx`SELECT s.key FROM settings s LEFT JOIN provider_workflow_models r ON r.setting_key=s.key
    WHERE s.key LIKE 'models.%' AND s.value->>'model' LIKE 'model:%' AND r.setting_key IS NULL`;
   if(dangling.length)throw Error('Workflow setting has no binding');
   const aliases=await tx`SELECT * FROM provider_model_aliases`;
   for(const a of aliases)if(a.registered_model_id!==migratedId('model',[a.vendor,a.model_id]))throw Error('Migration alias target mismatch');
   for(const source of completed.value.sourceMappings??[]) {
    const [model]=await tx`SELECT id FROM registered_models WHERE id=${source.id}::uuid`;
    if(model&&!aliases.some(a=>a.vendor===source.vendor&&a.model_id===source.modelId&&a.registered_model_id===source.id))throw Error('Surviving migrated model has no matching alias');
   }
   const [activated]=await tx`SELECT 1 FROM settings WHERE key='providerConnections.activation.v1'`;
   const activation=options.activate&&!activated?await activateMigration(tx,completed.value.sourceMappings??[]):null;
   const {sourceMappings:_,...summary}=completed.value;
   return {...summary,createdModels:0,migratedReferences:activation?.migratedReferences??0,
    verifiedBindings:activation?.verifiedBindings??bindings.length,activated:!!activated||!!activation};
  }
  // Require the same runtime credential environment as real dispatch, before any
  // migration writes. Never certify a provider whose key is absent at migration time.
  const keys=await tx<{credential_env:string}[]>`SELECT DISTINCT credential_env FROM model_providers WHERE credential_env IS NOT NULL AND credential_env<>''`;
  for(const {credential_env} of keys)
   if(!credential('models',credential_env))throw Error(`Missing provider runtime credential: ${credential_env}`);
  const sourceMappings:Array<{vendor:string;modelId:string;id:string}>=[];
  let lastVendor='',lastModel='',sourceCount=0,createdModels=0;
  while(true) {
   const rows=await tx<LegacyRow[]>`SELECT * FROM model_providers
    WHERE (vendor,model_id)>(${lastVendor},${lastModel}) ORDER BY vendor,model_id LIMIT 100`;
   if(!rows.length)break;
   for(const row of rows) {
    sourceCount++;
    const c=legacyConnection(row),id=migratedId('model',[row.vendor,row.model_id]);
    sourceMappings.push({vendor:row.vendor,modelId:row.model_id,id});
    await tx`INSERT INTO provider_connections
     (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,credential_env,updated_by)
     VALUES (${c.id}::uuid,${row.vendor+' · '+new URL(c.baseUrl).hostname+' · '+c.id.slice(0,8)},${row.vendor},'openai-compatible',${c.baseUrl},60000,true,${c.policy},${row.credential_env},'migration')
     ON CONFLICT(id) DO NOTHING`;
    const inserted=await tx`INSERT INTO registered_models
     (id,provider_id,model_id,adapter,endpoint_override,timeout_override_ms,capabilities,request_defaults,probe_spec,stream,
      complexity,documentation_url,notes,enabled,route_enabled,version,updated_by,updated_at)
     VALUES (${id}::uuid,${c.id}::uuid,${row.model_id},${row.adapter},${row.endpoint},${row.timeout_ms},${tx.json(row.capabilities)},
      ${tx.json(row.request_defaults as never)},${row.probe_spec===null?null:tx.json(row.probe_spec as never)},${row.stream},
      ${row.complexity},${row.documentation_url},${row.notes},${row.enabled},${row.route_enabled},${row.version},
      ${row.updated_by??'migration'},${row.updated_at}) ON CONFLICT(id) DO NOTHING RETURNING id`;
    createdModels+=inserted.length;
    await tx`INSERT INTO provider_model_aliases(vendor,model_id,registered_model_id)
     VALUES (${row.vendor},${row.model_id},${id}::uuid) ON CONFLICT(vendor,model_id) DO NOTHING`;
    // Old checks have no configuration evidence. Preserve their observations without certifying this configuration.
    await tx`INSERT INTO registered_model_checks
     (model_id,capability,config_fingerprint,status,verified_at,latency_ms,detail,updated_at)
     SELECT ${id}::uuid,capability,'legacy-unverified','unverified',verified_at,latency_ms,detail,updated_at
     FROM model_provider_checks WHERE vendor=${row.vendor} AND model_id=${row.model_id}
     ON CONFLICT(model_id,capability) DO NOTHING`;
    // An enabled route is not evidence that each declared capability was tested.
    // Preserve only a fresh, successful, exact capability probe from the old table.
    // NVIDIA's free-trial allowlist and actual runtime credentials remain mandatory.
    if(row.enabled&&row.route_enabled&&
       ['chat','embedding','document','safety'].includes(row.adapter)&&
       (row.vendor!=='nvidia'||isVerifiedFreeTrialProvider(row.model_id))) {
     const connection=await loadConnection(c.id,tx),model=await loadModel(id,tx);
     if(!storedCredential(connection))throw Error('Missing credential for migrating provider: '+row.vendor);
     const fingerprint=configurationFingerprint(connection,model),snapshot=configurationSnapshot(connection,model);
     const probes=await tx<{capability:string;verified_at:Date;updated_at:Date;latency_ms:number|null;detail:string|null}[]>`
      SELECT capability,verified_at,updated_at,latency_ms,detail FROM model_provider_checks
      WHERE vendor=${row.vendor} AND model_id=${row.model_id}
       AND status='verified' AND verified_at IS NOT NULL`;
     const now=Date.now();
     for(const probe of probes) {
      const age=now-probe.verified_at.getTime();
      if(!row.capabilities.includes(probe.capability as never)||age<0||age>=86400000)continue;
      await tx`INSERT INTO registered_model_checks
       (model_id,capability,config_fingerprint,config_snapshot,status,verified_at,latency_ms,detail,updated_at)
       VALUES (${id}::uuid,${probe.capability},${fingerprint},${tx.json(snapshot)},'legacy',
        ${probe.verified_at},${probe.latency_ms},${probe.detail},${probe.updated_at})
       ON CONFLICT(model_id,capability) DO UPDATE SET
        config_fingerprint=EXCLUDED.config_fingerprint,config_snapshot=EXCLUDED.config_snapshot,
        status='legacy',verified_at=EXCLUDED.verified_at,latency_ms=EXCLUDED.latency_ms,
        detail=EXCLUDED.detail,updated_at=EXCLUDED.updated_at`;
     }
    }
    lastVendor=row.vendor;lastModel=row.model_id;
   }
  }
  const aliases=await tx<{vendor:string;model_id:string;registered_model_id:string}[]>`
   SELECT a.* FROM provider_model_aliases a JOIN model_providers p USING(vendor,model_id)`;
  if(aliases.length!==sourceCount)throw Error('Migration alias count mismatch');
  for(const a of aliases)
   if(a.registered_model_id!==migratedId('model',[a.vendor,a.model_id]))throw Error('Migration alias target mismatch');
  const result={sourceModels:sourceCount,createdModels,aliases:aliases.length,
   migratedReferences:0,verifiedBindings:0};
  await tx`INSERT INTO settings(key,value,updated_by) VALUES (${markerKey},${tx.json({...result,sourceMappings})},'migration')`;
  const activation=options.activate?await activateMigration(tx,sourceMappings):null;
  await audit('migration','provider.connections.migrate','providers','split connections and models',null,result,{db:tx});
  return {...result,...activation,activated:!!activation};
 });
}
if(import.meta.main){try{console.log(JSON.stringify(await migrateProviderConnections({activate:process.argv.includes('--activate')})));}finally{await closeDb();}}
