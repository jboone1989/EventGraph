/**
 * One-time NVIDIA Free Endpoint import and historical 81-row correction.
 * This is an explicitly approved admin-data import, NOT a schema migration or
 * activation of existing editorial workflow routes.
 * Run from the VM13 preview image against its already-writable production DB.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from '@aihot/backend/config';
import {sql,closeDb,type Tx} from '@aihot/backend/db';
import {VERIFIED_FREE_TRIAL_ENDPOINTS,isVerifiedFreeTrialProvider} from '@aihot/backend/providers/registry/types';
import {audit} from '@aihot/backend/audit';
import {migratedId} from './migrate-provider-connections.ts';

interface Seed {
 vendor:string;modelId:string;adapter:string;endpoint:string|null;credentialEnv:string;
 capabilities:string[];requestDefaults:Record<string,unknown>;timeoutMs:number;
 stream:boolean;complexity:string;documentationUrl:string|null;notes:string|null;
}
interface Legacy {
 model_id:string;adapter:string;endpoint:string|null;capabilities:string[];
 request_defaults:Record<string,unknown>;timeout_ms:number;probe_spec:unknown;
 stream:boolean;complexity:string;documentation_url:string|null;notes:string|null;
}
type Probe={vendor:string;modelId:string;probeSpec:unknown};
const KEY='nvidia.registeredModelsBootstrap.v1';
const FREE_KEY='nvidia.registeredModelsFreeOnly.v2';
const FREE_IDS=Object.keys(VERIFIED_FREE_TRIAL_ENDPOINTS);
const BASE='https://integrate.api.nvidia.com/v1';
const ACTOR='nvidia-model-import';
function catalogue(){
 const seeds=JSON.parse(readFileSync(join(REPO_ROOT,'config/model-provider-seed.json'),'utf8')) as {providers:Seed[]};
 const probes=JSON.parse(readFileSync(join(REPO_ROOT,'config/model-provider-probes.json'),'utf8')) as {providers:Probe[]};
 const rows=seeds.providers.filter(x=>x.vendor==='nvidia');
 if(rows.length<1||new Set(rows.map(x=>x.modelId)).size!==rows.length)
  throw new Error('NVIDIA catalogue changed; review this one-time import before running');
 if(rows.some(x=>x.credentialEnv!=='NVIDIA_API_KEY'))
  throw new Error('NVIDIA bootstrap has unexpected credential source');
 return {rows,probes:new Map(probes.providers.filter(x=>x.vendor==='nvidia').map(x=>[x.modelId,x.probeSpec]))};
}
/**
 * Correct only the original machine-inserted catalogue rows. Model edits,
 * operator additions, workflow bindings and alias links are never deleted.
 * An audit and a separate marker record the exact correction.
 */
