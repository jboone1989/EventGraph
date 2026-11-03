/**
 * One-time NVIDIA catalogue import into provider_connections + registered_models.
 * This is an explicitly approved admin-data import, NOT a schema migration or
 * activation of existing editorial workflow routes.
 * Run from the VM13 preview image against its already-writable production DB.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from '@aihot/backend/config';
import {sql,closeDb} from '@aihot/backend/db';
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
export async function importNvidiaModels() {
 if(process.env.EVENTGRAPH_PREVIEW_MODE!=='true')
  throw new Error('NVIDIA import requires the VM13 preview environment');
 const {rows,probes}=catalogue();
 return sql.begin(async tx=>{
  await tx`SELECT pg_advisory_xact_lock(hashtext('nvidia-registered-model-import'))`;
  const [done]=await tx<{value:{catalogue:number;legacy:number;total:number;inserted:number;preserved:number;connectionId:string}}[]>`SELECT value FROM settings WHERE key=${KEY}`;
  if(done)return {status:'already-imported',summary:done.value};
  const old=await tx<Legacy[]>`SELECT model_id,adapter,endpoint,capabilities,request_defaults,timeout_ms,probe_spec,
   stream,complexity,documentation_url,notes FROM model_providers WHERE vendor='nvidia'`;
  const legacy=new Map(old.map(x=>[x.model_id,x]));
  // The historical catalogue and any additional administrator-defined legacy
  // NVIDIA models are imported, with legacy edits taking precedence over seeds.
  const byId=new Map(rows.map(x=>[x.modelId,x]));
  const all=new Set([...byId.keys(),...legacy.keys()]);
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
   (${KEY},${tx.json(summary)},${ACTOR})`;
  await audit(ACTOR,'provider.models.bootstrap','nvidia','Operator approved importing historical NVIDIA models into registered_models',null,summary,{db:tx});
  return {status:'imported',summary};
 });
}
if(import.meta.main){
 try {console.log(JSON.stringify(await importNvidiaModels()));}
 finally {await closeDb();}
}