async function reconcileFreeOnly(tx:Tx,connectionId:string,catalogueSize:number){
 const [done]=await tx<{value:unknown}[]>`SELECT value FROM settings WHERE key=${FREE_KEY}`;
 if(done)return {status:'already-reconciled',summary:done.value};
 const [connection]=await tx<{id:string}[]>`SELECT id FROM provider_connections WHERE id=${connectionId}::uuid AND vendor='nvidia'`;
 if(!connection)throw Error('Historical NVIDIA bootstrap connection is missing; cannot reconcile it safely');
 const deleted=await tx<{model_id:string}[]>`
  DELETE FROM registered_models m WHERE m.provider_id=${connectionId}::uuid
   AND m.model_id <> ALL(${FREE_IDS}::text[])
   AND m.upstream_metadata->>'source'='seed-catalogue'
   AND m.updated_by=${ACTOR} AND m.version=1
   AND NOT EXISTS(SELECT 1 FROM provider_workflow_models w WHERE w.model_id=m.id)
   AND NOT EXISTS(SELECT 1 FROM provider_model_aliases a WHERE a.registered_model_id=m.id)
  RETURNING model_id`;
 const remaining=await tx<{model_id:string}[]>`SELECT model_id FROM registered_models WHERE provider_id=${connectionId}::uuid`;
 const summary={catalogue:catalogueSize,eligible:FREE_IDS.length,deleted:deleted.length,
  remaining:remaining.length,preservedNonFree:remaining.filter(x=>!isVerifiedFreeTrialProvider(x.model_id)).length,connectionId};
 await tx`INSERT INTO settings(key,value,updated_by) VALUES
  (${FREE_KEY},${tx.json(summary)},${ACTOR})`;
 await audit(ACTOR,'provider.models.free-only-reconcile','nvidia',
  'Remove only untouched unsupported 81-catalogue bootstrap records; preserve operator and workflow records',
  null,summary,{db:tx});
 return {status:'reconciled',summary};
}
export async function importNvidiaModels() {
 if(process.env.EVENTGRAPH_PREVIEW_MODE!=='true')
  throw new Error('NVIDIA import requires the VM13 preview environment');
 const {rows,probes}=catalogue();
 return sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext('nvidia-registered-model-import'))`;
  const [done]=await tx<{value:{catalogue:number;legacy:number;total:number;inserted:number;preserved:number;connectionId:string}}[]>`SELECT value FROM settings WHERE key=${KEY}`;
  if(done)return reconcileFreeOnly(tx,done.value.connectionId,rows.length);
  const old=await tx<Legacy[]>`SELECT model_id,adapter,endpoint,capabilities,request_defaults,timeout_ms,probe_spec,
   stream,complexity,documentation_url,notes FROM model_providers WHERE vendor='nvidia'`;
  const legacy=new Map(old.map(x=>[x.model_id,x]));
  // The historical catalogue and any additional administrator-defined legacy
  // NVIDIA models are imported, with legacy edits taking precedence over seeds.
  const byId=new Map(rows.filter(x=>isVerifiedFreeTrialProvider(x.modelId)).map(x=>[x.modelId,x]));
  // Historical partner/download-only entries are not eligible for a free API key.
  const all=new Set([...byId.keys(),...legacy.keys()].filter(isVerifiedFreeTrialProvider));
  if(all.size!==FREE_IDS.length)throw Error('Verified NVIDIA Free Endpoint catalogue no longer matches the seed');
  const connections=await tx<{id:string;credential_env:string|null;has_secret:boolean}[]>`
   SELECT id,credential_env,(credential_secret IS NOT NULL) AS has_secret FROM provider_connections
   WHERE vendor='nvidia' AND trim(trailing '/' from base_url)=${BASE}
   ORDER BY (credential_env='NVIDIA_API_KEY' OR credential_secret IS NOT NULL) DESC,id`;
  let connectionId=connections[0]?.id;
  if(!connectionId){
   connectionId=migratedId('connection',['nvidia',BASE,'NVIDIA_API_KEY']);
   await tx`INSERT INTO provider_connections
    (id,name,vendor,protocol,base_url,timeout_ms,enabled,policy,credential_env,updated_by)
    VALUES (${connectionId}::uuid,'NVIDIA','nvidia','openai-compatible',${BASE},60000,true,
     'nvidia-free-trial','NVIDIA_API_KEY',${ACTOR})
    ON CONFLICT(id) DO NOTHING`;
  }
  const existing=await tx<{model_id:string}[]>`
   SELECT m.model_id FROM registered_models m JOIN provider_connections c ON m.provider_id=c.id
   WHERE c.vendor='nvidia'`;
  const present=new Set(existing.map(x=>x.model_id));
  let inserted=0;
  for(const modelId of all){
   if(present.has(modelId))continue;
   const seed=byId.get(modelId),prior=legacy.get(modelId);
   if(!seed&&!prior)throw Error('NVIDIA model has no source record');
   const adapter=prior?.adapter??seed!.adapter;
   const capabilities=prior?.capabilities??seed?.capabilities??[];
   const defaults=prior?.request_defaults??seed?.requestDefaults??{};
   const probe=prior?.probe_spec??probes.get(modelId)??null;
   const endpoint=prior?.endpoint??seed?.endpoint??null;
   const timeout=prior?.timeout_ms??seed?.timeoutMs??60000;
   const complexity=prior?.complexity??seed?.complexity??'medium';
   const stream=prior?.stream??seed?.stream??false;
   const docs=prior?.documentation_url??seed?.documentationUrl??null;
   const notes=prior?.notes??seed?.notes??null;
   // Never turn on a historical route just because it was previously tested.
   // Existing normalized rows are not touched, including administrator settings.
   const result=await tx<{id:string}[]>`INSERT INTO registered_models
    (id,provider_id,model_id,adapter,endpoint_override,timeout_override_ms,
     capabilities,request_defaults,probe_spec,stream,complexity,documentation_url,
     notes,enabled,route_enabled,upstream_metadata,updated_by)
    VALUES (${migratedId('model',['nvidia',modelId])}::uuid,${connectionId}::uuid,${modelId},
     ${adapter},${endpoint},${timeout},${tx.json(capabilities)},${tx.json(defaults as never)},
     ${probe===null?null:tx.json(probe as never)},${stream},${complexity},${docs},${notes},
     false,false,${tx.json({source:prior?'legacy-model-providers':'seed-catalogue'})},${ACTOR})
    ON CONFLICT DO NOTHING RETURNING id`;
   if(result.length!==1)throw new Error('Could not import NVIDIA model '+modelId+' without conflict');
   present.add(modelId);inserted++;
  }
  if([...all].some(id=>!present.has(id)))throw new Error('Incomplete NVIDIA model import');
  const summary={catalogue:rows.length,legacy:legacy.size,total:all.size,inserted,
   preserved:all.size-inserted,connectionId};
  await tx`INSERT INTO settings(key,value,updated_by) VALUES
   (${KEY},${tx.json(summary)},${ACTOR}),
   (${FREE_KEY},${tx.json({catalogue:rows.length,eligible:FREE_IDS.length,deleted:0,remaining:all.size,
    preservedNonFree:0,connectionId})},${ACTOR})`;
  await audit(ACTOR,'provider.models.bootstrap','nvidia','Operator approved importing historical NVIDIA models into registered_models',null,summary,{db:tx});
  return {status:'imported',summary};
 });
}
if(import.meta.main){
 try {console.log(JSON.stringify(await importNvidiaModels()));}
 finally {await closeDb();}
}
